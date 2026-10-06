CREATE OR REPLACE FUNCTION public.ops_health_record(p_result jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- health-ops(.github/health/ops-check.mjs)가 점검 끝에 부른다(2026-10-06 · 우편함 「코드 — 1-B …」 6) — 점검 스크립트의 유일한 DB 쓰기.
-- p_result = {at, run_url, ref, checks:[{id, name, status, value}]} — status 가 warn·fail 인 항목만 ops_health_findings 에 1행씩 넣는다.
-- 🔵 2026-10-06(우편함 「코드 — 1-C …」 3) — 실행마다(통과 포함) ops_health_runs 에 요약 1행(통과·경고·실패·건너뜀 수 · 실패·경고 id · ref · run URL).
--   「발송(ops_dispatch_log)했는데 요약 없음 = 점검 불능(관리 API를 못 썼다)」이 SQL 로 잡힌다.
-- 넣기 전에 30일 넘은 행을 두 표에서 지운다(보관 30일 — 별도 cron 없음). 넣은 경고·실패 행 수를 돌려준다.
declare
  n int;
  v_at timestamptz := coalesce((p_result->>'at')::timestamptz, now());
  v_checks jsonb := coalesce(p_result->'checks', '[]'::jsonb);
begin
  delete from public.ops_health_findings where run_at < now() - interval '30 days';
  delete from public.ops_health_runs where run_at < now() - interval '30 days';
  insert into public.ops_health_findings (run_at, item, result, reason, run_url)
  select v_at, c->>'id', c->>'status',
         left(regexp_replace(coalesce(c->>'name', '') || ' — ' || coalesce(c->>'value', ''), '\s+', ' ', 'g'), 300),
         p_result->>'run_url'
    from jsonb_array_elements(v_checks) c
   where c->>'status' in ('warn', 'fail');
  get diagnostics n = row_count;
  insert into public.ops_health_runs (run_at, ref, ok, n_pass, n_warn, n_fail, n_skip, failed, warned, run_url)
  select v_at, p_result->>'ref',
         count(*) filter (where c->>'status' = 'fail') = 0,
         count(*) filter (where c->>'status' = 'pass'), count(*) filter (where c->>'status' = 'warn'),
         count(*) filter (where c->>'status' = 'fail'), count(*) filter (where c->>'status' = 'skip'),
         coalesce(array_agg(c->>'id') filter (where c->>'status' = 'fail'), '{}'),
         coalesce(array_agg(c->>'id') filter (where c->>'status' = 'warn'), '{}'),
         p_result->>'run_url'
    from jsonb_array_elements(v_checks) c;
  return n;
end
$function$
