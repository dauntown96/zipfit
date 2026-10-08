-- 백업·생존 신호 예약을 GitHub 밖으로(2026-10-08 · 우편함 「코드 — 운영 기반 후속」 1 · 백로그 「남은 GitHub 예약 실행 의존」).
--   zipfit-backup 의 backup.yml(03:00 KST 예약)이 2.6~5.8시간 늦게 돌았다(10-02~10-07 성공 커밋 20:38~23:47 UTC).
--   health-ops·health-screen 과 같은 길: pg_cron 이 ops_backup_dispatch() 로 zipfit-backup 워크플로를 workflow_dispatch 로 부른다.
--   · backup.yml    — 매일 18:00 UTC(KST 03:00) · cron zipfit-backup-dispatch
--   · heartbeat.yml — 매일 18:40 UTC(KST 03:40) · cron zipfit-heartbeat-dispatch
--   입력 trigger=pg_cron 을 싣는다 — 워크플로가 「오늘(UTC) 이미 성공 커밋이 있으면 건너뜀」 관문을 이 발송과 예비 schedule 에만 건다(사람의 수동 실행은 그대로).
--   토큰: Vault github_actions_dispatch_token(2026-10-08 다운님이 저장소 범위에 zipfit-backup 추가 · Actions 읽기·쓰기 — 10-08 실측 200).
--   발송 기록 ops_dispatch_log(target 'zipfit-backup/backup.yml' · 'zipfit-backup/heartbeat.yml') — health-ops 가 25시간 안 · 204 를 본다.
--   🔴 공개 역할 실행 0 · service_role 만 · search_path 고정. 표 변경 0.
--   되돌리기: cron.unschedule 둘 + drop function public.ops_backup_dispatch(text) — 워크플로의 GitHub schedule 은 예비로 남아 있다.
-- zipfit:function ops_backup_dispatch(text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
DO $$ begin
  if exists (select 1 from cron.job where jobname in ('zipfit-backup-dispatch', 'zipfit-heartbeat-dispatch')) then raise exception 'GUARD job exists'; end if;
end $$;

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
$function$;
revoke execute on function public.ops_backup_dispatch(text) from public, anon, authenticated;
grant execute on function public.ops_backup_dispatch(text) to service_role;

select cron.schedule('zipfit-backup-dispatch', '0 18 * * *', $cmd$ select public.ops_backup_dispatch('backup.yml'); $cmd$);
select cron.schedule('zipfit-heartbeat-dispatch', '40 18 * * *', $cmd$ select public.ops_backup_dispatch('heartbeat.yml'); $cmd$);
