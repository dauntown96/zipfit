CREATE OR REPLACE FUNCTION public.ops_dispatch_log_fill()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- 발송 응답을 ops_dispatch_log 로 옮겨 적는다(2026-10-07 · 우편함 「코드 — Z-2 …」 10 · 이슈 #372).
-- 🔴 왜: net._http_response 는 오래 남지 않는다(2026-10-07 03:3xZ — 남은 응답 11행 · 가장 오래된 것 02:40Z · pg_net 요청 번호가 14355 → 4 로 다시 시작).
--    하루 한 번 발송(health-screen 23:50Z)의 응답이 몇 시간 안에 사라져 health-ops 가 「응답 대기」로 실패했다(#372 · 실제 발송은 GitHub 실행 23:50:01Z 성공).
-- ops_health_dispatch()·ops_screen_dispatch() 가 발송하기 전에 부른다(25·55분) — 앞선 발송(화면 점검 23:50Z 는 23:55Z 에)의 응답을 옮긴다.
-- 🔴 요청 번호는 다시 쓰일 수 있다 — 응답이 그 발송 시각 언저리(−1분 ~ +10분)에 생긴 것만 받는다(다른 날 같은 번호의 응답을 잡지 않게).
-- 옮겨 적은 행: status_note = 'net._http_response'. 응답 행이 없으면 그대로 둔다(점검기는 응답 칸이 비고 응답 행도 없으면 「응답 대기」).
declare
  n integer;
begin
  update public.ops_dispatch_log l
     set status_code = r.status_code,
         error_msg = left(coalesce(r.error_msg, case when r.status_code >= 300 then r.content end), 200),
         response_at = r.created,
         status_note = 'net._http_response'
    from net._http_response r
   where r.id = l.net_request_id
     and l.status_note is null
     and r.created >= l.at - interval '1 minute' and r.created < l.at + interval '10 minutes';
  get diagnostics n = row_count;
  return n;
end
$function$
