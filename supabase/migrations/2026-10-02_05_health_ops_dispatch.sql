-- 운영 점검 예약을 GitHub 밖으로(2026-10-03 · 우편함 「코드 — #328 해소(ops_gap 경고화) · 운영 점검 예약을 GitHub 밖(pg_cron → workflow_dispatch)으로」 2).
--   계기: health-ops.yml 의 GitHub schedule(25·55분)이 하루 몇 번만 돌았다(10-02 08:39Z 뒤 14:5xZ까지 0회) → ops_gap 실패 → #328 이 닫히지 않음.
--   pg_cron 이 25·55분에 ops_health_dispatch() 로 GitHub API workflow_dispatch 를 부른다(pg_net · Vault github_actions_dispatch_token).
--   발송 기록 ops_dispatch_log(요청 id) — health-ops 가 마지막 발송 응답(204)을 읽는다. RLS 켬 · 정책 0 · 공개 역할 권한 0.
--   🔴 공개 역할(PUBLIC·anon·authenticated) 실행 0 · service_role 만.
--   되돌리기: select cron.unschedule('zipfit-health-ops-dispatch'); (health-ops.yml schedule 을 25·55분으로 되돌리는 PR 과 함께)
-- zipfit:function ops_health_dispatch() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-health-ops-dispatch') then raise exception 'GUARD job exists'; end if;
end $$;
create table public.ops_dispatch_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  target         text not null,
  net_request_id bigint
);
alter table public.ops_dispatch_log enable row level security;
revoke all on table public.ops_dispatch_log from public, anon, authenticated;
grant select, insert, update, delete on table public.ops_dispatch_log to service_role;
comment on table public.ops_dispatch_log is '운영 점검 workflow_dispatch 발송 기록 — ops_health_dispatch() 가 쓰고 health-ops 가 읽는다(2026-10-03)';

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
$function$;

revoke execute on function public.ops_health_dispatch() from public, anon, authenticated;
grant execute on function public.ops_health_dispatch() to service_role;

select cron.schedule('zipfit-health-ops-dispatch', '25,55 * * * *', $cmd$ select public.ops_health_dispatch(); $cmd$);
