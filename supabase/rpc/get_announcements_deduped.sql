CREATE OR REPLACE FUNCTION public.get_announcements_deduped(p_region text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, source text, announcement_id text, title text, region text, region_top text, sido_nm text, sigungu_nm text, housing_type text, supply_org text, announcement_date date, apply_start date, apply_end date, status text, status_normalized text, url text, is_revised boolean, area_min numeric, area_max numeric, rent_min integer, rent_max integer, deposit_min bigint, deposit_max bigint, total_units integer, move_in_date text, target_type text, heating_type text, created_at timestamp with time zone, updated_at timestamp with time zone, mymy_applicable boolean, supply_form text, application_method text, recruit_multiplier text, pair_announcement_key text, housing_change_allowed boolean, precise_address text, is_relaxed_recruitment boolean, relaxation_detail text, selection_method text, subscription_months_required integer, subscription_payments_required integer, contract_before_verification boolean, rent_exemption_until date, rent_exemption_note text, revision_note text, revised_at timestamp with time zone, special_notes jsonb, revised_at_source text, first_seen_at timestamp with time zone, doc_submit_announce_date date, doc_submit_start date, doc_submit_end date, winner_announce_date date, contract_start date, contract_end date, building_name text, attachment_urls jsonb, has_cancel_notice boolean, region_names text[], block_count integer, first_announcement_date date, schedule_varies boolean)
 LANGUAGE sql
 STABLE
