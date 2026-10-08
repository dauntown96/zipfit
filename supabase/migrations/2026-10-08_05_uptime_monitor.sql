-- 바깥 감시 1단계 — pg_cron 이 배포 사이트와 공개 REST 를 10분마다 부르고 응답을 지워지지 않는 표에 옮긴다(2026-10-08 · 우편함 「운영 기반 묶음」 5).
--   1) ops_uptime_log — 부른 기록 1행(대상 · 요청 번호) · 응답(상태 · 오류 · 응답 시각 · 본문 길이 · 본문 표식)은 다음 회차가 옮겨 적는다.
--      🔴 net._http_response 는 몇 시간 안에 비워진다(#372) — 판정 재료는 이 표에만 남긴다. 90일 지난 기록은 지운다.
--   2) ops_uptime_fill() — net._http_response 에서 응답을 옮긴다(ops_dispatch_log_fill 과 같은 꼴 · 부른 시각 −1분 ~ +10분 응답만).
--   3) ops_uptime_ping() — 앞 회차 응답을 옮긴 뒤 두 대상을 부른다: 배포 사이트 https://kkokzip.com/ · 공개 REST(anon 키 · announcements 1행).
--   4) cron zipfit-uptime-ping — 10분마다(*/10).
--   health-ops 의 uptime 점검이 이 표를 읽는다 — 대상마다 최근 연속 실패 3회 = 실패 · 1~2회 = ⚠️.
--   🔴 한계: DB·Supabase 가 죽으면 이 감시도 함께 죽는다(바깥 서비스는 2단계).
--   공개 역할 권한 0 · 실행은 service_role 만(발송 함수와 같다) · search_path 고정.
--   되돌리기: select cron.unschedule('zipfit-uptime-ping'); drop function ops_uptime_ping(), ops_uptime_fill(); drop table ops_uptime_log;
-- zipfit:function ops_uptime_fill() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function ops_uptime_ping() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-uptime-ping') then raise exception 'GUARD job exists'; end if;
end $$;

create table public.ops_uptime_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  target         text not null,
  url            text not null,
  net_request_id bigint,
  status_code    integer,
  error_msg      text,
  response_at    timestamptz,
  body_bytes     integer,
  body_ok        boolean,
  status_note    text
);
create index ops_uptime_log_target_at on public.ops_uptime_log (target, at desc);
alter table public.ops_uptime_log enable row level security;
revoke all on table public.ops_uptime_log from public, anon, authenticated;
grant select, insert, update, delete on table public.ops_uptime_log to service_role;
comment on table public.ops_uptime_log is '바깥 감시 1단계 — ops_uptime_ping() 이 10분마다 부른 기록과 응답(2026-10-08) · health-ops uptime 이 읽는다 · 90일 보관';
comment on column public.ops_uptime_log.body_ok is '본문 표식 — site: 「꼭집」 포함 · rest: JSON 배열. 응답 전 NULL';
comment on column public.ops_uptime_log.status_note is '응답을 어디서 옮겼나 — net._http_response(ops_uptime_fill). NULL 이면 아직 못 옮겼다';

CREATE OR REPLACE FUNCTION public.ops_uptime_fill()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 바깥 감시 응답을 ops_uptime_log 로 옮겨 적는다(2026-10-08 · 우편함 「운영 기반 묶음」 5).
-- net._http_response 는 몇 시간 안에 비워진다(#372) — ops_uptime_ping() 이 부르기 전에 앞 회차 응답을 옮긴다.
-- 🔴 요청 번호는 다시 쓰일 수 있다 — 응답이 부른 시각 언저리(−1분 ~ +10분)에 생긴 것만 받는다(ops_dispatch_log_fill 과 같다).
declare
  n integer;
begin
  update public.ops_uptime_log l
     set status_code = r.status_code,
         error_msg = left(coalesce(r.error_msg, case when r.timed_out then '시간 초과' end), 200),
         response_at = r.created,
         body_bytes = octet_length(r.content),
         body_ok = case when r.status_code is null then false
                        when l.target = 'site' then position('꼭집' in coalesce(r.content, '')) > 0
                        else left(ltrim(coalesce(r.content, '')), 1) = '[' end,
         status_note = 'net._http_response'
    from net._http_response r
   where r.id = l.net_request_id
     and l.status_note is null
     and r.created >= l.at - interval '1 minute' and r.created < l.at + interval '10 minutes';
  get diagnostics n = row_count;
  return n;
end
$function$;
revoke execute on function public.ops_uptime_fill() from public, anon, authenticated;
grant execute on function public.ops_uptime_fill() to service_role;

CREATE OR REPLACE FUNCTION public.ops_uptime_ping()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 바깥 감시 1단계(2026-10-08 · 우편함 「운영 기반 묶음」 5) — cron zipfit-uptime-ping 이 10분마다 부른다.
-- 앞 회차 응답을 옮긴 뒤 두 대상을 부르고 요청 번호를 ops_uptime_log 에 남긴다. 90일 지난 기록은 지운다.
--   site — 배포 사이트 첫 화면(GitHub Pages · 사용자 도메인)
--   rest — 공개 REST(anon 키 — index.html 에 공개된 값 · announcements 1행) — 화면이 공고를 읽는 길
-- 🔴 DB 가 죽으면 이 감시도 함께 죽는다 — 그 축은 바깥 서비스(2단계) 몫이다.
declare
  v_site bigint; v_rest bigint;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs';
begin
  perform public.ops_uptime_fill();
  v_site := net.http_get(
    url := 'https://kkokzip.com/',
    headers := jsonb_build_object('User-Agent', 'ZipFitBot-uptime', 'Cache-Control', 'no-cache'),
    timeout_milliseconds := 20000);
  v_rest := net.http_get(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/rest/v1/announcements?select=announcement_id&limit=1',
    headers := jsonb_build_object('apikey', v_anon, 'Authorization', 'Bearer ' || v_anon, 'User-Agent', 'ZipFitBot-uptime'),
    timeout_milliseconds := 20000);
  insert into public.ops_uptime_log (target, url, net_request_id) values
    ('site', 'https://kkokzip.com/', v_site),
    ('rest', '/rest/v1/announcements?select=announcement_id&limit=1', v_rest);
  delete from public.ops_uptime_log where at < now() - interval '90 days';
  return 2;
end
$function$;
revoke execute on function public.ops_uptime_ping() from public, anon, authenticated;
grant execute on function public.ops_uptime_ping() to service_role;

select cron.schedule('zipfit-uptime-ping', '*/10 * * * *', $cmd$ select public.ops_uptime_ping(); $cmd$);
