CREATE OR REPLACE FUNCTION public.complex_geo_complex_put(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 단지 좌표 전 단지 채움 한 건의 결과를 쓴다(2026-11-22 · 우편함 「코드·운영 — 셋째 묶음」 A) — EF complex-geo-fill ?mode=complex 가 부른다.
-- p.kind = complex: {complex_id, address, outcome(picked|multi|none|error), candidates, note, row{road_address, adm_cd, rn_mgt_sn, bd_mgt_sn, bd_nm, udrt_yn,
--      buld_mnnm, buld_slno, ent_x, ent_y, lat, lng, source_url, note}}
--   ① 시도 기록 complex_geo_attempts(matched_from = address · 다시 시도하면 덮고 tries + 1)
--   ② picked ∧ complex_road_key(road_address, 단지 시도) = 단지 road_key 면 complex_geo 한 행(complex_id · source juso · 있으면 그대로) —
--      키가 다르면 쓰지 않고 시도 기록을 multi(사람 판정)로 바꾼다 · 좌표는 한국 범위(위도 33~39 · 경도 124~132) 밖이면 비움.
-- p.kind = coord: {id, outcome(picked|none|error), row{ent_x, ent_y, lat, lng}, note} — 좌표 빈 juso 행의 좌표만 채운다(범위 밖이면 비움) · 언제나 checked_at·note 갱신.
-- 🔴 세대 행 주소(원문)는 건드리지 않는다 · 사람·소급 행(좌표 있는 행)을 덮지 않는다.
declare
  v_kind text := p->>'kind'; v_out text := p->>'outcome'; v_row jsonb := p->'row'; v_addr text := p->>'address'; v_cid bigint;
  v_c record; v_lat double precision; v_lng double precision; v_ok boolean; n int := 0; v_key text;
begin
  if v_out is null or v_out not in ('picked', 'multi', 'none', 'error') then raise exception 'complex_geo_complex_put: outcome(picked|multi|none|error)'; end if;
  v_lat := (v_row->>'lat')::double precision; v_lng := (v_row->>'lng')::double precision;
  v_ok := coalesce(v_lat between 33 and 39 and v_lng between 124 and 132, false);
  if v_kind = 'coord' then
    update public.complex_geo g
       set ent_x = case when v_out = 'picked' and v_ok then (v_row->>'ent_x')::double precision end,
           ent_y = case when v_out = 'picked' and v_ok then (v_row->>'ent_y')::double precision end,
           lat = case when v_out = 'picked' and v_ok then v_lat end, lng = case when v_out = 'picked' and v_ok then v_lng end,
           source_url = case when v_out = 'picked' and v_ok and coalesce(g.source_url, '') !~ 'addrCoordApi'
                             then concat_ws(' · ', g.source_url, 'https://business.juso.go.kr/addrlink/addrCoordApi.do') else g.source_url end,
           note = left(concat_ws(' · ', g.note, p->>'note'), 500), checked_at = now()
     where g.id = (p->>'id')::bigint and g.source = 'juso' and g.lat is null;
    get diagnostics n = row_count;
    return jsonb_build_object('kind', 'coord', 'outcome', v_out, 'updated', n, 'xy', v_out = 'picked' and v_ok and n > 0);
  end if;
  if v_kind is distinct from 'complex' then raise exception 'complex_geo_complex_put: kind(complex|coord)'; end if;
  v_cid := (p->>'complex_id')::bigint;
  select c.id, c.sido_nm, c.road_key into v_c from public.complexes c where c.id = v_cid;
  if v_c.id is null then raise exception 'complex_geo_complex_put: 없는 단지'; end if;
  if v_addr is null or not exists (select 1 from public.housing_units h where h.address = v_addr and h.complex_id = v_cid) then
    raise exception 'complex_geo_complex_put: 그 단지 세대 행에 없는 주소';
  end if;
  if v_out = 'picked' then
    if v_row is null or nullif(btrim(v_row->>'road_address'), '') is null then raise exception 'complex_geo_complex_put: picked 인데 road_address 없음'; end if;
    v_key := public.complex_road_key(btrim(v_row->>'road_address'), v_c.sido_nm);
    if v_key is distinct from v_c.road_key then
      v_out := 'multi';
      p := jsonb_set(p, '{note}', to_jsonb(left(concat_ws(' · ', '도로명 키 다름(juso ' || coalesce(v_key, '없음') || ' ↔ 단지 ' || v_c.road_key || ') — 사람 판정', p->>'note'), 500)));
    end if;
  end if;
  insert into public.complex_geo_attempts (matched_from, outcome, candidates, note)
  values (v_addr, v_out, p->'candidates', left(p->>'note', 500))
  on conflict (matched_from) do update set outcome = excluded.outcome, candidates = excluded.candidates, note = excluded.note,
                                           tries = public.complex_geo_attempts.tries + 1, tried_at = now();
  if v_out = 'picked' then
    insert into public.complex_geo (matched_from, complex_id, source, road_address, adm_cd, rn_mgt_sn, bd_mgt_sn, bd_nm, udrt_yn, buld_mnnm, buld_slno,
                                    ent_x, ent_y, lat, lng, source_url, note)
    values (v_addr, v_cid, 'juso', btrim(v_row->>'road_address'), v_row->>'adm_cd', v_row->>'rn_mgt_sn', v_row->>'bd_mgt_sn', nullif(btrim(v_row->>'bd_nm'), ''),
            v_row->>'udrt_yn', (v_row->>'buld_mnnm')::int, (v_row->>'buld_slno')::int,
            case when v_ok then (v_row->>'ent_x')::double precision end, case when v_ok then (v_row->>'ent_y')::double precision end,
            case when v_ok then v_lat end, case when v_ok then v_lng end, v_row->>'source_url', left(v_row->>'note', 500))
    on conflict do nothing;
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('kind', 'complex', 'outcome', v_out, 'geo_inserted', n, 'xy', n > 0 and v_ok);
end
$function$

