-- 4장(2026-11-17 · 우편함 「코드·운영 — 4장: 단지 키 LH 단지 번호 채움 + 커트라인 RPC 단지 키 길(증평 송산 1·2·3 빈 커트라인) · 잇기 함수 단지 시도 순서 — 병합까지」).
-- 바꾸는 것:
--   ① 새 함수 complex_lh_code_fill() — 단지(build) ↔ LH 단지 번호 채움(같은 시도·시군구 ∧ 이름(공백·「단지」 걷음) 같음 ∧ 1:1 · 꼴은 기존 lh_code 별칭 + lh_sbd_lgo_no).
--      이 파일은 함수만 깐다 — 소급 채움은 병합 뒤 운영 데이터 쓰기(select public.complex_lh_code_fill()).
--   ② zipfit_ops.complex_link_pending — 끝에 그 함수를 불러 새 단지도 같은 규칙으로 채움(결과 lh_fill 칸).
--   ③ get_announcement_cutoff_rounds 세 번째 길 via 'code'(세대 complex_id → lh_sbd_lgo_no = sbd_lgo_no) — 이름 길·사슬 길이 그 카드 단지에 후보 0일 때만(있던 행 그대로).
--   ④ complex_link_announcements — 새 단지 sido_nm = 주소 첫 토큰 시도 → 세대 sido → 공고 sido(3장 ② 승인 · 기존 단지 변경 0).
-- 되돌리기: drop function public.complex_lh_code_fill(); 나머지 셋은 앞 커밋 사본으로 같은 꼴 새 마이그레이션(채운 별칭은 docs/rollback 쪽).
-- zipfit:function complex_lh_code_fill() acl={postgres=X/postgres} secdef=false
-- zipfit:function zipfit_ops.complex_link_pending() acl={postgres=X/postgres} secdef=false
-- zipfit:function complex_link_announcements(text[]) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function get_announcement_cutoff_rounds(text[]) acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=true
-- zipfit:anon select count(*) from get_announcement_cutoff_rounds((select array_agg(announcement_id) from (select announcement_id from get_announcements_deduped(null,null,null) where apply_end >= current_date) x))
set local lock_timeout = '5s';

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
$function$;
revoke all on function public.complex_lh_code_fill() from public, anon, authenticated, service_role;

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
  r := r || jsonb_build_object('lh_fill', public.complex_lh_code_fill());
  insert into zipfit_ops.complex_link_runs(result) values (r);
  delete from zipfit_ops.complex_link_runs where at < now() - interval '30 days';
  return r;
end
$function$;

