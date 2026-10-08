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
$function$
