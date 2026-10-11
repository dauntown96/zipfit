CREATE OR REPLACE FUNCTION public.ops_backup_poll()
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- zipfit-backup backup.yml 실행 기록을 받는다(2026-10-11 · 우편함 「코드 — 고지 회차 2」 10) — cron zipfit-backup-poll 이 매시 부른다.
-- ① 앞 회차 응답을 ops_backup_poll 에 옮기고 실행들을 ops_backup_seen 에 넣는다(run_id 마다 갱신) ② 새로 부르고 요청 번호를 남긴다.
-- 🔴 요청 번호는 다시 쓰일 수 있다 — 응답이 부른 시각 언저리(−1분 ~ +10분)에 생긴 것만 받는다(ops_uptime_fill 과 같다).
-- 비밀값: Vault github_actions_dispatch_token(발송 토큰 · Actions 읽기) — 값은 표·반환에 싣지 않는다.
declare
  v_tok text; v_id bigint;
begin
  with resp as (
    select p.id pid, r.status_code, r.content, r.created
      from public.ops_backup_poll p
      join net._http_response r on r.id = p.net_request_id
     where p.status_note is null
       and r.created >= p.at - interval '1 minute' and r.created < p.at + interval '10 minutes'
  ), runs as (
    select resp.pid, w
      from resp
      cross join lateral jsonb_array_elements(
        case when resp.status_code = 200 and left(ltrim(coalesce(resp.content, '')), 1) = '{'
             then coalesce(resp.content::jsonb -> 'workflow_runs', '[]'::jsonb) else '[]'::jsonb end) w
  ), ins as (
    insert into public.ops_backup_seen (run_id, event, status, conclusion, run_created_at, run_updated_at)
    select (w ->> 'id')::bigint, w ->> 'event', w ->> 'status', w ->> 'conclusion',
           (w ->> 'created_at')::timestamptz, (w ->> 'updated_at')::timestamptz
      from runs
    on conflict (run_id) do update
      set status = excluded.status, conclusion = excluded.conclusion,
          run_updated_at = excluded.run_updated_at, seen_at = now()
    returning run_id
  )
  update public.ops_backup_poll p
     set status_code = resp.status_code, response_at = resp.created, status_note = 'net._http_response',
         runs_seen = (select count(*) from runs where runs.pid = p.id)
    from resp
   where p.id = resp.pid;

  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'github_actions_dispatch_token';
  if coalesce(v_tok, '') = '' then
    raise exception 'Vault github_actions_dispatch_token 없음';
  end if;
  v_id := net.http_get(
    url := 'https://api.github.com/repos/dauntown96/zipfit-backup/actions/workflows/backup.yml/runs?per_page=10',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'zipfit-pg-cron'),
    timeout_milliseconds := 20000);
  insert into public.ops_backup_poll (net_request_id) values (v_id);
  return v_id;
end
$function$
