-- zipfit:function complex_geo_complex_targets(integer) acl={postgres=X/postgres,service_role=X/postgres} secdef=true
-- 단지 좌표 채움 차례 = 열린 카드 단지 먼저 → 새 단지(id 큰 것) 먼저(2026-11-25 · 우편함 「코드·운영 — 스물다섯째」 덧 1 · 할 일 6).
--   종전 order by c.id(오름차순) — 새 단지(대개 열린 카드의 것 · id 8089~ 좌표 18/844)가 가장 늦었다 · 11-25 15:40 KST 열린 카드 단지 362 중 258 좌표 0.
--   바뀌는 것은 cx 차례 하나(열림 표지 o.open_ = 그 단지 세대 행의 공고 apply_end ≥ 오늘 KST) — 대상 조건 · refill 먼저 · 한 런 수(p_limit) · 메모리 문턱 · 시도 거름 · 출구 지역(EF)은 그대로.
--   시험(되돌리기 전용 · 같은 날): 한 런 20단지 중 열린 카드 단지 옛 1 → 새 20 · 0.83초(service_role 경유 authenticator statement_timeout 8초 안).
-- 되돌리기: 옛 정의(git show HEAD~1:supabase/rpc/complex_geo_complex_targets.sql)로 새 마이그레이션.
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
  -- 🔵 2026-11-25(우편함 「코드·운영 — 스물다섯째」 덧 1 · 할 일 6) — 차례 = 열린 카드 단지 먼저(그 단지 세대 행의 공고 마감 ≥ 오늘 KST) → 새 단지(id 큰 것) 먼저.
  --    종전 id 오름차순이라 새 단지(대개 열린 카드의 것 · id 8089~)가 가장 늦게 채워졌다(11-25 열린 카드 단지 296 중 197 좌표 0). 한도·간격·출구 지역은 그대로.
  cx as (select c.id, c.sido_nm, c.sigungu_nm, c.road_key, c.display_name, a.address, o.open_
           from public.complexes c cross join ok
           cross join lateral (select h.address from public.housing_units h
                                where h.complex_id = c.id and h.address ~ '[0-9]'
                                  and not exists (select 1 from public.complex_geo g2 where g2.matched_from = h.address)
                                group by h.address order by count(*) desc, h.address limit 1) a
           cross join lateral (select exists (select 1 from public.housing_units h2 join public.announcements an on an.announcement_id = h2.announcement_id
                                               where h2.complex_id = c.id and an.apply_end >= (now() at time zone 'Asia/Seoul')::date) as open_) o
          where ok.mem_ok and c.road_key is not null
            and not exists (select 1 from public.complex_geo g where g.complex_id = c.id)
            and not exists (select 1 from public.complex_geo_attempts t where t.matched_from = a.address
                              and (t.outcome in ('picked', 'multi')
                                   or (t.outcome = 'none' and t.tried_at > now() - interval '30 days')
                                   or (t.outcome = 'error' and t.tried_at > now() - interval '50 minutes')))
          order by o.open_ desc, c.id desc limit greatest(0, (select n from lim) - (select count(*) from rf)))
  select jsonb_build_object(
    'mem_ok', (select mem_ok from ok), 'mem_available_mb', (select mb from ok),
    'refill', coalesce((select jsonb_agg(to_jsonb(rf) order by rf.id) from rf), '[]'::jsonb),
    'complexes', coalesce((select jsonb_agg(jsonb_build_object('complex_id', cx.id, 'address', cx.address, 'sido_nm', cx.sido_nm, 'sigungu_nm', cx.sigungu_nm,
                                    'road_key', cx.road_key,
                                    'names', array_remove(array[nullif(btrim(cx.display_name), '')]
                                               || array(select distinct nullif(btrim(h.building_name), '') from public.housing_units h where h.complex_id = cx.id), null))
                                  order by cx.open_ desc, cx.id desc) from cx), '[]'::jsonb))
$function$;
