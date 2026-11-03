-- GH 2-0 관찰 장치(2026-11-03 · 우편함 「코드·운영 — GH 2-0 관찰 장치(카드 0) · nexacro XML 거름 · ② 표 한 줄 · 결론 낱말 ⚠️」 2)
-- 뜻: collect-gh-announcements ?mode=observe 가 하루 4회 목록·상세를 읽고 announcements 에는 쓰지 않은 채 요약 한 행만 남긴다.
--   열린 GH 공고가 전부 마감 「-」(운영기관 상시 접수)라 다운님 결정 ③ 「1~2주 동안 GH 가 그 공고를 언제 내리나 보고 다시 판정」을 재는 장치다.
-- 칸: mode(collect · observe) · observed(지금 열린 공고 [{id, board, status_raw, close_raw, title, hidden}]) · appeared · disappeared(직전 관찰 행 대비 id 목록).
-- 권한 그대로: RLS on · 정책 0 · service_role select·insert 만(EF 가 직전 관찰 행을 읽는다).
-- cron: zipfit-gh-observe '31 0,3,6,9 * * *'(UTC) = KST 09:31·12:31·15:31·18:31 — 다른 잡과 분이 겹치지 않고 5의 배수·:20~24·:50~54 밖.
-- 부하: 한 번에 GH 목록 GET 3쪽 안팎 + 상세 GET(열린 공고 수 · 지금 5) · 18초 안팎(1단계 probe 실측) · 표 하루 4행.
-- 되돌리기: select cron.unschedule('zipfit-gh-observe'); alter table public.gh_collection_run_log drop column mode, drop column observed, drop column appeared, drop column disappeared;
DO $$ begin
  if to_regclass('public.gh_collection_run_log') is null then raise exception 'GUARD gh_collection_run_log missing'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gh_collection_run_log' and column_name = 'observed') then
    raise exception 'GUARD observed exists'; end if;
  if exists (select 1 from cron.job where jobname = 'zipfit-gh-observe') then raise exception 'GUARD zipfit-gh-observe exists'; end if;
  if exists (select 1 from cron.job where jobname like '%collect-gh%') then raise exception 'GUARD GH collect cron exists — 2-0 은 관찰만'; end if;
end $$;

alter table public.gh_collection_run_log
  add column mode text not null default 'collect' check (mode in ('collect', 'observe')),
  add column observed jsonb,
  add column appeared jsonb,
  add column disappeared jsonb;
comment on column public.gh_collection_run_log.mode is 'collect = announcements upsert 런 · observe = 관찰만(announcements 쓰기 0 · 2026-11-03 2-0)';
comment on column public.gh_collection_run_log.observed is '관찰 런: 지금 열린 공고 [{id GH_<pbancNo>, board, status_raw 목록 상태 칸(「-」), close_raw 마감일 칸(「-」), title, hidden}]';
comment on column public.gh_collection_run_log.appeared is '관찰 런: 직전 관찰 행에 없던 id(첫 관찰 행은 전부)';
comment on column public.gh_collection_run_log.disappeared is '관찰 런: 직전 관찰 행에 있었는데 지금 없는 id — 목록 오류가 있는 런은 null(다 보지 못해 말할 수 없음)';

select cron.schedule('zipfit-gh-observe', '31 0,3,6,9 * * *', $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(다른 수집 잡과 같은 꼴). 관찰만 — announcements 쓰기 0.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-gh-announcements?mode=observe',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);
