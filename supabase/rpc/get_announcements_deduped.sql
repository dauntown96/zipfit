CREATE OR REPLACE FUNCTION public.get_announcements_deduped(p_region text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, source text, announcement_id text, title text, region text, region_top text, sido_nm text, sigungu_nm text, housing_type text, supply_org text, announcement_date date, apply_start date, apply_end date, status text, status_normalized text, url text, is_revised boolean, area_min numeric, area_max numeric, rent_min integer, rent_max integer, deposit_min bigint, deposit_max bigint, total_units integer, move_in_date text, target_type text, heating_type text, created_at timestamp with time zone, updated_at timestamp with time zone, mymy_applicable boolean, supply_form text, application_method text, recruit_multiplier text, pair_announcement_key text, housing_change_allowed boolean, precise_address text, is_relaxed_recruitment boolean, relaxation_detail text, selection_method text, subscription_months_required integer, subscription_payments_required integer, contract_before_verification boolean, rent_exemption_until date, rent_exemption_note text, revision_note text, revised_at timestamp with time zone, special_notes jsonb, revised_at_source text, first_seen_at timestamp with time zone, doc_submit_announce_date date, doc_submit_start date, doc_submit_end date, winner_announce_date date, contract_start date, contract_end date, building_name text, attachment_urls jsonb, has_cancel_notice boolean, region_names text[], block_count integer, first_announcement_date date, schedule_varies boolean)
 LANGUAGE sql
 STABLE
