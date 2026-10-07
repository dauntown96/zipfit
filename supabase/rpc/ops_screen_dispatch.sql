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
  perform public.ops_dispatch_log_fill();   -- 앞선 발송의 응답을 옮겨 적는다(2026-10-07 · 응답 행은 몇 시간 안에 사라진다 — ops_dispatch_log_fill 주석)
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
$function$
