-- 화면 점검 예약을 GitHub 밖으로(2026-10-06 · 우편함 「코드 — Z-1 원문 키 사이클(DB) …」 PR-A A5 · 백로그 「남은 GitHub 예약 실행 의존」).
--   health-ops 와 같은 길: pg_cron 이 매일 23:50 UTC(KST 08:50)에 ops_screen_dispatch() 로 health-screen.yml 을 workflow_dispatch 로 부른다.
--   발송 기록은 ops_dispatch_log(target 'health-screen.yml') — health-ops 가 마지막 발송(25시간 안 · 204)을 본다. GitHub schedule 은 예비로 둔다.
--   🔴 공개 역할(PUBLIC·anon·authenticated) 실행 0 · service_role 만. 표 변경 0.
--   되돌리기: select cron.unschedule('zipfit-health-screen-dispatch'); drop function public.ops_screen_dispatch();
-- zipfit:function ops_screen_dispatch() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-health-screen-dispatch') then raise exception 'GUARD job exists'; end if;
end $$;

CREATE OR REPLACE FUNCTION public.ops_screen_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
-- 화면 점검(GitHub Actions health-screen.yml)을 workflow_dispatch 로 부른다(2026-10-06 · 우편함 「코드 — Z-1 …」 PR-A A5 · 백로그 「남은 GitHub 예약 실행 의존」).
-- cron zipfit-health-screen-dispatch 가 매일 23:50 UTC(KST 08:50 — 아침 워밍 수집 뒤)에 부른다. GitHub schedule(같은 시각)은 예비로 남는다.
-- 비밀값: Vault github_actions_dispatch_token(ops_health_dispatch 와 같은 토큰) — 값은 표·반환에 싣지 않는다.
-- 요청 id 를 ops_dispatch_log(target health-screen.yml)에 남긴다 — health-ops 가 마지막 발송 응답(204)을 읽는다.
declare
  v_tok text; v_id bigint;
begin
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'github_actions_dispatch_token';
  if coalesce(v_tok, '') = '' then
    raise exception 'Vault github_actions_dispatch_token 없음';
  end if;
  v_id := net.http_post(
    url := 'https://api.github.com/repos/dauntown96/zipfit/actions/workflows/health-screen.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'zipfit-pg-cron', 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
  insert into public.ops_dispatch_log (target, net_request_id) values ('health-screen.yml', v_id);
  return v_id;
end
$function$;

revoke execute on function public.ops_screen_dispatch() from public, anon, authenticated;
grant execute on function public.ops_screen_dispatch() to service_role;

select cron.schedule('zipfit-health-screen-dispatch', '50 23 * * *', $cmd$ select public.ops_screen_dispatch(); $cmd$);
