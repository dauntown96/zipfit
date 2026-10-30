-- 런칭 게이트 — 읽기 전용 한 벌(2026-10-18 · 우편함 「코드·운영 — 게이트 재는 장치」 ③ · 출처: 조사 「런칭 게이트 재는 법」 회신 · claude.ai 검증 통과)
-- 쓰는 법: claude.ai 가 세션 시작 때 Supabase 관리 API(`/database/query`)나 SQL 편집기로 이 파일의 SELECT 한 문장을 그대로 돌린다.
-- 🔴 쓰기 0 · 운영 목록 함수(get_announcements_deduped)를 한 번 부른다(약 3초) · 게이트 문구는 Notion L1 「🚀 런칭 준비도 지도」가 정본이다 —
--    이 파일은 「어떻게 재나」만 담는다. 문구가 바뀌면 이 파일을 함께 고친다.
--
-- 게이트와 재는 자리
--   G1 운영·화면 점검 실패 0, 7일 연속
--      운영 = ops_health_runs kind='ops' · 화면 = ops_health_runs kind='screen'(2026-10-18 마이그레이션 2026-10-18_04 뒤부터 쌓인다 —
--      그 전 화면 실패는 `health-screen` 이슈로만 셈: 마지막 #575 2026-10-16 20:37 KST).
--      실패 = ref='main' ∧ failed 에서 simulate* 와 점검 불능을 뺀 ❌ ≥ 1 인 실행(⚠️는 세지 않는다 · 멈춤/안 멈춤 둘 다 센다).
--      점검 불능(2026-10-20 · 우편함 「코드·운영 — 미착수 회차 … 점검 불능 분리」 ⓓ) = ops_health_runs.blind 에 든 ❌(마이그레이션 2026-10-20_01 뒤) ·
--      운영 runner 는 그 전 행도 점검 불능으로 센다(gate.mjs 가 늘 blind 로 갈랐다). 실패와 따로 blind_7d 로 낸다 — 「실패 0」이어도 점검 불능이 크면 잰 것이 아니다.
--      화면 점검 불능(배포 반영 기다림 초과)은 2026-10-20 뒤부터 DB 에 남는다(그 전에는 health-screen-blind 이슈로만).
--   G2 열린 카드 전부 분석 완료 또는 「분석 중」 표시 · 판정 대기 0
--      카드 요약 갈래(health-screen phrase 와 같은 식): 요약 · 목록없음 · 링크만 · 분석중 = 표지 있음 / 빈칸 · 미정리 = 위반.
--      🔵 2026-10-22(우편함 「표시층 — A(G2): 「링크만」 카드에 사실대로의 표지」) — 「링크만」(첨부 0 · 분석 없음)은 그동안 화면에 표지 없이 초록으로 셌다(빈틈).
--      이제 「링크만」이 표지 있음이 되려면 화면이 「꼭집 미분석」 표지 + 「꼭집이 아직 분석하지 않은 공고예요 · 원문은 … 게시판」을 달아야 하고,
--      그 판정은 SQL 이 못 보므로 health-screen phrase 가 한다(표지 없는 링크만 카드 = phrase 실패 = G1 화면 실패로 드러남).
--      g2.linkonly = 그 카드 수(따로 센다 · blank 에 넣지 않는다) — G2 초록 = blank 0 ∧ 판정 대기 0 ∧ (linkonly 0 ∨ 마지막 health-screen phrase 통과).
--      더함 둘(claude.ai 확정 2026-10-18): 「분석 중」은 대기열(analysis_dispatch_queue waiting·sent·claimed)에 있을 때만 약속이다(analyzing_not_queued = 0) ·
--      판정 대기는 announcement_analysis.status = '완료(판정 대기)'로 센다(pending_fields 「[판정대기]」 표식으로 세지 않는다 — 표식은 판정 뒤에도 기록으로 남는다).
--      열린 카드는 근사다: apply_end ≥ 오늘(KST) ∧ 제목에 「조기…마감」 없음(2026-10-18 화면 58 = 이 식 58). 정본은 health-screen phrase(공고 탭 전 카드).
--      🔵 2026-10-22(우편함 「표시층 C 묶음 5」 4 ⓓ) — 화면은 마감 날 원문 끝 시각(경로 표 · 일정 표 접수 행 period_text)이 지나면 그 카드를 내린다.
--      이 근사는 날짜만 보아 그날 끝까지 그 카드를 센다 — 어긋나는 쪽은 늘 「근사가 더 센다」(엄격한 쪽 · 거짓 초록 없음) · 끝 시각 읽기를 SQL 로 옮기면 사본이 생겨 옮기지 않는다.
--      마감 날 오후에 G2 가 화면보다 많으면 health-screen phrase(정본)로 가른다.
--   G3 열린 카드에 지금 보이는 틀린 정보 0(출처 무관 — 2026-10-19 다운님 결정 · 종전 「가장 최근 실사용 회차 『높음』 결함 0」) → 아래 Notion 질의 ①
--   G4 사용자 목록 실패 → health-ops list_user_fail(`ops_health_runs` warned · `ops_health_findings` item='list_user_fail'). 「사람」에는 다운님 기기가 섞인다 —
--      판정에서 다운님 기기 실패도 센다(claude.ai 확정 2026-10-18 · 빼면 낙관 쪽으로 기운다).
--      아래 g4: 로그 조회 실패(관리 API 오류 — 2026-10-19 22:25 「Failed to get project's logs」)는 사람 실패가 아니라 점검 불능 — blind 로 가른다(2026-10-20 ⓓ).
--      그 전 행은 기록 문구에 「Error:」가 있으면 점검 불능으로 본다(조회 실패 때만 예외 문구가 값에 들어간다 · 성공 값은 「사람 브라우저 N · …」).
--      g4.last_human_event_kst(2026-10-20 · 우편함 「… 미착수 회차 자동 회수·재발송(안 A) … G4 사건 시각 칸」 5) = 사건 시각 — 기록 문구 「마지막 MM-DD HH:MI KST」의
--      가장 늦은 값(사람 브라우저 마지막 실패). last_human_fail_kst 는 그 실패를 24시간 창에서 본 점검 시각이라 최대 하루 늦다(메아리).
--   G5 다섯 탭 중 빈 탭 0 → 비로그인: 화면 점검 항목 empty_tabs(kind='screen' 실행의 failed/warned · ops_health_findings item='empty_tabs').
--      로그인·저장 0 상태는 실사용 회차가 잰다.
--   G6 7일 동안 다운님 손 0 → DB 갈래 ⓐⓑⓔ는 아래 g6_db · ⓒ 사람이 닫은 점검 이슈는 GitHub(공개 이슈 목록) · ⓓ는 아래 Notion 질의 ②.
--      「손」 = 자동 장치가 멈춰 사람이 메운 것만(우리가 개선을 위해 부른 회차는 세지 않는다). 2026-10-12 #428(발송기 잠금 → 다운님 급히 전달)은 센다.
--      g6_db.late_claim_7d(2026-10-20 ⓑ) = 발송 뒤 잡기까지 30분 넘은 회차 — 사람 재개(세션에 메시지)는 다른 어떤 기록에도 안 남아 보이게만 둔다(셈에 넣을지는 판정).
--        후속 전용(reason='followup')은 잡기를 안 부르고 끝내는 일이 많아(2026-10-20 실측 23회차 중 13) 이 칸에서 뺀다 → followup_noclaim_close_7d(①-2 가 60분에 닫은 = 세션이 안 뜬 후속 회차) ·
--        followup_long_7d(끝까지 30분 넘은 후속 회차 — 늦게 떴는지 오래 일했는지 기록으로 못 가른다)로 따로 낸다.
--      g6_db.auto_release_unclaimed_7d(2026-10-20 안 A) = 발송기 ①-4 가 미착수 회차를 거둔 수 — 사람 손이 아니다(다음 판정이 재발송).
--        auto_release_7d(「자동 회수%」 전부)에도 함께 든다.
--   G7·G8 은 회차 판정으로 닫는다(복구 리허설 · 보안 감사) — 이 파일 밖.
--
-- Notion 질의(우편함 · 백로그 — Notion 커넥터로 claude.ai 가 돌린다)
--   ① G3 — 📋 백로그 DB: 게이트 = 'G3' AND 지금 보임 = 체크 AND 상태 <> '종결' = 0이면 초록(2026-10-19 다운님 결정 · 칸 둘 「게이트」·「지금 보임」 신설).
--      「지금 보임」 = 지금 열린 카드에서 사용자에게 틀린 값이 실제로 보이면 체크 · 감시 항목(health-ops target_* 등)은 그 SQL이 0보다 클 때만 체크.
--      출처 무관 — 실사용 회차 · 조사 · 점검 어디서 올라왔든 센다(종전 2026-10-19 오전 PR #639 = 런칭선 앞 ∧ 높음 ∧ 사용자가 겪음 · 그 전 = 항목 LIKE '%실사용 N회차%').
--      속성 이름·값(게이트 · 지금 보임 · 상태)은 2026-10-19 백로그 DB 스키마로 확인했다 — 스키마가 바뀌면 그쪽이 정본이다.
--   ② G6 ⓓ — 📬 우편함 DB: 계기 = '장치 멈춤' AND 작성일 ≥ 지금 − 7일(속성 「계기」 = 개선 / 장치 멈춤 / 다운님 결정 — 2026-10-18 신설 ·
--      그 전 페이지는 「다운님 몫」 글로 가른다).
select json_build_object(
  'measured_at_kst', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
  'g1_ops', g.g1_ops,
  'g1_screen', g.g1_screen,
  'g2', g.g2,
  'g4', g.g4,
  'g6_db', g.g6_db
)
from (
  with kst as (select (now() at time zone 'Asia/Seoul')::date d),
  r as (select kind, run_at, failed, warned, blind,
               (select array_agg(f) from unnest(failed) f
                 where f not like 'simulate%' and not (f = any(blind)) and not (kind = 'ops' and f = 'runner')) realf,
               (select array_agg(f) from unnest(failed) f where f = any(blind) or (kind = 'ops' and f = 'runner')) blindf,
               'list_user_fail' = any(warned) luf_warn,
               'list_user_fail' = any(blind) or exists (select 1 from ops_health_findings x where x.kind = 'ops' and x.run_at = ops_health_runs.run_at
                                                          and x.item = 'list_user_fail' and x.reason like '%Error:%') luf_blind
          from ops_health_runs where ref = 'main' and run_at > now() - interval '7 days'),
  o as (select d.announcement_id aid, d.title from get_announcements_deduped() d, kst
         where d.apply_end >= kst.d and d.title not like '%조기%마감%'),
  p as (select * from get_announcement_price_summary((select array_agg(aid) from o))),
  c as (select o.aid,
          case when p.announcement_id is null then '빈칸'
               when p.deposit_min is not null or p.rent_min is not null or p.area_min is not null then '요약'
               when p.analysis_done then '목록없음'
               when p.has_attachments = false then '링크만'
               when p.analysis_done is false then '분석중'
               else '미정리' end cat
          from o left join p on p.announcement_id = o.aid)
  select
    json_build_object(
      'runs_7d', (select count(*) from r where kind = 'ops'),
      'real_fail_7d', (select count(*) from r where kind = 'ops' and coalesce(cardinality(realf), 0) > 0),
      'last_real_fail_kst', (select to_char(max(run_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') from r where kind = 'ops' and coalesce(cardinality(realf), 0) > 0),
      'clean_hours', (select round(extract(epoch from now() - coalesce(max(run_at), now() - interval '7 days')) / 3600) from r where kind = 'ops' and coalesce(cardinality(realf), 0) > 0),
      'blind_7d', (select count(*) from r where kind = 'ops' and coalesce(cardinality(blindf), 0) > 0),
      'last_blind_kst', (select to_char(max(run_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') from r where kind = 'ops' and coalesce(cardinality(blindf), 0) > 0)
    ) as g1_ops,
    json_build_object(
      'runs_7d', (select count(*) from r where kind = 'screen'),
      'first_run_kst', (select to_char(min(run_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') from ops_health_runs where kind = 'screen' and ref = 'main'),
      'real_fail_7d', (select count(*) from r where kind = 'screen' and coalesce(cardinality(realf), 0) > 0),
      'last_real_fail_kst', (select to_char(max(run_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') from r where kind = 'screen' and coalesce(cardinality(realf), 0) > 0),
      'blind_7d', (select count(*) from r where kind = 'screen' and coalesce(cardinality(blindf), 0) > 0),
      'last_run', (select json_build_object('at_kst', to_char(run_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), 'failed', failed, 'warned', warned)
                     from r where kind = 'screen' order by run_at desc limit 1),
      -- 통과 항목은 ops_health_findings 에 남지 않는다(경고·실패만) → 마지막 화면 점검이 있고 그 행이 없으면 「통과」.
      'empty_tabs_last', (select coalesce((select f.result || ' — ' || f.reason from ops_health_findings f
                                            where f.kind = 'screen' and f.item = 'empty_tabs' and f.run_at = x.run_at), '통과')
                            from (select max(run_at) run_at from r where kind = 'screen') x where x.run_at is not null)
    ) as g1_screen,
    json_build_object(
      'open_approx', (select count(*) from c),
      'by_cat', (select json_object_agg(cat, n) from (select cat, count(*) n from c group by cat) x),
      'blank', (select count(*) from c where cat in ('빈칸', '미정리')),
      'linkonly', (select count(*) from c where cat = '링크만'),
      'analyzing_not_queued', (select count(*) from c join announcements a on a.announcement_id = c.aid
                                where c.cat = '분석중'
                                  and not exists (select 1 from analysis_dispatch_queue q
                                                   where q.state in ('waiting', 'sent', 'claimed')
                                                     and (q.announcement_id = c.aid or q.group_key = a.title_dedup_key))),
      'judge_wait_status', (select count(*) from announcement_analysis aa join o on o.aid = aa.announcement_id where aa.status = '완료(판정 대기)')
    ) as g2,
    json_build_object(
      'runs_7d', (select count(*) from r where kind = 'ops'),
      'human_fail_runs_7d', (select count(*) from r where kind = 'ops' and luf_warn and not luf_blind),
      'last_human_fail_kst', (select to_char(max(run_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') from r where kind = 'ops' and luf_warn and not luf_blind),
      'last_human_event_kst', (select max(substring(f.reason from '마지막 ([0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}) KST'))
                                 from ops_health_findings f where f.kind = 'ops' and f.item = 'list_user_fail' and f.run_at > now() - interval '7 days'),
      'blind_7d', (select count(*) from r where kind = 'ops' and luf_blind),
      'last_blind_kst', (select to_char(max(run_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') from r where kind = 'ops' and luf_blind)
    ) as g4,
    json_build_object(
      'manual_dispatch_7d', (select count(*) from analysis_dispatch_runs where reason = 'manual' and created_at > now() - interval '7 days'),
      'manual_release_7d', (select count(*) from analysis_dispatch_runs where finish_note like '잠금 풀기:%' and finished_at > now() - interval '7 days'),
      'auto_release_7d', (select count(*) from analysis_dispatch_runs where finish_note like '자동 회수%' and finished_at > now() - interval '7 days'),
      'auto_release_unclaimed_7d', (select count(*) from analysis_dispatch_runs where finish_note like '자동 회수 — 미착수%' and finished_at > now() - interval '7 days'),
      'listing_hides_7d', (select count(*) from zipfit_ops.listing_hides where hidden_at > now() - interval '7 days'),
      'aux_missing_open', (select count(*) from announcement_analysis aa join o on o.aid = aa.announcement_id where aa.status = '완료(보조 누락)'),
      'late_claim_7d', (select json_build_object('n', count(*), 'runs', coalesce(json_agg(json_build_object('id', id, 'reason', reason,
                              'wait_min', round(extract(epoch from claimed_at - created_at) / 60)) order by id), '[]'::json))
                          from analysis_dispatch_runs
                         where reason <> 'followup' and created_at > now() - interval '7 days' and claimed_at - created_at > interval '30 minutes'),
      'followup_noclaim_close_7d', (select json_build_object('n', count(*), 'runs', coalesce(json_agg(id order by id), '[]'::json))
                                      from analysis_dispatch_runs
                                     where reason = 'followup' and created_at > now() - interval '7 days' and finish_note like '후속 전용 — 만든 지 60분%'),
      'followup_long_7d', (select json_build_object('n', count(*), 'runs', coalesce(json_agg(json_build_object('id', id,
                              'min', round(extract(epoch from finished_at - created_at) / 60)) order by id), '[]'::json))
                             from analysis_dispatch_runs
                            where reason = 'followup' and created_at > now() - interval '7 days' and finished_at - created_at > interval '30 minutes'
                              and finish_note not like '후속 전용 — 만든 지 60분%')
    ) as g6_db
) g;
