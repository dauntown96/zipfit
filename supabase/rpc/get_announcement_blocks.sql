CREATE OR REPLACE FUNCTION public.get_announcement_blocks(p_announcement_id text)
 RETURNS TABLE(precise_address text, total_units integer, announcement_id text, source text)
 LANGUAGE sql
 STABLE
AS $function$
WITH target AS (
  SELECT announcement_dedup_key(title) AS dedup_key
  FROM announcements
  WHERE announcement_id = p_announcement_id
  LIMIT 1
),
base AS (
  SELECT a.*,
    announcement_dedup_key(a.title) AS dedup_key,
    trim(regexp_replace(a.precise_address, '\s*\([^)]*\)\s*$', '')) AS addr_core
  FROM announcements a
  WHERE a.title IS NOT NULL
),
group_rows AS (
  SELECT b.*
  FROM base b, target t
  WHERE b.dedup_key = t.dedup_key
),
-- ⭐ 2026-07-17 수정: distinct 주소 카운트를 MYHOME 소스 기준으로만 계산.
-- LH의 precise_address는 종종 서술형("OO동·OO동 일원")이라 같은 물리적 단지를
-- MYHOME과 다른 텍스트로 표현하는 경우가 있어(군포대야미 실측 사례), 이를 그대로
-- 카운트에 포함하면 단일 단지가 가짜로 다단지 처리되는 문제가 있었음.
-- MYHOME 주소가 하나도 없는 그룹(레거시/일부 LH전용 케이스 대비)에는 기존 방식(전체 소스 카운트)으로 폴백.
myhome_addr_count AS (
  SELECT count(DISTINCT addr_core) AS n
  FROM group_rows
  WHERE source = 'MYHOME' AND addr_core IS NOT NULL AND addr_core <> ''
),
myhome_has_any AS (
  SELECT count(*) > 0 AS has_any
  FROM group_rows
  WHERE source = 'MYHOME' AND addr_core IS NOT NULL AND addr_core <> ''
),
distinct_addr_count AS (
  SELECT CASE
    WHEN (SELECT has_any FROM myhome_has_any) THEN (SELECT n FROM myhome_addr_count)
    ELSE (SELECT count(DISTINCT addr_core) FROM group_rows WHERE addr_core IS NOT NULL AND addr_core <> '')
  END AS n
),
multi_blocks AS (
  SELECT DISTINCT ON (g.addr_core)
    COALESCE(
      (SELECT g2.precise_address FROM group_rows g2
       WHERE g2.addr_core = g.addr_core AND g2.precise_address IS NOT NULL
       ORDER BY CASE WHEN g2.source='LH' THEN 0 ELSE 1 END, length(g2.precise_address) DESC, g2.created_at DESC LIMIT 1),
      g.precise_address
    ) AS precise_address,
    COALESCE(
      (SELECT min(g2.total_units) FROM group_rows g2
       WHERE g2.addr_core = g.addr_core AND g2.total_units IS NOT NULL),
      g.total_units
    ) AS total_units,
    g.announcement_id, g.source
  FROM group_rows g, distinct_addr_count c
  WHERE c.n >= 2 AND g.addr_core IS NOT NULL AND g.addr_core <> ''
  ORDER BY g.addr_core,
    CASE WHEN g.source = 'LH' THEN 0 ELSE 1 END,
    g.created_at DESC
),
single_repr AS (
  SELECT
    COALESCE(
      (SELECT g2.precise_address FROM group_rows g2
       WHERE g2.precise_address IS NOT NULL
       ORDER BY CASE WHEN g2.source='LH' THEN 0 ELSE 1 END, length(g2.precise_address) DESC, g2.created_at DESC LIMIT 1),
      NULL
    ) AS precise_address,
    (SELECT min(g2.total_units) FROM group_rows g2 WHERE g2.total_units IS NOT NULL) AS total_units,
    g.announcement_id, g.source
  FROM group_rows g, distinct_addr_count c
  WHERE c.n < 2
  ORDER BY CASE WHEN g.source = 'LH' THEN 0 ELSE 1 END, g.created_at DESC
  LIMIT 1
)
SELECT * FROM multi_blocks
UNION ALL
SELECT * FROM single_repr;
$function$
