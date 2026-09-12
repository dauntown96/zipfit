CREATE OR REPLACE FUNCTION public.get_announcement_group_ids(p_announcement_id text)
 RETURNS TABLE(announcement_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
-- 🔴 STABLE이다(2026-09-12 강등). 본문이 순수 SELECT 하나이고 쓰기·now()·난수·nextval이
-- 전부 0건이라 VOLATILE이어야 할 이유가 없었다. 같은 계열 get_announcement_blocks·
-- get_announcements_deduped가 이미 STABLE이라 이 함수만 달랐다.
--
-- 🔴 SECURITY DEFINER는 그대로 둔다 — 돌려주는 값이 announcement_id 목록뿐이고
-- announcements의 SELECT 정책이 이미 `to anon, authenticated : true`라 지금 노출되는 것이 없다.
-- 바꿀 이유가 없으면 바꾸지 않는다.
--
-- 🔴 target에서 LIMIT 1을 걷어냈다(2026-09-12).
-- announcement_id 단독에는 유니크 제약이 없다 — 제약은 UNIQUE (source, announcement_id)다.
-- 지금 중복이 0건이라 LIMIT 1이 안 터졌을 뿐, 막고 있던 것은 제약이 아니라 우연이었다.
-- 중복이 생기면 LIMIT 1은 둘 중 하나를 조용히 골라 다른 공고의 그룹을 돌려준다.
-- 그래서 고르지 않는다 — 일치하는 행들의 키를 전부 모아 IN으로 받는다.
--   · 중복 0건인 지금은 결과가 종전과 완전히 같다(키가 언제나 1개다)
--   · 중복이 생기면 그룹이 합집합이 된다. 더 보여줄지언정 다른 공고를 보여주지는 않는다
-- ⚠️ 유니크 제약을 새로 거는 것이 근본 처방이나 DDL은 영향이 넓어 여기서 하지 않는다.
WITH target AS (
  SELECT DISTINCT announcement_dedup_key(title) AS dedup_key
  FROM announcements
  WHERE announcement_id = p_announcement_id
)
SELECT a.announcement_id
FROM announcements a
WHERE a.title IS NOT NULL
  AND a.hidden_from_listing IS NOT TRUE
  AND announcement_dedup_key(a.title) IN (SELECT dedup_key FROM target);
$function$
