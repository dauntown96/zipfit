CREATE OR REPLACE FUNCTION public.listing_hidden_keys()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-16(우편함 「코드 — 관리자 페이지 (가) 첫 판 …」 4) — 지금 숨긴 묶음(제목 키) 목록. 목록 RPC get_announcements_deduped 가 한 번(InitPlan) 부른다.
--   기록 표 zipfit_ops.listing_hides 는 GRANT 0 이라 anon 목록 경로가 직접 못 읽는다 — 그래서 키 목록만 내는 SECURITY DEFINER 하나를 둔다(사유·누가는 내지 않는다).
--   묶음 키 = 목록 RPC 의 title_key(같은 게시물 링크로 붙은 MYHOME 행은 LH 행의 제목 키) — 숨기면 그 묶음의 LH·MYHOME 행과 이후 새로 들어오는 같은 제목 행이 모두 빠진다.
  SELECT coalesce(array_agg(h.group_key ORDER BY h.group_key), '{}'::text[])
  FROM zipfit_ops.listing_hides h
  WHERE h.released_at IS NULL;
$function$
