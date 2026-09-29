-- 매입 홍보물 목록 수집 cron — collect-lh-promo 배포(Actions) 성공 뒤에 등록한다.
-- 주기: KST 09:05~18:35 30분마다(UTC 0~9시 5·35분). LH 공고는 낮에 올라오고, 이 함수는 새 공고·첨부 바뀐 공고만 처리하므로
--   할 일이 없는 런은 대상 조회 3회로 끝난다. collect-announcements(10분마다 0분대)와 분이 겹치지 않게 5·35분.
-- 시크릿은 Vault 에서 실행 시점에 읽는다(jobid 4 와 같은 이유 — 명령문에 값을 남기지 않는다).
-- 되돌리기: select cron.unschedule('zipfit-collect-lh-promo');
begin;
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-collect-lh-promo') then raise exception 'GUARD job exists'; end if;
end $$;
select cron.schedule('zipfit-collect-lh-promo', '5,35 0-9 * * *', $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(jobid 4와 동일한 이유).
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-promo?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);
commit;
