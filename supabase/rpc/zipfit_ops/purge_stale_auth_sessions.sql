CREATE OR REPLACE FUNCTION zipfit_ops.purge_stale_auth_sessions(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
-- 마지막 사용 뒤 p_days 일 지난 로그인 기록(auth.sessions)을 지우고 지운 행 수를 돌려준다(2026-10-12 · 우편함 「고지 회차 3」 1).
-- 마지막 사용 = greatest(updated_at, created_at, refreshed_at) — greatest 는 NULL 을 건너뛴다. refresh_tokens · mfa_amr_claims 는 CASCADE.
declare
  n integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'p_days 는 1 이상이어야 한다(받은 값 %)', p_days;
  end if;
  delete from auth.sessions s
   where greatest(s.updated_at, s.created_at, s.refreshed_at::timestamptz) < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end
$function$
