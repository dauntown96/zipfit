CREATE OR REPLACE FUNCTION public.ops_health_record(p_result jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- health-ops(.github/health/ops-check.mjs)가 점검 끝에 부른다(2026-10-06 · 우편함 「코드 — 1-B …」 6) — 점검 스크립트의 유일한 DB 쓰기.
-- p_result = {at, run_url, checks:[{id, name, status, value}]} — status 가 warn·fail 인 항목만 ops_health_findings 에 1행씩 넣는다.
-- 넣기 전에 30일 넘은 행을 지운다(보관 30일 — 별도 cron 없음). 넣은 행 수를 돌려준다.
declare
  n int;
begin
  delete from public.ops_health_findings where run_at < now() - interval '30 days';
  insert into public.ops_health_findings (run_at, item, result, reason, run_url)
  select coalesce((p_result->>'at')::timestamptz, now()), c->>'id', c->>'status',
         left(regexp_replace(coalesce(c->>'name', '') || ' — ' || coalesce(c->>'value', ''), '\s+', ' ', 'g'), 300),
         p_result->>'run_url'
    from jsonb_array_elements(coalesce(p_result->'checks', '[]'::jsonb)) c
   where c->>'status' in ('warn', 'fail');
  get diagnostics n = row_count;
  return n;
end
$function$
