-- pg_cron 실행 기록(cron.job_run_details) 30일 보관 잡(2026-11-02 · 우편함 「코드·운영 — 런칭 뒤 첫 주 묶음 …」 B · 백로그 「지우는 장치가 없는 기록이 쌓인다」 ①).
-- 계기: pg_cron 은 실행 기록을 지우지 않는다 — 2026-06-23 첫 행부터 31,6xx행 · 10 MB(하루 약 1,070행 · 23잡). Supabase 문서의 정리 꼴(하루 1회 DELETE)을 따른다.
-- 30일인 까닭 — 이 표를 읽는 우리 쪽 소비처의 가장 긴 창이 8일이다(2026-11-02 grep · 저장소 + DB 함수 본문):
--   .github/health/ops-check.mjs job_fail_24h(24시간) · promo/images_last_run_age_min(마지막 1행 — 잡이 매일 돈다) · collect-backlog.mjs(24시간) ·
--   sh-run.mjs(24시간) · docs/ops-audit.sql ①(8일) · ⑥(행 수·크기만). public·zipfit_ops 함수 본문에 cron.job_run_details 0 · zipfit-backup 0.
-- 시각: KST 00:17(UTC 15:17) — 같은 시간대 정리 잡(14 zipfit-purge-usage-events 15:00 · 16·57 15:10)과 떼고 :x0·:x5 를 피했다.
-- start_time 으로 자른다 — 도는 중인 행은 end_time 이 비어 있다(end_time 기준이면 영영 안 지워진다).
-- 시크릿 없음 · 순수 DELETE. 되돌리기: select cron.unschedule('zipfit-purge-cron-run-details');
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-purge-cron-run-details') then raise exception 'GUARD job exists'; end if;
end $$;
select cron.schedule('zipfit-purge-cron-run-details', '17 15 * * *', $cmd$delete from cron.job_run_details where start_time < now() - interval '30 days'$cmd$);
