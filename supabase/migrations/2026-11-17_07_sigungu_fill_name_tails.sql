-- 5장(2026-11-17 · 우편함 「코드·운영 — 5장: 단지 시군구 빈칸 89 채움(세대 주소) + LH 단지 번호 채움 규칙에 이름 꼬리 걷기 — 병합까지」).
-- 바꾸는 것:
--   ① 새 함수 complex_sigungu_fill() — 시군구 빈칸 단지를 세대 주소로(기존 값 목록과 정확 일치 · 하나일 때만 · 시도 어긋남·여럿·없음은 비움).
--   ② complex_lh_code_fill() — 이름 비교 전 양쪽 꼬리 셋(「(N개동)」 · 「휴먼시아」 · 「임대주택」) 더 걷음.
--   ③ zipfit_ops.complex_link_pending — 단지 번호 채움 앞에 ① (결과 sgg_fill).
--   이 파일은 함수만 깐다 — 소급은 병합 뒤 운영 데이터 쓰기(① 다음 ②).
-- 되돌리기: drop function public.complex_sigungu_fill(); ②③은 앞 커밋 사본으로 같은 꼴 새 마이그레이션.
-- zipfit:function complex_sigungu_fill() acl={postgres=X/postgres} secdef=false
-- zipfit:function complex_lh_code_fill() acl={postgres=X/postgres} secdef=false
-- zipfit:function zipfit_ops.complex_link_pending() acl={postgres=X/postgres} secdef=false
set local lock_timeout = '5s';

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
$function$;
revoke all on function public.complex_sigungu_fill() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complex_lh_code_fill()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 단지(build) ↔ LH 단지 번호(lh_cutoff_scores.sbd_lgo_no) 채움(2026-11-17 · 우편함 「코드·운영 — 4장 …」 본 1 1·2·4).
-- 규칙(지어 고르지 않음 — 모두 만족할 때만):
--   ① 같은 시도(짧은 이름 — complexes.sido_nm ↔ 커트라인 cnp_nm) ∧ 같은 시군구(공백 무시 — complexes.sigungu_nm ↔ sgg_nm)
--   ② 이름 = 공백과 「단지」 글자를 걷은 뒤 같음(complexes.display_name ↔ sbd_lgo_nm — 「증평송산1」 = 「증평송산 1단지」 · 「단지」 앞 숫자까지 같아야 한다)
--   ③ 1:1 — 그 코드에 맞는 단지가 하나 ∧ 그 단지에 맞는 코드가 하나 ∧ 코드에 이름·시군구·시도 꼴이 하나 ∧ 단지 lh_sbd_lgo_no 빈칸 ∧ 그 코드의 lh_code 별칭이 아직 없음.
--   🔵 2026-11-17(우편함 「코드·운영 — 5장 …」 본 2) — 이름 비교 전 양쪽에서 꼬리 셋을 더 걷는다: 「(N개동)」 · 「휴먼시아」 · 「임대주택」
--      (그 밖 「행복주택」 · 「국민임대」 · 블록 번호 · 「도전숙」 등은 걷지 않는다 · 「같은 시군구 ∧ 남은 후보 하나」만으로는 잇지 않는다 — 이름 조건 그대로).
--   complex_aliases name 별칭은 쓰지 않는다(같은 시 동명 다른 단지 10쌍). 둘 이상이면 비운다(ambiguous 로 돌려준다 — 사람 판정).
-- 채우는 꼴은 기존 67과 같다: complex_aliases lh_code 한 행(added_by collect · confirmed auto) + complexes.lh_sbd_lgo_no.
-- 부르는 곳: zipfit_ops.complex_link_pending(매시 41분 · 새 단지가 생겨도 채움) · 소급(4장 운영 데이터 쓰기).
-- 반환 {filled, ambiguous:[{id, no, n_cx, n_no}]}.
declare n int := 0; amb jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit.complex_link'));
  create temp table if not exists zf_lhfill (id bigint, no text, n_cx int, n_no int, nkeys int) on commit drop;
  truncate zf_lhfill;
  insert into zf_lhfill
  with m(t, s) as (values ('서울특별시','서울'),('서울시','서울'),('서울','서울'),('부산광역시','부산'),('부산','부산'),('대구광역시','대구'),('대구','대구'),
          ('인천광역시','인천'),('인천','인천'),('광주광역시','전남광주'),('광주','전남광주'),('전라남도','전남광주'),('전남','전남광주'),('전남광주통합특별시','전남광주'),('전남광주','전남광주'),
          ('대전광역시','대전'),('대전','대전'),('울산광역시','울산'),('울산','울산'),('세종특별자치시','세종'),('세종시','세종'),('세종','세종'),('경기도','경기'),('경기','경기'),
          ('강원특별자치도','강원'),('강원도','강원'),('강원','강원'),('충청북도','충북'),('충북','충북'),('충청남도','충남'),('충남','충남'),('전북특별자치도','전북'),('전라북도','전북'),('전북','전북'),
          ('경상북도','경북'),('경북','경북'),('경상남도','경남'),('경남','경남'),('제주특별자치도','제주'),('제주도','제주'),('제주','제주')),
  cut as (select distinct s.sbd_lgo_no no, replace(replace(replace(regexp_replace(regexp_replace(s.sbd_lgo_nm, '\s', '', 'g'), '\([0-9]+개동\)', '', 'g'), '휴먼시아', ''), '임대주택', ''), '단지', '') nk,
                 regexp_replace(s.sgg_nm, '\s', '', 'g') sk, cm.s dk
            from public.lh_cutoff_scores s left join m cm on cm.t = s.cnp_nm
           where s.sbd_lgo_no ~ '^[CD][0-9]{5}$' and coalesce(s.sgg_nm, '') <> '' and coalesce(s.sbd_lgo_nm, '') <> ''),
  cutk as (select no, min(nk) nk, min(sk) sk, min(dk) dk, count(*)::int nkeys from cut group by no),
  cx as (select c.id, c.lh_sbd_lgo_no lh, replace(replace(replace(regexp_replace(regexp_replace(c.display_name, '\s', '', 'g'), '\([0-9]+개동\)', '', 'g'), '휴먼시아', ''), '임대주택', ''), '단지', '') nk,
                regexp_replace(c.sigungu_nm, '\s', '', 'g') sk, cm.s dk
           from public.complexes c left join m cm on cm.t = c.sido_nm
          where c.kind = 'build' and coalesce(c.display_name, '') <> '' and coalesce(c.sigungu_nm, '') <> ''),
  pair as (select cx.id, cx.lh, k.no, k.nkeys from cx join cutk k on k.nk = cx.nk and k.sk = cx.sk and k.dk is not null and k.dk = cx.dk)
  select p.id, p.no, (count(*) over (partition by p.no))::int, (count(*) over (partition by p.id))::int, p.nkeys from pair p
   where p.lh is null or p.lh <> p.no;
  -- 이미 같은 코드가 붙은 단지(lh = no)는 위에서 빠진다 — 그 코드를 다른 단지가 또 맞히면 별칭 있음으로 걸러진다.
  with ok as (select f.id, f.no from zf_lhfill f
               where f.n_cx = 1 and f.n_no = 1 and f.nkeys = 1
                 and exists (select 1 from public.complexes c where c.id = f.id and c.lh_sbd_lgo_no is null)
                 and not exists (select 1 from public.complex_aliases a where a.alias_type = 'lh_code' and a.alias_value = f.no)),
       ins as (insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
               select ok.id, 'lh_code', ok.no, 'lh_cutoff_scores.sbd_lgo_nm · complexes.display_name',
                      '같은 시도·시군구 ∧ 이름(공백·「단지」 걷음) 같음 ∧ 1:1 · complex_lh_code_fill', 'collect', 'auto'
                 from ok on conflict do nothing returning complex_id, alias_value)
  update public.complexes c set lh_sbd_lgo_no = ins.alias_value from ins where c.id = ins.complex_id and c.lh_sbd_lgo_no is null;
  get diagnostics n = row_count;
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'no', f.no, 'n_cx', f.n_cx, 'n_no', f.n_no) order by f.no, f.id), '[]'::jsonb) into amb
    from zf_lhfill f where (f.n_cx > 1 or f.n_no > 1 or f.nkeys > 1)
      and exists (select 1 from public.complexes c where c.id = f.id and c.lh_sbd_lgo_no is null);
  return jsonb_build_object('filled', n, 'ambiguous', amb);
