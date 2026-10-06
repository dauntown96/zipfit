CREATE OR REPLACE FUNCTION public.get_announcement_sites(p_announcement_id text)
 RETURNS TABLE(precise_address text, total_units integer, announcement_id text, source text, site_label text)
 LANGUAGE sql
 STABLE
AS $function$
-- 🔴 2026-10-06(Z-1 PR-B ① — 우편함 「코드 — Z-1 원문 키 사이클」 (나) 세 걸음) — 카드 상세의 단지(블록) 목록을 두 모양으로 돌려준다.
--   ⓐ 블록 모양(지금 전부) — get_announcement_blocks 행 그대로 + site_label NULL. 블록 ID(MYHOME 분할 행)마다 산물이 산다.
--   ⓑ 단지 모양(Z — 산물이 원문 ID 하나에 산다) — 블록이 둘 이상 ∧ 블록 ID·MYHOME 행에 세대 행이 하나도 없음 ∧ 그룹 세대 행의
--      단지명(building_name 앞뒤 공백 뗀 것)이 둘 이상 → 단지명마다 한 행: announcement_id = 그 세대 행이 사는 원문 ID ·
--      site_label = 단지명. 화면은 (announcement_id, site_label) 으로 세대·이미지·모집 합·칩을 가른다.
--   🔴 하나의 공고는 두 모양 중 하나만 — 블록 ID 나 MYHOME 행(지난 회차의 분할 행 포함)에 세대 행이 하나라도 있으면 ⓐ 다(섞지 않는다).
--   ⓑ 의 주소·세대수: 단지 세대 행 주소(가장 많은 것)의 괄호 꼬리 뗀 값이 블록 주소(같은 규칙)와 같거나 앞 마디(시도)만 다르면 그 블록의
--      precise_address·total_units·source(머리 문구 「공급/모집 N세대」 접두가 종전과 같게 — source 는 그 세대수의 출처다) ·
--      없으면 세대 행 주소 · 세대수 NULL · 세대 행이 사는 행의 source.
--   ⓑ 의 원문 ID 가 여럿(정정본·지난 회차)에 같은 단지명이 있으면 한 행 — get_announcement_blocks 의 대표 고르기와 같은 순서
--      (LH 먼저 · created_at 최신 · id 큰 것).
--   ⚠️ 이 모양 판정은 get_announcements_deduped 의 block_count 가 거울로 따른다 — 함께 바꾼다.
WITH blk AS (
  SELECT b.precise_address, b.total_units, b.announcement_id, b.source, b.ord,
    trim(regexp_replace(b.precise_address, '\s*\([^)]*\)\s*$', '')) AS addr_core
  FROM public.get_announcement_blocks(p_announcement_id) WITH ORDINALITY AS b(precise_address, total_units, announcement_id, source, ord)
),
hu AS (
  SELECT h.announcement_id, btrim(h.building_name) AS site,
    trim(regexp_replace(h.address, '\s*\([^)]*\)\s*$', '')) AS addr_core, a.source
  FROM public.housing_units h
  JOIN public.announcements a ON a.announcement_id = h.announcement_id
  WHERE h.announcement_id IN (SELECT g.announcement_id FROM public.get_announcement_group_ids(p_announcement_id) g)
),
shape AS (
  SELECT (SELECT count(*) FROM blk) >= 2
     AND NOT EXISTS (SELECT 1 FROM hu WHERE hu.announcement_id IN (SELECT blk.announcement_id FROM blk) OR hu.source = 'MYHOME')
     AND (SELECT count(DISTINCT hu.site) FROM hu WHERE hu.site <> '') >= 2 AS is_site
),
site_pick AS (
  SELECT DISTINCT ON (hu.site) hu.site, hu.announcement_id, hu.source
  FROM hu
  JOIN public.announcements a ON a.announcement_id = hu.announcement_id
  WHERE hu.site <> ''
  ORDER BY hu.site, CASE WHEN hu.source = 'LH' THEN 0 ELSE 1 END, a.created_at DESC, a.id DESC
),
site_addr AS (
  SELECT hu.site, hu.announcement_id, mode() WITHIN GROUP (ORDER BY hu.addr_core) AS addr_core
  FROM hu
  WHERE hu.site <> '' AND hu.addr_core <> ''
  GROUP BY hu.site, hu.announcement_id
),
sites AS (
  SELECT sp.site, sp.announcement_id, sp.source, sa.addr_core,
    bm.precise_address AS blk_address, bm.total_units AS blk_units, bm.source AS blk_source
  FROM site_pick sp
  LEFT JOIN site_addr sa ON sa.site = sp.site AND sa.announcement_id = sp.announcement_id
  LEFT JOIN LATERAL (
    SELECT b.precise_address, b.total_units, b.source FROM blk b
    WHERE b.addr_core = sa.addr_core OR b.addr_core LIKE '% ' || sa.addr_core OR sa.addr_core LIKE '% ' || b.addr_core
    ORDER BY (b.addr_core = sa.addr_core) DESC, b.ord
    LIMIT 1
  ) bm ON true
)
SELECT r.precise_address, r.total_units, r.announcement_id, r.source, r.site_label
FROM (
  SELECT b.precise_address, b.total_units, b.announcement_id, b.source, NULL::text AS site_label, b.ord AS k1, ''::text AS k2, ''::text AS k3
  FROM blk b, shape
  WHERE NOT shape.is_site
  UNION ALL
  SELECT COALESCE(s.blk_address, s.addr_core), s.blk_units, s.announcement_id, COALESCE(s.blk_source, s.source), s.site,
    0::bigint, COALESCE(s.blk_address, s.addr_core, ''), s.site
  FROM sites s, shape
  WHERE shape.is_site
) r
ORDER BY r.k1, r.k2, r.k3;
$function$