AS $function$
WITH base AS (
  SELECT *,
    announcement_dedup_key(title) AS dedup_key,
    CASE WHEN source = 'MYHOME' THEN split_part(announcement_id, '_', 1) ELSE NULL END AS own_pblanc_id
  FROM announcements
  WHERE title IS NOT NULL
    AND hidden_from_listing IS NOT TRUE
),
superseded_pblanc_ids AS (
  SELECT DISTINCT before_pblanc_id AS pblanc_id
  FROM announcements
  WHERE before_pblanc_id IS NOT NULL AND before_pblanc_id <> ''
),
best_location AS (
  SELECT DISTINCT ON (dedup_key)
    dedup_key,
    sido_nm AS best_sido,
    sigungu_nm AS best_sigungu,
    precise_address AS best_precise
  FROM base
  ORDER BY dedup_key,
    (precise_address IS NULL),
    (sigungu_nm IS NULL),
    (sido_nm IS NULL),
    created_at DESC
),
best_schedule AS (
  SELECT dedup_key,
    (array_agg(apply_start ORDER BY created_at DESC) FILTER (WHERE apply_start IS NOT NULL))[1] AS best_apply_start,
    (array_agg(doc_submit_announce_date ORDER BY created_at DESC) FILTER (WHERE doc_submit_announce_date IS NOT NULL))[1] AS best_doc_submit_announce_date,
    (array_agg(doc_submit_start ORDER BY created_at DESC) FILTER (WHERE doc_submit_start IS NOT NULL))[1] AS best_doc_submit_start,
    (array_agg(doc_submit_end ORDER BY created_at DESC) FILTER (WHERE doc_submit_end IS NOT NULL))[1] AS best_doc_submit_end,
    (array_agg(winner_announce_date ORDER BY created_at DESC) FILTER (WHERE winner_announce_date IS NOT NULL))[1] AS best_winner_announce_date,
    (array_agg(contract_start ORDER BY created_at DESC) FILTER (WHERE contract_start IS NOT NULL))[1] AS best_contract_start,
    (array_agg(contract_end ORDER BY created_at DESC) FILTER (WHERE contract_end IS NOT NULL))[1] AS best_contract_end,
    (array_agg(building_name ORDER BY created_at DESC) FILTER (WHERE building_name IS NOT NULL))[1] AS best_building_name
  FROM base
  GROUP BY dedup_key
),
first_seen AS (
  SELECT dedup_key, min(created_at) AS first_seen_at
  FROM base
  GROUP BY dedup_key
),
-- 🔴 그룹이 걸친 시군구 전부 (2026-09-16 신설). 대표행의 sigungu_nm 하나로는
-- 「경기북부 7개 시군」 같은 공고가 한 곳으로만 잡혀 나머지 시군 사용자가 못 찾는다.
-- 🔴 파생을 저장하지 않고 조회 시점에 계산한다 — 원천(형제 행)이 이미 여기 있으므로
-- 사본을 만들면 갈릴 자리만 생긴다. base 를 한 번 더 GROUP BY 할 뿐이라
-- best_schedule·first_seen 과 같은 비용이다.
-- 제외: sigungu_nm NULL · '외'(지역본부명 오인 잔존분) · sido_nm NULL.
-- 🔴 시·도와 짝지어 담는다 — 「군위군」이 대구인지 경북인지 갈리지 않으면 안 된다.
-- 「시 구」 두 마디(부천시 소사구)는 첫 마디(부천시)도 함께 담아 시 단위로 찾는 사용자를 잡는다.
region_set AS (
  SELECT dedup_key, array_agg(DISTINCT nm ORDER BY nm) AS region_names
  FROM (
    SELECT b.dedup_key, b.sido_nm || ' ' || b.sigungu_nm AS nm
    FROM base b
    WHERE b.sido_nm IS NOT NULL AND b.sigungu_nm IS NOT NULL AND b.sigungu_nm <> '외'
    UNION
    SELECT b.dedup_key, b.sido_nm || ' ' || split_part(b.sigungu_nm, ' ', 1)
    FROM base b
    WHERE b.sido_nm IS NOT NULL AND b.sigungu_nm IS NOT NULL AND b.sigungu_nm <> '외'
      AND b.sigungu_nm LIKE '% %'
  ) rn
  GROUP BY dedup_key
),
-- 🔴 그 공고의 단지(블록) 수 (2026-09-16 신설). get_announcement_blocks 의 세는 규칙을
-- 그대로 옮긴 것이다 — 괄호 꼬리를 뗀 precise_address(addr_core)의 distinct 수이고,
-- MYHOME 주소가 하나라도 있으면 MYHOME 기준, 없으면 전체 소스 기준으로 센다.
-- ⚠️ 규칙이 갈리면 화면의 블록 섹션과 카드 표지가 어긋난다. 2026-09-16 활성 113건 전수에서
-- get_announcement_blocks 의 반환 행 수와 113/113 일치를 확인하고 넣었다.
block_count AS (
  SELECT dedup_key,
    CASE WHEN count(*) FILTER (WHERE source = 'MYHOME' AND addr_core <> '') > 0
         THEN count(DISTINCT addr_core) FILTER (WHERE source = 'MYHOME' AND addr_core <> '')
         ELSE count(DISTINCT addr_core) FILTER (WHERE addr_core <> '')
    END AS n
  FROM (
    SELECT dedup_key, source,
      COALESCE(trim(regexp_replace(precise_address, '\s*\([^)]*\)\s*$', '')), '') AS addr_core
    FROM base
  ) ac
  GROUP BY dedup_key
),
-- 취소공고를 원공고 그룹에 연결한다 (2026-09-12 신설).
-- 🔴 dedup 키는 그대로 둔다 — `[취소공고]` 접두를 announcement_dedup_key가 걷어내지 않으므로
-- 취소공고는 원공고와 별개 그룹으로 남는다(838그룹 재편을 2건과 바꾸지 않는다).
-- 대신 「그 별개 그룹이 존재하는가」만 계산해 원공고 대표행에 플래그로 붙인다.
-- 🔴 제목 문자열이 아니라 dedup 키를 쓴다 — 접두 제거·따옴표 제거·공백 제거·연속 마침표
-- 축약이 전부 announcement_dedup_key 안에 있어서, 그 함수가 바뀌면 이 매칭도 따라온다.
-- `[취소공고]`에는 공백·따옴표·마침표가 없어 정규화를 거쳐도 접두 6글자가 그대로 남는다.
-- ⚠️ 소스를 조건에 넣지 않는다 — 표본 2건이 전부 LH일 뿐 LH 전용이라는 근거가 없다.
-- ⚠️ 취소행 자체는 여전히 자기 그룹으로 조회된다. 숨기지 않는다.
cancel_keys AS (
  SELECT DISTINCT substr(dedup_key, 7) AS orig_dedup_key
  FROM base
  WHERE substr(dedup_key, 1, 6) = '[취소공고]'
    AND length(dedup_key) > 6
),
winner AS (
  SELECT DISTINCT ON (b.dedup_key) b.*
  FROM base b
  ORDER BY b.dedup_key,
    b.announcement_date DESC NULLS LAST,
    CASE WHEN b.own_pblanc_id IN (SELECT pblanc_id FROM superseded_pblanc_ids) THEN 1 ELSE 0 END,
    CASE WHEN b.is_revised THEN 0 ELSE 1 END,
    CASE b.source WHEN 'LH' THEN 1 WHEN 'MYHOME' THEN 2 ELSE 3 END,
    b.created_at DESC,
    b.id ASC
)
SELECT
  w.id, w.source, w.announcement_id, w.title, w.region,
  CASE
    WHEN bl.best_sido IS NOT NULL THEN bl.best_sido
    WHEN w.region = '서울' THEN '서울특별시'
    ELSE COALESCE(SUBSTRING(w.region FROM '^\S+?[시도]'), SPLIT_PART(w.region, ' ', 1))
  END AS region_top,
  bl.best_sido AS sido_nm,
  bl.best_sigungu AS sigungu_nm,
  w.housing_type, w.supply_org, w.announcement_date,
  COALESCE(w.apply_start, bs.best_apply_start) AS apply_start,
  w.apply_end,
  w.status,
  w.status AS status_normalized,
  w.url, w.is_revised,
  w.area_min, w.area_max, w.rent_min, w.rent_max,
  w.deposit_min, w.deposit_max, w.total_units,
  w.move_in_date, w.target_type, w.heating_type,
  w.created_at, w.updated_at,
  w.mymy_applicable, w.supply_form, w.application_method,
  w.recruit_multiplier, w.pair_announcement_key, w.housing_change_allowed,
  COALESCE(w.precise_address, bl.best_precise) AS precise_address,
  w.is_relaxed_recruitment, w.relaxation_detail, w.selection_method,
  w.subscription_months_required, w.subscription_payments_required,
  w.contract_before_verification, w.rent_exemption_until, w.rent_exemption_note,
  w.revision_note, w.revised_at, w.special_notes, w.revised_at_source,
  fs.first_seen_at,
  COALESCE(w.doc_submit_announce_date, bs.best_doc_submit_announce_date) AS doc_submit_announce_date,
  COALESCE(w.doc_submit_start, bs.best_doc_submit_start) AS doc_submit_start,
  COALESCE(w.doc_submit_end, bs.best_doc_submit_end) AS doc_submit_end,
  COALESCE(w.winner_announce_date, bs.best_winner_announce_date) AS winner_announce_date,
  COALESCE(w.contract_start, bs.best_contract_start) AS contract_start,
  COALESCE(w.contract_end, bs.best_contract_end) AS contract_end,
  COALESCE(w.building_name, bs.best_building_name) AS building_name,
  w.attachment_urls,
  (w.dedup_key IN (SELECT orig_dedup_key FROM cancel_keys)) AS has_cancel_notice,
  rs.region_names,
  CASE WHEN bc.n >= 2 THEN bc.n ELSE 1 END AS block_count,
  -- 🔴 2026-09-17 추가한 둘. 대표행(winner) 값을 그대로 낸다 — 형제 행에서 끌어오지
  -- 않는다(best_* 계열과 다르다). 회차 축은 이번에 바꾸지 않으므로 화면이 읽기만 한다.
  w.first_announcement_date,
  w.schedule_varies
