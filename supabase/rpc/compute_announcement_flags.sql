CREATE OR REPLACE FUNCTION public.compute_announcement_flags()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
-- 제목 키워드로 파생 플래그를 채운다. BEFORE INSERT OR UPDATE.
--
-- ■ 2026-09-18 추가 — is_relaxed_recruitment · contract_before_verification
-- 🔴 이 두 줄은 **켜기만 하고 끄지 않는다.** true 를 false 로 되돌리는 경로가 없다.
--
-- 왜 그렇게 하나(2026-09-18 조사):
--   · 제목 축 **정밀도 100%** — 두 번 측정됐다. 2026-09-13 에 제목에 「완화」가 든 고유 제목
--     172개를 육안 전수 확인해 거짓양성 0건이었고, 이번에 역방향으로도 확인했다:
--     is_relaxed_recruitment=true 인 64행이 **전부** 제목에 「완화」를 갖고 있었다.
--   · 제목 축 **재현율 15%** — 제목에 「완화」가 든 416건 중 켜진 것이 64건뿐이었다.
--     즉 제목이 있으면 켜는 것은 안전하고, 제목이 없다고 끄는 것은 위험하다.
--   · 🔴 **끄면 안 되는 실물이 있다** — `2015122300020701`(김제하동)은 제목에 「선계약」도
--     「후검증」도 없는데 contract_before_verification=true 다. 원문 본문의 「先계약 後검증」
--     조항을 사람이 읽고 넣은 값이다(2026-09-13). 제목으로 끄면 그 값이 매 수집 런에 사라진다.
--
-- ■ 왜 protect_detail_columns() 에 보호 술어를 더하지 않았나
-- 그 함수는 `coalesce(NEW.x, OLD.x)` 방식이라 **NULL 쓰기만** 막는다. 두 컬럼은 기본값이
-- false 라 「false 로 덮기」는 NULL 이 아니어서 걸리지 않고, 막으려면 region 처럼 별도 술어가
-- 필요하다. 🔴 **보호 장치를 하나 더 얹는 대신 되돌릴 일 자체를 만들지 않는 쪽**을 골랐다 —
-- 여기서 OLD 를 OR 하므로 수집이 false 를 실어도 켜진 값이 꺼지지 않는다.
--
-- ■ 판정식은 제목만 본다
-- 본문(announcement_policies·eligibility_criteria·housing_units)까지 보면 거짓양성이 12건
-- 새로 생긴다(2026-09-18 실측): 매입임대 표준 문구인 「임대보증금 완화제도」, JSON 키 이름인
-- `출산가구_자산완화`, 든든전세의 상설 규칙인 「자산기준 10%p 완화」가 전부 걸린다.
--
-- ■ 🔴 의도적으로 끄려면 — 탈출구
-- 이 트리거는 자동 켜기를 에러 없이 수행하므로, 모르고 끄려 들면 성공으로 읽히고 값은 그대로다.
-- 정말 꺼야 할 때는 같은 트랜잭션 안에서 먼저 아래를 실행한다.
--
--     BEGIN;
--     SET LOCAL zipfit.allow_flag_clear = 'on';
--     UPDATE announcements SET is_relaxed_recruitment = false WHERE ...;
--     COMMIT;
--
-- SET LOCAL 은 트랜잭션이 끝나면 사라지므로 다음 트랜잭션은 다시 보호 상태다.
-- ⚠️ 이 스위치는 **두 항을 함께 푼다** — OLD OR 뿐 아니라 제목 OR 도 건너뛴다. 제목 OR 를
--    남기면 제목에 「완화」가 든 행(=켜진 행의 전부다)은 무엇을 해도 꺼지지 않아 탈출구가
--    탈출구 노릇을 못 한다. protect_detail_columns() 의 allow_null_clear 와 같은 성질이다.
-- ⚠️ 이 스위치는 is_target·is_metro 에는 영향이 없다 — 그 둘은 아래에서 늘 계산된다.
BEGIN
  -- is_target: 신혼·신생아·청년 키워드
  NEW.is_target := (
    NEW.title ILIKE '%신혼%' OR
    NEW.title ILIKE '%신생아%' OR
    NEW.title ILIKE '%청년%' OR
    NEW.housing_type ILIKE '%신혼%'
  );

  -- is_metro: 수도권 (서울·경기·인천)
  NEW.is_metro := (
    NEW.region ILIKE '%서울%' OR
    NEW.region ILIKE '%경기%' OR
    NEW.region ILIKE '%인천%'
  );

  -- 🔴 켜기만 하는 두 플래그. 탈출구가 켜져 있으면 NEW 값을 그대로 둔다.
  -- coalesce 로 감싸는 이유: 두 컬럼은 nullable 이라 payload 가 명시적 null 을 실으면
  -- OR 결과가 null 이 되고, 그러면 「모름」이 화면에서 「아님」과 같아진다.
  IF coalesce(current_setting('zipfit.allow_flag_clear', true), '') <> 'on' THEN
    NEW.is_relaxed_recruitment := (
      coalesce(NEW.is_relaxed_recruitment, false)
      OR (TG_OP = 'UPDATE' AND coalesce(OLD.is_relaxed_recruitment, false))
      OR NEW.title ILIKE '%완화%'
    );

    NEW.contract_before_verification := (
      coalesce(NEW.contract_before_verification, false)
      OR (TG_OP = 'UPDATE' AND coalesce(OLD.contract_before_verification, false))
      OR NEW.title ILIKE '%선계약%'
      OR NEW.title ILIKE '%후검증%'
    );
  END IF;

  RETURN NEW;
END;
$function$
