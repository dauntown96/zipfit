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
-- 동시 호출은 권고 잠금으로 한 줄로 세운다. 반환: {ids, link, new_complex, code, hold}
declare
  r record; v_kind text; v_rk text; v_cid bigint; v_ckind text; v_codes text[]; v_keys text[];
  n_link int := 0; n_new int := 0; n_code int := 0; n_hold int := 0; n int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('ids', 0); end if;
  if cardinality(p_ids) > 2000 then p_ids := p_ids[1:2000]; end if;
  perform pg_advisory_xact_lock(hashtext('zipfit.complex_link'));
  for r in select distinct on (a.announcement_id) a.announcement_id, a.precise_address, a.sido_nm, a.sigungu_nm, a.supply_org, a.housing_type, a.housing_type_family
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
        insert into public.complexes (kind, supplier, sido_nm, sigungu_nm, road_key) values (v_kind, r.supply_org, r.sido_nm, r.sigungu_nm, v_rk) returning id into v_cid;
        insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
        values (v_cid, 'road', v_rk, 'announcements.precise_address', 'complex_road_key(precise_address, sido_nm) · 공고 ' || r.announcement_id, 'collect', 'auto');
        n_new := n_new + 1;
      end if;
      if v_cid is not null then
        insert into public.announcement_complexes (announcement_id, complex_id, source) values (r.announcement_id, v_cid, 'precise_address') on conflict do nothing;
        get diagnostics n = row_count; n_link := n_link + n;
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
    end if;
  end loop;
  return jsonb_build_object('ids', cardinality(p_ids), 'link', n_link, 'new_complex', n_new, 'code', n_code, 'hold', n_hold);
end
$function$
