CREATE OR REPLACE FUNCTION public.listing_pending_rechecks()
 RETURNS TABLE(announcement_id text, branch text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-23(우편함 「코드·운영 — 열넷째 묶음(단독 · 원칙 29)」) — 분석 대기열에 끝나지 않은 재확인 몫(정정 · 첨부 · 차수)의 공고 id 와 갈래.
--   목록 RPC get_announcements_deduped 가 한 번(MATERIALIZED) 불러 칸 recheck_pending 을 만든다. 대기열 표는 anon·authenticated GRANT 0 이라
--   몫 id·갈래만 내는 SECURITY DEFINER 하나를 둔다(키 글자 · 상태 · 메모 · 실행 번호는 내지 않는다). 갈래 = group_key 의 ' #정정 ' · ' #첨부 ' · ' #차수 '.
--   「끝나지 않음」 = state 가 done · dropped 가 아님(waiting · ready · sent · claimed). ' #접수기간 없음 ' 은 신규 분석이라 뺀다.
  SELECT DISTINCT q.announcement_id, substring(q.group_key FROM ' #(정정|첨부|차수) ') AS branch
  FROM public.analysis_dispatch_queue q
  WHERE q.state NOT IN ('done', 'dropped')
    AND q.group_key ~ ' #(정정|첨부|차수) ';
$function$
