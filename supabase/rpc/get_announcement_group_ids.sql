CREATE OR REPLACE FUNCTION public.get_announcement_group_ids(p_announcement_id text)
 RETURNS TABLE(announcement_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
--
-- 🔴 2026-09-30(코드 — 같은 게시물은 LH 카드 한 장) — 그룹 키 = 링크 표에 있는 MYHOME 행이면 LH 행의 제목 키, 아니면 자기 제목 키.
--   목록 RPC get_announcements_deduped 의 link_map 과 같은 규칙이다(함께 바꾼다). LH 카드를 열면 붙은 공고문의 산물이 함께 온다.
WITH link_map AS (
  SELECT DISTINCT ON (l.linked_announcement_id)
    l.linked_announcement_id AS aid, announcement_dedup_key(lh.title) AS lh_key
  FROM public.announcement_post_links l
  JOIN public.announcements lh ON lh.announcement_id = l.lh_announcement_id
  WHERE lh.title IS NOT NULL AND lh.hidden_from_listing IS NOT TRUE
  ORDER BY l.linked_announcement_id, l.lh_announcement_id
),
keyed AS (
  SELECT a.announcement_id, a.title, a.hidden_from_listing,
    COALESCE(lm.lh_key, announcement_dedup_key(a.title)) AS dedup_key
  FROM announcements a
  LEFT JOIN link_map lm ON lm.aid = a.announcement_id
),
target AS (
  SELECT DISTINCT dedup_key
  FROM keyed
  WHERE announcement_id = p_announcement_id
)
SELECT k.announcement_id
FROM keyed k
WHERE k.title IS NOT NULL
  AND k.hidden_from_listing IS NOT TRUE
  AND k.dedup_key IN (SELECT dedup_key FROM target);
$function$
