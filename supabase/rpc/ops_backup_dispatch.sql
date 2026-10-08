CREATE OR REPLACE FUNCTION public.ops_backup_dispatch(p_workflow text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- zipfit-backup 워크플로(backup.yml · heartbeat.yml)를 workflow_dispatch 로 부른다(2026-10-08 · 우편함 「코드 — 운영 기반 후속」 1).
-- cron zipfit-backup-dispatch(18:00 UTC) · zipfit-heartbeat-dispatch(18:40 UTC)가 부른다. GitHub schedule(같은 시각)은 예비로 남는다.
-- 입력 trigger=pg_cron — 워크플로 관문이 「오늘(UTC) 성공 커밋이 이미 있으면 건너뜀」을 이 발송·예비 schedule 에만 건다.
-- 비밀값: Vault github_actions_dispatch_token(ops_health_dispatch 와 같은 토큰) — 값은 표·반환에 싣지 않는다.
-- 요청 id 를 ops_dispatch_log(target 'zipfit-backup/<파일>')에 남긴다 — health-ops 가 마지막 발송(25시간 안 · 204)을 본다.
declare
  v_tok text; v_id bigint;
begin
  if p_workflow not in ('backup.yml', 'heartbeat.yml') then
    raise exception 'ops_backup_dispatch: 허용 밖 워크플로 %', p_workflow;
  end if;
  perform public.ops_dispatch_log_fill();   -- 앞선 발송의 응답을 옮겨 적는다(응답 행은 몇 시간 안에 사라진다)
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'github_actions_dispatch_token';
  if coalesce(v_tok, '') = '' then
    raise exception 'Vault github_actions_dispatch_token 없음';
  end if;
  v_id := net.http_post(
    url := 'https://api.github.com/repos/dauntown96/zipfit-backup/actions/workflows/' || p_workflow || '/dispatches',
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('trigger', 'pg_cron')),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'zipfit-pg-cron', 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
  insert into public.ops_dispatch_log (target, net_request_id) values ('zipfit-backup/' || p_workflow, v_id);
  return v_id;
end
$function$
