-- 코드 회차 2 — 3. 첨부 목록 변경 이력(EF 배포 회차 5번 후보 B: 트리거 + 이력 표)
-- 뜻: announcements.attachment_urls 가 **실제로 바뀐** UPDATE 마다, 바뀌기 **전** 목록을 한 행 남긴다.
--   seen_at = 그 옛 목록이 다른 목록으로 바뀐 것을 본 시각(= 옛 목록이 마지막으로 유효했던 때).
-- 트리거 순서: announcements 의 BEFORE UPDATE 트리거는 이름 순으로 돈다. 이 트리거(trg_track_…)는 기존 다섯
--   (protect_created_at_trigger · protect_detail_columns_trigger · trg_announcements_updated_at · trg_compute_flags ·
--   trg_set_revised_at) 뒤에 돈다. 그래서 WHEN 이 보는 NEW 는 protect_detail_columns 가 되돌린 뒤의 값이다 —
--   수집이 NULL 을 실어 보내 보호 트리거가 옛 목록으로 되돌린 경우는 IS DISTINCT FROM 이 거짓이라 이력을 쓰지 않는다.
--   attachment_urls 를 만지는 기존 트리거는 protect_detail_columns 하나뿐이고, RETURN NULL 하는 트리거는 없다(2026-09-29 코드 확인).
-- 권한: RLS 켜고 정책 0 · anon·authenticated 권한 0(원칙 15). 쓰기는 트리거가 부르는 역할(수집 EF = service_role · 분석 = postgres).
-- 되돌리기: drop trigger trg_track_attachment_history on public.announcements; drop function public.track_attachment_history();
--          drop table public.announcement_attachment_history;  (get_reanalysis_queue 의 「분석 뒤 첨부 변경」 분기를 먼저 걷는다)
begin;
DO $$ begin
  if to_regclass('public.announcement_attachment_history') is not null then raise exception 'GUARD table exists'; end if;
  if exists (select 1 from pg_trigger where tgname='trg_track_attachment_history') then raise exception 'GUARD trigger exists'; end if;
end $$;

create table public.announcement_attachment_history (
  id              bigint generated always as identity primary key,
  announcement_id text not null,
  source          text,
  seen_at         timestamptz not null default now(),
  files           jsonb
);
create index announcement_attachment_history_aid_seen on public.announcement_attachment_history (announcement_id, seen_at);
comment on table public.announcement_attachment_history is
  'announcements.attachment_urls 가 바뀔 때 바뀌기 전 목록을 한 행씩 남긴다(트리거 trg_track_attachment_history · 2026-09-29 코드 회차 2).';
comment on column public.announcement_attachment_history.seen_at is '옛 목록이 다른 목록으로 바뀐 것을 본 시각';
comment on column public.announcement_attachment_history.files is '바뀌기 전 attachment_urls 그대로(NULL 이면 그때 처음 채워진 것)';
alter table public.announcement_attachment_history enable row level security;
revoke all on table public.announcement_attachment_history from public, anon, authenticated;
grant select, insert on table public.announcement_attachment_history to service_role;

create function public.track_attachment_history() returns trigger
  language plpgsql
as $function$
begin
  -- WHEN (OLD.attachment_urls IS DISTINCT FROM NEW.attachment_urls) 로만 불린다 — 여기서 다시 비교하지 않는다.
  insert into public.announcement_attachment_history (announcement_id, source, files)
  values (OLD.announcement_id, OLD.source, OLD.attachment_urls);
  return NEW;
end
$function$;
revoke execute on function public.track_attachment_history() from public, anon, authenticated;

create trigger trg_track_attachment_history
  before update on public.announcements
  for each row
  when (old.attachment_urls is distinct from new.attachment_urls)
  execute function public.track_attachment_history();
commit;
