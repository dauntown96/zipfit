-- GH 들이기(2026-11-17 · 우편함 「코드·운영 — GH 들이기: 마감일 있는 GH 공고만 수집·대기열·카드 …」 2 · 다운님 승인 2026-11-16 권장 A 「마감일 있는 것만 지금」)
-- 뜻: collect-gh-announcements ?mode=collect 를 하루 4회 불러 announcements 에 GH_<pbancNo> 를 쓴다.
--   🔴 새로 들이는 것은 목록 마감일 칸이 날짜인 열린 공고만(결정 ③ — 「-」 운영기관 상시 접수는 들이지 않음 · EF readLists datedOnly).
--   관찰(zipfit-gh-observe · 09:31 등)은 그대로 둔다 — 「-」 공고를 언제 내리나 재는 장치.
-- cron: zipfit-collect-gh-announcements '38 0,3,6,9 * * *'(UTC) = KST 09:38·12:38·15:38·18:38 — 관찰 7분 뒤(같은 호스트에 겹쳐 부르지 않음) · 다른 잡과 분이 겹치지 않음 · :20~24·:50~54 밖.
-- 부하: 관찰과 같다 — 목록 GET 3쪽 안팎 + 상세 GET(마감일 있는 열린 공고 · 지금 2) · 20초 안팎 · 표 gh_collection_run_log 하루 4행 더.
-- 되돌리기: select cron.unschedule('zipfit-collect-gh-announcements'); — 들인 행은 남는다(숨기려면 update announcements set hidden_from_listing = true where source = 'GH').
DO $$ begin
  if to_regclass('public.gh_collection_run_log') is null then raise exception 'GUARD gh_collection_run_log missing'; end if;
  if exists (select 1 from cron.job where jobname = 'zipfit-collect-gh-announcements') then raise exception 'GUARD zipfit-collect-gh-announcements exists'; end if;
  if not exists (select 1 from cron.job where jobname = 'zipfit-gh-observe') then raise exception 'GUARD zipfit-gh-observe missing'; end if;
end $$;

select cron.schedule('zipfit-collect-gh-announcements', '38 0,3,6,9 * * *', $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(다른 수집 잡과 같은 꼴). 마감일 있는 열린 GH 공고만 announcements 에 쓴다.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-gh-announcements?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);
