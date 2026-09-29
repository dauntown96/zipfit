-- 코드 회차 2 잔여 C-2 — announcement_analysis.attachment_reviewed_at
-- 뜻: 재확인 회차가 「분석 뒤 첨부 변경」을 원문과 대조해 확인한 시각. 채우는 쪽은 재확인 회차(스킬 개정 후보 — claude.ai 기록).
--   get_reanalysis_queue() 의 「분석 뒤 첨부 변경」 갈래는 seen_at > greatest(analyzed_at, attachment_reviewed_at) 인 이력만 센다.
--   🔴 analyzed_at·batch_label 은 여전히 덮지 않는다(처음 분석 묶음 유지) — 이 칸이 따로 있는 이유다.
-- 권한: 표 단위 권한을 그대로 받는다(announcement_analysis 는 anon·authenticated 권한 0).
-- 되돌리기: get_reanalysis_queue 를 이 칸을 읽지 않는 정의로 되돌린 뒤
--          alter table public.announcement_analysis drop column attachment_reviewed_at;
begin;
DO $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='announcement_analysis' and column_name='attachment_reviewed_at')
  then raise exception 'GUARD exists'; end if;
end $$;
alter table public.announcement_analysis add column attachment_reviewed_at timestamptz;
comment on column public.announcement_analysis.attachment_reviewed_at is
  '재확인이 분석 뒤 첨부 변경을 대조해 확인한 시각. 재분석 큐는 이 시각 뒤의 첨부 이력만 센다(2026-09-29 코드 회차 2 잔여).';
commit;
