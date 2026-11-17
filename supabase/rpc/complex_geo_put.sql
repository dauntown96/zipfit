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
$function$
