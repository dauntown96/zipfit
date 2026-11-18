-- GH 단지 이미지 탭 목록(2026-11-18 · 우편함 「코드·운영 — 7장 …」 3 · 6장 ⑦ 1 「GH 단지 이미지 탭을 수집기가 목록으로 남기기」).
-- 뜻: collect-gh-announcements(collect)가 이미 여는 상세 페이지 「단지 관련 이미지 정보」 탭(fn_chgSn(bizCd, atchFileSn, atchFileDtlSn, ver) + 탭 표기)을
--   공고마다 한 줄씩 남긴다 — 목록만(받기 · Drive · announcement_extras 연결은 분석 회차 · LH collect-lh-images 와 같은 몫 나눔).
-- 🔴 LH announcement_complex_images 에 넣지 않는 까닭: 그 표의 sbd_lgo_no(LH 단지 코드 · NOT NULL)를 단지 잇기(complex_link_announcements — lh_code 별칭)와
--   LH 첨부 문지기(lh_file_gate — file_sn ↔ lhFile.do)가 읽는다 — GH bizCd·파일 번호가 섞이면 단지 키와 문지기 재사용이 틀린다.
-- 쓰기: service_role(EF)만 · 화면·anon 0 · 행을 지우지 않는다(지나간 탭 목록은 GH 가 페이지를 내리면 다시 받을 수 없다).
-- 되돌리기: drop table public.gh_complex_images; (EF 는 upsert 실패를 런 로그 img.failed 에만 남기고 수집은 그대로 돈다)
create table public.gh_complex_images (
  id               bigint generated always as identity primary key,
  announcement_id  text not null,
  board            text constraint gh_complex_images_board_check check (board in ('sr7150', 'sr7155')),
  biz_cd           text not null,
  atch_file_sn     bigint not null,
  atch_file_dtl_sn integer not null,
  ver              text not null,
  tab_label        text not null,
  tab_index        integer,
  download_url     text not null constraint gh_complex_images_url_check check (download_url like 'https://apply-cdn.gh.or.kr/sr/sr715_/selectCtlgFileDown.do?%'),
  fetched_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  constraint gh_complex_images_file_key unique (announcement_id, atch_file_sn, atch_file_dtl_sn)
);
comment on table public.gh_complex_images is
  'GH(경기주택도시공사) 공고 상세 「단지 관련 이미지 정보」 탭 목록(2026-11-18 · EF collect-gh-announcements collect) · 한 행 = 공고 × 파일(atch_file_sn · atch_file_dtl_sn) · tab_label = 탭 표기 원문(「32B 평면도」 · 「조감도」) · download_url = 원본 받기(selectCtlgFileDown.do — fetch-attachment 허용 경로) · ver 는 GH 등록 시각 · 목록만(받기·연결은 분석 회차) · 쓰기는 service_role 만 · 행을 지우지 않는다';
alter table public.gh_complex_images enable row level security;
revoke all on table public.gh_complex_images from public, anon, authenticated;
grant select, insert, update, delete on table public.gh_complex_images to service_role;
