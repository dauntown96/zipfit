CREATE OR REPLACE FUNCTION public.complex_sigungu_fill()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 단지 시군구 빈칸 채움(2026-11-17 · 우편함 「코드·운영 — 5장 …」 본 1).
-- 계기: 소급 1차(2026-11-11) 93 · 수집 2 단지가 세대 행·공고 행 시군구가 모두 빈칸이라 complexes.sigungu_nm 이 빈 채로 생겼다(LH 공고 행 sigungu_nm 빈칸).
-- 원천 = 그 단지 세대 행 housing_units.address(원문). 주소 첫 토큰이 시도 이름이고 그 짧은 이름 = 단지 sido_nm 짧은 이름일 때 둘째 토큰(또는 둘째+셋째 —
--   「창원시 마산회원구」)을 시군구 후보로 · 받아들이는 값은 기존 값 목록(lh_cutoff_scores.sgg_nm ∪ complexes.sigungu_nm)과 정확히 같은 것만(두 토큰 꼴이 목록에 있으면 그것 먼저).
-- 한 단지에 받아들인 값이 하나일 때만 채운다 · 둘 이상(multi) · 목록에 없음(none) · 주소 시도 ≠ 단지 시도(sido_mismatch)는 비우고 돌려준다(사람 판정 · 지어 고르지 않음).
-- 부르는 곳: zipfit_ops.complex_link_pending(매시 41분 · 단지 번호 채움 앞) · 소급(5장 운영 데이터 쓰기). 반환 {filled, skipped:[{id, why, vals}]}.
declare n int := 0; sk jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit.complex_link'));
  create temp table if not exists zf_sggfill (id bigint, why text, vals text[]) on commit drop;
  truncate zf_sggfill;
  insert into zf_sggfill
  with m(t, s) as (values ('서울특별시','서울'),('서울시','서울'),('서울','서울'),('부산광역시','부산'),('부산시','부산'),('부산','부산'),('대구광역시','대구'),('대구시','대구'),('대구','대구'),
          ('인천광역시','인천'),('인천시','인천'),('인천','인천'),('광주광역시','전남광주'),('광주','전남광주'),('전라남도','전남광주'),('전남','전남광주'),('전남광주통합특별시','전남광주'),('전남광주','전남광주'),
          ('대전광역시','대전'),('대전시','대전'),('대전','대전'),('울산광역시','울산'),('울산시','울산'),('울산','울산'),('세종특별자치시','세종'),('세종시','세종'),('세종','세종'),('경기도','경기'),('경기','경기'),
          ('강원특별자치도','강원'),('강원도','강원'),('강원','강원'),('충청북도','충북'),('충북','충북'),('충청남도','충남'),('충남','충남'),('전북특별자치도','전북'),('전라북도','전북'),('전북','전북'),
          ('경상북도','경북'),('경북','경북'),('경상남도','경남'),('경남','경남'),('제주특별자치도','제주'),('제주도','제주'),('제주','제주')),
  known as (select distinct v from (select btrim(s.sgg_nm) v from public.lh_cutoff_scores s union select btrim(c.sigungu_nm) from public.complexes c) k where coalesce(v, '') <> ''),
  hu as (select c.id, cm.s csd, regexp_split_to_array(regexp_replace(btrim(h.address), '\s+', ' ', 'g'), ' ') tk
           from public.complexes c join public.housing_units h on h.complex_id = c.id
           left join m cm on cm.t = c.sido_nm
          where c.sigungu_nm is null and coalesce(h.address, '') <> ''),
  hv as (select hu.id, hu.csd, am.s asd,
                case when (select 1 from known where v = hu.tk[2] || ' ' || hu.tk[3]) = 1 then hu.tk[2] || ' ' || hu.tk[3]
                     when (select 1 from known where v = hu.tk[2]) = 1 then hu.tk[2] end v
           from hu left join m am on am.t = hu.tk[1]),
  agg as (select id, bool_or(asd is not null and csd is not null and asd <> csd) bad_sido, bool_or(asd is null) no_sido,
                 array_agg(distinct v) filter (where v is not null and asd is not null and asd = csd) vals from hv group by id)
  select id, case when bad_sido then 'sido_mismatch' when coalesce(cardinality(vals), 0) = 0 then (case when no_sido then 'no_sido_token' else 'none' end)
                  when cardinality(vals) > 1 then 'multi' else 'ok' end, vals
    from agg;
  update public.complexes c set sigungu_nm = f.vals[1]
    from zf_sggfill f where f.id = c.id and f.why = 'ok' and c.sigungu_nm is null;
  get diagnostics n = row_count;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'why', why, 'vals', vals) order by id), '[]'::jsonb) into sk from zf_sggfill where why <> 'ok';
  return jsonb_build_object('filled', n, 'skipped', sk);
end
$function$
