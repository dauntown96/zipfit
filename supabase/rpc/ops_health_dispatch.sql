CREATE OR REPLACE FUNCTION public.ops_health_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
-- 운영 건강 점검(GitHub Actions health-ops.yml)을 workflow_dispatch 로 부른다(2026-10-03 · 우편함 「코드 — #328 해소 · 운영 점검 예약을 GitHub 밖으로」).
-- cron zipfit-health-ops-dispatch 가 25·55분에 부른다 — GitHub schedule 은 하루 몇 번만 돌았다(10-02 08:39Z 뒤 14:5xZ까지 0회).
-- 비밀값: Vault github_actions_dispatch_token(fine-grained · dauntown96/zipfit 하나 · Actions 읽기·쓰기 · 만료 2027-10-03) — 값은 표·반환에 싣지 않는다.
-- 요청 id 를 ops_dispatch_log 에 남긴다 — health-ops 가 마지막 발송의 응답(204)을 net._http_response 에서 읽는다. 7일 지난 기록은 지운다.
declare
  v_tok text; v_id bigint;
begin
  perform public.ops_dispatch_log_fill();   -- 앞선 발송의 응답을 옮겨 적는다(2026-10-07 · 응답 행은 몇 시간 안에 사라진다 — ops_dispatch_log_fill 주석)
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'github_actions_dispatch_token';
  if coalesce(v_tok, '') = '' then
    raise exception 'Vault github_actions_dispatch_token 없음';
  end if;
  v_id := net.http_post(
    url := 'https://api.github.com/repos/dauntown96/zipfit/actions/workflows/health-ops.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'zipfit-pg-cron', 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
  insert into public.ops_dispatch_log (target, net_request_id) values ('health-ops.yml', v_id);
  delete from public.ops_dispatch_log where at < now() - interval '7 days';
  return v_id;
end
$function$