FROM winner w
JOIN best_location bl ON bl.dedup_key = w.dedup_key
JOIN best_schedule bs ON bs.dedup_key = w.dedup_key
JOIN first_seen fs ON fs.dedup_key = w.dedup_key
LEFT JOIN region_set rs ON rs.dedup_key = w.dedup_key
LEFT JOIN block_count bc ON bc.dedup_key = w.dedup_key
WHERE (
    p_region IS NULL
    OR bl.best_sido = p_region
    OR CASE
         WHEN w.region = '서울' THEN '서울특별시'
         ELSE COALESCE(SUBSTRING(w.region FROM '^\S+?[시도]'), SPLIT_PART(w.region, ' ', 1))
       END = p_region
  )
  AND (
    p_type IS NULL
    OR CASE
         WHEN (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%토지%'     THEN '토지'
         WHEN (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%상가%'
           OR (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%점포%'     THEN '상가'
         WHEN (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%분양%'
          AND (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) NOT LIKE '%분양전환%' THEN '분양주택'
         WHEN (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%매입임대%'
           OR (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%전세임대%'
           OR (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%전세주택%' THEN '매입·전세임대'
         WHEN (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%행복주택%' THEN '행복주택'
         WHEN (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%영구임대%' THEN '영구임대'
         WHEN (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%국민임대%' THEN '국민임대'
         WHEN (coalesce(w.housing_type,'') || ' ' || coalesce(w.title,'')) LIKE '%공공임대%' THEN '공공임대'
         ELSE '기타'
       END = p_type
  )
  AND (
    p_status IS NULL
    OR (p_status = '정정공고' AND w.is_revised = true)
    OR (p_status <> '정정공고' AND w.status = p_status)
  );
$function$
