-- 일정 표 2단계 ① — announcement_schedule 표 신설 · 경로 표 route 에 「우편」(2026-10-12 · 우편함 「코드 — 일정 표 2단계 ①: DDL …」 1·4).
-- 설계안 A 그대로(우편함 「코드 — 일정 표 설계」 회신 · claude.ai 「통과」): 원문 일정 정책 행(「모집일정」 등) 한 줄 = 일정 표 한 행.
--   stage 12값은 설계 실측(385줄)의 단계 분류 · stage_text·period_text·scope_text 는 근거 정책 행 content_raw 의 부분 문자열(불변식 v3.10 V14a).
--   start_date·end_date 는 period_text 에서 읽은 날짜(요일이 적혀 있으면 맞아야 한다 — V14b) · 블록 ID 에 쓰지 않는다(V14c).
-- 🔴 표만 만든다 — 쓰는 쪽(분석 스킬 · 백필)과 화면은 다음 회차. 이 파일로 생기는 행은 0이다.
-- 권한: 경로 표(announcement_apply_routes)와 같은 꼴 — RLS 켜고 select 정책 anon·authenticated · 쓰기는 service_role 만(원칙 15).
-- 경로 표 route CHECK: '인터넷·모바일' · '현장' · '전체' 에 '우편' 을 더한다(설계 실측 — 우편 접수 공고). 기존 행은 건드리지 않는다.
-- 되돌리기: drop table public.announcement_schedule;
--   alter table public.announcement_apply_routes drop constraint announcement_apply_routes_route_check,
--     add constraint announcement_apply_routes_route_check check (route = any (array['인터넷·모바일'::text, '현장'::text, '전체'::text]));
--   (「우편」 행이 생긴 뒤라면 그 행부터 정리한다)
DO $$ begin
  if to_regclass('public.announcement_schedule') is not null then raise exception 'GUARD announcement_schedule exists'; end if;
end $$;

create table public.announcement_schedule (
  id              bigint generated always as identity primary key,
  announcement_id text not null,
  policy_id       uuid not null references public.announcement_policies(id) on delete cascade,
  stage           text not null check (stage in ('공고','대상주택게시','주택열람','접수','서류대상발표','서류제출',
                                                 '자격검증','결과발표','동호배정','계약','입주','기타')),
  stage_text      text not null,
  period_text     text not null,
  start_date      date,
  end_date        date,
  scope_text      text,
  site_label      text,
  sort_order      smallint not null,
  extracted_by    text not null,
  created_at      timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date <= end_date)
);
create index announcement_schedule_ann_idx on public.announcement_schedule (announcement_id, sort_order);
create index announcement_schedule_policy_idx on public.announcement_schedule (policy_id);

comment on table public.announcement_schedule is
  '공고 일정 표(2026-10-12 · 설계안 A) — 원문 일정 정책 행(policy_id · 「모집일정」 등)의 한 줄 = 한 행. 글자 칸은 근거 행 content_raw 의 부분 문자열(불변식 V14a). 화면 노출은 다음 회차';
comment on column public.announcement_schedule.announcement_id is '근거 정책 행과 같은 announcement_id(원문 ID — 블록 ID 금지 · V14c)';
comment on column public.announcement_schedule.stage is '단계 12값 — 공고 · 대상주택게시 · 주택열람 · 접수 · 서류대상발표 · 서류제출 · 자격검증 · 결과발표 · 동호배정 · 계약 · 입주 · 기타';
comment on column public.announcement_schedule.stage_text is '원문 단계 글자 그대로(부분 문자열)';
comment on column public.announcement_schedule.period_text is '원문 일시 글자 그대로(부분 문자열) — 요일이 있으면 start_date 요일과 맞아야 한다(V14b)';
comment on column public.announcement_schedule.start_date is 'period_text 에서 읽은 시작일(못 읽으면 NULL)';
comment on column public.announcement_schedule.end_date is 'period_text 에서 읽은 끝일(하루짜리면 start_date 와 같다 · 못 읽으면 NULL)';
comment on column public.announcement_schedule.scope_text is '원문 대상·범위 글자(단지·순위·경로 — 부분 문자열 · 없으면 NULL)';
comment on column public.announcement_schedule.site_label is '근거 정책 행 site_label 을 옮긴 값(원문 ID 하나에 여러 단지 — 규약 29)';
comment on column public.announcement_schedule.sort_order is '같은 공고 안 원문 순서';
comment on column public.announcement_schedule.extracted_by is '누가 뽑았나 — 분석 회차 표지(예: run 번호 · 백필 회차)';

alter table public.announcement_schedule enable row level security;
create policy "read announcement_schedule" on public.announcement_schedule
  for select to anon, authenticated using (true);
revoke all on table public.announcement_schedule from public, anon, authenticated;
grant select on table public.announcement_schedule to anon, authenticated;
grant select, insert, update, delete on table public.announcement_schedule to service_role;

-- 경로 표 route 에 「우편」 — 기존 행은 건드리지 않는다(행 수 95 · 값 분포는 적용 전후 관리 API로 잰다).
alter table public.announcement_apply_routes drop constraint announcement_apply_routes_route_check;
alter table public.announcement_apply_routes add constraint announcement_apply_routes_route_check
  check (route = any (array['인터넷·모바일'::text, '현장'::text, '전체'::text, '우편'::text]));
