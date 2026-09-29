-- 매입 홍보물 자동 수집 — LH 매입 공고 페이지 「홍보물」 목록(메타데이터)을 담는 표 둘
-- 뜻: LH 공고 페이지의 주택 행 「홍보물」 버튼 = ahflPop(파일 수, sbdLgoNo, dngHsAdmNo, aptBrndCd).
--   aptBrndCd 가 있으면 POST /lhapply/apply/wt/wrtanc/selectListAptBrndAhfInf.do → list[{dngHsAdr, cmnAhflNm, cmnAhflSn, …}]
--   없으면           POST /lhapply/apply/wt/wrtanc/selectWrtancAhflInfList.do  → list[{cmnAhflNm, cmnAhflSn, …}] (주소 없음 → 행 주소 칸)
--   받기는 GET /lhapply/lhFile.do?fileid=<cmnAhflSn> — 🔴 수집은 받지 않는다(목록만). 받기·Drive·announcement_extras 연결은 분석 회차.
-- 쓰는 쪽: Edge Function collect-lh-promo(service_role) 하나.
-- 권한: RLS 켜고 정책 0 · anon·authenticated 권한 0(원칙 15). 화면은 이 표를 읽지 않는다.
-- 되돌리기: cron 잡 zipfit-collect-lh-promo 를 먼저 unschedule → drop table public.announcement_promo_files; drop table public.announcement_promo_fetch;
begin;
DO $$ begin
  if to_regclass('public.announcement_promo_files') is not null then raise exception 'GUARD files exists'; end if;
  if to_regclass('public.announcement_promo_fetch') is not null then raise exception 'GUARD fetch exists'; end if;
end $$;

create table public.announcement_promo_files (
  id                bigint generated always as identity primary key,
  announcement_id   text   not null,
  sbd_lgo_no        text,
  apt_brnd_cd       text,
  dng_hs_adm_no     text,
  button_file_count integer,
  row_address       text,
  dng_hs_adr        text,
  file_sn           bigint not null,
  file_name         text   not null,
  file_size         bigint,
  file_kind         text,
  fetched_at        timestamptz not null default now(),
  unique (announcement_id, file_sn)
);
comment on table public.announcement_promo_files is
  'LH 매입 공고 페이지 「홍보물」 파일 목록 — 받기 전 메타데이터(collect-lh-promo · 2026-09-29). 파일 자체는 lhFile.do?fileid=file_sn';
comment on column public.announcement_promo_files.button_file_count is '그 버튼 ahflPop 첫 인자(페이지가 밝힌 파일 수)';
comment on column public.announcement_promo_files.row_address is '버튼이 있는 주택 행의 주소 칸(HTML 원문, 태그만 걷음) — 목록이 주소를 주지 않는 dngHsAdmNo 경로의 대조 재료';
comment on column public.announcement_promo_files.dng_hs_adr is '목록 응답 dngHsAdr 원문(끝 공백 포함 그대로) — aptBrndCd 경로만';
comment on column public.announcement_promo_files.file_sn is 'cmnAhflSn — lhFile.do?fileid= 값';
comment on column public.announcement_promo_files.file_name is 'cmnAhflNm 원문(확장자 포함). LH 는 전부 application/octet-stream 으로 주므로 종류는 받을 때 머리 바이트로 가린다';
comment on column public.announcement_promo_files.file_kind is 'lsSplInfUplFlDsCdNm 원문(예: 호실사진)';
alter table public.announcement_promo_files enable row level security;
revoke all on table public.announcement_promo_files from public, anon, authenticated;
grant select, insert, update, delete on table public.announcement_promo_files to service_role;

create table public.announcement_promo_fetch (
  announcement_id text primary key,
  fetched_at      timestamptz not null default now(),
  ok              boolean not null,
  buttons         integer,
  files_expected  integer,
  files_listed    integer,
  duration_ms     integer,
  error           text
);
comment on table public.announcement_promo_fetch is
  '공고별 마지막 홍보물 목록 수집 결과(collect-lh-promo). 새 공고 = 여기 행 없음 · 첨부 바뀐 공고 = announcement_attachment_history.seen_at > fetched_at';
comment on column public.announcement_promo_fetch.ok is 'false 면 목록 행을 바꾸지 않았다(옛 목록 유지) — 6시간 뒤 다시 시도';
comment on column public.announcement_promo_fetch.files_expected is '버튼 첫 인자 합(0 인 버튼 제외)';
comment on column public.announcement_promo_fetch.files_listed is '목록 응답 파일 수 합';
alter table public.announcement_promo_fetch enable row level security;
revoke all on table public.announcement_promo_fetch from public, anon, authenticated;
grant select, insert, update, delete on table public.announcement_promo_fetch to service_role;

DO $$ declare n int; begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema='public' and table_name in ('announcement_promo_files','announcement_promo_fetch')
     and grantee in ('anon','authenticated','PUBLIC');
  if n <> 0 then raise exception 'GUARD grants to anon/authenticated %', n; end if;
end $$;
commit;
