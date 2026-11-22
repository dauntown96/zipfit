-- zipfit:function complex_geo_complex_targets(integer) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function complex_geo_complex_put(jsonb) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 단지 좌표 전 단지 채움(2026-11-22 · 우편함 「코드·운영 — 셋째 묶음: 7′ juso 좌표 전 단지 채움 …」 A ·
--   근거 행안부 답 2026-11-19(저장·핀 허용 · 좌표제공 API 결과는 국내 서버) · 조사 docs/complex-geo-sample.md(road_key 키워드 표본 100/100) · 서울 이전 11-20).
-- 바꾸는 것:
--   ① complex_geo_complex_targets(n) — EF complex-geo-fill ?mode=complex 가 런마다 부른다(service_role 만).
--      refill = 좌표 빈 juso 행(도로명·건물번호 칸이 있는 것 · 7일에 한 번만 다시) · complexes = complex_geo 행이 없는 단지
--      (matched_from = 그 단지 세대 행 주소 중 가장 많은 것 · 원문 그대로 · 아직 complex_geo 에 없는 것) — 시도 기록(complex_geo_attempts)이 막지 않는 것.
--      DB 메모리 가용(zipfit_ops.instance_metrics_log 최근 2시간 안 마지막 값)이 300MB 아래면 대상 0(mem_ok false — 요청서 「멈춤」).
--   ② complex_geo_complex_put(p) — kind complex: 시도 기록 한 행 + picked 면 complex_geo 한 행(complex_id 로 · source juso) —
--      🔴 complex_road_key(juso 도로명, 단지 시도) = 단지 road_key 일 때만 쓴다(다르면 multi 로 남김 · 사람 판정) · 좌표는 한국 범위 밖이면 비움.
--      kind coord: 좌표 빈 juso 행의 좌표만 채운다(도로명 칸은 그대로) · 못 받으면 checked_at·note 만.
--      🔴 세대 행 주소(원문)는 건드리지 않는다 · 단지 잇기 함수는 부르지 않는다(이미 이어진 단지다).
--   ③ pg_cron zipfit-complex-geo-fill-complex '8,28,44 0-11 * * *'(UTC) = KST 09~20시 시간당 3번(:08 · :28 · :44) —
--      :20~24 · :50~54 밖 · 다른 잡과 분 겹침 없음 · 런마다 단지 ≤ 20(juso 호출 ≤ 약 40 · 3초 간격 · 런 110초 상한).
--      셈(2026-11-22 10:2x KST): 대상 단지 3,112 + 좌표 빈 juso 행 21 → 하루 36런 × 20 ≈ 720 단지 · juso 호출 ≈ 1,440/일 → 약 4.4일.
--      juso 하루 한도는 문서로 못 찾음(「한도 모름」) — 보수적으로 낮 창 · 순차 3초 · E0007 이면 그 런 멈춤.
--      다 채우면 EF 가 대상 0 으로 바깥 호출 0 — 잡은 새 단지 몫으로 남긴다(지울지는 다음 회차 판단).
-- 저장: complex_geo 한 행 ≈ 수백 바이트 → 3,100행 ≈ 1~2MB(+ 시도 기록 같은 수).
-- 되돌리기: select cron.unschedule('zipfit-complex-geo-fill-complex'); drop function public.complex_geo_complex_put(jsonb);
--   drop function public.complex_geo_complex_targets(integer); 채운 행은 note 「단지 단위」로 가려 지운다(운영 데이터 쓰기).
set local lock_timeout = '5s';
DO $$ begin
  if to_regclass('public.complex_geo') is null or to_regclass('public.complex_geo_attempts') is null then raise exception 'GUARD complex_geo missing'; end if;
  if to_regclass('zipfit_ops.instance_metrics_log') is null then raise exception 'GUARD instance_metrics_log missing'; end if;
  if to_regprocedure('public.ops_project_url()') is null then raise exception 'GUARD ops_project_url missing'; end if;
  if exists (select 1 from cron.job where jobname = 'zipfit-complex-geo-fill-complex') then raise exception 'GUARD zipfit-complex-geo-fill-complex exists'; end if;
end $$;

