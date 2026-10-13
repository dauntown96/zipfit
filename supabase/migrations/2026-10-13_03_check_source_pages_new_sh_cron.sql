-- 새 SH 공고 원문 대조 cron — SH 수집 10분 뒤 「한 번도 대조된 적 없는 SH 키만」(2026-10-13 · 우편함 「코드 — SH 새 공고 진입 지연 · SH 자치구」 2).
-- 계기: 접수기간 없는 SH 공고는 원문 대조(source_page_checks)의 SH 목록 모집상태 「모집중」이 있어야 분석 대기열 후보가 된다(analysis_dispatch_tick).
--   정기 대조(zipfit-check-source-pages)는 UTC 11:30 · 21:30 회차(KST 20:30 · 06:30)뿐이라, 아침 SH 수집분(UTC 0시 = KST 09시)은 첫 대조까지
--   약 11시간 반을 기다렸다 — SH_311349(10-13 09:00 KST 수집)가 대기열·대조 0인 채 남았다.
-- 주기: SH 수집(zipfit-collect-sh-announcements · UTC 0·3·6·9시 정각)의 10분 뒤. 한 호출 = check-source-pages ?mode=collect&new=sh
--   (오류 없는 대조 행이 한 건도 없는 열린 SH 키만 · 없으면 대상 조회 두 번으로 끝난다). 이미 대조된 키는 정기 회차 몫 그대로다 —
--   과거 SH 공고가 한꺼번에 대기열에 들지 않는다. 대조가 「모집중」을 남기면 다음 발송 판정(zipfit-analysis-dispatch · 10분 간격 6분)이 집는다.
-- 시크릿은 Vault 에서 실행 시점에 읽는다(zipfit-check-source-pages 와 같은 꼴 — 명령문에 값을 남기지 않는다).
-- 되돌리기: select cron.unschedule('zipfit-check-source-pages-new-sh');
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-check-source-pages-new-sh') then raise exception 'GUARD job exists'; end if;
  if not exists (select 1 from cron.job where jobname = 'zipfit-check-source-pages') then raise exception 'GUARD base job missing'; end if;
end $$;
select cron.schedule('zipfit-check-source-pages-new-sh', '10 0,3,6,9 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/check-source-pages?mode=collect&new=sh',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);
