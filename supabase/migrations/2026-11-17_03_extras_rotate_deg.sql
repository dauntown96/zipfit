-- zipfit:anon select id, rotate_deg from public.announcement_extras where announcement_id = '0000061210'
-- 갤러리 행(announcement_extras) 화면 회전 값 한 칸(2026-11-17 · 우편함 「표시층 — 3판」 2 · 다운님 결정 16:11 평면도 회전 안 B).
-- rotate_deg = 화면이 그 그림을 시계 방향으로 돌릴 각도(0 · 90 · 180 · 270 · 기본 0). 원본 파일·주소(file_url)는 그대로 — 화면 회전만.
-- 묶음 단위: 같은 원 파일(source_url — 같은 zip)에서 온 행들에 같은 값을 쓴다(값 쓰기는 이 파일 적용 뒤 운영 데이터 쓰기 · 이 파일은 칸만).
-- 기본 0 이라 적용 뒤 화면 변화 0 · 공개 읽기 권한은 표 단위(anon·authenticated SELECT)라 새 칸도 그대로 읽힌다.
-- 되돌리기: alter table public.announcement_extras drop column rotate_deg;
set local lock_timeout = '5s';
alter table public.announcement_extras
  add column rotate_deg smallint not null default 0
  constraint announcement_extras_rotate_deg_check check (rotate_deg in (0, 90, 180, 270));
comment on column public.announcement_extras.rotate_deg is
  '화면 회전(시계 방향 도 · 0/90/180/270 · 기본 0) — 원 파일이 옆으로 누운 묶음(같은 source_url)에 같은 값 · 원본 파일은 그대로(2026-11-17 안 B)';
