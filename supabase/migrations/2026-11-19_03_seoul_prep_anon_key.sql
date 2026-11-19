-- zipfit:function ops_project_anon_key() acl={postgres=X/postgres,service_role=X/postgres} secdef=true
-- zipfit:function ops_uptime_ping() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 서울 이전 준비 ①′(2026-11-19 · 우편함 「코드·운영 — 10장」 ② · 「서울 이전 준비 ①」 회신 ⑦ · claude.ai 검증 동의).
-- 뜻: DB 안 공개 anon 키를 zipfit_ops.project_self 한 행에 모은다 — 동작 변화 0(같은 REST · 같은 키 · 같은 주기).
--   ① zipfit_ops.project_self.anon_key — JWT 세 마디 꼴 CHECK · NOT NULL · 값 = 지금 키(index.html 에 공개된 값 · 비밀 아님).
--   ② public.ops_project_anon_key() — 그 칸을 돌려준다 · 없으면 던진다 · SECURITY DEFINER(ops_project_url 과 같은 까닭) · postgres·service_role 만.
--   ③ ops_uptime_ping — v_anon 글자 대신 ops_project_anon_key()(그 밖 한 글자도 같다).
-- 이전 날: update zipfit_ops.project_self set ref = '<새 ref>', anon_key = '<새 anon 키>', updated_at = now();
-- 되돌리기: ops_uptime_ping 을 supabase/rpc 앞 판으로 되돌리는 새 마이그레이션 → drop function public.ops_project_anon_key(); alter table zipfit_ops.project_self drop column anon_key;
alter table zipfit_ops.project_self
  add column anon_key text check (anon_key ~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$');
update zipfit_ops.project_self set anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs', updated_at = now() where id;
alter table zipfit_ops.project_self alter column anon_key set not null;
comment on column zipfit_ops.project_self.anon_key is '자기 프로젝트 공개 anon 키(2026-11-19 · 서울 이전 준비 ①′) — public.ops_project_anon_key() 가 읽는다 · 비밀 아님(index.html 에 공개) · 이전 날 ref 와 함께 바꾼다.';

CREATE OR REPLACE FUNCTION public.ops_project_anon_key()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 자기 프로젝트 공개 anon 키(2026-11-19 · 우편함 「코드·운영 — 10장」 ② · 서울 이전 준비 ①′) — ops_uptime_ping 이 공개 REST 를 부를 때 쓴다.
--   값의 자리는 zipfit_ops.project_self 한 행(anon_key) — 이전 날 ref 와 함께 바꾼다. 비밀값 아님(화면 index.html 에 공개된 값).
--   🔴 행이 없거나 비면 던진다.
declare v text;
begin
  select s.anon_key into v from zipfit_ops.project_self s where s.id;
  if v is null then
    raise exception 'zipfit_ops.project_self 에 anon_key 가 없다';
  end if;
  return v;
end
$function$;
revoke execute on function public.ops_project_anon_key() from public, anon, authenticated;
grant execute on function public.ops_project_anon_key() to service_role;
comment on function public.ops_project_anon_key() is '자기 프로젝트 공개 anon 키 — zipfit_ops.project_self 한 행에서(2026-11-19 · 서울 이전 준비 ①′)';

CREATE OR REPLACE FUNCTION public.ops_uptime_ping()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 바깥 감시 1단계(2026-10-08 · 우편함 「운영 기반 묶음」 5) — cron zipfit-uptime-ping 이 10분마다 부른다.
-- 앞 회차 응답을 옮긴 뒤 두 대상을 부르고 요청 번호를 ops_uptime_log 에 남긴다. 90일 지난 기록은 지운다.
--   site — 배포 사이트 첫 화면 앞 4KB(Range · GitHub Pages · 사용자 도메인)
--   rest — 공개 REST(anon 키 — index.html 에 공개된 값 · announcements 1행) — 화면이 공고를 읽는 길
-- 🔴 DB 가 죽으면 이 감시도 함께 죽는다 — 그 축은 바깥 서비스(2단계) 몫이다.
declare
  v_site bigint; v_rest bigint;
  v_anon constant text := public.ops_project_anon_key();  -- 🔵 2026-11-19 공개 anon 키는 zipfit_ops.project_self(서울 이전 준비 ①′)
begin
  perform public.ops_uptime_fill();
  -- 🔵 2026-10-08(운영 기반 후속 5) — 첫 4KB 만 받는다(Range · 206). 종전에는 첫 화면 전체(599KB)를 10분마다 받아 net._http_response 에 쌓았다.
  --    첫 4KB 에 <title>꼭집 …</title> 이 있어 「꼭집 페이지가 떠 있다」를 그대로 증명한다(ops_uptime_fill 의 본문 표식 「꼭집」 그대로).
  v_site := net.http_get(
    url := 'https://kkokzip.com/',
    headers := jsonb_build_object('User-Agent', 'ZipFitBot-uptime', 'Cache-Control', 'no-cache', 'Range', 'bytes=0-4095'),
    timeout_milliseconds := 20000);
  v_rest := net.http_get(
    url := public.ops_project_url() || '/rest/v1/announcements?select=announcement_id&limit=1',  -- 🔵 2026-11-19 주소는 ops_project_url()(서울 이전 준비 ①)
    headers := jsonb_build_object('apikey', v_anon, 'Authorization', 'Bearer ' || v_anon, 'User-Agent', 'ZipFitBot-uptime'),
    timeout_milliseconds := 20000);
  insert into public.ops_uptime_log (target, url, net_request_id) values
    ('site', 'https://kkokzip.com/', v_site),
    ('rest', '/rest/v1/announcements?select=announcement_id&limit=1', v_rest);
  delete from public.ops_uptime_log where at < now() - interval '90 days';
  return 2;
end
$function$;

DO $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public','zipfit_ops') and p.prosrc like '%XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs%') then
    raise exception 'GUARD 뒤 함수 본문 anon 키 글자 남음';
  end if;
  if exists (select 1 from cron.job where command like '%XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs%') then raise exception 'GUARD cron 명령 anon 키'; end if;
  if public.ops_project_anon_key() <> 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs' then raise exception 'GUARD ops_project_anon_key 값'; end if;
end $$;