CREATE OR REPLACE FUNCTION public.complex_link_announcements(p_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 단지 잇기(2026-11-11 · 우편함 「코드·운영 — 단지 키 2차 …」 2) — 수집이 새 공고 확정분을 채운다. 부르는 곳: EF collect-announcements(LH 상세 upsert 뒤 · precise_address)
--   · EF collect-lh-images(단지 그림 upsert 뒤 · sbd_lgo_no). 원문 값만 쓴다(원칙 30) — 표시 이름(display_name)은 비워 둔다(세대 행이 생기면 분석·소급이 채운다).
-- ① 도로명: complex_road_key(precise_address, sido_nm) 가 있으면 그 road 별칭의 단지에 잇는다 · 없으면 단지를 새로 만들고 road 별칭(added_by collect) ·
--    같은 키의 단지가 다른 kind(매입 ↔ 건설)면 잇지 않는다(보류 수만 센다). 전세임대는 단지를 만들지 않는다.
-- ② LH 코드: 건설형 공고에서 코드(단지 그림 · 커트라인 pan_id)가 하나이고 아직 별칭이 없으며 그 공고 도로명 키(건설형 세대 행 · 없으면 precise_address)가
--    하나일 때만 lh_code 별칭(1차 규칙). 이름으로는 잇지 않는다.
-- 🔵 2026-11-12(우편함 「코드·운영 — 단지 키 3차 + …」 1 · 단지 키 2차 ⑦ 1·2 판정) — 셋을 더한다:
-- ③ 이름: 단지를 새로 만들 때 · 이은 단지의 display_name 이 비었을 때 공고 building_name(MYHOME hsmpNm · 원문 단지명)으로 채운다(원문 값 · 덮어쓰지 않음).
-- ④ 코드 고르기: 공고 하나에 코드가 여럿이라 ②가 못 붙인 코드 — 커트라인 행 sbd_lgo_nm(LH 단지 이름 원문)으로 같은 공고 세대 행 building_name 을
--    글자 그대로 앞머리 일치(building_name like sbd_lgo_nm || '%')로 고르고, 고른 세대 행의 도로명 키가 하나 ∧ 그 키의 건설형 단지가 있으면 lh_code 별칭.
--    이름으로 단지를 합치지 않는다 — 같은 공고 안에서 코드를 고르는 데만 쓴다(다른 공고·다른 단지로 넘어가지 않음).
-- ⑤ 세대 행: 이 공고 세대 행 중 complex_id 가 비고 도로명 키가 있는 행을 그 키의 단지에 잇는다(같은 kind 만 · 없으면 1차 규칙대로 단지 + road 별칭 —
--    display_name = 그 세대 행 building_name). 분석이 세대 행을 쓴 뒤 이 함수를 다시 부르면 채워진다(스킬 v11.6 전까지 코드·운영 회차가 소급으로 부른다).
-- 🔵 2026-11-17(우편함 「코드·운영 — 2장 …」 본 1 · #1030 둘째 키 승인) — ⑤의 둘째 키: 세대 행 주소의 도로명 키가 NULL(지번 꼴 · 시도 없음)이고
--    그 주소(원문 그대로)가 complex_geo.matched_from 과 같으면 complex_road_key(complex_geo.road_address) 로 잇는다(source pending · 도로명 없는 행은 잇지 않음).
--    새 단지를 만들면 road 별칭 출처 = complex_geo.road_address · 이은 단지가 아직 어느 complex_geo 행에도 없으면 그 행 complex_id 를 채운다(단지 하나에 한 행).
-- 🔵 2026-11-17(우편함 「코드·운영 — 4장 …」 본 2 · 3장 ② 승인) — 단지를 새로 만들 때 complexes.sido_nm = 주소 첫 토큰이 시도 이름이면 그 토큰(원문 그대로)
--    → 아니면 세대 sido_nm → 아니면 공고 sido_nm(① precise_address 는 그 주소 첫 토큰 → 공고 sido_nm). 경산 셋이 LH 공고 행 시도(지역본부 「대구광역시」)로 든 꼴(3장).
--    「광주시」는 경기 광주시와 겹쳐 시도로 읽지 않는다(complex_road_key 와 같다). 기존 단지는 건드리지 않는다.
-- 동시 호출은 권고 잠금으로 한 줄로 세운다. 반환: {ids, link, new_complex, code, hold, name, code_pick, unit, unit_geo, geo_cid}
declare
  r record; v_kind text; v_rk text; v_cid bigint; v_ckind text; v_codes text[]; v_keys text[];
  n_link int := 0; n_new int := 0; n_code int := 0; n_hold int := 0; n int;
  n_name int := 0; n_pick int := 0; n_unit int := 0; cr record; u record; n_ugeo int := 0; n_gcid int := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('ids', 0); end if;
  if cardinality(p_ids) > 2000 then p_ids := p_ids[1:2000]; end if;
  perform pg_advisory_xact_lock(hashtext('zipfit.complex_link'));
  for r in select distinct on (a.announcement_id) a.announcement_id, a.precise_address, a.sido_nm, a.sigungu_nm, a.supply_org, a.housing_type, a.housing_type_family,
                  nullif(btrim(a.building_name), '') as building_name
             from public.announcements a where a.announcement_id = any(p_ids) order by a.announcement_id, a.source loop
    v_kind := case when coalesce(r.housing_type, '') ~ '전세임대' then null
                   when coalesce(r.housing_type_family, '') = '매입임대' or coalesce(r.housing_type, '') ~ '매입|집주인' then 'buy'
                   else 'build' end;
    continue when v_kind is null;
    v_rk := public.complex_road_key(r.precise_address, r.sido_nm);
    if v_rk is not null then
      v_cid := null;
      select c.id, c.kind into v_cid, v_ckind from public.complex_aliases ca join public.complexes c on c.id = ca.complex_id
       where ca.alias_type = 'road' and ca.alias_value = v_rk;
      if v_cid is not null and v_ckind <> v_kind then
        n_hold := n_hold + 1; v_cid := null;
      elsif v_cid is null then
        insert into public.complexes (kind, supplier, sido_nm, sigungu_nm, road_key, display_name)
        values (v_kind, r.supply_org,
                case when split_part(regexp_replace(btrim(coalesce(r.precise_address, '')), '\s+', ' ', 'g'), ' ', 1) ~ '^(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주|전라남도|전남|전남광주통합특별시|전남광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)$'
                     then split_part(regexp_replace(btrim(r.precise_address), '\s+', ' ', 'g'), ' ', 1) else r.sido_nm end,
                r.sigungu_nm, v_rk, r.building_name) returning id into v_cid;
        insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
        values (v_cid, 'road', v_rk, 'announcements.precise_address', 'complex_road_key(precise_address, sido_nm) · 공고 ' || r.announcement_id, 'collect', 'auto');
        n_new := n_new + 1;
      end if;
      if v_cid is not null then
        insert into public.announcement_complexes (announcement_id, complex_id, source) values (r.announcement_id, v_cid, 'precise_address') on conflict do nothing;
        get diagnostics n = row_count; n_link := n_link + n;
        if r.building_name is not null then
          update public.complexes set display_name = r.building_name where id = v_cid and display_name is null;
          get diagnostics n = row_count; n_name := n_name + n;
        end if;
      end if;
    end if;
    if v_kind = 'build' then
      select array_agg(distinct x.code) into v_codes from (
        select i.sbd_lgo_no as code from public.announcement_complex_images i where i.announcement_id = r.announcement_id
        union select s.sbd_lgo_no from public.lh_cutoff_scores s where s.pan_id = r.announcement_id) x
       where x.code ~ '^[CD][0-9]{5}$';
      if cardinality(v_codes) = 1 and not exists (select 1 from public.complex_aliases ca where ca.alias_type = 'lh_code' and ca.alias_value = v_codes[1]) then
        v_keys := array(select distinct k from (select public.complex_road_key(h.address, coalesce(h.sido_nm, r.sido_nm)) as k from public.housing_units h
                                                where h.announcement_id = r.announcement_id) q where k is not null);
        if cardinality(v_keys) = 0 and v_rk is not null then v_keys := array[v_rk]; end if;
        if cardinality(v_keys) = 1 then
          v_cid := null;
          select c.id into v_cid from public.complex_aliases ca join public.complexes c on c.id = ca.complex_id
           where ca.alias_type = 'road' and ca.alias_value = v_keys[1] and c.kind = 'build';
          if v_cid is not null then
            insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
            values (v_cid, 'lh_code', v_codes[1], 'announcement_complex_images · lh_cutoff_scores', '공고 하나에 코드 하나 ∧ 그 공고 도로명 키 하나 · 공고 ' || r.announcement_id, 'collect', 'auto')
            on conflict do nothing;
            get diagnostics n = row_count;
            if n > 0 then
              n_code := n_code + 1;
              update public.complexes set lh_sbd_lgo_no = v_codes[1] where id = v_cid and lh_sbd_lgo_no is null;
              insert into public.announcement_complexes (announcement_id, complex_id, source) values (r.announcement_id, v_cid, 'lh_code') on conflict do nothing;
            end if;
          end if;
        end if;
      end if;
      -- ④ 코드 고르기(커트라인 이름 ↔ 같은 공고 세대 건물명 앞머리)
      for cr in select distinct s.sbd_lgo_no as code, s.sbd_lgo_nm as nm from public.lh_cutoff_scores s
                where s.pan_id = r.announcement_id and s.sbd_lgo_no ~ '^[CD][0-9]{5}$' and nullif(btrim(s.sbd_lgo_nm), '') is not null
                  and not exists (select 1 from public.complex_aliases ca where ca.alias_type = 'lh_code' and ca.alias_value = s.sbd_lgo_no) loop
        v_keys := array(select distinct k from (select public.complex_road_key(h.address, coalesce(h.sido_nm, r.sido_nm)) as k from public.housing_units h
                                                where h.announcement_id = r.announcement_id and h.building_name like cr.nm || '%') q where k is not null);
        continue when cardinality(v_keys) <> 1;
        v_cid := null;
        select cc.id into v_cid from public.complex_aliases ca join public.complexes cc on cc.id = ca.complex_id
         where ca.alias_type = 'road' and ca.alias_value = v_keys[1] and cc.kind = 'build';
        continue when v_cid is null;
        insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
        select v_cid, 'lh_code', cr.code, 'lh_cutoff_scores.sbd_lgo_nm · housing_units.building_name',
               '커트라인 이름 「' || cr.nm || '」 ↔ 같은 공고 세대 건물명 앞머리 · 도로명 키 하나 · 공고 ' || r.announcement_id, 'collect', 'auto'
         where not exists (select 1 from public.complex_aliases ca where ca.alias_type = 'lh_code' and ca.alias_value = cr.code);
        get diagnostics n = row_count;
        if n > 0 then
          n_pick := n_pick + 1;
          update public.complexes set lh_sbd_lgo_no = cr.code where id = v_cid and lh_sbd_lgo_no is null;
          insert into public.announcement_complexes (announcement_id, complex_id, source) values (r.announcement_id, v_cid, 'lh_code') on conflict do nothing;
        end if;
      end loop;
    end if;
    -- ⑤ 세대 행 complex_id(도로명 키 · 같은 kind)
    for u in select q.id, coalesce(q.k1, public.complex_road_key(g.road_address, q.sd)) as k, q.k1 is null and g.id is not null as by_geo, g.id as gid,
                    q.bn, q.sd, q.sg, coalesce(q.tk, q.sd) as csd
               from (select h.id, h.address, public.complex_road_key(h.address, coalesce(h.sido_nm, r.sido_nm)) as k1, nullif(btrim(h.building_name), '') as bn,
                            coalesce(h.sido_nm, r.sido_nm) as sd, coalesce(h.sigungu_nm, r.sigungu_nm) as sg,
                            case when split_part(regexp_replace(btrim(coalesce(h.address, '')), '\s+', ' ', 'g'), ' ', 1) ~ '^(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주|전라남도|전남|전남광주통합특별시|전남광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)$'
                                 then split_part(regexp_replace(btrim(h.address), '\s+', ' ', 'g'), ' ', 1) end as tk
                       from public.housing_units h where h.announcement_id = r.announcement_id and h.complex_id is null) q
               left join public.complex_geo g on q.k1 is null and g.matched_from = q.address and g.source <> 'pending' and g.road_address is not null loop
      continue when u.k is null;
      v_cid := null; v_ckind := null;
      select cc.id, cc.kind into v_cid, v_ckind from public.complex_aliases ca join public.complexes cc on cc.id = ca.complex_id
       where ca.alias_type = 'road' and ca.alias_value = u.k;
      if v_cid is not null and v_ckind <> v_kind then
        n_hold := n_hold + 1; continue;
      elsif v_cid is null then
        insert into public.complexes (kind, supplier, sido_nm, sigungu_nm, road_key, display_name) values (v_kind, r.supply_org, u.csd, u.sg, u.k, u.bn) returning id into v_cid;
        insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
        values (v_cid, 'road', u.k, case when u.by_geo then 'complex_geo.road_address' else 'housing_units.address' end,
                case when u.by_geo then 'complex_road_key(complex_geo.road_address) · matched_from = 세대 주소 · complex_geo ' || u.gid || ' · 공고 ' || r.announcement_id
                     else 'complex_road_key(address, sido_nm) · 세대 행 · 공고 ' || r.announcement_id end, 'collect', 'auto');
        n_new := n_new + 1;
      end if;
      update public.housing_units set complex_id = v_cid where id = u.id and complex_id is null;
      get diagnostics n = row_count; n_unit := n_unit + n;
      if u.by_geo then
        n_ugeo := n_ugeo + n;
        update public.complex_geo set complex_id = v_cid
         where id = u.gid and complex_id is null and not exists (select 1 from public.complex_geo g2 where g2.complex_id = v_cid);
        get diagnostics n = row_count; n_gcid := n_gcid + n;
      end if;
      insert into public.announcement_complexes (announcement_id, complex_id, source) values (r.announcement_id, v_cid, 'housing_units') on conflict do nothing;
      if u.bn is not null then update public.complexes set display_name = u.bn where id = v_cid and display_name is null; end if;
    end loop;
  end loop;
  return jsonb_build_object('ids', cardinality(p_ids), 'link', n_link, 'new_complex', n_new, 'code', n_code, 'hold', n_hold,
                            'name', n_name, 'code_pick', n_pick, 'unit', n_unit, 'unit_geo', n_ugeo, 'geo_cid', n_gcid);
end
$function$;

CREATE OR REPLACE FUNCTION public.get_announcement_cutoff_rounds(p_ids text[])
 RETURNS TABLE(announcement_id text, complex_name text, unit_types text[], rcr_pan_dt date, ltst_nm text, rqs_tp_nm text, spl_tp_nm text, spl_rmno integer, rqpr_cnt integer, competition_ratio numeric, cutoff_text text, cutoff_state text, via text, history jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 🔵 2026-11-05(우편함 「표시층 — 커트라인 시안 A」) — 카드 「지난 회차」 줄·상세 표의 재료.
  --   lh_cutoff_scores 는 RLS 켬 · 정책 0 · anon 권한 0 그대로 둔다 — 이 함수가 화면에 필요한 칸만 돌려준다
  --   (gmy_stnd_desc · rfe_stnd_desc · pan_nm · 수집 시각은 내보내지 않는다). cutoff_text 는 수집기가 거른 글(표 CHECK 셋)뿐이다.
  -- 🔵 2026-11-05(우편함 「표시층 — 「얼마·될까」 상세 묶음」 1·2) — 길 둘의 합 + 같은 주택형 지난 신청 수 추이.
  --   via 'name'  = 이 공고 묶음(title_dedup_key)의 세대 행 단지명 ↔ sbd_lgo_nm(공백 무시 · 같음) ∧ 세대 행 시군구 ↔ sgg_nm(공백 무시 · 같음).
  --   via 'chain' = 회차 사슬(get_announcement_round_chain_ids 와 같은 규칙 — 묶음 키 = 같은 게시물 링크면 LH 제목 키 · 아니면 title_dedup_key ·
  --                 회차 링크를 방향 없이 6단계까지)로 이은 다른 묶음(hop ≥ 1)의 pan_id 행 중 이 카드 단지와 같은 단지만 —
  --                 🔴 그 함수를 카드마다 부르지 않고 집합으로 한 번 편다(카드마다 부르면 열린 카드 125개가 anon 3초를 넘었다 · 2026-11-05 실측).
  --                 같은 단지 =
  --                 단지 키 = 공백·「-」를 빼고 「블럭」→「블록」 · 한쪽이 다른 쪽과 같거나 그 앞머리이고 바로 뒤가 숫자가 아님
  --                 (「화성동탄2A82블록」 ↔ 「화성동탄2A82블록(28단지)(행복)」 · 「A5」 ↔ 「A53」은 다름) ∧ 시군구는 둘 다 있을 때만 한쪽이 다른 쪽 앞머리.
  --   via 'code'  = 🔵 2026-11-17(우편함 「코드·운영 — 4장 …」 본 1 3) 세 번째 길 — 세대 행 complex_id → complexes.lh_sbd_lgo_no = sbd_lgo_no.
  --                 이름 길·사슬 길이 그 카드 단지(bkey)에 후보를 하나도 못 낸 때만 쓴다(있던 행은 그대로 · 빈 자리만 채움 — 증평송산 1·2·3 「증평송산1」 ↔ 「증평송산 1단지」).
  --   세 길 공통: 카드 유형(housing_type)이 spl_tp_nm 을 품음 ∧ 이 공고의 회차 날짜(first_announcement_date, 없으면 announcement_date)보다 앞선 rcr_pan_dt.
  --   카드 단지마다 두 길의 후보 중 가장 최근 한 회차(rcr_pan_dt → pan_id → sbd_lgo_no 큰 쪽) — 두 길이 같은 회차면 via 'name'.
  --   history = 같은 단지 번호(sbd_lgo_no) · 같은 주택형(ltst_nm 글자 그대로) · 같은 신청유형의 고른 회차까지(포함) 회차별 신청 수
  --             [{d: rcr_pan_dt, n: rqpr_cnt, s: spl_rmno}] 오래된 것부터 — 같은 날 행이 여럿(pan_id 다름)이면 pan_id 큰 한 행(합하지 않는다 · 정정 겹셈 방지).
  --             s(그 회차 공급 수)는 2026-11-12(우편함 「코드·운영 — …21026 마감 원인·고침 + 커트라인 공급 이력」 1) — n 과 같은 행의 칸이다.
  --   주택형 맞춤·대표 고르기는 화면(zfCutoff*)이 unit_types 로 한다.
  -- 배열 상한 2000 — get_announcement_price_summary 와 같은 꼴(SQL 함수라 cast 로 넘을 때만 실패시킨다).
  with recursive guard as (
    select case when coalesce(cardinality(p_ids), 0) > 2000
                then cast('p_ids ' || cardinality(p_ids) || '개 — 2000개 초과 · 나눠 부른다' as integer) end as over
  ),
  ids as (
    select distinct x as aid from unnest(p_ids) x, guard where x is not null and guard.over is null
  ),
  ann as (
    select i.aid, a.housing_type, a.title_dedup_key, coalesce(a.first_announcement_date, a.announcement_date) as adate
    from ids i join public.announcements a on a.announcement_id = i.aid
    where a.housing_type is not null and coalesce(a.first_announcement_date, a.announcement_date) is not null
  ),
  units as (
    select an.aid, h.building_name, coalesce(h.sigungu_nm, '') as sgg, h.unit_type, h.seq, cc.lh_sbd_lgo_no as lh
    from ann an
    join public.announcements s on s.title_dedup_key = an.title_dedup_key and s.hidden_from_listing is not true
    join public.housing_units h on h.announcement_id = s.announcement_id
    left join public.complexes cc on cc.id = h.complex_id
    where coalesce(h.building_name, '') <> ''
  ),
  cx as (
    select aid,
           regexp_replace(building_name, '\s', '', 'g') as bkey,
           replace(regexp_replace(building_name, '[\s-]', '', 'g'), '블럭', '블록') as ckey,
           max(regexp_replace(sgg, '\s', '', 'g')) as skey,
           array_remove(array_agg(unit_type order by seq), null) as unit_types,
           array_remove(array_agg(distinct lh), null) as codes
    from units group by 1, 2, 3
  ),
  by_name as (
    select an.aid, cx.bkey, cx.unit_types, c.*, 'name'::text as via
    from ann an
    join cx on cx.aid = an.aid and cx.skey <> ''
    join public.lh_cutoff_scores c
      on regexp_replace(c.sbd_lgo_nm, '\s', '', 'g') = cx.bkey
     and regexp_replace(coalesce(c.sgg_nm, ''), '\s', '', 'g') = cx.skey
     and position(c.spl_tp_nm in an.housing_type) > 0
     and c.rcr_pan_dt < an.adate
  ),
  link_map as materialized (
    select distinct on (l.linked_announcement_id) l.linked_announcement_id as lid, lh.title_dedup_key as lh_key
    from public.announcement_post_links l
    join public.announcements lh on lh.announcement_id = l.lh_announcement_id
    where lh.title is not null and lh.hidden_from_listing is not true
    order by l.linked_announcement_id, l.lh_announcement_id
  ),
  keyed as materialized (
    select a.announcement_id as kid, (a.title is not null and a.hidden_from_listing is not true) as member,
           coalesce(lm.lh_key, a.title_dedup_key) as gkey
    from public.announcements a left join link_map lm on lm.lid = a.announcement_id
  ),
  walk(aid, gkey, hop) as (
    select an.aid, k.gkey, 0 from ann an join keyed k on k.kid = an.aid
    union
    select w.aid, k2.gkey, w.hop + 1
    from walk w
    join keyed k1 on k1.gkey = w.gkey and k1.member
    join public.announcement_round_links l on k1.kid in (l.earlier_announcement_id, l.later_announcement_id)
    join keyed k2 on k2.kid = case when l.earlier_announcement_id = k1.kid then l.later_announcement_id else l.earlier_announcement_id end
    where w.hop < 6
  ),
  chain as (
    select distinct w.aid, k.kid as pid
    from walk w join keyed k on k.gkey = w.gkey and k.member
    where w.hop >= 1 and not exists (select 1 from walk w0 where w0.aid = w.aid and w0.hop = 0 and w0.gkey = w.gkey)
  ),
  by_chain as (
    select an.aid, cx.bkey, cx.unit_types, c.*, 'chain'::text as via
    from ann an
    join chain on chain.aid = an.aid
    join public.lh_cutoff_scores c on c.pan_id = chain.pid
    join cx on cx.aid = an.aid
    cross join lateral (select replace(regexp_replace(c.sbd_lgo_nm, '[\s-]', '', 'g'), '블럭', '블록') as k,
                               regexp_replace(coalesce(c.sgg_nm, ''), '\s', '', 'g') as s) n
    where position(c.spl_tp_nm in an.housing_type) > 0
      and c.rcr_pan_dt < an.adate
      and (n.k = cx.ckey
           or (n.k like cx.ckey || '%' and substr(n.k, length(cx.ckey) + 1, 1) !~ '[0-9]')
           or (cx.ckey like n.k || '%' and substr(cx.ckey, length(n.k) + 1, 1) !~ '[0-9]'))
      and (n.s = '' or cx.skey = '' or n.s like cx.skey || '%' or cx.skey like n.s || '%')
  ),
  by_code as (
    select an.aid, cx.bkey, cx.unit_types, c.*, 'code'::text as via
    from ann an
    join cx on cx.aid = an.aid and cardinality(cx.codes) > 0
    join public.lh_cutoff_scores c on c.sbd_lgo_no = any(cx.codes)
    where position(c.spl_tp_nm in an.housing_type) > 0
      and c.rcr_pan_dt < an.adate
      and not exists (select 1 from by_name x where x.aid = an.aid and x.bkey = cx.bkey)
      and not exists (select 1 from by_chain x where x.aid = an.aid and x.bkey = cx.bkey)
  ),
  cand as (
    select * from by_name
    union all
    select b.* from by_chain b
    where not exists (select 1 from by_name x where x.aid = b.aid and x.bkey = b.bkey and x.pan_id = b.pan_id and x.sbd_lgo_no = b.sbd_lgo_no
                        and x.ltst_nm = b.ltst_nm and x.rqs_tp_nm = b.rqs_tp_nm)
    union all
    select * from by_code
  ),
  m as (
    select cand.*, dense_rank() over (partition by cand.aid, cand.bkey order by cand.rcr_pan_dt desc, cand.pan_id desc, cand.sbd_lgo_no desc) as rk
    from cand
  ),
  pick as (select * from m where m.rk = 1),
  hist as (
    select p.aid, p.bkey, p.ltst_nm, p.rqs_tp_nm,
           jsonb_agg(jsonb_build_object('d', h.rcr_pan_dt, 'n', h.rqpr_cnt, 's', h.spl_rmno) order by h.rcr_pan_dt) as history
    from (select distinct aid, bkey, sbd_lgo_no, ltst_nm, rqs_tp_nm, rcr_pan_dt from pick) p
    join (
      -- 한 번 훑어 단지·주택형·신청유형·날짜마다 pan_id 큰 한 행(표에 sbd_lgo_no 색인이 없어 행마다 찾으면 표를 행 수만큼 훑는다)
      select distinct on (s.sbd_lgo_no, s.ltst_nm, s.rqs_tp_nm, s.rcr_pan_dt) s.sbd_lgo_no, s.ltst_nm, s.rqs_tp_nm, s.rcr_pan_dt, s.rqpr_cnt, s.spl_rmno
      from public.lh_cutoff_scores s
      where s.sbd_lgo_no in (select pk.sbd_lgo_no from pick pk)
      order by s.sbd_lgo_no, s.ltst_nm, s.rqs_tp_nm, s.rcr_pan_dt, s.pan_id desc
    ) h on h.sbd_lgo_no = p.sbd_lgo_no and h.ltst_nm = p.ltst_nm and h.rqs_tp_nm = p.rqs_tp_nm and h.rcr_pan_dt <= p.rcr_pan_dt
    group by 1, 2, 3, 4
  )
  select p.aid, p.sbd_lgo_nm, p.unit_types, p.rcr_pan_dt, p.ltst_nm, p.rqs_tp_nm, p.spl_tp_nm, p.spl_rmno, p.rqpr_cnt,
         p.competition_ratio, p.cutoff_text, p.cutoff_state, p.via, hist.history
  from pick p
  left join hist on hist.aid = p.aid and hist.bkey = p.bkey and hist.ltst_nm = p.ltst_nm and hist.rqs_tp_nm = p.rqs_tp_nm
  order by p.aid, p.sbd_lgo_nm, p.ltst_nm, p.rqs_tp_nm
$function$;