end
$function$;

CREATE OR REPLACE FUNCTION zipfit_ops.complex_link_pending()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 새 분석 공고 단지 잇기(2026-11-12 · 우편함 「코드·운영 — Visual 갱신 뒤 승인 멈춤 안 C 시험 + 새 분석 공고 단지 잇기 자동 호출 …」 2).
--   분석이 세대 행을 쓴 뒤 complex_link_announcements 를 아무도 부르지 않아 새 공고 세대 행 complex_id 가 비었다(…21051 0/2 · run 427).
--   pg_cron zipfit-complex-link-pending 이 매시 부른다: 대상 = ① complex_id 가 비고 도로명 키가 있는 세대 행의 공고 ② 지난 2일 안에 세대 행이 생긴 공고
--   (코드 고르기 · 이름 채움 재료) · 최대 2,000 · 대상 0 이면 잇기 함수를 부르지 않는다. 쓰기는 잇기 함수 규칙 그대로(원문 값만 · 이름으로 합치지 않음).
-- 🔵 2026-11-12(우편함 「코드·운영 — 0장 일곱 …」 5 · #1006 ⑦ 1) — 부를 때마다 결과를 zipfit_ops.complex_link_runs 에 한 행 남긴다(대상 0 포함 ·
--   30일 넘은 행은 같은 자리에서 지운다) — pg_cron 은 반환값을 「1 row」로만 남겨 하루 변경 수를 셀 수 없었다. health-ops ℹ️ complex_link_daily 가 읽는다.
-- 🔵 2026-11-17(우편함 「코드·운영 — 2장 …」 본 1) — 대상 ①에 둘째 키 자리를 더한다: complex_id 가 비고 도로명 키는 NULL 이나
--   주소가 complex_geo.matched_from 과 같은(source pending 밖 · 도로명 있음) 세대 행의 공고.
-- 🔵 2026-11-17(우편함 「코드·운영 — 3장 …」 0장 2) — 대상 ①의 도로명 키 시도가 세대 sido_nm 이 비면 공고 sido_nm(공고 행 source 순 첫 행)으로
--   물러난다(잇기 함수 ⑤와 같은 꼴 — 종전에는 세대 sido 가 빈 행이 2일 뒤 다시 불리지 않았다).
-- 🔵 2026-11-17(우편함 「코드·운영 — 4장 …」 본 1 4) — 부를 때마다 끝에 public.complex_lh_code_fill()(단지 ↔ LH 단지 번호 채움 · 대상 0이면 쓰기 0)을 부르고
--   그 결과를 r 의 lh_fill 칸에 함께 남긴다(새 단지가 생겨도 같은 규칙으로 채워진다).
-- 🔵 2026-11-17(우편함 「코드·운영 — 5장 …」 본 1 4) — 단지 번호 채움 앞에 public.complex_sigungu_fill()(시군구 빈칸 단지 — 세대 주소 · 대상 0이면 쓰기 0)을
--   부르고 결과를 sgg_fill 칸에 남긴다(새 단지가 세대·공고 시군구 빈칸으로 생겨도 같은 규칙으로 채워진다 · 그 뒤 단지 번호 채움이 그 단지도 본다).
declare ids text[]; r jsonb;
begin
  ids := array(select distinct x from (
      select h.announcement_id x from public.housing_units h
        left join lateral (select a.sido_nm from public.announcements a where a.announcement_id = h.announcement_id order by a.source limit 1) an on true
       where h.complex_id is null and h.address is not null
         and (public.complex_road_key(h.address, coalesce(h.sido_nm, an.sido_nm)) is not null
              or exists (select 1 from public.complex_geo g where g.matched_from = h.address and g.source <> 'pending' and g.road_address is not null))
      union
      select h.announcement_id from public.housing_units h where h.created_at > now() - interval '2 days') z
    where x is not null order by 1 limit 2000);
  if cardinality(ids) = 0 then r := jsonb_build_object('ids', 0);
  else r := public.complex_link_announcements(ids); end if;
  r := r || jsonb_build_object('sgg_fill', public.complex_sigungu_fill());
  r := r || jsonb_build_object('lh_fill', public.complex_lh_code_fill());
  insert into zipfit_ops.complex_link_runs(result) values (r);
  delete from zipfit_ops.complex_link_runs where at < now() - interval '30 days';
  return r;
end
$function$;
