-- complex_link_announcements 3차 — ③ 이름(공고 building_name · 세대 building_name 원문) · ④ 코드 고르기(커트라인 sbd_lgo_nm ↔ 같은 공고 세대 building_name 앞머리) · ⑤ 세대 행 complex_id
-- (2026-11-12 · 우편함 「코드·운영 — 단지 키 3차 + 지번→도로명 출처 조사 + 0장 …」 1 · 단지 키 2차 ⑦ 1·2 판정). 반환에 name · code_pick · unit 칸이 더해진다(부르는 EF 는 로그만 남긴다).
-- 소급은 적용 뒤 데이터 쓰기(이 함수를 대상 공고로 한 번 부름 — 회신 행 목록).
-- 되돌리기: 이 PR 앞 커밋의 supabase/rpc/complex_link_announcements.sql 정의로 create or replace 하는 새 파일(별칭·세대 칸은 남는다 — 지우려면 evidence 로 고른다).
-- zipfit:function complex_link_announcements(text[]) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
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
-- 동시 호출은 권고 잠금으로 한 줄로 세운다. 반환: {ids, link, new_complex, code, hold, name, code_pick, unit}
declare
  r record; v_kind text; v_rk text; v_cid bigint; v_ckind text; v_codes text[]; v_keys text[];
  n_link int := 0; n_new int := 0; n_code int := 0; n_hold int := 0; n int;
  n_name int := 0; n_pick int := 0; n_unit int := 0; cr record; u record;
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
    for u in select h.id, public.complex_road_key(h.address, coalesce(h.sido_nm, r.sido_nm)) as k, nullif(btrim(h.building_name), '') as bn,
                    coalesce(h.sido_nm, r.sido_nm) as sd, coalesce(h.sigungu_nm, r.sigungu_nm) as sg
               from public.housing_units h where h.announcement_id = r.announcement_id and h.complex_id is null loop
      continue when u.k is null;
      v_cid := null; v_ckind := null;
      select cc.id, cc.kind into v_cid, v_ckind from public.complex_aliases ca join public.complexes cc on cc.id = ca.complex_id
       where ca.alias_type = 'road' and ca.alias_value = u.k;
      if v_cid is not null and v_ckind <> v_kind then
        n_hold := n_hold + 1; continue;
      elsif v_cid is null then
        insert into public.complexes (kind, supplier, sido_nm, sigungu_nm, road_key, display_name) values (v_kind, r.supply_org, u.sd, u.sg, u.k, u.bn) returning id into v_cid;
        insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
        values (v_cid, 'road', u.k, 'housing_units.address', 'complex_road_key(address, sido_nm) · 세대 행 · 공고 ' || r.announcement_id, 'collect', 'auto');
        n_new := n_new + 1;
      end if;
      update public.housing_units set complex_id = v_cid where id = u.id and complex_id is null;
      get diagnostics n = row_count; n_unit := n_unit + n;
      insert into public.announcement_complexes (announcement_id, complex_id, source) values (r.announcement_id, v_cid, 'housing_units') on conflict do nothing;
      if u.bn is not null then update public.complexes set display_name = u.bn where id = v_cid and display_name is null; end if;
    end loop;
  end loop;
  return jsonb_build_object('ids', cardinality(p_ids), 'link', n_link, 'new_complex', n_new, 'code', n_code, 'hold', n_hold,
                            'name', n_name, 'code_pick', n_pick, 'unit', n_unit);
end
$function$;
