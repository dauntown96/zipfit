-- zipfit:function complex_geo_complex_targets(integer) acl={postgres=X/postgres,service_role=X/postgres} secdef=true
-- 단지 좌표 전 단지 채움 대상 함수를 SECURITY DEFINER 로(2026-11-22 · 우편함 「코드·운영 — 셋째 묶음」 A · 앞 파일 2026-11-22_01 뒤).
-- 왜: 첫 런(10:28 KST)이 「targets: permission denied for schema zipfit_ops」 — 함수가 메모리 가용(zipfit_ops.instance_metrics_log)을 읽는데
--   부르는 역할 service_role 에 zipfit_ops 스키마 USAGE 가 없다(바깥 호출 0 · 쓰기 0). 스키마 권한을 넓히지 않고 이 함수만 소유자(postgres) 권한으로 돈다.
--   실행 권한은 그대로 service_role 만 · search_path 고정(public, pg_temp) · 함수 몸은 그대로(읽기만 · STABLE).
-- 되돌리기: alter function public.complex_geo_complex_targets(integer) security invoker; + rpc 사본 되돌림.
set local lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.complex_geo_complex_targets(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
