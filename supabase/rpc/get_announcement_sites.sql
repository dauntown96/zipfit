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
-- 🔴 2026-10-07(Z-2 ① PR-A — 우편함 「코드 — Z-2 …」 2) 두 가지를 더했다. 지금(이전 전) 화면은 그대로다(942장 대조).
--   ⑴ 회차 거름 — 단지(ⓑ의 행)는 **이번 회차** 세대 행에서만 고른다: 세대 행이 사는 행이 p 자신 ∨ p 와 같은 apply_end
--      ∨ 같은 게시물 링크로 붙은 행(목록 RPC same_round_units 와 같은 회차 규칙 + p 자신). 그룹에 회차가 둘 이상이면 지난 회차
--      단지(이름 꼬리 「(N개동)」이 달라 따로 섰다 — 구미구평 …0709 5 → 10)가 이번 카드에 서지 않는다(원주 …0783 은 6 → 3이 된다 — ② 이전 뒤).
--      🔴 모양 판정의 「블록 ID·MYHOME 행 세대 0」은 거르지 않은 그룹 전체로 본다 — 지난 회차 산물이 아직 분할 행에 있으면 ⓐ 그대로(섞지 않는다).
--      ⚠️ 단지명 정규화(끝 괄호 떼기)는 하지 않는다 — 제주 …0804 「(H-1BL)」·「(H-2BL)」은 서로 다른 단지다.
--   ⑵ 주소 대조 넓힘 — 종전 규칙(같음 · 앞 마디만 다름)이 먼저이고, 안 맞을 때만 정규화 주소(괄호 꼬리 · 쉼표 뒤 · 공백을 걷고
--      시도 줄임말 7개를 푼 것)의 같음·꼬리 일치(6자 이상) → 도로명+번호 키 같음 순으로 찾는다
--      (「초지2로42」 · 「논현로 81, 논현LH4단지」 · 「53-18,53-20」 · 「경북 …」 · 「원주시 남원로 52」 ↔ 「원주시 흥업면 남원로 52」).
WITH tgt AS (
  SELECT (SELECT a.apply_end FROM public.announcements a WHERE a.announcement_id = p_announcement_id
          ORDER BY CASE WHEN a.source = 'LH' THEN 0 ELSE 1 END, a.created_at DESC, a.id DESC LIMIT 1) AS apply_end
),
blk0 AS (
  SELECT b.precise_address, b.total_units, b.announcement_id, b.source, b.ord,
    trim(regexp_replace(b.precise_address, '\s*\([^)]*\)\s*$', '')) AS addr_core
  FROM public.get_announcement_blocks(p_announcement_id) WITH ORDINALITY AS b(precise_address, total_units, announcement_id, source, ord)
),
blk AS (
  SELECT b.*, n.nz, regexp_replace(COALESCE(substring(n.c FROM '[가-힣0-9]+(?:로|길)\s*[0-9]+(?:-[0-9]+)?'), ''), '\s+', '', 'g') AS road
  FROM blk0 b
  CROSS JOIN LATERAL (SELECT split_part(COALESCE(b.addr_core, ''), ',', 1) AS c) c0
  CROSS JOIN LATERAL (
    SELECT c0.c,
      regexp_replace(CASE split_part(c0.c, ' ', 1)
          WHEN '경북' THEN '경상북도' WHEN '경남' THEN '경상남도' WHEN '전북' THEN '전북특별자치도' WHEN '전남' THEN '전라남도'
          WHEN '충북' THEN '충청북도' WHEN '충남' THEN '충청남도' WHEN '강원' THEN '강원특별자치도' ELSE split_part(c0.c, ' ', 1) END
        || substr(c0.c, length(split_part(c0.c, ' ', 1)) + 1), '\s+', '', 'g') AS nz
  ) n
),
hu_all AS (
  SELECT h.announcement_id, btrim(h.building_name) AS site,
    trim(regexp_replace(h.address, '\s*\([^)]*\)\s*$', '')) AS addr_core, a.source, a.apply_end
  FROM public.housing_units h
  JOIN public.announcements a ON a.announcement_id = h.announcement_id
  WHERE h.announcement_id IN (SELECT g.announcement_id FROM public.get_announcement_group_ids(p_announcement_id) g)
),
hu AS (
  SELECT hu_all.announcement_id, hu_all.site, hu_all.addr_core, hu_all.source
  FROM hu_all, tgt
  WHERE hu_all.announcement_id = p_announcement_id
     OR hu_all.apply_end = tgt.apply_end
     OR EXISTS (SELECT 1 FROM public.announcement_post_links l
                JOIN public.announcements lh ON lh.announcement_id = l.lh_announcement_id
                WHERE l.linked_announcement_id = hu_all.announcement_id
                  AND lh.title IS NOT NULL AND lh.hidden_from_listing IS NOT TRUE)
),
shape AS (
  SELECT (SELECT count(*) FROM blk) >= 2
     AND NOT EXISTS (SELECT 1 FROM hu_all WHERE hu_all.announcement_id IN (SELECT blk.announcement_id FROM blk) OR hu_all.source = 'MYHOME')
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
site_key AS (
  SELECT sa.site, sa.announcement_id, sa.addr_core, n.nz,
    regexp_replace(COALESCE(substring(n.c FROM '[가-힣0-9]+(?:로|길)\s*[0-9]+(?:-[0-9]+)?'), ''), '\s+', '', 'g') AS road
  FROM site_addr sa
  CROSS JOIN LATERAL (SELECT split_part(sa.addr_core, ',', 1) AS c) c0
  CROSS JOIN LATERAL (
    SELECT c0.c,
      regexp_replace(CASE split_part(c0.c, ' ', 1)
          WHEN '경북' THEN '경상북도' WHEN '경남' THEN '경상남도' WHEN '전북' THEN '전북특별자치도' WHEN '전남' THEN '전라남도'
          WHEN '충북' THEN '충청북도' WHEN '충남' THEN '충청남도' WHEN '강원' THEN '강원특별자치도' ELSE split_part(c0.c, ' ', 1) END
        || substr(c0.c, length(split_part(c0.c, ' ', 1)) + 1), '\s+', '', 'g') AS nz
  ) n
),
sites AS (
  SELECT sp.site, sp.announcement_id, sp.source, sa.addr_core,
    bm.precise_address AS blk_address, bm.total_units AS blk_units, bm.source AS blk_source
  FROM site_pick sp
  LEFT JOIN site_key sa ON sa.site = sp.site AND sa.announcement_id = sp.announcement_id
  LEFT JOIN LATERAL (
    SELECT b.precise_address, b.total_units, b.source FROM blk b
    CROSS JOIN LATERAL (SELECT (b.addr_core = sa.addr_core OR b.addr_core LIKE '% ' || sa.addr_core OR sa.addr_core LIKE '% ' || b.addr_core) IS TRUE AS old_hit) o
    WHERE o.old_hit
       OR (b.nz <> '' AND b.nz = sa.nz)
       OR (length(sa.nz) >= 6 AND length(b.nz) >= 6 AND (right(b.nz, length(sa.nz)) = sa.nz OR right(sa.nz, length(b.nz)) = b.nz))
       OR (b.road <> '' AND b.road = sa.road)
    ORDER BY (b.addr_core = sa.addr_core) IS TRUE DESC, o.old_hit DESC,
      CASE WHEN o.old_hit THEN 0 WHEN b.nz = sa.nz THEN 1
           WHEN right(b.nz, length(sa.nz)) = sa.nz OR right(sa.nz, length(b.nz)) = b.nz THEN 2 ELSE 3 END,
      b.ord
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
