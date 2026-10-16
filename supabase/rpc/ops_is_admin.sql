CREATE OR REPLACE FUNCTION public.ops_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-16(우편함 「코드 — 관리자 페이지 (가) 첫 판 …」 1·5) — 화면이 설정 탭 「운영」 구역을 그릴지만 묻는다(참/거짓 하나 · 데이터 없음).
--   판별은 auth.uid() ∈ zipfit_ops.admins 하나다(인자 없음 · 사용자가 고칠 수 있는 자리 없음 · 표 GRANT 0).
--   데이터를 내는 관리자 함수(ops_status_board · ops_listing_hide)는 관리자가 아니면 예외로 거부한다 — 이 함수만 거짓을 돌려
--   비관리자 로그인 사용자의 설정 탭이 오류 응답(콘솔 「Failed to load resource」) 없이 그대로 그려지게 한다.
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM zipfit_ops.admins a WHERE a.user_id = auth.uid());
$function$
