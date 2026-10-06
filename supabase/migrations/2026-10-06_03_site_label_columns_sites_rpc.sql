-- Z-1 PR-B ① 칸만(2026-10-06 · 우편함 「코드 — Z-1 원문 키 사이클(DB) …」 (나) 세 걸음의 첫 걸음).
--   ① 산물 표 넷에 site_label text(원문 단지명 그대로 · NULL = 공통) — 자격·정책·경로·이미지. 세대는 building_name 이 표지라 칸을 더하지 않는다.
--   ② get_announcement_sites(text) — get_announcement_blocks 의 4칸 + site_label. 블록 모양(지금 전부)은 블록 RPC 행 그대로,
--      단지 모양(산물이 원문 ID 에 있고 블록 ID·MYHOME 행에 세대 0)은 단지명마다 한 행(함수 머리 주석).
--   🔴 데이터 이전 0 · 화면 무변경(화면은 아직 이 RPC 를 부르지 않는다 — ② 걸음 PR 이 바꾼다). 불변식은 v3.7 파일에 「블록 ID 산물」 줄을 꺼 두고 쓴다(③과 함께 켠다).
--   되돌리기: drop function public.get_announcement_sites(text); alter table … drop column site_label(넷 — 값이 채워진 뒤에는 ③ 되돌리기 먼저).
-- zipfit:function get_announcement_sites(text) acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=false
-- zipfit:anon select * from get_announcement_sites('2015122300020859')
-- zipfit:anon select * from get_announcement_sites('2015122300020838')
ALTER TABLE public.eligibility_criteria ADD COLUMN site_label text;
ALTER TABLE public.announcement_policies ADD COLUMN site_label text;
ALTER TABLE public.announcement_apply_routes ADD COLUMN site_label text;
ALTER TABLE public.announcement_extras ADD COLUMN site_label text;
COMMENT ON COLUMN public.eligibility_criteria.site_label IS '원문 단지명 그대로 — 그 단지에만 해당하는 행. NULL = 공고 공통. 산물은 원문 ID 하나에 둔다(Z-1 · 2026-10-06).';
COMMENT ON COLUMN public.announcement_policies.site_label IS '원문 단지명 그대로 — 그 단지에만 해당하는 행. NULL = 공고 공통. 산물은 원문 ID 하나에 둔다(Z-1 · 2026-10-06).';
COMMENT ON COLUMN public.announcement_apply_routes.site_label IS '원문 단지명 그대로 — 그 단지에만 해당하는 행. NULL = 공고 공통. 산물은 원문 ID 하나에 둔다(Z-1 · 2026-10-06).';
COMMENT ON COLUMN public.announcement_extras.site_label IS '원문 단지명 그대로 — unit_key 없는 단지 이미지. NULL = 공고 공통. 산물은 원문 ID 하나에 둔다(Z-1 · 2026-10-06).';

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
;

REVOKE EXECUTE ON FUNCTION public.get_announcement_sites(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_announcement_sites(text) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_announcement_sites(text) IS '카드 상세 단지(블록) 목록 — 블록 모양이면 get_announcement_blocks 그대로 + site_label NULL · 단지 모양이면 원문 ID 세대 단지명마다 한 행(Z-1 · 2026-10-06).';
