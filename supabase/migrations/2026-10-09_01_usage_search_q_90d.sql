-- 검색어 원문은 90일만 둔다(2026-10-09 · 우편함 「코드 — 고지 회차 1」 3 · 다운님 결정 「검색은 계정과 떼고 원문 보관 90일」).
-- 기존 정리 잡 zipfit-purge-usage-events(jobid 14 · 매일 15:00 UTC = 00:00 KST)에 한 문장을 더한다 — 잡을 새로 만들지 않는다.
--   ① 1년 지난 행 삭제(그대로 — 처리방침 「이용 기록 1년」)
--   ② 90일 지난 search 행의 props.q 만 걷는다 — 행은 남겨 검색 횟수 통계는 1년 유지 · 표식 q_expired 로 「원래 없던 것」과 가른다.
-- 🔴 기준에 유예를 두지 않는다(①과 같은 이유 — 약속한 90일을 넘겨 보관하게 된다).
-- props CHECK(2048자 이하)는 줄기만 한다. occurred_at 인덱스가 있어 범위가 싸다.
-- 되돌리기: 아래 명령에서 UPDATE 문을 뺀 옛 명령으로 cron.alter_job(14, command := …) — 옛 명령은 이 파일의 GUARD 가 확인한 그대로다.
DO $$ begin
  if not exists (select 1 from cron.job where jobname = 'zipfit-purge-usage-events'
                   and command like '%DELETE FROM public.usage_events WHERE occurred_at < now() - interval ''1 year'';%'
                   and command not like '%q_expired%') then
    raise exception 'GUARD purge job missing or already changed';
  end if;
end $$;
select cron.alter_job(
  (select jobid from cron.job where jobname = 'zipfit-purge-usage-events'),
  command := $cmd$
  -- 처리방침 「서비스 이용 기록은 수집일로부터 1년간 보관한 뒤 파기합니다」를 지키는 장치.
  -- 🔴 삭제 기준에는 유예를 두지 않는다 — 유예를 두면 약속한 1년을 넘겨 보관하게 된다.
  --    유예는 감시(불변식 V8) 쪽에 둔다: 잡이 며칠 밀려도 경보가 깜빡이지 않게.
  -- occurred_at 인덱스가 있어 범위 삭제가 싸다. 시크릿이 필요 없는 순수 DELETE다.
  DELETE FROM public.usage_events WHERE occurred_at < now() - interval '1 year';
  -- 2026-10-09 — 검색어 원문(props.q)은 90일 뒤 걷는다. 행은 남긴다(검색 횟수는 1년).
  UPDATE public.usage_events
     SET props = (props - 'q') || '{"q_expired":true}'::jsonb
   WHERE event = 'search' AND props ? 'q' AND occurred_at < now() - interval '90 days';
  $cmd$
);
