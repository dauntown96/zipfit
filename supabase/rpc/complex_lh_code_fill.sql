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
  cut as (select distinct s.sbd_lgo_no no, replace(regexp_replace(s.sbd_lgo_nm, '\s', '', 'g'), '단지', '') nk,
                 regexp_replace(s.sgg_nm, '\s', '', 'g') sk, cm.s dk
            from public.lh_cutoff_scores s left join m cm on cm.t = s.cnp_nm
           where s.sbd_lgo_no ~ '^[CD][0-9]{5}$' and coalesce(s.sgg_nm, '') <> '' and coalesce(s.sbd_lgo_nm, '') <> ''),
  cutk as (select no, min(nk) nk, min(sk) sk, min(dk) dk, count(*)::int nkeys from cut group by no),
  cx as (select c.id, c.lh_sbd_lgo_no lh, replace(regexp_replace(c.display_name, '\s', '', 'g'), '단지', '') nk,
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
$function$
