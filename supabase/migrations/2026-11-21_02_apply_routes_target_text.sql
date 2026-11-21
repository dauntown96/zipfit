-- 현장 접수 경로 행에 「대상」 칸(2026-11-21 · 우편함 「코드·운영 — 첫 묶음」 B · 백로그 「현장 접수 줄의 대상 …」 ①).
-- 칸만 더한다(쓰기 0) — 채우기는 analysis 스킬 개정 뒤 분석 묶음 소급.
-- 권한: 표 단위 SELECT(anon · authenticated)·정책(「anon can read announcement_apply_routes」 SELECT anon,authenticated)이 새 칸에도 그대로 적용된다 — 바꾸는 것 0.
alter table public.announcement_apply_routes add column target_text text;
comment on column public.announcement_apply_routes.target_text is '그 접수 줄의 대상(원문 낱말 그대로 — 예: 「일반공급」·「우선공급 1순위」) · 없으면 NULL(2026-11-21)';
