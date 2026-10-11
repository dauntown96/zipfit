-- 로그인 기록 30일 정리(2026-10-12 · 우편함 「코드 — 고지 회차 3」 1 · 다운님 허용 문장 ①).
--   처리방침 「로그인 기록」 보유 = 로그아웃·탈퇴 때 즉시, 그 밖에는 마지막 사용 뒤 30일이 지나면 지운다.
--   마지막 사용 = greatest(updated_at, created_at, refreshed_at) — 「고지 회차 2」 회신 ② 조사 그대로.
--   auth.refresh_tokens · auth.mfa_amr_claims 는 auth.sessions 에 FK ON DELETE CASCADE(2026-10-12 실측) — 함께 지워진다.
--   postgres 는 auth.sessions DELETE 권한이 있다(같은 날 실측) → SECURITY INVOKER · 실행은 postgres(cron) 만.
--   cron zipfit-purge-stale-sessions — 매일 15:10 UTC = 00:10 KST(이용 기록 정리 15:00 UTC 뒤).
--   되돌리기: select cron.unschedule('zipfit-purge-stale-sessions'); drop function zipfit_ops.purge_stale_auth_sessions(integer);
-- zipfit:function zipfit_ops.purge_stale_auth_sessions(integer) acl={postgres=X/postgres} secdef=false
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-purge-stale-sessions') then raise exception 'GUARD job exists'; end if;
end $$;

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
$function$;

revoke all on function zipfit_ops.purge_stale_auth_sessions(integer) from public, anon, authenticated, service_role;
comment on function zipfit_ops.purge_stale_auth_sessions(integer) is '마지막 사용 뒤 p_days 일 지난 auth.sessions 를 지운다(2026-10-12 고지 회차 3 · 1) — cron zipfit-purge-stale-sessions 가 매일 30 으로 부른다';

select cron.schedule('zipfit-purge-stale-sessions', '10 15 * * *', $$select zipfit_ops.purge_stale_auth_sessions(30)$$);
