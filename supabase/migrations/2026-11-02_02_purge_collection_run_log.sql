-- LH·MYHOME 수집 런 로그(public.collection_run_log) 90일 보관 잡(2026-11-02 · 우편함 「코드·운영 — zipfit-backup 덤프 보관 규칙 … + collection_run_log 90일 잡 …」 B ·
--   백로그 「지우는 장치가 없는 기록이 쌓인다」 ② · #800 회신 C-2 — 운영 기록 8표 중 보관 장치가 없던 마지막 표).
-- 90일인 까닭 — 이 표를 읽는 곳의 가장 긴 창이 7일이다(2026-11-02 grep · 저장소 + DB 함수 본문):
--   .github/health/ops-check.mjs(24시간 · 마지막 1행) · lh-gone.mjs(7일) · docs/ops-audit.sql ④(7일) · get_last_collected_at()(max 1행) ·
--   불변식은 권한·정책만 본다(날짜 창 0) · index.html 0 · 그 밖의 public·zipfit_ops 함수 본문 0. SH 로그(sh_collection_run_log · jobid 16)와 같은 90일.
-- 시각: KST 00:27(UTC 15:27) — 같은 시간대 정리 잡(14 · 15:00 · 16·57 · 15:10 · 71 · 15:17)과 떼고 :x0·:x5 를 피했다. 하루 호출 +1.
-- 시크릿 없음 · 순수 DELETE. 되돌리기: select cron.unschedule('zipfit-purge-collection-run-log');
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-purge-collection-run-log') then raise exception 'GUARD job exists'; end if;
end $$;
select cron.schedule('zipfit-purge-collection-run-log', '27 15 * * *', $cmd$delete from public.collection_run_log where run_at < now() - interval '90 days'$cmd$);
