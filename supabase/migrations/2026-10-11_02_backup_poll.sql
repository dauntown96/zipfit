-- 백업 점검 항목 살리기(2026-10-11 · 우편함 「코드 — 고지 회차 2」 10 · 「고지 회차 1」 회신 7 ③ 설계).
--   health-ops 는 DB 를 읽기 전용으로만 읽어 Vault 토큰으로 GitHub 를 부를 수 없다 → pg_cron 이 zipfit-backup 의 실행 기록을 받아 표에 남기고 점검은 그 표를 읽기만 한다.
--   🔴 설계와 다른 점 — 「커밋 목록」(/commits)이 아니라 「backup.yml 실행 기록」(/actions/workflows/backup.yml/runs)을 받는다.
--      발송 토큰(Vault github_actions_dispatch_token · fine-grained · Actions 읽기·쓰기)은 저장소 내용 읽기 권한이 없어 /commits 가 403 이다(2026-10-11 실측 · net.http_get 1회).
--      /actions/…/runs 는 200(같은 날 실측 — 최근 5회: workflow_dispatch 18:00 UTC 성공 109~119초 · schedule 예비 21~22시 성공 12~14초).
--   「실제 백업」 = 성공(conclusion success) ∧ 걸린 시간 ≥ 45초. 관문(gate)만 돌고 백업 job 을 건너뛴 실행도 성공으로 끝나므로(10여 초) 시간으로 가른다.
--      성공 = 덤프·검증·커밋 스텝이 모두 통과(검증에 실패하면 커밋하지 않고 실패로 끝난다 — backup.yml) — 그래서 「실제 백업 성공 ≤ 25시간」 ≈ 「backup: 커밋 ≤ 25시간」.
--   1) ops_backup_poll — 부른 기록(요청 번호 · 응답 상태). 2) ops_backup_seen — 받은 실행(run_id 마다 1행 · 갱신).
--   3) ops_backup_poll() — 앞 회차 응답을 옮긴 뒤 새로 부른다(ops_uptime_ping 과 같은 꼴 · 응답 행은 몇 시간 안에 사라진다 #372).
--   4) cron zipfit-backup-poll — 매시 12분(백업 18:00 UTC 끝 → 19:12 요청 · 20:12 에 옮겨 적힘).
--   공개 역할 권한 0 · 실행은 service_role 만 · search_path 고정. 비밀값(토큰)은 표·반환에 싣지 않는다. 지우는 문장 없음(행은 하루 몇 개).
--   되돌리기: select cron.unschedule('zipfit-backup-poll'); drop function ops_backup_poll(); drop table ops_backup_seen, ops_backup_poll;
-- zipfit:function ops_backup_poll() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-backup-poll') then raise exception 'GUARD job exists'; end if;
end $$;

create table public.ops_backup_poll (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  net_request_id bigint,
  status_code    integer,
  response_at    timestamptz,
  runs_seen      integer,
  status_note    text
);
alter table public.ops_backup_poll enable row level security;
revoke all on table public.ops_backup_poll from public, anon, authenticated;
grant select, insert, update on table public.ops_backup_poll to service_role;
comment on table public.ops_backup_poll is 'zipfit-backup backup.yml 실행 기록을 부른 기록(2026-10-11 고지 회차 2 · 10) — ops_backup_poll() 이 매시 남기고 다음 회차가 응답을 옮긴다';

create table public.ops_backup_seen (
  run_id         bigint primary key,
  event          text,
  status         text,
  conclusion     text,
  run_created_at timestamptz,
  run_updated_at timestamptz,
  seen_at        timestamptz not null default now()
);
alter table public.ops_backup_seen enable row level security;
revoke all on table public.ops_backup_seen from public, anon, authenticated;
grant select, insert, update on table public.ops_backup_seen to service_role;
comment on table public.ops_backup_seen is 'zipfit-backup backup.yml 실행(GitHub Actions runs · 2026-10-11 고지 회차 2 · 10) — health-ops backup 이 「성공 ∧ 45초 이상」 마지막 실행을 읽는다';

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
$function$;
revoke execute on function public.ops_backup_poll() from public, anon, authenticated;
grant execute on function public.ops_backup_poll() to service_role;

select cron.schedule('zipfit-backup-poll', '12 * * * *', $cmd$
  -- zipfit-backup backup.yml 실행 기록 수집(2026-10-11 고지 회차 2 · 10) — health-ops backup 이 ops_backup_seen 을 읽는다.
  select public.ops_backup_poll();
$cmd$);
