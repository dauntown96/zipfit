-- 함수 안 낡은 주석 넷 — 동작 변화 0(본문 코드 그대로 · 주석 줄만) (2026-10-09 · 우편함 「코드 — 고지 회차 1」 8 ⑥ · 백로그 「문서 현행화 회차가 찾은 코드·권한 정리 거리」).
--   ops_health_dispatch: 발송 토큰 대상에 zipfit-backup(2026-10-08 더함) · ops_screen_dispatch: GitHub schedule 예비는 2026-10-07 걷음
--   analysis_followup_request: claude.ai 는 DB 를 쓰지 않는다 · protect_detail_columns: EF 행 번호(움직인다) → 자리 이름
-- 🔴 CREATE OR REPLACE 는 권한을 바꾸지 않는다 — 아래 선언은 지금 값 그대로다(2026-10-09 proacl 실측).
-- 되돌리기: 이전 정의(git show <이 PR 앞 커밋>:supabase/rpc/<이름>.sql)로 새 파일.
-- zipfit:function ops_health_dispatch() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function ops_screen_dispatch() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_followup_request(text,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function protect_detail_columns() acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
CREATE OR REPLACE FUNCTION public.ops_health_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
-- 운영 건강 점검(GitHub Actions health-ops.yml)을 workflow_dispatch 로 부른다(2026-10-03 · 우편함 「코드 — #328 해소 · 운영 점검 예약을 GitHub 밖으로」).
-- cron zipfit-health-ops-dispatch 가 25·55분에 부른다 — GitHub schedule 은 하루 몇 번만 돌았다(10-02 08:39Z 뒤 14:5xZ까지 0회).
-- 비밀값: Vault github_actions_dispatch_token(fine-grained · dauntown96/zipfit · zipfit-backup(2026-10-08 더함) · Actions 읽기·쓰기 · 만료 2027-10-03) — 값은 표·반환에 싣지 않는다.
-- 요청 id 를 ops_dispatch_log 에 남긴다 — health-ops 가 마지막 발송의 응답(204)을 net._http_response 에서 읽는다. 7일 지난 기록은 지운다.
declare
  v_tok text; v_id bigint;
begin
  perform public.ops_dispatch_log_fill();   -- 앞선 발송의 응답을 옮겨 적는다(2026-10-07 · 응답 행은 몇 시간 안에 사라진다 — ops_dispatch_log_fill 주석)
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'github_actions_dispatch_token';
  if coalesce(v_tok, '') = '' then
    raise exception 'Vault github_actions_dispatch_token 없음';
  end if;
  v_id := net.http_post(
    url := 'https://api.github.com/repos/dauntown96/zipfit/actions/workflows/health-ops.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'zipfit-pg-cron', 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
  insert into public.ops_dispatch_log (target, net_request_id) values ('health-ops.yml', v_id);
  delete from public.ops_dispatch_log where at < now() - interval '7 days';
  return v_id;
end
$function$;
CREATE OR REPLACE FUNCTION public.ops_screen_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
-- 화면 점검(GitHub Actions health-screen.yml)을 workflow_dispatch 로 부른다(2026-10-06 · 우편함 「코드 — Z-1 …」 PR-A A5 · 백로그 「남은 GitHub 예약 실행 의존」).
-- cron zipfit-health-screen-dispatch 가 매일 23:50 UTC(KST 08:50 — 아침 워밍 수집 뒤)에 부른다. GitHub schedule 예비 줄은 2026-10-07 걷었다(health-screen.yml — 병합 뒤 실행 · 수동 실행은 그대로).
-- 비밀값: Vault github_actions_dispatch_token(ops_health_dispatch 와 같은 토큰) — 값은 표·반환에 싣지 않는다.
-- 요청 id 를 ops_dispatch_log(target health-screen.yml)에 남긴다 — health-ops 가 마지막 발송 응답(204)을 읽는다.
declare
  v_tok text; v_id bigint;
begin
  perform public.ops_dispatch_log_fill();   -- 앞선 발송의 응답을 옮겨 적는다(2026-10-07 · 응답 행은 몇 시간 안에 사라진다 — ops_dispatch_log_fill 주석)
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'github_actions_dispatch_token';
  if coalesce(v_tok, '') = '' then
    raise exception 'Vault github_actions_dispatch_token 없음';
  end if;
  v_id := net.http_post(
    url := 'https://api.github.com/repos/dauntown96/zipfit/actions/workflows/health-screen.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'zipfit-pg-cron', 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
  insert into public.ops_dispatch_log (target, net_request_id) values ('health-screen.yml', v_id);
  return v_id;
end
$function$;
CREATE OR REPLACE FUNCTION public.analysis_followup_request(p_page_ref text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 우편함 「진행 요청」 후속 처리 페이지(「운영 — 데이터 쓰기 …」)를 루틴에 바로 맡긴다(2026-10-02 · 우편함 「협의 — 원문 키 사이클 …」 1).
-- 🔴 service_role(관리 API)·postgres 만 부른다 — 페이지를 만든 뒤 Claude Code(관리 API)나 다운님이 한 번 부른다(claude.ai 는 DB 를 쓰지 않는다 — 분석 스킬).
-- 요청을 대기(waiting)로 남길 뿐 루틴을 직접 부르지 않는다 — 다음 발송 판정(cron zipfit-analysis-dispatch · 10분마다)이
-- 분석 몫이 없어도 사유 followup 으로 루틴을 부른다(도는 회차가 있으면 끝난 뒤 · 스위치·연속 3실패 멈춤은 그대로).
-- 같은 페이지의 대기 요청이 이미 있으면 새로 만들지 않고 그 요청을 돌려준다.
-- 루틴은 Notion 우편함에서 진행 요청 페이지를 스스로 찾는다 — p_page_ref 는 기록용(페이지 id 또는 제목)이다.
declare
  v_ref text := btrim(coalesce(p_page_ref, ''));
  v_id bigint;
begin
  if v_ref = '' then
    raise exception '우편함 페이지(p_page_ref)가 필요하다';
  end if;
  insert into public.analysis_followup_requests (page_ref, note) values (v_ref, p_note)
  on conflict (page_ref) where state = 'waiting' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.analysis_followup_requests where page_ref = v_ref and state = 'waiting';
    return jsonb_build_object('request', v_id, 'state', 'waiting', 'duplicate', true);
  end if;
  return jsonb_build_object('request', v_id, 'state', 'waiting', 'duplicate', false,
                            'next', '다음 발송 판정(10분마다 · 매시 6분부터)이 루틴을 부른다 — 도는 회차가 있으면 끝난 뒤');
end
$function$;
CREATE OR REPLACE FUNCTION public.protect_detail_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
-- 수집이 값을 NULL로 덮어쓰는 것을 막는다. BEFORE UPDATE 전용이라 신규 INSERT는 영향이 없다.
--
-- ■ 왜 이것이 필요한가
-- collect-announcements의 `mapLHRow(item, sbd, scdl, ahflInfo)`는 상세 응답이 없으면 상세 파생
-- 컬럼을 전부 null로 채운 payload를 만든다. 그 payload가 매 런 `upsert(..., ignoreDuplicates:false)`로
-- 기존 행에 덮어써진다. 호출 지점이 넷이다(2026-09-09 당시 — 행 번호는 적지 않는다, 코드가 움직인다) — 기본 목록 upsert·late_retry 는
-- 상세를 아예 안 넘기고, 상세 경로 둘은 `r.sbd || r.scdl` 게이트라 sbd만 있어도 통과해 scdl 파생 7개가 null로 덮인다.
-- collect-sh-announcements의 `mapRow`는 apply_start·apply_end에 리터럴 null을 싣는다(하루 4회).
-- 2026-09-09 실측: 상세조회가 성공한 이력이 있는데(detail_fetch_last_attempt 있음 + fail_count=0)
-- apply_start·building_name·attachment_urls가 전부 NULL인 LH 행이 294건이었다. 채워진 적이 없는
-- 것이 아니라 채웠다가 지워진 것이다.
--
-- ■ 왜 EF가 아니라 트리거인가
-- (1) 네 경로를 한 번에 덮는다 — EF를 고치면 네 군데를 따로 고쳐야 하고 SH·미배포 upsert-announcement는
--     여전히 남는다. (2) 키를 빼는 방식은 기본 목록 upsert 가 신규 INSERT 경로를 겸해서 새 공고가 빈 채로 태어난다.
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
-- sido_nm — get_announcements_deduped의 best_location이 그룹 단위로 coalesce한다.
-- sigungu_nm — 🔴 2026-09-17부터 보호한다(아래 sbd 블록). 종전 제외 근거(best_location이 그룹 단위로
--   coalesce한다)는 **화면**에서만 성립하고 컬럼 자체는 지워졌다. mapLHRow가 dsSbd 전 원소의 주소에서
--   시군구를 뽑게 되면서 상세가 없는 런은 NULL을 싣는데, 그것이 매 런 기존 값을 지운다.
-- announcement_date·status·title·url — 목록에서 매 런 오므로 NULL이 될 일이 없다.
-- apply_end — 🔴 2026-09-15부터 보호한다(위 scdl 블록). 종전 제외 근거(「목록에서 매 런 온다」)는
--   LH·MYHOME에만 성립하고 SH에는 성립하지 않는다 — collect-sh-announcements의 mapRow가
--   apply_start과 **같은 줄에서** 리터럴 null을 싣는다(하루 4회, 위 ■ 왜 이것이 필요한가 참조).
--   apply_start은 그래서 보호에 들어갔는데 apply_end만 빠져 있었다. 지금은 SH의 apply_end가
--   항상 null이라 지워질 값이 없어 피해가 0이나, SH 접수기간 상세 파싱이 들어오면 새로 채운
--   마감일이 하루 4회 지워진다. 그래서 파싱보다 먼저 넣는다.
-- region — 🔴 2026-09-12부터 보호한다(본문 맨 아래). 다른 컬럼과 축이 다르다 —
--   NULL이 되는 것이 아니라 「덜 정확한 값」으로 덮이므로 coalesce로는 못 막고,
--   「NEW가 주소형이 아니고 OLD가 주소형이면 OLD 유지」라는 별도 술어를 쓴다.
--   NULL 쓰기는 여전히 막지 않는다 — mapLHRow가 region에 NULL을 싣는 경로가 없다.
BEGIN
  -- 🔴 2026-09-28(B53) — 분석으로 확정한 접수기간이 있으면 수집값보다 먼저 선다.
  --   왜: LH 한 게시물(PAN_ID)에 공고문 두 벌이 붙으면 목록 CLSG_DT 가 게시물 전체의 마감이라,
  --   이 카드의 공고가 아닌 날짜가 apply_end 로 들어온다(…020734 목포 등 6단지 원문 접수
  --   09-30~10-01 ↔ 수집 10-02 — 10-02 는 같은 게시물의 영암용앙1 접수일). 수집이 매 런 덮어써서
  --   값을 손으로 고쳐도 되돌아간다.
  --   왜 RPC 가 아니라 여기서: apply_end 를 읽는 곳이 목록 RPC 하나가 아니다 — 회차 조회(화면
  --   fetchGroupRounds · B46 정책 회차 판정) · get_reanalysis_queue · 분석률 · 수집 EF 의 마감 처리가
  --   전부 원래 칸을 읽는다. 칸 자체를 확정값으로 고정하면 읽는 쪽이 한 곳도 갈리지 않는다.
  --   수집값은 남지 않는다(필요하면 collect-announcements ?mode=probe 로 원본을 본다).
  --   allow_null_clear 보다 앞에 둔다 — 확정값을 풀려면 *_confirmed 를 NULL 로 되돌린다.
  IF NEW.apply_start_confirmed IS NOT NULL THEN
    NEW.apply_start := NEW.apply_start_confirmed;
  END IF;
  IF NEW.apply_end_confirmed IS NOT NULL THEN
    NEW.apply_end := NEW.apply_end_confirmed;
  END IF;

  -- 🔵 2026-09-29 코드 회차 3 — 확정 마감일이 이미 지났고 이미 「접수마감」인 행은 수집 upsert 가
  --   원천 status(「공고중」 등)로 되돌리지 못하게 한다. 이것이 없으면 매 런 upsert 가 되돌리고
  --   같은 런 끝의 markExpired 가 다시 「접수마감」으로 바꿨다(칠곡 MYHOME 5행 · expired_marked 매 런 5).
  --   조건은 markExpired 와 같은 축이다 — apply_end < UTC 오늘(EF 가 new Date().toISOString() 날짜로 비교).
  --   확정값이 없는 행 · 확정 마감일이 오늘 이후인 행 · OLD 가 「접수마감」이 아닌 행은 건드리지 않는다.
  IF NEW.apply_end_confirmed IS NOT NULL
     AND NEW.apply_end < (now() AT TIME ZONE 'UTC')::date
     AND OLD.status = '접수마감'
     AND NEW.status IS DISTINCT FROM '접수마감' THEN
    NEW.status := OLD.status;
  END IF;

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
  -- 🔴 2026-09-17 추가한 셋.
  -- sigungu_nm — dsSbd 전 원소가 한 시군구로 수렴할 때만 실리고 수렴하지 않으면 NULL이라,
  --   region처럼 별도 술어가 필요 없고 coalesce로 걸린다.
  NEW.sigungu_nm               := coalesce(NEW.sigungu_nm,               OLD.sigungu_nm);
  -- schedule_varies — dsSplScdl 파생이라 상세가 없는 런은 NULL을 싣는다.
  NEW.schedule_varies          := coalesce(NEW.schedule_varies,          OLD.schedule_varies);
  -- first_announcement_date — 목록(PAN_DT) 파생이라 매 런 오지만, 값이 빠진 회차가 기존 값을
  --   지우지 않도록 같은 그물에 넣는다(MYHOME·SH는 애초에 NULL이라 무해하다).
  NEW.first_announcement_date  := coalesce(NEW.first_announcement_date,  OLD.first_announcement_date);
  -- scdl(일정) 파생
  NEW.apply_start              := coalesce(NEW.apply_start,              OLD.apply_start);
  NEW.apply_end                := coalesce(NEW.apply_end,                OLD.apply_end);
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
  -- 무엇을 막나: 기본 목록 upsert(collect-announcements `lhBaseRows`)가 매 런 목록 전량 500여 건의
  -- region에 CNP_CD_NM(지역본부명)을 실어 보내고, 상세가 성공한 <=90건만 상세 upsert(`detailRows`)에서 실제
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
$function$;
