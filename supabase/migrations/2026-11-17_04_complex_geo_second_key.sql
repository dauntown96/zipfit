-- 단지 잇기 둘째 키 + 자동 채움 장치(2026-11-17 · 우편함 「코드·운영 — 2장: 단지 잇기 둘째 키(complex_geo.road_address) + 자동 채움 장치 …」 본 1·2 ·
--   근거 #1030 둘째 키 승인 · 11-16 「juso 두 키로 지번 33주소 표」 검증(여러 결과 고르기 규칙 · source=pending)).
-- 바꾸는 것:
--   ① complex_link_announcements ⑤ — 세대 행 도로명 키가 NULL 이면 complex_geo(matched_from = 세대 주소 그대로 · source pending 밖)의 road_address 키로 잇는다
--      · 이은 단지가 아직 어느 complex_geo 행에도 없으면 그 행 complex_id 를 채운다(단지 하나에 한 행 — 유일 색인 그대로) · 반환에 unit_geo · geo_cid.
--   ② zipfit_ops.complex_link_pending 대상 ① — 같은 둘째 키 자리의 공고도 부른다.
--   ③ 새 표 complex_geo_attempts(자동 채움 시도 기록 · 주소마다 한 행 · outcome multi = 사람 판정 목록) — 공개 읽기 없음 · 쓰기 service_role.
--   ④ complex_geo_targets · complex_geo_put(service_role 만) — EF complex-geo-fill 이 부른다.
--   ⑤ pg_cron zipfit-complex-geo-fill '34 * * * *'(매시 34분 UTC = KST xx:34 · :20~24 · :50~54 밖 · 다른 잡과 분 겹침 없음) — 대상 0 이면 EF 가 바깥을 부르지 않는다.
-- complex_geo 표 꼴(칸 이름·뜻 · 제약)은 바꾸지 않는다(표시층 3판이 읽는다).
-- 되돌리기: select cron.unschedule('zipfit-complex-geo-fill'); drop function public.complex_geo_put(jsonb); drop function public.complex_geo_targets(integer);
--   drop table public.complex_geo_attempts; 두 잇기 함수는 git show <앞 커밋>:supabase/rpc/… 사본으로 같은 꼴 새 마이그레이션.
-- zipfit:function complex_link_announcements(text[]) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function zipfit_ops.complex_link_pending() acl={postgres=X/postgres} secdef=false
-- zipfit:function complex_geo_targets(integer) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function complex_geo_put(jsonb) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
set local lock_timeout = '5s';
DO $$ begin
  if to_regclass('public.complex_geo') is null then raise exception 'GUARD complex_geo missing'; end if;
  if exists (select 1 from cron.job where jobname = 'zipfit-complex-geo-fill') then raise exception 'GUARD zipfit-complex-geo-fill exists'; end if;
end $$;

create table public.complex_geo_attempts (
  matched_from text primary key,
  outcome      text not null constraint complex_geo_attempts_outcome_check check (outcome in ('picked', 'multi', 'none', 'error')),
  candidates   jsonb,
  note         text,
  tries        integer not null default 1,
  tried_at     timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
comment on table public.complex_geo_attempts is
  '단지 도로명·좌표 자동 채움 시도 기록(2026-11-17 · EF complex-geo-fill) · 한 행 = 원 주소 문자열(housing_units.address 그대로) · outcome picked(complex_geo 에 씀) | multi(juso 정확 결과 여럿 · 원문 단지명·건축HUB 로 못 고름 — 사람 판정 목록) | none(juso 정확 결과 0 · 30일 뒤 다시) | error(호출 실패 · 50분 뒤 다시) · 쓰기는 service_role 만';
alter table public.complex_geo_attempts enable row level security;
revoke all on table public.complex_geo_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.complex_geo_attempts to service_role;

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
        insert into public.complexes (kind, supplier, sido_nm, sigungu_nm, road_key, display_name) values (v_kind, r.supply_org, r.sido_nm, r.sigungu_nm, v_rk, r.building_name) returning id into v_cid;
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
                    q.bn, q.sd, q.sg
               from (select h.id, h.address, public.complex_road_key(h.address, coalesce(h.sido_nm, r.sido_nm)) as k1, nullif(btrim(h.building_name), '') as bn,
                            coalesce(h.sido_nm, r.sido_nm) as sd, coalesce(h.sigungu_nm, r.sigungu_nm) as sg
                       from public.housing_units h where h.announcement_id = r.announcement_id and h.complex_id is null) q
               left join public.complex_geo g on q.k1 is null and g.matched_from = q.address and g.source <> 'pending' and g.road_address is not null loop
      continue when u.k is null;
      v_cid := null; v_ckind := null;
      select cc.id, cc.kind into v_cid, v_ckind from public.complex_aliases ca join public.complexes cc on cc.id = ca.complex_id
       where ca.alias_type = 'road' and ca.alias_value = u.k;
      if v_cid is not null and v_ckind <> v_kind then
        n_hold := n_hold + 1; continue;
      elsif v_cid is null then
        insert into public.complexes (kind, supplier, sido_nm, sigungu_nm, road_key, display_name) values (v_kind, r.supply_org, u.sd, u.sg, u.k, u.bn) returning id into v_cid;
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
declare ids text[]; r jsonb;
begin
  ids := array(select distinct x from (
      select h.announcement_id x from public.housing_units h
       where h.complex_id is null and h.address is not null
         and (public.complex_road_key(h.address, h.sido_nm) is not null
              or exists (select 1 from public.complex_geo g where g.matched_from = h.address and g.source <> 'pending' and g.road_address is not null))
      union
      select h.announcement_id from public.housing_units h where h.created_at > now() - interval '2 days') z
    where x is not null order by 1 limit 2000);
  if cardinality(ids) = 0 then r := jsonb_build_object('ids', 0);
  else r := public.complex_link_announcements(ids); end if;
  insert into zipfit_ops.complex_link_runs(result) values (r);
  delete from zipfit_ops.complex_link_runs where at < now() - interval '30 days';
  return r;
end
$function$;

CREATE OR REPLACE FUNCTION public.complex_geo_targets(p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 단지 도로명·좌표 자동 채움 대상(2026-11-17 · 우편함 「코드·운영 — 2장 …」 본 2) — EF complex-geo-fill 이 런마다 부른다.
  -- 대상 = 세대 행 주소(원문 그대로) 중 complex_id 빈칸 ∧ 숫자 있음 ∧ 도로명 키 NULL(잇기 함수와 같은 시도 — 세대 행 · 없으면 공고) ∧ complex_geo 에 없음
  --   ∧ 시도 기록이 막지 않음(picked · multi(사람 판정) 는 다시 안 함 · none 은 30일 · error 는 50분 뒤 다시).
  -- 반환 [{address, names(세대 building_name · 공고 제목 — 여러 결과 고르기 재료), ann_ids}] · 오래된 주소부터 p_limit(1~20).
  select coalesce(jsonb_agg(jsonb_build_object('address', t.address, 'names', t.names, 'ann_ids', t.ann_ids) order by t.first_at, t.address), '[]'::jsonb)
    from (select h.address, min(h.created_at) as first_at,
                 array_remove(array_agg(distinct nullif(btrim(h.building_name), '')), null)
                   || array_remove(array_agg(distinct nullif(btrim(a.title), '')), null) as names,
                 array_agg(distinct h.announcement_id) as ann_ids
            from public.housing_units h
            left join lateral (select a1.sido_nm, a1.title from public.announcements a1 where a1.announcement_id = h.announcement_id
                                order by a1.source limit 1) a on true
           where h.complex_id is null and h.address ~ '[0-9]'
             and public.complex_road_key(h.address, coalesce(h.sido_nm, a.sido_nm)) is null
             and not exists (select 1 from public.complex_geo g where g.matched_from = h.address)
             and not exists (select 1 from public.complex_geo_attempts t where t.matched_from = h.address
                               and (t.outcome in ('picked', 'multi')
                                    or (t.outcome = 'none' and t.tried_at > now() - interval '30 days')
                                    or (t.outcome = 'error' and t.tried_at > now() - interval '50 minutes')))
           group by h.address
           order by min(h.created_at), h.address
           limit greatest(1, least(coalesce(p_limit, 6), 20))) t
$function$;
revoke all on function public.complex_geo_targets(integer) from public, anon, authenticated;
grant execute on function public.complex_geo_targets(integer) to service_role;

CREATE OR REPLACE FUNCTION public.complex_geo_put(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 단지 도로명·좌표 자동 채움 한 주소의 결과를 쓴다(2026-11-17 · 우편함 「코드·운영 — 2장 …」 본 2) — EF complex-geo-fill 이 주소마다 부른다.
-- p = {address, outcome(picked|multi|none|error), candidates, note, row{road_address, adm_cd, rn_mgt_sn, bd_mgt_sn, bd_nm, udrt_yn, buld_mnnm, buld_slno,
--      ent_x, ent_y, lat, lng, source_url, note}}.
--   ① 시도 기록 complex_geo_attempts 한 행(주소마다 하나 · 다시 시도하면 덮고 tries + 1).
--   ② picked 면 complex_geo 한 행(source juso · 있으면 그대로 — 사람·소급 행을 덮지 않는다) · 좌표가 한국 범위(위도 33~39 · 경도 124~132) 밖이면 좌표 칸 비움.
--   ③ 새 행이 생겼으면 그 주소의 세대 행 공고로 complex_link_announcements(둘째 키가 잇는다).
-- 🔴 세대 행 주소(원문)는 건드리지 않는다 · 세대 행에 없는 주소는 받지 않는다.
declare
  v_addr text := p->>'address'; v_out text := p->>'outcome'; v_row jsonb := p->'row'; v_ids text[]; n int := 0; v_link jsonb;
  v_lat double precision; v_lng double precision; v_ok boolean;
begin
  if v_addr is null or v_out is null or v_out not in ('picked', 'multi', 'none', 'error') then raise exception 'complex_geo_put: address · outcome(picked|multi|none|error)'; end if;
  if not exists (select 1 from public.housing_units h where h.address = v_addr) then raise exception 'complex_geo_put: 세대 행에 없는 주소'; end if;
  insert into public.complex_geo_attempts (matched_from, outcome, candidates, note)
  values (v_addr, v_out, p->'candidates', left(p->>'note', 500))
  on conflict (matched_from) do update set outcome = excluded.outcome, candidates = excluded.candidates, note = excluded.note,
                                           tries = public.complex_geo_attempts.tries + 1, tried_at = now();
  if v_out = 'picked' then
    if v_row is null or nullif(btrim(v_row->>'road_address'), '') is null then raise exception 'complex_geo_put: picked 인데 road_address 없음'; end if;
    v_lat := (v_row->>'lat')::double precision; v_lng := (v_row->>'lng')::double precision;
    v_ok := v_lat between 33 and 39 and v_lng between 124 and 132;
    insert into public.complex_geo (matched_from, source, road_address, adm_cd, rn_mgt_sn, bd_mgt_sn, bd_nm, udrt_yn, buld_mnnm, buld_slno,
                                    ent_x, ent_y, lat, lng, source_url, note)
    values (v_addr, 'juso', btrim(v_row->>'road_address'), v_row->>'adm_cd', v_row->>'rn_mgt_sn', v_row->>'bd_mgt_sn', nullif(btrim(v_row->>'bd_nm'), ''), v_row->>'udrt_yn',
            (v_row->>'buld_mnnm')::int, (v_row->>'buld_slno')::int,
            case when v_ok then (v_row->>'ent_x')::double precision end, case when v_ok then (v_row->>'ent_y')::double precision end,
            case when v_ok then v_lat end, case when v_ok then v_lng end, v_row->>'source_url', left(v_row->>'note', 500))
    on conflict (matched_from) do nothing;
    get diagnostics n = row_count;
    if n > 0 then
      v_ids := array(select distinct h.announcement_id from public.housing_units h where h.address = v_addr and h.announcement_id is not null);
      if cardinality(v_ids) > 0 then v_link := public.complex_link_announcements(v_ids); end if;
    end if;
  end if;
  return jsonb_build_object('outcome', v_out, 'geo_inserted', n, 'link', v_link);
end
$function$;
revoke all on function public.complex_geo_put(jsonb) from public, anon, authenticated;
grant execute on function public.complex_geo_put(jsonb) to service_role;

select cron.schedule('zipfit-complex-geo-fill', '34 * * * *', $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(다른 수집 잡과 같은 꼴). 대상 0 이면 EF 가 바깥을 부르지 않는다.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/complex-geo-fill?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);
