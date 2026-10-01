-- 운영 — 목록 RPC null 인자 근본(2026-10-01 · 우편함 「운영 — 공고 분석 감지 루틴 발송기」 3)
--   PostgREST 가 인자를 null 로 명시해 보내면 SQL 함수가 인라인되지 않고 일반 계획이 되어, 마지막 WHERE 의 OR 조건 때문에
--   대표 행 추정이 1로 떨어지고 complex_name(같은 회차 세대 행 다시 세기)을 대표마다 다시 돌렸다(925회 · 4.6초 → anon 3초 초과 500).
--   complex_name 을 MATERIALIZED 로 한 번만 계산한다 — 반환형·행·값·권한 그대로(되돌리기 전용 실측: 네 모양 전 행 md5 같음).
-- zipfit:function get_announcements_deduped(text,text,text) acl={=X/postgres,postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=false
-- zipfit:anon select * from get_announcements_deduped()
-- zipfit:anon select t.* from json_to_record('{"p_region":null,"p_type":null,"p_status":null}'::json) as x(p_region text, p_type text, p_status text), lateral get_announcements_deduped(x.p_region, x.p_type, x.p_status) t
-- zipfit:anon select t.* from json_to_record('{"p_region":"경기도"}'::json) as x(p_region text), lateral get_announcements_deduped(x.p_region) t
-- zipfit:anon select t.* from json_to_record('{"p_type":"국민임대"}'::json) as x(p_type text), lateral get_announcements_deduped(p_type => x.p_type) t
CREATE OR REPLACE FUNCTION public.get_announcements_deduped(p_region text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, source text, announcement_id text, title text, region text, region_top text, sido_nm text, sigungu_nm text, housing_type text, supply_org text, announcement_date date, apply_start date, apply_end date, status text, status_normalized text, url text, is_revised boolean, area_min numeric, area_max numeric, rent_min integer, rent_max integer, deposit_min bigint, deposit_max bigint, total_units integer, move_in_date text, target_type text, heating_type text, created_at timestamp with time zone, updated_at timestamp with time zone, mymy_applicable boolean, supply_form text, application_method text, recruit_multiplier text, pair_announcement_key text, housing_change_allowed boolean, precise_address text, is_relaxed_recruitment boolean, relaxation_detail text, selection_method text, subscription_months_required integer, subscription_payments_required integer, contract_before_verification boolean, rent_exemption_until date, rent_exemption_note text, revision_note text, revised_at timestamp with time zone, special_notes jsonb, revised_at_source text, first_seen_at timestamp with time zone, doc_submit_announce_date date, doc_submit_start date, doc_submit_end date, winner_announce_date date, contract_start date, contract_end date, building_name text, attachment_urls jsonb, has_cancel_notice boolean, region_names text[], block_count integer, first_announcement_date date, schedule_varies boolean, apply_end_confirmed date, apply_period_check boolean, last_seen_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
-- 🔴 2026-09-30(코드 — 같은 게시물은 LH 카드 한 장) — 같은 게시물 링크 표(announcement_post_links · 규칙 v2 = 같은 날짜 ∧ panId)에
--   있는 MYHOME 행은 **제목 키 대신 LH 행의 제목 키**를 쓴다 → LH 카드 그룹에 붙는다(목록에 따로 서지 않는다).
--   🔴 링크 표에 없는 행은 그대로다 — 같은 panId 라도 다른 회차(천안쌍용5-2 · 김제·정읍)는 표에 없어 붙지 않는다.
--   LH 행이 목록에 없으면(hidden · 제목 없음) 붙이지 않는다 — MYHOME 카드가 종전대로 선다.
--   ⚠️ 같은 규칙이 get_announcement_group_ids · get_announcement_blocks · get_announcement_price_summary 에 있다 — 함께 바꾼다.
--   붙은 행(linked_in)은 대표·주소·일정 폴백을 고를 때 맨 뒤다 — LH 카드의 대표·제목·시군구는 종전 그대로이고,
--   더해지는 것은 region_names · block_count · 단지명 셈(complex_name) · 그룹 산물이다.
WITH link_map AS MATERIALIZED (
  SELECT DISTINCT ON (l.linked_announcement_id)
    l.linked_announcement_id AS aid, announcement_dedup_key(lh.title) AS lh_key
  FROM public.announcement_post_links l
  JOIN public.announcements lh ON lh.announcement_id = l.lh_announcement_id
  WHERE lh.title IS NOT NULL AND lh.hidden_from_listing IS NOT TRUE
  ORDER BY l.linked_announcement_id, l.lh_announcement_id
),
raw_base AS (
  SELECT a.*,
    COALESCE(lm.lh_key, announcement_dedup_key(a.title)) AS title_key,
    (lm.aid IS NOT NULL) AS linked_in,
    CASE WHEN source = 'MYHOME' THEN split_part(announcement_id, '_', 1) ELSE NULL END AS own_pblanc_id,
    -- 회차 날짜 — 정정이면 첫 공고일, 아니면 공고일(get_announcement_price_summary·화면 zfNoticeDate 와 같은 규칙)
    CASE WHEN is_revised AND first_announcement_date IS NOT NULL THEN first_announcement_date ELSE announcement_date END AS round_date
  FROM announcements a
  LEFT JOIN link_map lm ON lm.aid = a.announcement_id
  WHERE title IS NOT NULL
    AND hidden_from_listing IS NOT TRUE
    -- 🔴 2026-09-28(B53) — 비주택 유형을 목록에서 뺀다. 거주자 모집이 아니다(가정어린이집 운영예정자
    --   모집 …020085 · …020812). 수집은 그대로다 — 행은 남고 목록·그룹 대표에만 안 선다.
    --   ⚠️ 분석률·재분석 큐가 이 RPC 를 모수로 쓰므로 같은 제외가 저절로 따라간다.
    -- 🔴 2026-09-28(B59) — 유형 목록을 하드코딩에서 표준 조회로 옮겼다(B57 ③ 설계안).
    --   housing_type_map → housing_type_std.is_housing = false 인 (source, housing_type) 만 뺀다.
    --   지금 비주택은 LH 「임대주택 - 가정어린이집」 하나라 결과 집합은 종전과 같다(전후 대표 ID 집합 diff 0).
    --   ⚠️ 매핑이 없는 새 housing_type 은 이 조건에 안 걸려 목록에 남는다(모르는 것을 숨기지 않는다).
    AND NOT EXISTS (SELECT 1 FROM public.housing_type_map m JOIN public.housing_type_std s ON s.name = m.std_type
                    WHERE m.source_table = 'announcements' AND m.source = a.source
                      AND m.housing_type = a.housing_type AND NOT s.is_housing)
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
    r.linked_in,
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
    linked_in,
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
-- 🔵 2026-09-30 — 붙은 공고문(linked_in)의 일정은 LH 카드 일정의 폴백으로 쓰지 않는다 — 공고문마다 일정이 다르다(아산 신창·인주 ↔ 탕정2).
--   공고문별 접수기간은 화면이 링크 표로 따로 받는다.
best_schedule AS (
  SELECT dedup_key,
    (array_agg(apply_start ORDER BY created_at DESC, id DESC) FILTER (WHERE apply_start IS NOT NULL AND NOT linked_in))[1] AS best_apply_start,
    (array_agg(doc_submit_announce_date ORDER BY created_at DESC, id DESC) FILTER (WHERE doc_submit_announce_date IS NOT NULL AND NOT linked_in))[1] AS best_doc_submit_announce_date,
    (array_agg(doc_submit_start ORDER BY created_at DESC, id DESC) FILTER (WHERE doc_submit_start IS NOT NULL AND NOT linked_in))[1] AS best_doc_submit_start,
    (array_agg(doc_submit_end ORDER BY created_at DESC, id DESC) FILTER (WHERE doc_submit_end IS NOT NULL AND NOT linked_in))[1] AS best_doc_submit_end,
    (array_agg(winner_announce_date ORDER BY created_at DESC, id DESC) FILTER (WHERE winner_announce_date IS NOT NULL AND NOT linked_in))[1] AS best_winner_announce_date,
    (array_agg(contract_start ORDER BY created_at DESC, id DESC) FILTER (WHERE contract_start IS NOT NULL AND NOT linked_in))[1] AS best_contract_start,
    (array_agg(contract_end ORDER BY created_at DESC, id DESC) FILTER (WHERE contract_end IS NOT NULL AND NOT linked_in))[1] AS best_contract_end,
    (array_agg(building_name ORDER BY created_at DESC, id DESC) FILTER (WHERE building_name IS NOT NULL AND NOT linked_in))[1] AS best_building_name
  FROM base
  GROUP BY dedup_key
),
first_seen AS (
  -- 🔴 2026-09-29(EF 회차 4) last_seen_at — 그룹 안 행 중 수집 EF가 원천에서 마지막으로 다시 본 시각(max).
  --   announcements.last_seen_at 은 수집 매퍼만 채운다(분석·만료 처리로는 안 바뀐다). SH 행은 NULL.
  -- 🔵 2026-09-30 — 붙은 행(linked_in)은 세지 않는다 — LH 카드의 처음 본 시각·마지막 본 시각은 종전 그대로다.
  SELECT dedup_key,
    COALESCE(min(created_at) FILTER (WHERE NOT linked_in), min(created_at)) AS first_seen_at,
    COALESCE(max(last_seen_at) FILTER (WHERE NOT linked_in), max(last_seen_at)) AS last_seen_at
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
    b.linked_in,
    b.announcement_date DESC NULLS LAST,
    CASE WHEN b.own_pblanc_id IN (SELECT pblanc_id FROM superseded_pblanc_ids) THEN 1 ELSE 0 END,
    CASE WHEN b.is_revised THEN 0 ELSE 1 END,
    CASE b.source WHEN 'LH' THEN 1 WHEN 'MYHOME' THEN 2 ELSE 3 END,
    b.created_at DESC,
    b.id ASC
),
-- 🔴 2026-09-29(코드 회차 3) — LH 다단지 카드의 단지명 「A 외 N개 단지」를 **같은 회차 세대 행**으로 다시 센다.
--   EF 가 붙인 접미(dsSbd 수)는 원문이 모집하지 않는 단지까지 셀 수 있다 — 보성·순천·광양 …0667 은 「보성운곡 국민임대 외 4개 단지」
--   (5)인데 같은 회차 세대 행은 4단지이고 보성운곡은 그 안에 없다 · 목포·무안·영암·완도 …0734 는 7 대 6.
--   대상: 대표가 LH ∧ 대표 building_name 에 그 접미가 있음 ∧ 대표와 **같은 apply_end** 의 그룹 구성원에 세대 행이 있음.
--   🔴 같은 회차만 센다 — 그룹의 옛 회차 세대 행까지 세면 원주무실 …0783 (3 → 7)·구미구평 …0709 (5 → 10)처럼 부푼다.
--   ⚠️ 「완료 계열 분석이 있다」를 announcement_analysis 로 직접 보지 않는다 — 이 함수는 INVOKER 이고 그 표는 anon 에
--      SELECT 가 없다(2026-09-29 요약 함수 장애와 같은 자리). 세대 행은 분석 반영으로만 생기므로 그것을 재료로 쓴다
--      (2026-09-29 실측: 접미 카드 중 같은 회차 세대 행이 있는 것은 전부 같은 회차 완료 계열 분석이 있다).
--   단지 키 = 건물 머리 키(화면 zfBuildingKeyOf 와 같은 식: building_name, 없으면 address)에서 꼬리 「(N개동)」·「(…, N개동)」만 뗀 것.
--   🔴 괄호 꼬리를 통째로 떼지 않는다 — 제주 일도·삼도 …0804 의 「(H-1BL)」·「(H-2BL)」은 서로 다른 단지다(떼면 3 → 2).
--   바꾸는 것은 **센 수가 2 이상이고, 접미의 수와 다르거나 대표 이름이 단지 키에 없을 때**다 — 둘 다 맞으면 EF 이름을 그대로 둔다(대조군 불변).
--   대표 이름 A: 종전 이름(접미를 뗀 것)이 같은 회차 단지 키와 공백 무시 부분 일치하면 그대로 · 아니면 대표 주소(region)의
--   시군구에 있는 단지 · 그래도 없으면 구성원 ID 순 첫 단지. 형식 「A 외 N개 단지」는 종전과 같다.
--   지역(region_names)·block_count 는 바꾸지 않는다 — 두 카드 모두 같은 회차 세대 행의 구성원 지역과 이미 같다(2026-09-29 대조).
same_round_units AS (
  SELECT w.dedup_key, w.building_name AS w_building_name, w.region AS w_region,
    b.announcement_id AS gid, b.sido_nm, b.sigungu_nm,
    regexp_replace(COALESCE(NULLIF(btrim(h.building_name), ''), h.address), '\s*\(([^()]*,\s*)?\d+개동\)\s*$', '') AS unit_key
  FROM winner w
  -- 🔵 2026-09-30 — 같은 게시물로 붙은 공고문(linked_in)은 접수 마감일이 달라도 같은 회차다(링크 규칙이 같은 날짜를 요구한다).
  JOIN base b ON b.dedup_key = w.dedup_key AND (b.apply_end = w.apply_end OR b.linked_in)
  JOIN public.housing_units h ON h.announcement_id = b.announcement_id
  WHERE w.source = 'LH'
    AND w.building_name ~ '\s외\s+\d+개\s*단지\s*$'
),
same_round_complex AS (
  SELECT dedup_key,
    max(w_building_name) AS w_building_name,
    regexp_replace(max(w_building_name), '\s외\s+\d+개\s*단지\s*$', '') AS old_lead,
    count(DISTINCT unit_key) AS n,
    bool_or(position(regexp_replace(unit_key, '\s', '', 'g') IN regexp_replace(regexp_replace(w_building_name, '\s외\s+\d+개\s*단지\s*$', ''), '\s', '', 'g')) > 0
         OR position(regexp_replace(regexp_replace(w_building_name, '\s외\s+\d+개\s*단지\s*$', ''), '\s', '', 'g') IN regexp_replace(unit_key, '\s', '', 'g')) > 0
         -- 🔵 2026-09-29(매입 홍보물 회차 3) — 종전 이름 첫 한글 덩어리(2자 이상)가 단지 키에 들어 있어도 같은 단지로 본다.
         --   EF 이름과 세대 행 이름은 같은 단지를 다르게 적는다: 「원주무실(7) 국민임대」↔「원주무실7」 · 「아산탕정2-A7BL」↔「아산탕정LH7단지」
         --   · 「경산하양 A-3블록 행복주택」↔「경산하양3」 · 「인천서창 14BL」↔「인천서창 14단지」 · 「효자5국민임대 B1블록」↔「전주효자5」.
         OR position(substring(w_building_name FROM '[가-힣]{2,}') IN regexp_replace(unit_key, '\s', '', 'g')) > 0) AS lead_found,
    (array_agg(unit_key ORDER BY (w_region LIKE sido_nm || ' ' || sigungu_nm || ' %') IS NOT TRUE, gid, unit_key))[1] AS fallback_lead
  FROM same_round_units
  WHERE unit_key IS NOT NULL AND unit_key <> ''
  GROUP BY dedup_key
),
-- 🔴 2026-10-01(운영 — null 인자 근본) — MATERIALIZED 로 한 번만 계산한다. 인자를 상수로 못 받는 호출(PostgREST 가 null 을 명시해 보낸 경우)은
--   일반 계획이 되어 마지막 WHERE 의 OR 조건 때문에 대표 행 추정이 1로 떨어지고, 이 CTE(같은 회차 세대 행 다시 세기)를 대표마다
--   다시 돌렸다(925회 × 4.9ms = anon 3초 초과 500). 행·값은 그대로다 — 계산 횟수만 한 번으로 묶는다.
complex_name AS MATERIALIZED (
  SELECT dedup_key,
    CASE WHEN lead_found THEN old_lead ELSE fallback_lead END || ' 외 ' || (n - 1) || '개 단지' AS building_name
  FROM same_round_complex
  WHERE n >= 2
    AND (n <> substring(w_building_name FROM '\s외\s+(\d+)개\s*단지\s*$')::int + 1
         -- 🔵 2026-09-29(매입 홍보물 회차 3) — 수가 같아도 대표 이름이 같은 회차 단지 키에 없으면 고른다(군산 …0663).
         OR NOT lead_found)
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
  -- 🔴 2026-09-29(코드 회차 3) — 같은 회차 세대 행으로 다시 센 단지명이 있으면 그것(complex_name 주석).
  COALESCE(cn.building_name, w.building_name, bs.best_building_name) AS building_name,
  w.attachment_urls,
  EXISTS (SELECT 1 FROM cancel_keys ck
          WHERE ck.orig_title_key = w.title_key
            AND (ck.cancel_apply_end IS NULL OR w.apply_end IS NULL OR ck.cancel_apply_end = w.apply_end)) AS has_cancel_notice,
  rs.region_names,
  CASE WHEN bc.n >= 2 THEN bc.n ELSE 1 END AS block_count,
  -- 🔴 2026-09-17 추가한 둘. 대표행(winner) 값을 그대로 낸다 — 형제 행에서 끌어오지
  -- 않는다(best_* 계열과 다르다). 회차 축은 이번에 바꾸지 않으므로 화면이 읽기만 한다.
  w.first_announcement_date,
  w.schedule_varies,
  -- 🔴 2026-09-28(B59) 추가한 둘 — 대표행(winner) 값만 본다. 기존 칸·행 집합은 그대로다(칸 추가뿐, 숨기지 않는다).
  --   apply_end_confirmed : 원문으로 확정한 접수 마감일(B53 칸). 있으면 apply_end 도 이미 이 값이다(보호 트리거).
  --   apply_period_check  : 「접수기간 확인 필요」 — MYHOME 대표 ∧ 공급기관이 LH 아님 ∧ 확정값 없음
  --                          ∧ (공사 신뢰 check ∨ apply_end = winner_announce_date). 대표가 LH 행이면 판정하지 않는다.
  --   ⚠️ supply_org 가 NULL 인 MYHOME 행은 공사를 모르므로 판정하지 않는다(false).
  w.apply_end_confirmed,
  (w.source = 'MYHOME' AND w.supply_org IS NOT NULL AND w.supply_org <> 'LH'
   AND w.apply_start_confirmed IS NULL AND w.apply_end_confirmed IS NULL
   AND (pt.period_trust = 'check' OR w.apply_end = w.winner_announce_date)) IS TRUE AS apply_period_check,
  -- 🔴 2026-09-29(EF 회차 4) 칸 추가뿐 — 행 집합·다른 칸은 그대로다.
  fs.last_seen_at
FROM winner w
JOIN best_location bl ON bl.dedup_key = w.dedup_key
JOIN best_schedule bs ON bs.dedup_key = w.dedup_key
JOIN first_seen fs ON fs.dedup_key = w.dedup_key
LEFT JOIN region_set rs ON rs.dedup_key = w.dedup_key
LEFT JOIN block_count bc ON bc.dedup_key = w.dedup_key
LEFT JOIN complex_name cn ON cn.dedup_key = w.dedup_key
LEFT JOIN public.supply_org_period_trust pt ON pt.supply_org = w.supply_org
WHERE (
    p_region IS NULL
    OR bl.best_sido = p_region
    OR CASE
         WHEN w.region = '서울' THEN '서울특별시'
         ELSE COALESCE(SUBSTRING(w.region FROM '^\S+?[시도]'), SPLIT_PART(w.region, ' ', 1))
       END = p_region
    -- 🔵 2026-09-30(표시층·필터) — 실제 전국 모집(시도 「전국」)은 어느 지역 필터에도 함께 뜬다.
    --   지역이 있는데 LH 지역본부 칸이 「전국」이던 공고는 수집 매핑(sidoOfNationwide)·데이터 정정으로 제 시도를 갖는다.
    OR COALESCE(bl.best_sido, CASE
         WHEN w.region = '서울' THEN '서울특별시'
         ELSE COALESCE(SUBSTRING(w.region FROM '^\S+?[시도]'), SPLIT_PART(w.region, ' ', 1))
       END) = '전국'
    -- 🔵 2026-09-30(코드 — 여러 시도) — 여러 시도에 걸친 공고(대구경북·대전충남·인천/부천·부산울산)는
    --   걸친 시도 전부의 지역 필터에 뜬다. 재료는 region_names(「시도 시군구」 — 그룹 형제 행)의 시도 마디다.
    --   대표 시도(region_top·sido_nm)와 카드 첫 줄은 그대로 — 행 집합만 넓어진다.
    OR EXISTS (SELECT 1 FROM unnest(rs.region_names) rn WHERE split_part(rn, ' ', 1) = p_region)
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
$function$;
