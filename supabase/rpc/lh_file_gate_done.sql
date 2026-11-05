CREATE OR REPLACE FUNCTION public.lh_file_gate_done(p_log_id bigint, p_outcome text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lh_file_gate 가 허락한 받기의 결과를 같은 기록 행에 적는다(2026-11-05) — EF fetch-attachment 가 응답을 돌려주기 직전에 부른다.
-- p_outcome = 'ok'(받음 · 올림) 또는 실패 사유(fail · truncated · html_response · http_4xx …) — 실패 행은 「재시도 한 번까지」 셈에 든다.
update public.lh_file_fetch_log
   set outcome = left(coalesce(p_outcome, 'fail'), 60), outcome_at = now()
 where id = p_log_id and allowed and outcome is null;
$function$
