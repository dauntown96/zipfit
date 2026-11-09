-- LH 첨부 문지기 기록(public.lh_file_fetch_log) 90일 보관 잡(2026-11-09 · 우편함 「코드·운영 — 차수 발송 다시 켜기(본문 처리) + 보안 권고 허용 목록 한 줄
--   (lh_file_fetch_log) + 문지기 기록 90일 정리 cron」 3장 · 앞 회차 「LH 첨부 경로(lhFile.do) 사용 중단 …」 검증 ②).
-- 이 표를 읽는 곳(2026-11-09 grep · 저장소 + DB 함수 본문):
--   .github/health/ops-check.mjs ℹ️ lh_file_mode(24시간) · lh_file_gate(같은 file_id 의 성공·실패 행 — 날짜 창 없음) · lh_file_gate_done(자기 행 id) · index.html 0.
--   🔵 lh_file_gate 는 「이미 받은 파일」·「실패 두 번」을 이 표로 센다 — 90일 넘은 행이 지워지면 그 파일은 essential 에서 다시 한 번(+재시도 한 번) 허락된다.
--      열린 공고 첨부만 허락하는 모드라 90일 넘게 열린 공고의 같은 파일에서만 생긴다(요청서가 정한 90일 그대로 · 회신 ⑦).
-- 시각: KST 00:37(UTC 15:37) — 같은 시간대 정리 잡(14 · 15:00 · 16·57 · 15:10 · 71 · 15:17 · 73 · 15:27)과 떼고 :x0·:x5 를 피했다. 하루 호출 +1.
-- 시크릿 없음 · 순수 DELETE. 되돌리기: select cron.unschedule('zipfit-purge-lh-file-fetch-log');
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-purge-lh-file-fetch-log') then raise exception 'GUARD job exists'; end if;
end $$;
select cron.schedule('zipfit-purge-lh-file-fetch-log', '37 15 * * *', $cmd$delete from public.lh_file_fetch_log where at < now() - interval '90 days'$cmd$);
