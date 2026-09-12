CREATE OR REPLACE FUNCTION public.protect_detail_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
-- 수집이 값을 NULL로 덮어쓰는 것을 막는다. BEFORE UPDATE 전용이라 신규 INSERT는 영향이 없다.
--
-- ■ 왜 이것이 필요한가
-- collect-announcements의 `mapLHRow(item, sbd, scdl, ahflInfo)`는 상세 응답이 없으면 상세 파생
-- 컬럼을 전부 null로 채운 payload를 만든다. 그 payload가 매 런 `upsert(..., ignoreDuplicates:false)`로
-- 기존 행에 덮어써진다. 호출 지점이 넷이다 — 416행(기본 목록)·636행(late_retry)은 상세를 아예 안 넘기고,
-- 502·549행은 `if (r.sbd || r.scdl)` 게이트라 sbd만 있어도 통과해 scdl 파생 7개가 null로 덮인다.
-- collect-sh-announcements의 `mapRow`는 apply_start·apply_end에 리터럴 null을 싣는다(하루 4회).
-- 2026-09-09 실측: 상세조회가 성공한 이력이 있는데(detail_fetch_last_attempt 있음 + fail_count=0)
-- apply_start·building_name·attachment_urls가 전부 NULL인 LH 행이 294건이었다. 채워진 적이 없는
-- 것이 아니라 채웠다가 지워진 것이다.
--
-- ■ 왜 EF가 아니라 트리거인가
-- (1) 네 경로를 한 번에 덮는다 — EF를 고치면 네 군데를 따로 고쳐야 하고 SH·미배포 upsert-announcement는
--     여전히 남는다. (2) 키를 빼는 방식은 416행이 신규 INSERT 경로를 겸해서 새 공고가 빈 채로 태어난다.
-- (3) deploy_edge_function이 파일이 아니라 내용 문자열을 받는 구조가 2026-08-26 전사 사고 당시
--     그대로라, EF 재배포를 피하는 것 자체가 이득이다. (4) 되돌리기가 DROP TRIGGER 한 줄이다.
--
-- ■ 🔴 의도적으로 값을 지우려면 — 탈출구
-- 이 트리거는 NULL 쓰기를 에러 없이 무시한다. 모르고 지우려 들면 성공으로 읽히고 값은 그대로다.
-- 정말 지워야 할 때는 같은 트랜잭션 안에서 먼저 아래를 실행한다.
--
--     BEGIN;
--     SET LOCAL zipfit.allow_null_clear = 'on';
--     UPDATE announcements SET building_name = NULL WHERE ...;
--     COMMIT;
--
-- SET LOCAL은 트랜잭션이 끝나면 사라지므로 다음 트랜잭션은 다시 보호 상태다. 밖으로 새지 않는다.
-- ⚠️ 이 스위치는 이름이 allow_null_clear지만 **아래 region 가드도 함께 푼다**(맨 위에서 통째로
-- 빠져나가기 때문이다). region을 일부러 지역본부명으로 되돌려야 할 때도 같은 스위치를 쓴다.
-- 🔴 대안(DROP → 정정 → 재생성)을 쓰지 말 것 — 수집이 KST 09:00~18:50에 10분 간격으로 돌아서
-- 그 사이에 런이 끼면 정확히 막으려던 소거가 그 창에서 일어난다.
--
-- ■ 보호하지 않는 것
-- deposit_min·rent_min — mapMyHomeRow가 0을 null로 접어(`rentRaw !== 0 ? rentRaw : null`)
--   「0원」과 「모름」이 DB에서 갈리지 않는다. 보호하면 전세형 전환 공고에 낡은 월세가 영구히 남는다.
--   EF 매핑을 고칠 문제다(백로그).
-- sido_nm·sigungu_nm — get_announcements_deduped의 best_location이 그룹 단위로 coalesce한다.
-- apply_end·announcement_date·status·title·url — 목록에서 매 런 오므로 NULL이 될 일이 없다.
-- region — 🔴 2026-09-12부터 보호한다(본문 맨 아래). 다른 컬럼과 축이 다르다 —
--   NULL이 되는 것이 아니라 「덜 정확한 값」으로 덮이므로 coalesce로는 못 막고,
--   「NEW가 주소형이 아니고 OLD가 주소형이면 OLD 유지」라는 별도 술어를 쓴다.
--   NULL 쓰기는 여전히 막지 않는다 — mapLHRow가 region에 NULL을 싣는 경로가 없다.
BEGIN
  IF coalesce(current_setting('zipfit.allow_null_clear', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- sbd(상세) 파생
  NEW.area_min                 := coalesce(NEW.area_min,                 OLD.area_min);
  NEW.area_max                 := coalesce(NEW.area_max,                 OLD.area_max);
  NEW.total_units              := coalesce(NEW.total_units,              OLD.total_units);
  NEW.heating_type             := coalesce(NEW.heating_type,             OLD.heating_type);
  NEW.move_in_date             := coalesce(NEW.move_in_date,             OLD.move_in_date);
  NEW.building_name            := coalesce(NEW.building_name,            OLD.building_name);
  -- scdl(일정) 파생
  NEW.apply_start              := coalesce(NEW.apply_start,              OLD.apply_start);
  NEW.doc_submit_announce_date := coalesce(NEW.doc_submit_announce_date, OLD.doc_submit_announce_date);
  NEW.doc_submit_start         := coalesce(NEW.doc_submit_start,         OLD.doc_submit_start);
  NEW.doc_submit_end           := coalesce(NEW.doc_submit_end,           OLD.doc_submit_end);
  NEW.winner_announce_date     := coalesce(NEW.winner_announce_date,     OLD.winner_announce_date);
  NEW.contract_start           := coalesce(NEW.contract_start,           OLD.contract_start);
  NEW.contract_end             := coalesce(NEW.contract_end,             OLD.contract_end);
  -- 첨부·주소
  NEW.attachment_urls          := coalesce(NEW.attachment_urls,          OLD.attachment_urls);
  NEW.precise_address          := coalesce(NEW.precise_address,          OLD.precise_address);

  -- region — 🔴 여기만 축이 다르다. NULL이 아니라 「덜 정확한 값」으로 덮여서 coalesce가 안 걸린다.
  -- 무엇을 막나: 기본 목록 upsert(collect-announcements 422행)가 매 런 목록 전량 500여 건의
  -- region에 CNP_CD_NM(지역본부명)을 실어 보내고, 상세가 성공한 <=90건만 542·589행에서 실제
  -- 주소를 싣는다. 그래서 한 런이 복구한 주소를 다음 런이 지웠다 — 2026-09-12 실측으로
  -- 직전 런에 상세를 받은 55행에서만 주소형이 35건이고, 그 이전에 받은 361행은 0건이었다.
  -- 판정식은 ⑩ 「열화의 판정 기준」과 같다: 숫자가 있거나 읍·면·동·리·로·길 토큰이 있으면 주소형.
  --   실측(2026-09-12): LH가 실제로 보내는 지역본부명 25종이 전부 비주소형으로 갈린다(오분류 0).
  -- 🔴 아래 셋은 그대로 통과한다 — 막는 방향은 「주소형 -> 지역본부명」 하나뿐이다.
  --   · INSERT — 이 트리거는 BEFORE UPDATE 전용이라 새 공고는 region을 갖고 태어난다
  --   · 지역본부명 -> 지역본부명 — 본부 표기가 실제로 바뀌면 갱신된다
  --   · 주소형 -> 주소형 — 상세조회가 주소를 갱신하는 경로는 막히지 않는다
  IF NEW.region IS NOT NULL AND OLD.region IS NOT NULL
     AND NOT (NEW.region ~ '[0-9]' OR NEW.region ~ '(읍|면|동|리|로|길)')
     AND     (OLD.region ~ '[0-9]' OR OLD.region ~ '(읍|면|동|리|로|길)')
  THEN
    NEW.region := OLD.region;
  END IF;

  RETURN NEW;
END;
$function$
