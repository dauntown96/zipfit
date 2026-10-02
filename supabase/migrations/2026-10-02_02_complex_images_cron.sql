-- LH 단지 이미지 탭 목록 수집 cron — collect-lh-images 배포(Actions) · 시험 수집(?id=) 뒤에 등록한다(2026-10-02).
-- 주기: KST 09:17~18:47 30분마다(UTC 0~9시 17·47분). 새 공고·첨부 바뀐 공고·실패 6시간 뒤만 처리하므로 할 일이 없는 런은 대상 조회 3회로 끝난다.
--   수집(0·10…분) · 링크 갱신(3·13…분) · 발송기(6·16…분) · 홍보물(5·35분)과 분이 겹치지 않게 17·47분.
-- 시크릿은 Vault 에서 실행 시점에 읽는다(zipfit-collect-lh-promo 와 같은 꼴 — 명령문에 값을 남기지 않는다).
-- 되돌리기: select cron.unschedule('zipfit-collect-lh-images');
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-collect-lh-images') then raise exception 'GUARD job exists'; end if;
  if to_regclass('public.announcement_complex_images') is null then raise exception 'GUARD table missing'; end if;
end $$;
select cron.schedule('zipfit-collect-lh-images', '17,47 0-9 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-images?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);