CREATE OR REPLACE FUNCTION public.complex_geo_complex_targets(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 단지 좌표 전 단지 채움 대상(2026-11-22 · 우편함 「코드·운영 — 셋째 묶음」 A) — EF complex-geo-fill ?mode=complex 가 런마다 부른다.
  -- 반환 {mem_ok, mem_available_mb, refill[{id, adm_cd, rn_mgt_sn, udrt_yn, buld_mnnm, buld_slno}], complexes[{complex_id, address, sido_nm, sigungu_nm, road_key, names}]}.
  --   mem_ok false(최근 2시간 안 메모리 가용 < 300MB)면 두 목록 모두 빈다 · refill 이 먼저 · 합쳐 p_limit(1~40).
  with m as (select (select l.mem_available from zipfit_ops.instance_metrics_log l where l.at > now() - interval '2 hours' order by l.at desc limit 1) as avail),
  ok as (select coalesce(m.avail >= 300 * 1024 * 1024, true) as mem_ok, round(m.avail / 1048576.0) as mb from m),
  lim as (select greatest(1, least(coalesce(p_limit, 20), 40)) as n),
  rf as (select g.id, g.adm_cd, g.rn_mgt_sn, g.udrt_yn, g.buld_mnnm, g.buld_slno
           from public.complex_geo g, ok
          where ok.mem_ok and g.source = 'juso' and g.lat is null and g.adm_cd ~ '^[0-9]{10}$' and g.rn_mgt_sn is not null and g.buld_mnnm is not null
            and (g.note !~ '좌표 다시 채움' or g.checked_at < now() - interval '7 days')
          order by g.id limit (select n from lim)),
  cx as (select c.id, c.sido_nm, c.sigungu_nm, c.road_key, c.display_name, a.address
           from public.complexes c cross join ok
           cross join lateral (select h.address from public.housing_units h
                                where h.complex_id = c.id and h.address ~ '[0-9]'
                                  and not exists (select 1 from public.complex_geo g2 where g2.matched_from = h.address)
                                group by h.address order by count(*) desc, h.address limit 1) a
          where ok.mem_ok and c.road_key is not null
            and not exists (select 1 from public.complex_geo g where g.complex_id = c.id)
            and not exists (select 1 from public.complex_geo_attempts t where t.matched_from = a.address
                              and (t.outcome in ('picked', 'multi')
                                   or (t.outcome = 'none' and t.tried_at > now() - interval '30 days')
                                   or (t.outcome = 'error' and t.tried_at > now() - interval '50 minutes')))
          order by c.id limit greatest(0, (select n from lim) - (select count(*) from rf)))
  select jsonb_build_object(
    'mem_ok', (select mem_ok from ok), 'mem_available_mb', (select mb from ok),
    'refill', coalesce((select jsonb_agg(to_jsonb(rf) order by rf.id) from rf), '[]'::jsonb),
    'complexes', coalesce((select jsonb_agg(jsonb_build_object('complex_id', cx.id, 'address', cx.address, 'sido_nm', cx.sido_nm, 'sigungu_nm', cx.sigungu_nm,
                                    'road_key', cx.road_key,
                                    'names', array_remove(array[nullif(btrim(cx.display_name), '')]
                                               || array(select distinct nullif(btrim(h.building_name), '') from public.housing_units h where h.complex_id = cx.id), null))
                                  order by cx.id) from cx), '[]'::jsonb))
$function$;
revoke execute on function public.complex_geo_complex_targets(integer) from public, anon, authenticated;
grant execute on function public.complex_geo_complex_targets(integer) to service_role;

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
$function$;
revoke execute on function public.complex_geo_complex_put(jsonb) from public, anon, authenticated;
grant execute on function public.complex_geo_complex_put(jsonb) to service_role;

select cron.schedule('zipfit-complex-geo-fill-complex', '8,28,44 0-11 * * *', $cmd$
  -- 단지 좌표 전 단지 채움(2026-11-22) — KST 09~20시 시간당 3번 · 대상 0 이면 EF 가 바깥을 부르지 않는다. 시크릿은 Vault 에서 실행 시점에.
  SELECT net.http_post(
    url := public.ops_project_url() || '/functions/v1/complex-geo-fill?mode=complex',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);
