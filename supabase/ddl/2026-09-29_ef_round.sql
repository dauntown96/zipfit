-- EF 배포 회차 4 — 카드 「마지막 확인 시각」(후보 B): announcements.last_seen_at
-- 뜻: 수집 EF(collect-announcements)가 **원천(LH 목록·상세·MYHOME 목록)에서 그 행을 다시 받아 쓴** 마지막 시각.
-- 채우는 곳: mapLHRow · mapMyHomeRow 두 매퍼만(upsert 다섯 곳이 전부 이 둘을 거친다).
--   원천을 다시 보지 않는 쓰기(markExpired · bump_detail_fetch_fail · bulk_set_revision_note · 분석 UPDATE)는 이 칸을 건드리지 않는다.
--   ⚠️ SH(collect-sh-announcements)는 이번 회차에 고치지 않아 SH 행은 NULL로 남는다.
-- 왜 updated_at 이 아닌가: updated_at 은 트리거(trg_announcements_updated_at)가 **모든 UPDATE**에 바꾼다 — 분석 쓰기로도 움직인다.
-- 권한: 새 칸은 표 단위 권한(anon=r·authenticated=r)을 그대로 받는다. 화면은 get_announcements_deduped() 로만 읽는다.
-- 되돌리기: alter table public.announcements drop column last_seen_at;  (그 전에 RPC 에서 칸을 먼저 걷는다)
begin;
DO $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='announcements' and column_name='last_seen_at')
  then raise exception 'GUARD exists'; end if;
end $$;
alter table public.announcements add column last_seen_at timestamptz;
comment on column public.announcements.last_seen_at is '수집 EF가 원천(LH·MYHOME)에서 이 행을 다시 받아 쓴 마지막 시각. 매퍼만 채운다(2026-09-29 EF 회차).';
commit;
