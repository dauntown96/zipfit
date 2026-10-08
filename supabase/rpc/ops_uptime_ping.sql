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
$function$
