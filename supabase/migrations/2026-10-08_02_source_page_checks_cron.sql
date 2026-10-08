-- 원문 키 정기 대조 cron — check-source-pages 배포(Actions) · 시험 수집 뒤에 등록한다(2026-10-08 · 우편함 「코드 — 3-B ③ …」 2).
-- 주기: 하루 두 회차 — UTC 11:30~11:50 · 21:30~21:50(KST 20:30 · 06:30) 5분 간격 다섯 번. 한 호출은 100초 예산 안에서
--   「최근 6시간 안에 대조하지 않은 열린 원문 키」를 처리하고 남은 것은 같은 회차의 다음 호출이 받는다(2026-10-08 열린 키 63 · 페이지 약 3초).
--   할 일이 없는 호출은 대상 조회 두 번으로 끝난다. 수집(UTC 0~9시 · 18:00 · 23:40·23:50) · SH(0·3·6·9시) · 홍보물·이미지(0~9시)와 겹치지 않는다.
-- 시크릿은 Vault 에서 실행 시점에 읽는다(zipfit-collect-lh-images 와 같은 꼴 — 명령문에 값을 남기지 않는다).
-- 되돌리기: select cron.unschedule('zipfit-check-source-pages');
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-check-source-pages') then raise exception 'GUARD job exists'; end if;
  if to_regclass('public.source_page_checks') is null then raise exception 'GUARD table missing'; end if;
end $$;
select cron.schedule('zipfit-check-source-pages', '30-50/5 11,21 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/check-source-pages?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);