AS $function$
WITH raw_base AS (
  SELECT *,
    announcement_dedup_key(title) AS title_key,
    CASE WHEN source = 'MYHOME' THEN split_part(announcement_id, '_', 1) ELSE NULL END AS own_pblanc_id,
    -- 회차 날짜 — 정정이면 첫 공고일, 아니면 공고일(get_announcement_price_summary·화면 zfNoticeDate 와 같은 규칙)
    CASE WHEN is_revised AND first_announcement_date IS NOT NULL THEN first_announcement_date ELSE announcement_date END AS round_date
  FROM announcements
  WHERE title IS NOT NULL
    AND hidden_from_listing IS NOT TRUE
),
superseded_pblanc_ids AS (
  SELECT DISTINCT before_pblanc_id AS pblanc_id
  FROM announcements
  WHERE before_pblanc_id IS NOT NULL AND before_pblanc_id <> ''
),
-- 🔴 2026-09-25(B26 · P1) — 열린 지난 회차를 목록에 되살린다.
--   제목 키(title_key)만으로 묶으면 그룹당 최신 회차 한 행만 남아, 같은 제목의 새 회차가 올라오는 순간
--   아직 접수 전·중인 앞 회차가 목록에서 사라졌다(군산나운4 …020801 접수 9/29 ← …020822 접수 10/6).
--   그래서 「제목 그룹의 대표와 회차 날짜·apply_end 가 둘 다 다르고, LH 행 status 가 공고중·접수중인 회차」만
--   dedup_key 에 '#회차날짜' 꼬리를 붙여 따로 떼어 낸다. 같은 회차 날짜의 MYHOME 짝도 함께 떨어진다.
--   🔵 앞 회차가 접수마감이 되면 조건이 풀려 저절로 원래 그룹으로 돌아간다.
--   ⚠️ title_winner 의 ORDER BY 는 아래 winner CTE 와 **같아야 한다**(대표를 두 번 고르는 셈이다).
--   🔵 2026-09-25(B30) — 떼어진 회차도 cancel_keys 와 맞는다(dedup_key 가 아니라 title_key 로 짝짓는다).
title_winner AS (
  SELECT DISTINCT ON (r.title_key) r.title_key, r.round_date, r.apply_end
  FROM raw_base r
  ORDER BY r.title_key,
    r.announcement_date DESC NULLS LAST,
    CASE WHEN r.own_pblanc_id IN (SELECT pblanc_id FROM superseded_pblanc_ids) THEN 1 ELSE 0 END,
    CASE WHEN r.is_revised THEN 0 ELSE 1 END,
    CASE r.source WHEN 'LH' THEN 1 WHEN 'MYHOME' THEN 2 ELSE 3 END,
    r.created_at DESC,
    r.id ASC
),
open_past_rounds AS (
  SELECT DISTINCT r.title_key, r.round_date
  FROM raw_base r
  JOIN title_winner tw ON tw.title_key = r.title_key
  WHERE r.source = 'LH'
    AND r.status IN ('공고중', '접수중')
    AND r.round_date IS NOT NULL
    AND r.round_date IS DISTINCT FROM tw.round_date
    AND r.apply_end IS DISTINCT FROM tw.apply_end
),
base AS (
  SELECT r.*,
    CASE WHEN o.round_date IS NOT NULL THEN r.title_key || '#' || o.round_date::text ELSE r.title_key END AS dedup_key
  FROM raw_base r
  LEFT JOIN open_past_rounds o ON o.title_key = r.title_key AND o.round_date = r.round_date
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
    created_at DESC,
    -- 🔴 2026-09-21 — 결정적 꼬리키. 같은 dedup_key 안에 created_at 까지 같은 행이 실재해
    --   (양산 21282_* · 21283_*) 대표 주소가 물리적 행 순서로 갈렸다. 실측: 주소가 서로 다른
    --   동률 그룹 137개(dedup_key 115개). 아래 winner CTE 가 이미 쓰는 것과 같은 컬럼이다.
    id DESC
),
-- 🔴 2026-09-25(B26) — 결정적 꼬리키 id DESC 를 더했다. 같은 dedup_key 안에 created_at 이 같은 행
--   (MYHOME 다블록 한 배치)이 실재해, 어느 형제의 값이 뽑히는지가 실행 계획에 따라 갈렸다 — P1 로 계획이
--   바뀌자 접수마감 카드들의 building_name 이 다른 블록 이름으로 바뀐 것으로 드러났다. 종전 정의도 같은
--   데이터에서 계획에 따라 다른 값을 냈다(2026-09-25 실측) — 되돌아갈 「종전 값」이 고정돼 있지 않았다.
--   방향은 best_location 과 같은 id DESC 다 — 표지의 주소(best_precise)와 건물명이 같은 블록 행에서 온다
--   (건물명이 2종 이상인 146그룹 중 id DESC 142 · id ASC 29).
best_schedule AS (
  SELECT dedup_key,
    (array_agg(apply_start ORDER BY created_at DESC, id DESC) FILTER (WHERE apply_start IS NOT NULL))[1] AS best_apply_start,
    (array_agg(doc_submit_announce_date ORDER BY created_at DESC, id DESC) FILTER (WHERE doc_submit_announce_date IS NOT NULL))[1] AS best_doc_submit_announce_date,
    (array_agg(doc_submit_start ORDER BY created_at DESC, id DESC) FILTER (WHERE doc_submit_start IS NOT NULL))[1] AS best_doc_submit_start,
    (array_agg(doc_submit_end ORDER BY created_at DESC, id DESC) FILTER (WHERE doc_submit_end IS NOT NULL))[1] AS best_doc_submit_end,
    (array_agg(winner_announce_date ORDER BY created_at DESC, id DESC) FILTER (WHERE winner_announce_date IS NOT NULL))[1] AS best_winner_announce_date,
    (array_agg(contract_start ORDER BY created_at DESC, id DESC) FILTER (WHERE contract_start IS NOT NULL))[1] AS best_contract_start,
    (array_agg(contract_end ORDER BY created_at DESC, id DESC) FILTER (WHERE contract_end IS NOT NULL))[1] AS best_contract_end,
    (array_agg(building_name ORDER BY created_at DESC, id DESC) FILTER (WHERE building_name IS NOT NULL))[1] AS best_building_name
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
-- 🔴 2026-09-25(B30) — 회차 조건을 더했다: 제목 키 + 접수 마감일(apply_end).
--   제목 키만 보면 그룹 대표(최신 회차)에 배지가 붙어, 취소되지 않은 다음 회차가 취소된 것처럼 보였다
--   (태백철암1 9/14 회차 · 청주지북A4 6/5 회차 — 둘 다 취소 대상은 앞 회차였다).
--   취소공고 2건 모두 대상 회차와 apply_end 가 같다(태백 10/14 · 청주 5/29). 공고일은 청주에서 갈린다(취소 5/21 ↔ 대상 5/15).
--   한쪽 apply_end 가 NULL 이면 종전처럼 제목만 본다.
--   dedup_key 대신 title_key 를 써서 P1 으로 떼어진 회차('#회차날짜' 꼬리)도 배지를 받는다.
--   ⚠️ 화면 zfPairedCancelIds · zfCheckDedupMirror 가 같은 규칙의 거울이다 — 함께 바꾼다.
-- 🔴 2026-09-25(H1) — MATERIALIZED: 한 번만 계산한다. 인라인되면 아래 has_cancel_notice EXISTS 가
--   대표행마다 base 전체(3,066행)를 다시 훑는 상관 서브쿼리가 되어(loops=906) anon statement_timeout 3s 를 넘었다.
cancel_keys AS MATERIALIZED (
  SELECT DISTINCT substr(title_key, 7) AS orig_title_key, apply_end AS cancel_apply_end
  FROM base
  WHERE substr(title_key, 1, 6) = '[취소공고]'
    AND length(title_key) > 6
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
  EXISTS (SELECT 1 FROM cancel_keys ck
          WHERE ck.orig_title_key = w.title_key
            AND (ck.cancel_apply_end IS NULL OR w.apply_end IS NULL OR ck.cancel_apply_end = w.apply_end)) AS has_cancel_notice,
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
