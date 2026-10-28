-- GH(경기주택도시공사) 수집 런 기록 표 (2026-10-28 · 우편함 「코드·운영(브랜치만 · 병합 0) — GH 수집기 …」)
-- 🔴 병합 = 적용이다 — 이 파일은 런칭 뒤 GH 수집기를 켜는 회차에 병합한다(그 전에는 브랜치에만 둔다). 그날 이름 날짜를 그날로 바꿔도 된다(아직 기록 안 된 파일).
-- 뜻: Edge Function collect-gh-announcements 의 ?mode=collect 한 번 = 한 행. 꼴은 sh_collection_run_log 와 같고, 쪽 수·상세 결과를 jsonb 로 둔다
--   (GH 는 게시판 둘 — 쪽 수가 게시판마다 다르다). 상세 실패는 errors 가 아니라 detail 에 둔다(SH 와 같은 축 — 목록을 다 봤는지와 다른 물음).
-- 쓰는 쪽: collect-gh-announcements(service_role) 하나. 읽는 쪽: 운영 점검(postgres)뿐 — 화면은 읽지 않는다.
-- 권한: RLS 켜고 정책 0 · anon·authenticated 권한 0(원칙 15) → 불변식 V6 해당 없음(anon SELECT 없음) · 보안 허용목록에 한 줄(같은 PR).
-- 되돌리기: cron 잡(zipfit-collect-gh-announcements)이 있으면 먼저 unschedule → drop table public.gh_collection_run_log;
DO $$ begin
  if to_regclass('public.gh_collection_run_log') is not null then raise exception 'GUARD gh_collection_run_log exists'; end if;
end $$;

create table public.gh_collection_run_log (
  id           bigint generated always as identity primary key,
  run_at       timestamptz not null default now(),
  pages        jsonb,
  parsed       integer,
  picked       integer,
  upserted     integer,
  hidden       integer,
  visible      integer,
  duration_ms  integer,
  errors       jsonb not null default '[]'::jsonb,
  detail       jsonb
);
comment on table public.gh_collection_run_log is
  'GH 청약센터 수집 런 기록(collect-gh-announcements ?mode=collect · 2026-10-28). 1페이지부터 실패한 런도 남긴다(pages=null)';
comment on column public.gh_collection_run_log.pages is '게시판별 {total, read, failed} — sr7150 임대주택 · sr7155 매입임대';
comment on column public.gh_collection_run_log.parsed is '읽은 목록 행 수(게시판 합)';
comment on column public.gh_collection_run_log.picked is '들인 행 수 = 열린 공고 ∪ 이미 들인 GH 공고(같은 pbancNo 합친 뒤)';
comment on column public.gh_collection_run_log.errors is '목록 실패만(쪽 status · 예외 · 시간 예산) — 비지 않은 런은 「목록을 다 봤다」고 말할 수 없다';
comment on column public.gh_collection_run_log.detail is '상세 결과 {tried, with_files, files, failed, windows, unread, sigungu} — 접수 창을 못 읽은 사유는 unread';
alter table public.gh_collection_run_log enable row level security;
revoke all on table public.gh_collection_run_log from public, anon, authenticated;
grant select, insert on table public.gh_collection_run_log to service_role;
