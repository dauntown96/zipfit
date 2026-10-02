-- LH 단지형 공고 「단지 관련 이미지 정보」 목록 — 받기 전 메타데이터를 담는 표 둘 (2026-10-02 · 우편함 「코드 — 현장 줄에 요일·제외 조각 · LH 단지 이미지 목록을 DB 표로」 2)
-- 뜻: LH 공고 페이지 이미지 탭 = ① 평면도(인라인 `var wrtancFloorplan = JSON.parse('…')` — 단지 탭별 형 평면도)
--      ② 나머지 탭(onClickPlanTab 의 `list.push("{cmnAhflSn=…}")` — 단지조감도·단지배치도·동호배치도·위치도·카다로그·기타).
--   받기는 GET /lhapply/lhFile.do?fileid=<file_sn> — 🔴 수집은 받지 않는다(목록만). 받기·Drive·announcement_extras 연결은 분석 회차.
--   상세 API dsSbdAhfl 은 이 목록과 같지 않다(고령다산2 36·51형 평면도가 API에 없다 — 2026-09-29 실측) — 그래서 페이지를 읽는다.
-- 쓰는 쪽: Edge Function collect-lh-images(service_role) 하나. 꼴은 announcement_promo_files·_fetch(2026-09-29)와 같다.
-- 권한: RLS 켜고 정책 0 · anon·authenticated 권한 0(원칙 15). 화면은 이 표를 읽지 않는다 → 불변식 V1·V6 허용목록 변경 없음.
-- 되돌리기: cron 잡 zipfit-collect-lh-images 가 있으면 먼저 unschedule → drop table public.announcement_complex_images; drop table public.announcement_complex_image_fetch;
DO $$ begin
  if to_regclass('public.announcement_complex_images') is not null then raise exception 'GUARD images exists'; end if;
  if to_regclass('public.announcement_complex_image_fetch') is not null then raise exception 'GUARD fetch exists'; end if;
end $$;

create table public.announcement_complex_images (
  id              bigint generated always as identity primary key,
  announcement_id text   not null,
  sbd_lgo_no      text   not null,
  tab             text   not null check (tab in ('평면도', '이미지')),
  tab_index       integer,
  file_sn         bigint not null,
  file_name       text   not null,
  file_kind       text,
  hty_nna         text,
  file_size       bigint,
  fetched_at      timestamptz not null default now(),
  unique (announcement_id, sbd_lgo_no, file_sn)
);
comment on table public.announcement_complex_images is
  'LH 공고 페이지 「단지 관련 이미지 정보」 파일 목록 — 받기 전 메타데이터(collect-lh-images · 2026-10-02). 파일 자체는 lhFile.do?fileid=file_sn';
comment on column public.announcement_complex_images.sbd_lgo_no is '단지 코드(sbdLgoNo) — 같은 코드의 두 단지 탭이 같은 파일을 싣으면 한 행만 둔다(…0733 완주봉동)';
comment on column public.announcement_complex_images.tab is '평면도 = wrtancFloorplan(형별) · 이미지 = 나머지 탭(조감도·배치도 등)';
comment on column public.announcement_complex_images.tab_index is '평면도만 — wrtancFloorplan 바깥 배열 순서(페이지 단지 탭 순서)';
comment on column public.announcement_complex_images.file_sn is 'cmnAhflSn — lhFile.do?fileid= 값';
comment on column public.announcement_complex_images.file_name is 'cmnAhflNm 원문(확장자 포함)';
comment on column public.announcement_complex_images.file_kind is 'lsSplInfUplFlDsCdNm 원문(평면도 · 단지조감도 · 단지배치도 · 동호배치도 · 위치도 · 카다로그 · 기타)';
comment on column public.announcement_complex_images.hty_nna is '평면도 형 표기 원문(htyNna — 36형 · 46A · 51 …). 이미지 탭은 NULL';
comment on column public.announcement_complex_images.file_size is 'cmnAhflSz(바이트) — 페이지가 null 로 주면 NULL';
comment on column public.announcement_complex_images.fetched_at is '이 목록을 페이지에서 읽은 시각(같은 런의 행은 같은 값)';
alter table public.announcement_complex_images enable row level security;
revoke all on table public.announcement_complex_images from public, anon, authenticated;
grant select, insert, update, delete on table public.announcement_complex_images to service_role;

create table public.announcement_complex_image_fetch (
  announcement_id text primary key,
  fetched_at      timestamptz not null default now(),
  ok              boolean not null,
  floorplans      integer,
  images          integer,
  files_listed    integer,
  duration_ms     integer,
  error           text
);
comment on table public.announcement_complex_image_fetch is
  '공고별 마지막 단지 이미지 목록 수집 결과(collect-lh-images). 새 공고 = 여기 행 없음 · 첨부 바뀐 공고 = announcement_attachment_history.seen_at > fetched_at';
comment on column public.announcement_complex_image_fetch.ok is 'true 면 목록 행이 이 시각의 페이지와 같다(0장 포함) · false 면 목록 행을 바꾸지 않았다(옛 목록 유지) — 6시간 뒤 다시 시도';
alter table public.announcement_complex_image_fetch enable row level security;
revoke all on table public.announcement_complex_image_fetch from public, anon, authenticated;
grant select, insert, update, delete on table public.announcement_complex_image_fetch to service_role;

DO $$ declare n int; begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema='public' and table_name in ('announcement_complex_images','announcement_complex_image_fetch')
     and grantee in ('anon','authenticated','PUBLIC');
  if n <> 0 then raise exception 'GUARD grants to anon/authenticated %', n; end if;
end $$;
