CREATE OR REPLACE FUNCTION public.get_rent_per_sqm_quartiles()
 RETURNS TABLE(housing_type_std text, basis text, sido_nm text, n integer, n_open integer, n_closed integer, q1 double precision, med double precision, q3 double precision, refreshed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-25(우편함 「코드·운영 — 스무째: ㎡당 월세 시·도×유형 사분위 RPC」) — ㎡당 월세 비교 표본의 시·도 × 표준 유형 사분위(스냅숏 읽기).
--   표본 정의·셈은 zipfit_ops.rent_sqm_quartiles_refresh()(30분마다 · cron zipfit-rent-sqm-quartiles) — 이 함수는 그 표를 읽기만 한다(인자 없음 · 100행 안팎).
--   sido_nm NULL = 전국(그 유형 전체) · basis 'na' = 영구임대 나군 · n = 표본(열린 n_open + 닫힌 분석 완료 n_closed · 마감 1년 안) · refreshed_at = 셈한 때.
--   🔴 정의자인 까닭: 스냅숏 표(zipfit_ops)는 클라이언트 권한 0 — 내보내는 것은 유형·시·도별 집계 숫자뿐(공고 id·개인정보 0). search_path 고정.
  select q.housing_type_std, q.basis, q.sido_nm, q.n, q.n_open, q.n_closed, q.q1, q.med, q.q3, q.refreshed_at
  from zipfit_ops.rent_sqm_quartiles q
  order by q.housing_type_std, q.basis, q.sido_nm nulls first;
$function$
