-- 2026-11-03 우편함 「코드·운영 — 로그인 결과 DB 기록 · 이슈 머리 · 찜 바퀴 + 이미지 같은 파일 공유(content_sha256 · 다운님 결정 안 ① 2026-11-03)」 B 1
-- announcement_extras 에 원본 파일 내용의 sha256(hex 소문자 64자) 칸을 더한다 — 같은 내용 파일을 Drive 에 다시 올리지 않고
-- 기존 file_url 을 재사용하는 축(fetch-attachment mode=upload 가 받은 바이트의 sha256 으로 이 칸을 찾는다).
-- 🔴 file_hash 와 다른 칸이다 — file_hash 는 이름과 달리 Drive 파일 크기(바이트 · 2026-07-01 적재분만)다.
alter table public.announcement_extras add column if not exists content_sha256 text;
alter table public.announcement_extras drop constraint if exists announcement_extras_content_sha256_hex;
alter table public.announcement_extras add constraint announcement_extras_content_sha256_hex
  check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');
create index if not exists announcement_extras_content_sha256_idx
  on public.announcement_extras (content_sha256) where content_sha256 is not null;
comment on column public.announcement_extras.content_sha256 is
  '원본 파일 내용 sha256(hex 소문자 64자) — 같은 내용 파일 재사용 축(fetch-attachment mode=upload). file_hash(= Drive 파일 크기)와 다른 칸. 2026-11-03';
