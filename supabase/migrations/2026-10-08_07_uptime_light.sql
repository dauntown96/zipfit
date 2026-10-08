-- 바깥 감시 경량화(2026-10-08 · 우편함 「코드 — 운영 기반 후속」 5) — site 대상이 첫 화면 전체(599KB)를 10분마다 받던 것을 앞 4KB(Range: bytes=0-4095 → 206)로.
--   2026-10-08 실측: https://kkokzip.com/ Range 0-4095 → 206 · content-range bytes 0-4095/602658 · 앞 4KB 에 <title>꼭집 — 꼭 맞는 집만 꼭 집어서 · 「꼭집」 5회.
--   판정은 그대로다: 성공 = HTTP 2xx·3xx(206 포함) ∧ 본문 표식 「꼭집」(ops_uptime_fill 변경 0). rest 대상 변경 0.
--   되돌리기: 사본 ops_uptime_ping.sql 의 이전 정의(커밋 84d5324)로 되돌리는 새 마이그레이션.
-- zipfit:function ops_uptime_ping() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
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
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs';
begin
  perform public.ops_uptime_fill();
  -- 🔵 2026-10-08(운영 기반 후속 5) — 첫 4KB 만 받는다(Range · 206). 종전에는 첫 화면 전체(599KB)를 10분마다 받아 net._http_response 에 쌓았다.
  --    첫 4KB 에 <title>꼭집 …</title> 이 있어 「꼭집 페이지가 떠 있다」를 그대로 증명한다(ops_uptime_fill 의 본문 표식 「꼭집」 그대로).
  v_site := net.http_get(
    url := 'https://kkokzip.com/',
    headers := jsonb_build_object('User-Agent', 'ZipFitBot-uptime', 'Cache-Control', 'no-cache', 'Range', 'bytes=0-4095'),
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
