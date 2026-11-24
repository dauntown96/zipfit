-- 원문 키 정기 대조에 「주택형 안내」 표 한 칸(2026-11-24 · 우편함 「코드·운영 — 열일곱째 묶음 A장」 3 · 근거 = 조사 「두 가지(읽기만)」 ⑦1 · 백로그 「공고문 값과 LH 공고 페이지 값이 어긋나도 기계가 모른다」).
-- check-source-pages 가 이미 받는 LH 공고 페이지 GET 응답 안의 단지 탭 「주택형 안내」 표(주택형 · 전용면적 · 세대수 · 금회공급)를 이 칸에 둔다(호출 +0).
-- 칸을 채우는 EF 고침 · health-ops 대조는 이 파일이 적용된 뒤 다음 PR(원칙 13 — 칸이 먼저 있어야 EF 쓰기가 실패하지 않는다).
-- 되돌리기: alter table public.source_page_checks drop column page_units;
DO $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'source_page_checks' and column_name = 'page_units') then
    raise exception 'GUARD source_page_checks.page_units exists';
  end if;
end $$;

alter table public.source_page_checks add column page_units jsonb;

comment on column public.source_page_checks.page_units is
  'LH 공고 페이지 단지 탭 「주택형 안내」 표 — [{tab, nodata, rows:[{hty, area, households, supply, short}]}] · 탭 없는 페이지는 tab null 하나 · 표 없음(매입 꼴 등)은 [] · SH·오류 행은 NULL (check-source-pages · 2026-11-24)';
