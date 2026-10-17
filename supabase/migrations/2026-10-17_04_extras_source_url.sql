-- 갤러리 파일 원본 위치 칸(2026-10-17 · 우편함 「코드·운영 — … 갤러리 원본 위치 칸 …」 5 · 백로그 「갤러리 파일(Drive)은 어떤 백업에도 없고 원본 위치도 남아 있지 않다」).
--   announcement_extras.source_url — 그 파일을 받은 원본 주소(없으면 NULL). LH 공고 페이지 첨부·홍보물·단지 이미지는
--   https://apply.lh.or.kr/lhapply/lhFile.do?fileid=<파일 번호>(announcement_promo_files.file_sn · announcement_complex_images.file_sn — 페이지 다운로드 버튼과 같은 길).
--   기존 행은 비운 채 둔다(소급은 수·방법만 회신 — Drive 파일 이름 ↔ 파일 번호 대조가 필요하다). 새 행은 갤러리를 넣는 분석이 채운다(스킬 개정은 claude.ai 몫).
-- 되돌리기: alter table public.announcement_extras drop column source_url;
alter table public.announcement_extras add column source_url text;
comment on column public.announcement_extras.source_url is
  '원본 위치(2026-10-17) — 이 파일을 받은 원본 주소. LH = https://apply.lh.or.kr/lhapply/lhFile.do?fileid=<file_sn>(announcement_promo_files · announcement_complex_images 의 file_sn). 모르면 NULL. file_url(Drive)이 사라져도 다시 받을 길.';
