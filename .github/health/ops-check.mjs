// B. 운영 건강 점검 — 사람 손 없이 도는가(런칭 조건 ③). 읽기·알림만 한다.
// 기준값은 2026-09-29 지난 7일 collection_run_log(441런) 분포에서 정했다 — 근거는 각 점검의 rule 칸.
//   주간(UTC 0~9시) 런 간격 p50 10.0분 · p99 10.2분 · 최대 11.1분 / 야간 최대 간격 490분(09:50 → 18:00)
//   소요 p50 50.6초 · p95 57.6초 · 최대 97.2초 / LH 0건 런: 7일 중 하루 1회 / MYHOME 0건 런: 0
//   「상세조회 마감 … 미시도」 오류는 441런 중 193런(하루 최대 59런)이라 런 단위로는 기준이 되지 않는다 →
//   「활성 LH 공고 중 6시간 넘게 상세조회를 시도하지 않은 수」(지금 3)로 잰다.
// 🔴 첫 주는 넉넉하게 — 오탐이 잦으면 알림이 읽히지 않는다.
import { sqlRead, anonRpc, report, recordFindings, recordInstanceMetrics, SITE, PROJECT_REF, ANON_KEY } from './lib.mjs'
import { METRICS_PATH, pickMetrics, judgeInstance } from './instance.mjs'
import { YEARLY_SQL, judgeYearly } from './yearly.mjs'
import { SH_RUN_SQL, judgeShRun } from './sh-run.mjs'
import { BACKLOG_SQL, judgeBacklog } from './collect-backlog.mjs'
import { HARD, splitFailed } from './gate.mjs'
import { lhGoneSql, judgeLhGone } from './lh-gone.mjs'
import { ELIG_FORM_NULL_SQL, RENT_NULL_SQL, ROUND_MIX_SQL, judgeEligFormNull, judgeRentNull, judgeRoundMix } from './open-gaps.mjs'
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const now = new Date()
const hourUtc = now.getUTCHours()
// 🔵 2026-10-06 — 10시대를 주간에서 뺐다: 마지막 주간 런이 09:50 이라 10:xxZ 점검은 최대 69분을 보고 40분 문턱에 걸렸다
//    (매일 19:55 KST 거짓 실패 #332~#334). 수집 cron */10 0-9 UTC 와 같은 범위다 — 10시대는 야간 문턱(720분)으로 잰다.
const DAYTIME = hourUtc >= 0 && hourUtc <= 9            // 수집 cron */10 0-9 UTC
const PROMO_DAYTIME = hourUtc >= 0 && hourUtc <= 9      // 홍보물 cron 5,35 0-9 UTC — 10시대에는 09:35 가 마지막(40분을 넘는다)
// 🔵 2026-10-02 — 점검이 밤에도 30분마다 돈다(25·55분). 하루 첫 런(홍보물 00:05 · 이미지 00:17) 전에는 전날 마지막 런을 보므로
//    UTC 0시 40분 전은 밤 문턱(900분)으로 잰다 — 23:55 점검이 00시 넘어 밀려 돌 때의 오탐을 막는다.
const minuteUtc = now.getUTCMinutes()
const FIRST_RUN_DONE = PROMO_DAYTIME && !(hourUtc === 0 && minuteUtc < 40)
// ⑬ 바깥 감시 기록 — 부른 지 12분 지난(다음 회차가 응답을 옮긴 뒤) 24시간 안 기록 · 새것부터. 미응답(옮기지 못함)도 실패로 센다.
//    롤백 시험이 이 문자열을 그대로 떠서 쓴다(가짜 실패 행을 넣고 같은 판정이 나오는지) — 바꾸면 시험도 다시 돈다.
// ⑥ 백업 — pg_cron(zipfit-backup-poll)이 매시 받아 둔 backup.yml 실행 기록(ops_backup_seen)을 읽는다(2026-10-11 고지 회차 2 · 10).
//    「실제 백업」 = 성공 ∧ 걸린 시간 ≥ 45초(관문만 돌고 끝난 실행은 10여 초 · 마이그레이션 2026-10-11_02 머리 주석).
//    🔵 2026-10-12(우편함 「코드 — 점검 오탐 둘 + 고지 마무리」 2) — 판정은 「경과 시간」이 아니라 「UTC 날짜」다: 덤프 이름이 UTC 날짜라
//    날짜 D 의 백업은 D 18:00 UTC 정기 + 여유 4시간(수집이 응답을 다음 시각에 옮겨 기록이 최대 약 1시간 10분 늦다) = D 22:00 UTC 부터 요구한다.
//    통과 = 실제 백업의 가장 늦은 실행 UTC 날짜 ≥ (지금 UTC − 22시간)의 날짜. 종전 「≤ 25시간」은 ① 같은 날 이른 시각 승인 실행 뒤
//    그날 정기 회차가 관문에서 건너뛰면 다음 정기까지 최대 약 42시간을 실패로 냈고 ② 18:00 백업이 19:12 에야 기록되는 틈에서 25.1시간 오탐을 냈다.
//    표가 없으면(적용 전) 쿼리가 실패한다 — 그래서 UPTIME_SQL 처럼 따로 돈다.
const BACKUP_SQL = `
select jsonb_build_object(
  'applied_min', (select extract(epoch from now() - applied_at) / 60 from zipfit_ops.schema_migrations where filename = '2026-10-11_02_backup_poll.sql'),
  'real_age_h', (select extract(epoch from now() - max(run_updated_at)) / 3600 from public.ops_backup_seen
                  where conclusion = 'success' and run_updated_at - run_created_at >= interval '45 seconds'),
  'real_last_date', (select max((run_created_at at time zone 'UTC')::date) from public.ops_backup_seen
                  where conclusion = 'success' and run_updated_at - run_created_at >= interval '45 seconds'),
  'due_date', (((now() at time zone 'UTC') - interval '22 hours')::date),
  'last_fail', (select jsonb_build_object('at', run_created_at, 'conclusion', conclusion) from public.ops_backup_seen
                 where status = 'completed' and conclusion not in ('success', 'skipped', 'cancelled') order by run_created_at desc limit 1),
  'poll_ok_age_h', (select extract(epoch from now() - max(at)) / 3600 from public.ops_backup_poll where status_code = 200),
  'poll_last', (select jsonb_build_object('code', status_code, 'age_min', extract(epoch from now() - at) / 60) from public.ops_backup_poll
                 where status_note is not null order by id desc limit 1)
) as j;`
const UPTIME_SQL = `
select jsonb_build_object(
  'applied_min', (select extract(epoch from now() - applied_at) / 60 from zipfit_ops.schema_migrations where filename = '2026-10-08_05_uptime_monitor.sql'),
  'last_at_min', (select jsonb_object_agg(target, extract(epoch from now() - m) / 60) from (select target, max(at) m from public.ops_uptime_log group by target) s),
  'rows', coalesce((select jsonb_agg(jsonb_build_object('target', target, 'ok', ok, 'code', status_code, 'err', error_msg) order by target, at desc)
     from (select target, at, status_code, error_msg,
                  coalesce(status_code between 200 and 399 and body_ok, false) as ok
             from public.ops_uptime_log
            where at < now() - interval '12 minutes' and at > now() - interval '24 hours') r), '[]'::jsonb)
) as j;`
// ⑭ 공개 목록 RPC 응답 시간(2026-10-17 · 우편함 「코드·운영 — … 목록 RPC 응답 감시 …」 2) — cron zipfit-list-rpc-probe 가 10분마다 anon 으로 잰 기록.
//    판정은 지난 35분(이 점검 간격 30분 + 여유) 기록만 본다 — 한 번 넘은 기록이 24시간 내내 실패로 남지 않게. 24시간 요약은 값에만 싣는다(원인 판정 재료).
// ⑮ pg_net 비밀값(2026-10-17 · 같은 우편함 1) — net 표 권한은 supabase_admin 이 PUBLIC 에 준 것이라 회수하지 못한다(마이그레이션 2026-10-17_01 머리).
//    대신 ① 거두기(zipfit-net-purge-secrets 5분)가 도는지 = 10분 넘게 남은 토큰 꼴 응답 0 ② 노출 스키마(public)에서 anon·authenticated 가 부를 수 있는
//    함수 중 net 을 부르는 것 0 ③ 바깥 REST 가 net 스키마를 거절(406 PGRST106)하는지를 본다. ③은 아래 판정 자리에서 fetch 로 잰다.
// ⑯ 갤러리 원본 위치(2026-10-17 · 같은 우편함 5 · 정보) — 칸을 더한 뒤 들어온 갤러리 행 중 원본 위치(source_url)가 빈 수.
const PROBE_SQL = `
select jsonb_build_object(
  'applied_min', (select extract(epoch from now() - applied_at) / 60 from zipfit_ops.schema_migrations where filename = '2026-10-17_01_net_purge_list_probe.sql'),
  'last_age_min', (select extract(epoch from now() - max(at)) / 60 from zipfit_ops.list_rpc_probe_log),
  'recent', coalesce((select jsonb_agg(jsonb_build_object('ms', ms, 'ms2', to_jsonb(l)->'ms2', 'ok', ok, 'err', error) order by at desc)
                        from zipfit_ops.list_rpc_probe_log l where at > now() - interval '35 minutes'), '[]'::jsonb),
  'day', (select jsonb_build_object('n', count(*), 'p50', round(percentile_cont(0.5) within group (order by ms)), 'max', max(ms),
                                    'p50_2', round(percentile_cont(0.5) within group (order by (to_jsonb(l)->>'ms2')::int)),
                                    'over2', count(*) filter (where ms >= 2000), 'bad', count(*) filter (where not ok))
            from zipfit_ops.list_rpc_probe_log l where at > now() - interval '24 hours'),
  'tok_old', (select count(*) from net._http_response r where r.created < now() - interval '10 minutes'
                and r.content ~* '"(access_token|refresh_token|id_token|client_secret)"\\s*:'),
  'exposed_net_fns', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
         and pg_get_functiondef(p.oid) ~ 'net\\.(http_|_http_response|http_collect)'), '[]'::jsonb),
  'extras_src', (select jsonb_build_object('since', min(m.applied_at), 'new', count(e.id), 'empty', count(e.id) filter (where e.source_url is null))
                   from zipfit_ops.schema_migrations m left join public.announcement_extras e on e.created_at >= m.applied_at
                  where m.filename = '2026-10-17_04_extras_source_url.sql')
) as j;`
// ⑧ 분석 발송기 잠금 — 90분 넘게 도는 회차를 심장박동 유무로 가른다(2026-10-15 · 우편함 「코드 — health-ops stale_lock 갈래 …」 1).
//    발송기 자동 회수(analysis_dispatch_tick ①-3 · 마이그레이션 2026-10-15_02)는 running ∧ reason ≠ followup ∧ 잡힘 ∧ 심장박동 있음 ∧
//    마지막 심장박동 30분 조용 ∧ 만든 지 90분인 회차를 거둔다 — 이 점검은 그 조건을 거울한다(바뀌면 여기도).
//    why: hb = 심장박동 있는 회차가 잡은 지 90분 넘음(자동 회수 대상 · ⚠️) ·
//         reclaim_missed = 회수 조건(조용 30분 ∧ 생성 90분)을 넘고도 tick 두 번(20분)이 지나도록 running(회수가 안 돈다 · ❌) ·
//         미착수(2026-10-20 · 우편함 「코드·운영 — 미착수 회차 자동 회수·재발송(안 A) …」 4 — 발송기 ①-4 거울 · 후속 전용은 뺀다):
//           unclaimed = 잡기 없음(claimed_at NULL — 세션이 뜨지 않음 · 사용량 소진이 흔한 원인 · run 260 꼴)으로 발송 45분 넘음(⚠️ · 자동 회수 대상) ·
//           unclaimed_missed = 회수 가능 시각(발송 45분 ∨ 직전 미착수 회수 60분 중 늦은 쪽)을 20분 넘기도록 그대로(❌ · 회수가 안 돈다 —
//             6시간 6번 상한에 걸렸거나 발송기가 멈춤 · 사람 풀기).
//         회수 밖 둘(❌ · 사람 풀기 — 2026-10-20 ⓒ에서 종전 no_hb 하나를 갈랐다 · 등급·기준 그대로):
//           no_hb = 잡았는데 첫 심장박동 전에 끊김(판정 (가)로 회수 밖) · followup = 후속 전용 회차(①-2 가 60분에 닫는다)가 90분 넘음
//           (후속 전용은 잡기를 안 부르고 끝내는 일이 많아(2026-10-20 실측 23회차 중 13) 미착수로 세지 않는다).
//    롤백 시험이 이 문자열을 그대로 떠서 쓴다(가짜 회차를 넣고 같은 판정이 나오는지) — 바꾸면 시험도 다시 돈다.
const STALE_LOCK_SQL = `(select json_build_object(
         'hard', coalesce(json_agg(json_build_object('id', r.id, 'why', z.why, 'age_min', round(extract(epoch from now() - coalesce(r.claimed_at, r.created_at)) / 60),
                    'hb_min', round(extract(epoch from now() - r.heartbeat_at) / 60)) order by r.id) filter (where z.why not in ('hb', 'unclaimed')), '[]'::json),
         'hb', coalesce(json_agg(json_build_object('id', r.id, 'age_min', round(extract(epoch from now() - coalesce(r.claimed_at, r.created_at)) / 60),
                    'hb_min', round(extract(epoch from now() - r.heartbeat_at) / 60)) order by r.id) filter (where z.why = 'hb'), '[]'::json),
         'unclaimed', coalesce(json_agg(json_build_object('id', r.id, 'age_min', round(extract(epoch from now() - r.created_at) / 60)) order by r.id)
                    filter (where z.why = 'unclaimed'), '[]'::json))
       from analysis_dispatch_runs r
       cross join lateral (select case
           when r.reason <> 'followup' and r.heartbeat_at is not null
                and r.heartbeat_at < now() - interval '50 minutes' and r.created_at < now() - interval '110 minutes' then 'reclaim_missed'
           when r.reason <> 'followup' and r.claimed_at is null
                and now() > greatest(r.created_at + interval '45 minutes',
                                     coalesce((select max(x.finished_at) from analysis_dispatch_runs x where x.finish_note like '자동 회수 — 미착수%'),
                                              '-infinity'::timestamptz) + interval '60 minutes') + interval '20 minutes' then 'unclaimed_missed'
           when r.reason <> 'followup' and r.claimed_at is null and r.created_at < now() - interval '45 minutes' then 'unclaimed'
           when coalesce(r.claimed_at, r.created_at) >= now() - interval '90 minutes' then null
           when r.reason <> 'followup' and r.heartbeat_at is not null then 'hb'
           when r.reason = 'followup' then 'followup'
           else 'no_hb' end as why) z
      where r.state in ('firing', 'running') and z.why is not null)`
// ⑧-5 자동 회수 본 횟수(2026-10-15 · 같은 우편함 2) — 지난 24시간 발송기가 거둔 회차. 사람 풀기(analysis_run_release)는 finish_note 「잠금 풀기: …」 ·
//    자동 회수는 「자동 회수 — …」로 갈린다. 공고 = 그 회차에서 되돌린 대기열 행(note 「자동 회수 run N」) · 후속 = 「run N 마감 정리」 요청의 마지막 상태.
const AUTO_RECLAIM_SQL = `(select coalesce(json_agg(json_build_object('id', r.id, 'at', to_char(r.finished_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI'),
         'ann', (select string_agg(q.announcement_id, ', ' order by q.announcement_id) from analysis_dispatch_queue q where q.note = '자동 회수 run ' || r.id),
         'fu', (select f.state || coalesce('/' || f.result, '') from analysis_followup_requests f where f.page_ref = 'run ' || r.id || ' 마감 정리' order by f.id desc limit 1))
         order by r.id), '[]'::json)
       from analysis_dispatch_runs r
      where r.state = 'released' and r.finish_note like '자동 회수%' and r.finished_at > now() - interval '24 hours')`
// ⑭ 상세 지도 끝 상태(2026-10-13 · 우편함 「코드 — 지도 감시」) — 열린 카드마다 화면(index.html)이 지도를 어떻게 끝내는지를 DB 로 거울한다.
//    거울하는 화면 규칙(배포본 b242914 기준 — 바뀌면 여기도): toggleDetail(정밀주소 있으면 그 주소로 핀 · 없으면 pickRegionAddr 폴백) ·
//    loadAnnouncementBlocks(블록 2개 이상이면 블록마다 핀) · loadHousingUnits(세대 행 있으면 세대 주소로 핀 · 없으면 폴백이 시·구 수준 ∧
//    zfPlaceNames(region_names) 2곳 이상이면 closeMapAsMultiRegion) · initMapForHouse(전세임대 닫힘 → 폴백 시·도뿐 닫힘 → 폴백 시·구 = 대략 핀).
//    pickRegionAddr: region 3어절 이상 = detail · sido_nm ∧ sigungu_nm = sigungu · region 2어절 = sigungu · 그 밖 sido. zfPlaceNames = 다른 이름의 접두인 이름은 뺀다.
//    ⚠️ 브라우저 지오코딩 실패(Lv3 「찾지 못함」 대략 핀)는 DB 가 알 수 없다 — 이 점검은 「처음부터 시·구뿐이라 대략인 핀」만 센다.
//    ⚠️ 세대 행은 회차 가르기 전 그룹 전체로 센다(화면은 이번 회차가 0 이어도 지난 회차만 있으면 그것으로 핀을 꽂는다 — pastOnly).
const MAP_SQL = `
with c as (
  select g.announcement_id, g.housing_type, nullif(trim(g.precise_address), '') pa, coalesce(g.block_count, 1) bc,
         nullif(trim(g.sido_nm), '') sido, nullif(trim(g.sigungu_nm), '') sgg, trim(coalesce(g.region, '')) rg,
         coalesce(g.region_names, '{}') rns
    from public.get_announcements_deduped(null, null, null) g
   where g.status <> '접수마감'),
gi as (select c.announcement_id, x.announcement_id gid from c cross join lateral public.get_announcement_group_ids(c.announcement_id) x),
hu as (select gi.announcement_id, count(h.id) n from gi left join public.housing_units h on h.announcement_id = gi.gid group by 1),
f as (
  select c.*, hu.n hu,
    (select count(*) from unnest(c.rns) a(x) where a.x <> '' and not exists (
        select 1 from unnest(c.rns) b(y) where b.y <> a.x and starts_with(b.y, a.x || ' '))) places,
    case when c.rg <> '' and array_length(regexp_split_to_array(c.rg, '\\s+'), 1) >= 3 then 'detail'
         when c.sido is not null and c.sgg is not null then 'sigungu'
         when c.rg <> '' and array_length(regexp_split_to_array(c.rg, '\\s+'), 1) = 2 then 'sigungu'
         when c.sido is not null or c.rg <> '' then 'sido'
         else 'none' end lvl
  from c join hu using (announcement_id)),
s as (
  select f.announcement_id,
    case when f.bc >= 2 then 'blocks'
         when f.pa is not null or f.hu > 0 then case when f.housing_type like '%전세임대%' then 'closed_jeonse' else 'pin' end
         when f.lvl = 'sigungu' and f.places >= 2 then 'closed_multi'
         when f.housing_type like '%전세임대%' then 'closed_jeonse'
         when f.lvl = 'sido' then 'closed_sido'
         when f.lvl = 'sigungu' then 'approx'
         when f.lvl = 'detail' then 'pin'
         else 'none' end st,
    (f.places >= 2 and f.bc < 2 and f.hu = 0 and f.housing_type not like '%전세임대%' and (f.pa is not null or f.lvl = 'detail')) one_point
  from f)
select json_build_object(
  'open', (select count(*) from s),
  'states', (select json_object_agg(st, n) from (select st, count(*) n from s group by st) x),
  'approx', coalesce((select json_agg(announcement_id order by announcement_id) from s where st = 'approx'), '[]'),
  'multi_one_point', coalesce((select json_agg(announcement_id order by announcement_id) from s where one_point), '[]'),
  'multi_closed', coalesce((select json_agg(announcement_id order by announcement_id) from s where st = 'closed_multi'), '[]')) as j;`
const checks = []
const add =(id, name, status, value, rule) => checks.push({ id, name, status, value, rule })
// 🔵 2026-10-20(우편함 「코드·운영 — 미착수 회차 … 점검 불능 분리」 ⓓ) — 점검 불능: 그 항목을 재지 못했다(판정 자체가 없다). ❌·⚠️ 등급은 그대로 두고
//    blind 를 붙여 ops_health_runs.blind 에 따로 남긴다(런칭 게이트 G1·G4 셈이 빼고 센다 — docs/launch-gates.sql).
const addBlind = (id, name, status, value, rule) => checks.push({ id, name, status, value, rule, blind: true })

const EXPECTED_JOBS = [
  'zipfit-collect-announcements', 'zipfit-collect-announcements-warmup', 'zipfit-collect-announcements-night',
  'zipfit-collect-sh-announcements', 'zipfit-sh-close-missing', 'zipfit-collect-rental-stats',
  'zipfit-collect-lh-promo', 'zipfit-purge-usage-events', 'zipfit-purge-sh-run-log',
  'zipfit-refresh-post-links',   // 2026-09-30 같은 게시물 링크 자동 채움(마이그레이션 04)
  'zipfit-analysis-dispatch',    // 2026-10-01 공고 분석 루틴 발송기(마이그레이션 2026-10-01_03)
  'zipfit-collect-lh-images',    // 2026-10-02 LH 단지 이미지 탭 목록(마이그레이션 2026-10-02_02)
  'zipfit-health-ops-dispatch',  // 2026-10-03 운영 점검 예약을 GitHub 밖으로 — pg_cron → workflow_dispatch(마이그레이션 2026-10-02_05)
  'zipfit-health-screen-dispatch', // 2026-10-06 화면 점검 예약도 GitHub 밖으로(마이그레이션 2026-10-06_02)
  'zipfit-check-source-pages',   // 2026-10-08 열린 원문 키 정기 대조(3-B ③ 1단계 · 마이그레이션 2026-10-08_02)
  'zipfit-check-source-pages-new-sh',   // 2026-10-13 새 SH 키만 SH 수집 10분 뒤 대조(마이그레이션 2026-10-13_03)
  'zipfit-uptime-ping',          // 2026-10-08 바깥 감시 1단계(마이그레이션 2026-10-08_05)
  'zipfit-backup-dispatch', 'zipfit-heartbeat-dispatch',   // 2026-10-08 백업·생존 신호 예약도 GitHub 밖으로(마이그레이션 2026-10-08_06)
  'zipfit-backup-poll',          // 2026-10-11 zipfit-backup backup.yml 실행 기록 수집(마이그레이션 2026-10-11_02 · ⑥ backup)
  'zipfit-net-purge-secrets',    // 2026-10-17 pg_net 응답 표 비밀값 응답 거두기(마이그레이션 2026-10-17_01 · ⑮ net_secret)
  'zipfit-list-rpc-probe',       // 2026-10-17 공개 목록 RPC anon 실행 시간 기록(마이그레이션 2026-10-17_01 · ⑭ list_rpc_time)
]

// ③④ 관리 API 가 필요 없는 점검(비로그인 목록·요약 · 배포 사이트)은 DB 점검과 다른 try 로 먼저 돈다
//    (2026-10-06 · 우편함 「코드 — 1-C …」 2) — 관리 API 가 죽어 DB 점검이 「점검 실행」(runner) 하나로 끝나도 화면 쪽 결과는 남는다.
try {
  // ③ 비로그인 목록·요약 함수
  const list = await anonRpc('get_announcements_deduped', {})
  const listOk = list.status === 200 && Array.isArray(list.data) && list.data.length > 0
  add('anon_list', '비로그인 get_announcements_deduped', listOk && list.ms <= 10000 ? 'pass' : 'fail',
    `${list.status} · ${Array.isArray(list.data) ? list.data.length : 0}행 · ${list.ms}ms${list.snippet ? ' · ' + list.snippet : ''}`,
    '200 · 행 > 0 · 왕복 ≤ 10초(서버 한도 3초는 200 여부로 잰다 — 넘으면 500. 왕복은 러너↔싱가포르 1.9MB라 넉넉히)')
  // ③-2 화면이 실제로 보내는 인자 모양(2026-10-01 — 명시 null 은 함수가 인라인되지 않아 따로 잰다 · 우편함 「운영 — 감지 루틴 발송기」 3)
  //    🔵 2026-10-29(우편함 「코드·운영 — 런칭 뒤 묶음」 3 · 백로그 「목록·인사이트가 limit 없이 전량」) — 세 모양은 announcement_id 칸만 받는다(?select=).
  //    함수는 서버에서 끝까지 돌고(명시 null 은 인라인되지 않아 전 행 계산) 200·행 수 판정은 같다 · 받는 양만 1.9MB → 약 42KB(2026-10-29 실측).
  //    전 칸 응답은 위 anon_list 한 번만 받는다(요약 50건 id 재료) — 실행 1회 목록 전송 약 7.6MB → 약 2.0MB.
  for (const [id, body] of [['anon_list_null', { p_region: null, p_type: null, p_status: null }], ['anon_list_region', { p_region: '경기도' }], ['anon_list_type', { p_type: '국민임대' }]]) {
    const x = await anonRpc('get_announcements_deduped?select=announcement_id', body)
    const ok = x.status === 200 && Array.isArray(x.data) && x.data.length > 0
    add(id, `비로그인 get_announcements_deduped ${JSON.stringify(body)}`, ok && x.ms <= 10000 ? 'pass' : 'fail',
      `${x.status} · ${Array.isArray(x.data) ? x.data.length : 0}행 · ${x.ms}ms${x.snippet ? ' · ' + x.snippet : ''}`,
      '200 · 행 > 0(서버 한도 3초는 200 여부로 잰다) — 명시 null 은 2026-10-01 이전 4.6초 500 이었다')
  }
  const ids = listOk ? list.data.slice(0, 50).map(r => r.announcement_id) : []
  const sum = ids.length ? await anonRpc('get_announcement_price_summary', { p_ids: ids }) : { status: 0, ms: 0, data: null, snippet: '목록 실패로 건너뜀' }
  const sumOk = sum.status === 200 && Array.isArray(sum.data) && sum.data.length === ids.length
  add('anon_summary', '비로그인 get_announcement_price_summary(50건)', sumOk && sum.ms <= 10000 ? 'pass' : 'fail',
    `${sum.status} · ${Array.isArray(sum.data) ? sum.data.length : 0}/${ids.length}행 · ${sum.ms}ms${sum.snippet ? ' · ' + sum.snippet : ''}`, '200 · 요청 수 = 응답 행 수 · 왕복 ≤ 10초')
  // ④ 배포 사이트
  for (const [id, url] of [['site_index', SITE], ['site_sw', SITE + 'sw.js']]) {
    let st = 0, ok = false
    try { const r = await fetch(url, { cache: 'no-store' }); st = r.status; const t = await r.text(); ok = r.ok && (id === 'site_sw' ? t.includes('CACHE_NAME') : t.includes('꼭집')) } catch (e) { st = String(e).slice(0, 80) }
    add(id, `배포 사이트 ${id === 'site_sw' ? 'sw.js' : 'index'}`, ok ? 'pass' : 'fail', st, '200 · 본문 표식')
  }
} catch (e) {
  add('runner_web', '점검 실행(관리 API 밖 — 목록·사이트)', 'fail', String(e).slice(0, 300), '목록·사이트 점검이 끝까지 돈다')
}

try {
  // 🔵 2026-10-06 1-C — simulate=runner: 관리 API 예외처럼 DB 점검을 처음에 끊는다(점검 불능 라벨 health-ops-blind 시험).
  if (process.env.SIMULATE === 'runner') throw new Error('점검 불능 흉내(수동 입력 simulate=runner) — 관리 API 예외처럼')
  const [db] = await sqlRead(`
    select json_build_object(
      'last_run_age_min', (select extract(epoch from now() - max(run_at))/60 from collection_run_log),
      'last_run_ms', (select duration_ms from collection_run_log order by id desc limit 1),
      'slow_runs_24h', (select count(*) from collection_run_log where run_at > now() - interval '24 hours' and duration_ms >= 140000),
      'write_err_runs_24h', (select count(*) from collection_run_log r where run_at > now() - interval '24 hours'
         and exists (select 1 from jsonb_array_elements_text(r.errors) e where e ilike '%upsert%' or e ilike '%insert%' or e like '%예상치 못한 오류%' or e like 'MYHOME: %')),
      'lh0_today', (select count(*) from collection_run_log where (run_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date and coalesce(lh_fetched,0) = 0),
      'mh0_today', (select count(*) from collection_run_log where (run_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date and coalesce(myhome_fetched,0) = 0),
      'detail_stale', (select count(*) from announcements where source='LH' and status in ('공고중','접수중','정정공고중')
         and (detail_fetch_last_attempt is null or detail_fetch_last_attempt < now() - interval '6 hours')),
      'jobs', (select json_agg(json_build_object('name', jobname, 'active', active)) from cron.job),
      'job_fail_24h', (select json_agg(json_build_object('name', j.jobname, 'n', x.n)) from (select jobid, count(*) n from cron.job_run_details
         where start_time > now() - interval '24 hours' and status not in ('succeeded','running','starting') group by jobid) x join cron.job j using (jobid)),
      'promo_last_run_age_min', (select extract(epoch from now() - max(d.start_time))/60 from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'zipfit-collect-lh-promo'),
      'promo_fail_24h', (select count(*) from announcement_promo_fetch where not ok and fetched_at > now() - interval '24 hours'),
      'images_last_run_age_min', (select extract(epoch from now() - max(d.start_time))/60 from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'zipfit-collect-lh-images'),
      'images_fail_24h', (select count(*) from announcement_complex_image_fetch where not ok and fetched_at > now() - interval '24 hours'),
      'sh_last_run_age_min', (select extract(epoch from now() - max(run_at))/60 from sh_collection_run_log),
      'ops_dispatch', (select json_build_object('age_min', extract(epoch from now() - l.at)/60, 'status', coalesce(l.status_code, r.status_code), 'pending', l.status_note is null and r.id is null,
                              'err', left(coalesce(l.error_msg, r.error_msg, case when r.status_code >= 300 then r.content end), 200))
                         from ops_dispatch_log l left join net._http_response r on r.id = l.net_request_id and r.created >= l.at - interval '1 minute' and r.created < l.at + interval '10 minutes'
                        where l.target = 'health-ops.yml' order by l.id desc limit 1),
      -- 🔵 2026-10-07(#372) — 응답은 ops_dispatch_log 칸(ops_dispatch_log_fill 이 발송 전에 옮김)이 먼저 · 없으면 net._http_response(발송 시각 언저리만 — 요청 번호 재사용).
      --    응답 행은 몇 시간 안에 사라진다 — 하루 한 번 발송(화면 점검)을 응답 행으로만 보면 몇 시간 뒤부터 「응답 대기」 오탐이었다.
      'screen_dispatch', (select json_build_object('age_min', extract(epoch from now() - l.at)/60, 'status', coalesce(l.status_code, r.status_code), 'pending', l.status_note is null and r.id is null,
                              'err', left(coalesce(l.error_msg, r.error_msg, case when r.status_code >= 300 then r.content end), 200))
                         from ops_dispatch_log l left join net._http_response r on r.id = l.net_request_id and r.created >= l.at - interval '1 minute' and r.created < l.at + interval '10 minutes'
                        where l.target = 'health-screen.yml' order by l.id desc limit 1),
      -- 🔵 2026-10-08(운영 기반 후속 1) — zipfit-backup 백업·생존 신호 발송(하루 한 번) · 화면 점검 발송과 같은 꼴.
      'backup_dispatch', (select json_object_agg(t.target, (select json_build_object('age_min', extract(epoch from now() - l.at)/60, 'status', coalesce(l.status_code, r.status_code), 'pending', l.status_note is null and r.id is null,
                              'err', left(coalesce(l.error_msg, r.error_msg, case when r.status_code >= 300 then r.content end), 200))
                         from ops_dispatch_log l left join net._http_response r on r.id = l.net_request_id and r.created >= l.at - interval '1 minute' and r.created < l.at + interval '10 minutes'
                        where l.target = t.target order by l.id desc limit 1))
                         from (values ('zipfit-backup/backup.yml'), ('zipfit-backup/heartbeat.yml')) t(target)),
      -- 🔵 2026-10-09(고지 회차 1 · 7 ①) — 직전 운영 점검 실행(ops_health_runs · 이번 실행은 끝에 기록되므로 아직 없다).
      -- 🔵 2026-10-18 — 화면 점검(kind='screen')도 같은 표에 한 줄을 남긴다 → 운영 점검만 센다.
      'last_health_run_age_min', (select extract(epoch from now() - max(run_at))/60 from ops_health_runs where kind = 'ops'),
      -- 🔵 2026-10-09(고지 회차 1 · 7 ②) — 24시간 안 발송 중 GitHub 가 204 가 아닌 응답을 준 것 · 응답을 못 옮긴 것(발송 40분 넘게 응답 칸 빔).
      --    ops_dispatch 는 마지막 한 줄만 봐서 다음 발송이 204 면 앞의 500 이 덮였다(10-08 id 245 — 60분 공백이 어디에도 안 남음).
      'dispatch_bad_24h', (select json_agg(json_build_object('target', target, 'non204', non204, 'lost', lost, 'n', n)) from (
         select target, count(*) filter (where status_code is not null and status_code <> 204) non204,
                count(*) filter (where status_code is null and at < now() - interval '40 minutes') lost, count(*) n
           from ops_dispatch_log where at > now() - interval '24 hours' group by target) z),
      'dispatch', (select json_build_object(
         'enabled', c.enabled, 'grace_min', extract(epoch from c.grace)/60, 'max_wait_min', extract(epoch from c.max_wait)/60,
         'waiting', (select count(*) from analysis_dispatch_queue where state = 'waiting'),
         'overdue', (select count(*) from analysis_dispatch_queue where state = 'waiting'
           and (case when returned then greatest(ready_at, state_at) else ready_at end) < now() - (c.grace + c.max_wait)  -- 되돌린 공고는 되돌린 때부터(2026-10-01 진전 없는 되돌림)
           and coalesce((select max(created_at) from analysis_dispatch_runs where reason <> 'followup'), '-infinity') < now() - (c.grace + c.max_wait)),  -- 몫 상한(한 발송 batch_size건)이라 긴 대기열은 정상 — 그동안 발송이 하나도 없을 때만 센다(2026-10-01 · 후속 전용 followup 회차는 세지 않는다 2026-10-02)
         'batch_size', c.batch_size,
         'not_ready_24h', (select count(*) from analysis_dispatch_queue where state = 'waiting' and ready_at is null and enqueued_at < now() - interval '24 hours'),
         'stale_lock', ${STALE_LOCK_SQL},
         'auto_reclaim_24h', ${AUTO_RECLAIM_SQL},
         'fail_streak', (select count(*) = 3 and bool_and(state = 'failed') from (select state from analysis_dispatch_runs order by id desc limit 3) z),
         'zero_streak', (select count(*) = 3 and bool_and(state = 'finished' and done = 0) from (select r.state,
           (select count(*) from analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done') as done
           from analysis_dispatch_runs r where r.reason <> 'followup' order by r.id desc limit 3) z),
         'followup_stuck', (select count(*) from analysis_followup_requests where state = 'waiting' and requested_at < now() - interval '120 minutes'))
       from analysis_dispatch_config c where c.id = 1),
      -- 🔵 2026-10-06 후속 처리 결과(1-B 4·5) — 실린 지 30분 넘었는데 결과 없음 · 또는 결과 미착수·실패. 실린 때 = 회차 created_at · 24시간 안 회차만.
      --    이 기능이 적용된 뒤 들어온 요청만 본다(기준 = 마이그레이션 2026-10-06_06 적용 시각 — 그 전 done 행은 소급하지 않는다).
      'followup_unreported', (select coalesce(json_agg(json_build_object('id', f.id, 'run', f.run_id, 'result', f.result) order by f.id), '[]'::json)
         from analysis_followup_requests f join analysis_dispatch_runs r on r.id = f.run_id
        where f.requested_at >= coalesce((select min(applied_at) from zipfit_ops.schema_migrations where filename = '2026-10-06_06_followup_result_health_findings.sql'), 'infinity')
          and r.created_at > now() - interval '24 hours'
          and ((f.result is null and r.created_at < now() - interval '30 minutes') or f.result in ('미착수', '실패'))
          -- 🔵 2026-10-15(우편함 「코드 — 루틴 자동 회수 …」 판정 ② 제안 채택) — 같은 page_ref 의 뒤 요청이 「처리」면 앞 요청은 뺀다
          --    (재요청으로 이미 처리된 요청이 24시간 내내 ⚠️ 를 내 경고가 무뎌졌다 — #37 미착수 ↔ #38 처리 · 10-14 12:25 ~ 10-15 11:25 KST).
          and not exists (select 1 from analysis_followup_requests g where g.page_ref = f.page_ref and g.id > f.id and g.result = '처리')),
      -- 🔵 2026-10-08 원문 키 정기 대조(3-B ③ 1단계) — 마지막으로 끝까지 돈 실행(오류 없음) · 키마다 26시간 안 마지막 대조 중 아직 열린 카드의 어긋남.
      'source_check', (select json_build_object(
         'runs', (select count(*) from source_page_check_runs),
         'last_ok_age_min', (select extract(epoch from now() - max(finished_at))/60 from source_page_check_runs where finished_at is not null and error is null),
         'since_cron_min', (select extract(epoch from now() - min(applied_at))/60 from zipfit_ops.schema_migrations where filename = '2026-10-08_02_source_page_checks_cron.sql'),
         'closed', (select coalesce(json_agg(z.source_key || ' ' || coalesce(z.page_status, '')), '[]'::json) from (select distinct on (c.source_key) c.* from source_page_checks c
             where c.checked_at > now() - interval '26 hours' and c.error is null order by c.source_key, c.checked_at desc) z
             join announcements a on a.announcement_id = z.card_id where z.closed_mismatch and a.status <> '접수마감'),
         -- 🔵 2026-10-08(운영 기반 후속 6) — 같은 공고 묶음에 접수 끝 갈림을 알리는 ⚠️ 정책 행(분류 「⚠️ … 기간 끝 날짜 …」)이 이미 있으면 known(알고 있음).
         --    화면이 사용자에게 이미 알리고 있는 갈림이다 — 경고 대신 정보로 세고 개수는 남긴다. ⚠️ 행이 없는 갈림만 경고다.
         'enddiff', (select coalesce(json_agg(json_build_object('t', z.source_key || ' 카드 ' || coalesce(z.card_apply_end::text, '-') || ' ↔ 페이지 ' || coalesce(z.page_apply_end::text, '-'),
                'known', exists (select 1 from announcement_policies p
                                  where p.announcement_id in (select g.announcement_id from get_announcement_group_ids(z.card_id) g)
                                    and p.category like '⚠️%' and p.category like '%기간 끝 날짜%'))), '[]'::json) from (select distinct on (c.source_key) c.* from source_page_checks c
             where c.checked_at > now() - interval '26 hours' and c.error is null order by c.source_key, c.checked_at desc) z
             join announcements a on a.announcement_id = z.card_id where z.end_diff and a.status <> '접수마감'))),
      -- 🔵 2026-10-06 정정본 분석 없음(A3) — 열린 대표 중 정정 행이 정정된 지 60분 넘었는데 정정본 분석이 없고, 같은 묶음에 정정 전 분석이 있는 것.
      'revision_gap', (with rv as materialized (select d.announcement_id from get_announcements_deduped() d join announcements a using (announcement_id)
           where a.is_revised and a.revised_at < now() - interval '60 minutes' and d.apply_end >= (now() at time zone 'Asia/Seoul')::date)
         select coalesce(json_agg(rv.announcement_id), '[]'::json) from rv where not get_revision_analysis_done(rv.announcement_id)
           and exists (select 1 from announcement_analysis aa where aa.announcement_id in (select g.announcement_id from get_announcement_group_ids(rv.announcement_id) g)
                       and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)'))),
      -- 🔵 2026-10-16(우편함 「코드 — 정정 몫 누락 …」 4) — 대기열에서 조용히 사라진 후보(발송기 결함).
      --    열린 대표(apply_end ≥ 오늘+3 · 들어온 지/정정된 지 60분 넘음) ∧ 묶음 첨부 > 0 ∧ 아직 분석할 것이 있음
      --      (정정 행 ∧ 정정본 분석 없음 ∧ 같은 제목 묶음에 정정 전 분석 있음 — revision_gap 과 같은 판정 · 또는 같은 회차(같은 마감 · 링크)에 완료 분석 없음 — 발송기 cand 와 같은 판정)
      --    ∧ 그 공고의 대기열 행이 waiting·sent·claimed 어디에도 없음. 발송기는 10분마다 후보를 넣으므로 이 꼴은 넣다가 충돌로 사라진 것이다(…0877 · 10-15~16).
      --    🔵 2026-10-21(…20929) — 정정본 갈래는 「apply_end ≥ 오늘」(발송기 rcand 와 같은 창) · 미분석 갈래만 「≥ 오늘+3」.
      'dispatch_orphan', (with lm as (select distinct on (l.linked_announcement_id) l.linked_announcement_id aid, announcement_dedup_key(lh.title) lh_key
             from announcement_post_links l join announcements lh on lh.announcement_id = l.lh_announcement_id
            where lh.title is not null and lh.hidden_from_listing is not true order by l.linked_announcement_id, l.lh_announcement_id),
           kd as materialized (select a.announcement_id, a.apply_end, a.attachment_urls, coalesce(lm.lh_key, announcement_dedup_key(a.title)) k, (lm.aid is not null) linked
             from announcements a left join lm on lm.aid = a.announcement_id where a.title is not null and a.hidden_from_listing is not true),
           rp as materialized (select d.announcement_id, d.apply_end, kd.k, a.is_revised, a.revised_at, a.created_at
             from get_announcements_deduped() d join kd using (announcement_id) join announcements a using (announcement_id)
            where d.apply_end >= (now() at time zone 'Asia/Seoul')::date)
         select coalesce(json_agg(rp.announcement_id order by rp.announcement_id), '[]'::json) from rp
          where greatest(rp.created_at, coalesce(rp.revised_at, rp.created_at)) < now() - interval '60 minutes'
            and (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0) from kd g where g.k = rp.k and jsonb_typeof(g.attachment_urls) = 'array') > 0
            and ((rp.is_revised and rp.revised_at is not null and not get_revision_analysis_done(rp.announcement_id)
                  and exists (select 1 from kd g join announcement_analysis aa using (announcement_id)
                               where g.k = rp.k and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')))
                 or (rp.apply_end >= (now() at time zone 'Asia/Seoul')::date + 3 and not exists (select 1 from kd g join announcement_analysis aa using (announcement_id)
                               where g.k = rp.k and (g.apply_end = rp.apply_end or g.linked)
                                 and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)'))))
            and not exists (select 1 from analysis_dispatch_queue q where q.announcement_id = rp.announcement_id and q.state in ('waiting', 'sent', 'claimed'))),
      -- 🔵 2026-10-15(우편함 「코드 — 불변식 … · health-ops-soft 「판정완료인데 판정 대기」 감지」 2) — 판정 대기 잔존.
      --    done = 상태 「완료(판정 대기)」인데 pending_fields 에 「[판정완료] YYYY-MM-DD …」 줄(2026-10-15 규약 — 판정이 난 날 · 근거 페이지)이 있는 공고.
      --    「[판정완료]」 바로 뒤 날짜로 가린다 — 2026-09 분석들의 「[판정완료] <설명>」(분석자가 스스로 정한 것을 적은 옛 꼴)은 세지 않는다.
      --    old = 「완료(판정 대기)」로 분석(analyzed_at) 뒤 7일 넘게 남은 공고(판정이 아직 안 끝난 것 — 정보).
      'pending_done', (select coalesce(json_agg(a.announcement_id order by a.analyzed_at), '[]'::json) from announcement_analysis a
           where a.status = '완료(판정 대기)' and exists (select 1 from unnest(a.pending_fields) e where e ~ '^\\s*\\[판정완료\\]\\s*[0-9]{4}-[0-9]{2}-[0-9]{2}')),
      'pending_old', (select coalesce(json_agg(json_build_object('id', a.announcement_id, 'days', floor(extract(epoch from now() - a.analyzed_at) / 86400)::int)
             order by a.analyzed_at), '[]'::json) from announcement_analysis a
           where a.status = '완료(판정 대기)' and a.analyzed_at < now() - interval '7 days')
    ) j`)
  const d = db.j

  // ① 수집 런 신선도 · 실패 런
  const ageLimit = DAYTIME ? 40 : 720
  add('collect_fresh', '마지막 LH·MYHOME 수집 런 경과(분)', d.last_run_age_min <= ageLimit ? 'pass' : 'fail',
    Math.round(d.last_run_age_min), `주간(UTC 0~9시) ≤ 40분(10분 주기 · p99 간격 10.2분 → 3회 연속 빠짐) · 야간(10시대 포함) ≤ 720분(최대 간격 490분)`)
  add('collect_slow', '24시간 안 140초 넘은 수집 런', d.slow_runs_24h === 0 ? 'pass' : 'fail', d.slow_runs_24h, '0(7일 최대 97.2초 · 150초에서 함수가 죽는다)')
  add('collect_write_err', '24시간 안 DB 쓰기 오류가 적힌 수집 런', d.write_err_runs_24h === 0 ? 'pass' : 'fail', d.write_err_runs_24h, '0(upsert·insert·예상치 못한 오류·MYHOME 예외 — 7일 0)')
  // ② 공공데이터포털 관찰 기준(백로그 「공공데이터포털 간헐 응답 장애」)
  add('portal_lh0', '오늘(KST) LH 목록 0건 런', d.lh0_today < 3 ? 'pass' : 'fail', d.lh0_today, '< 3회/일(백로그 기준 · 7일 최대 1)')
  add('portal_mh0', '오늘(KST) MYHOME 목록 0건 런', d.mh0_today < 3 ? 'pass' : 'fail', d.mh0_today, '< 3회/일(7일 0)')
  if (hourUtc >= 1 && hourUtc <= 10) {
    add('portal_detail', '활성 LH 공고 중 6시간 넘게 상세조회 안 된 수', d.detail_stale <= 5 ? 'pass' : 'fail', d.detail_stale, '≤ 5(백로그 기준 · 2026-09-29 3)')
  } else {
    add('portal_detail', '활성 LH 공고 중 6시간 넘게 상세조회 안 된 수', 'skip', d.detail_stale, '주간(UTC 1~10시)에만 판정 — 밤에는 상세조회가 쉰다')
  }
  // ⑤ cron 잡 · 매입 홍보물 수집
  const jobs = new Map((d.jobs || []).map(j => [j.name, j.active]))
  const missing = EXPECTED_JOBS.filter(n => jobs.get(n) !== true)
  add('cron_active', 'cron 잡 활성', missing.length === 0 ? 'pass' : 'fail', missing.length ? `비활성·없음: ${missing.join(', ')}` : `${EXPECTED_JOBS.length}개 모두 활성`, '기대 목록 전부 active')
  const jf = (d.job_fail_24h || [])
  add('cron_fail', '24시간 안 실패한 cron 실행', jf.length === 0 ? 'pass' : 'fail', jf.map(x => `${x.name} ${x.n}`).join(', ') || 0, '0(7일 0)')
  const promoLimit = FIRST_RUN_DONE ? 40 : 900
  add('promo_fresh', '매입 홍보물 수집 마지막 cron 실행 경과(분)', d.promo_last_run_age_min != null && d.promo_last_run_age_min <= promoLimit ? 'pass' : 'fail',
    d.promo_last_run_age_min == null ? '실행 기록 없음' : Math.round(d.promo_last_run_age_min), 'UTC 00:40~9시 ≤ 40분(30분 주기) · 그 밖 ≤ 900분(09:35 → 다음날 00:05 = 870분 — 예약 지연 여유)')
  add('promo_fail', '24시간 안 실패한 홍보물 목록 수집(공고)', d.promo_fail_24h < 3 ? 'pass' : 'fail', d.promo_fail_24h, '< 3(첫 런 26공고 오류 0)')
  // 2026-10-02 LH 단지 이미지 탭 목록 — 홍보물과 같은 주기(30분 · UTC 0~9시)라 같은 문턱을 쓴다.
  add('images_fresh', '단지 이미지 목록 수집 마지막 cron 실행 경과(분)', d.images_last_run_age_min != null && d.images_last_run_age_min <= promoLimit ? 'pass' : 'fail',
    d.images_last_run_age_min == null ? '실행 기록 없음' : Math.round(d.images_last_run_age_min), 'UTC 00:40~9시 ≤ 40분(30분 주기 17·47분) · 그 밖 ≤ 900분')
  add('images_fail', '24시간 안 실패한 단지 이미지 목록 수집(공고)', d.images_fail_24h < 3 ? 'pass' : 'fail', d.images_fail_24h, '< 3(2026-10-02 시험 38쪽 파싱 실패 0)')
  add('sh_fresh', 'SH 수집 마지막 런 경과(분)', d.sh_last_run_age_min != null && d.sh_last_run_age_min <= 960 ? 'pass' : 'fail',
    d.sh_last_run_age_min == null ? '기록 없음' : Math.round(d.sh_last_run_age_min), '≤ 960분(하루 4회 09·12·15·18시 KST — 18시 → 다음날 09시 = 900분 · 밤 점검(23:55)이 밀려 00시 첫 런 직전에 돌 여유 60분)')
  // ⑧ 공고 분석 루틴 발송기(2026-10-01) — 스위치가 켜져 있을 때만 판정한다(꺼진 동안 대기는 정상).
  {
    const x = d.dispatch
    if (!x) {
      add('dispatch', '분석 발송기', 'fail', '설정 행 없음', 'analysis_dispatch_config 한 행')
    } else if (!x.enabled) {
      add('dispatch', '분석 발송기(스위치 꺼짐)', 'skip', `대기 ${x.waiting}`, '꺼진 동안은 판정하지 않는다 — 켜면 아래 다섯을 본다')
    } else {
      const bad = []
      if (x.overdue > 0) bad.push(`유예 ${x.grace_min}분 + 상한 ${x.max_wait_min}분 동안 발송 0인데 그보다 오래 기다린 대기 ${x.overdue}`)
      if (x.not_ready_24h > 0) bad.push(`홍보물 목록을 24시간 넘게 기다리는 매입 ${x.not_ready_24h}`)
      // 🔵 2026-10-02 — 6시간 → 90분 · 기준 coalesce(claimed_at, created_at)(정상 회차 15~34분 · run 101 은 3시간 53분이었다).
      //    걸리면 Notion ⑥ 「발송 회차 잠금 풀기」 절차로 analysis_run_release(run_id, 사유)를 부른다.
      // 🔵 2026-10-15(우편함 「코드 — health-ops stale_lock 갈래 …」 1) — 심장박동 있는 회차의 90분은 ⚠️(아래 stale_lock_hb · 자동 회수 대상).
      //    ❌ 는 둘만 — 심장박동 없는 회차(회수 밖 · 사람 풀기) · 회수 조건을 넘고 tick 두 번(20분) 지나도록 도는 회차(회수가 안 돈다).
      const hard = (x.stale_lock && x.stale_lock.hard) || []
      const missed = hard.filter(s => s.why === 'reclaim_missed')
      // 🔵 2026-10-20(우편함 「코드·운영 — 미착수 회차 …」 ⓒ) — 회수 밖 갈래 셋을 따로 부른다(종전 한 문구 「심장박동 없음 · 후속 전용」이 미착수를 가렸다).
      const offReclaim = [
        ['unclaimed_missed', '미착수(잡기 없음) 자동 회수가 안 돈다(회수 가능 시각을 20분 넘김 — 6시간 6번 상한 또는 발송기 멈춤)', s => `run ${s.id}(발송 뒤 ${s.age_min}분)`],
        ['no_hb', '첫 심장박동 전 끊김(잡았는데 심장박동 없음)', s => `run ${s.id}(잡은 지 ${s.age_min}분)`],
        ['followup', '후속 전용', s => `run ${s.id}(${s.age_min}분)`],
      ]
      for (const [why, label, fmt] of offReclaim) {
        const xs = hard.filter(s => s.why === why)
        if (xs.length) bad.push(`자동 회수 밖 회차 90분 넘게 안 풀린 잠금 — ${label} ${xs.map(fmt).join(', ')} — 세션 확인 뒤 analysis_run_release`)
      }
      if (missed.length) bad.push(`자동 회수 조건(조용 30분 ∧ 생성 90분)을 20분 넘게 지났는데 도는 회차 ${missed.map(s => `run ${s.id}(심장박동 ${s.hb_min}분 전)`).join(', ')} — 발송기 회수가 안 돈다(zipfit-analysis-dispatch 확인)`)
      if (x.fail_streak) bad.push('연속 3번 발송 실패(자동 발송 멈춤)')
      if (x.zero_streak) bad.push('연속 3회차 끝낸 공고 0건(자동 발송 멈춤 — 공통 원인 확인)')
      // 🔵 2026-10-02 — 우편함 후속 처리 요청(analysis_followup_request)이 120분 넘게 루틴에 실리지 않음(잠금 · 멈춤 · 스위치).
      if (x.followup_stuck > 0) bad.push(`120분 넘게 실리지 않은 후속 처리 요청 ${x.followup_stuck}`)
      add('dispatch', '분석 발송기', bad.length ? 'fail' : 'pass', bad.length ? bad.join(' · ') : `대기 ${x.waiting} · 이상 없음`,
        '켜짐: grace+max_wait 동안 발송 0인데 그보다 오래 기다린 대기 0(몫 상한 — 한 발송 batch_size건) · 홍보물 24시간 대기 0 · 미착수 회수가 안 도는 회차 0 · 자동 회수 밖 회차(첫 심장박동 전 끊김 · 후속 전용) 90분 넘은 잠금(잡은 때 · 잡기 없으면 발송 때 기준) 0 · 자동 회수 조건 넘고 20분 지난 회차 0 · 연속 3실패 아님 · 연속 3회차 0건 끝 아님(후속 전용 회차 제외) · 120분 넘은 후속 처리 요청 0')
    }
  }
  // ⑧-1 심장박동 있는 회차의 긴 잠금 · ⑧-5 자동 회수 본 횟수(2026-10-15 · 우편함 「코드 — health-ops stale_lock 갈래 …」 1·2).
  //    🔴 둘 다 ⚠️ 경고만이다(이슈를 열지 않는다) — 발송기가 스스로 거두는 길 위에 있다. 회수가 안 돌면 위 dispatch ❌ 가 잡는다.
  //    스위치와 무관하게 본다(①-3 회수는 스위치가 꺼져도 tick 이 돈다).
  {
    const hb = (d.dispatch && d.dispatch.stale_lock && d.dispatch.stale_lock.hb) || []
    add('stale_lock_hb', '심장박동 있는 분석 회차 90분 넘게 도는 중(자동 회수 대상)', hb.length === 0 ? 'pass' : 'warn',
      hb.length ? hb.map(s => `run ${s.id} 잡은 지 ${s.age_min}분 · 심장박동 ${s.hb_min}분 전`).join(', ') : 0,
      '0 — 심장박동이 30분 넘게 조용 ∧ 만든 지 90분이면 발송기가 거둔다(analysis_dispatch_tick ①-3) · 넘으면 ⚠️ 경고만 · 회수 조건을 20분 넘기면 dispatch ❌')
    // 🔵 2026-10-20(우편함 「코드·운영 — 미착수 회차 자동 회수·재발송(안 A) …」 4) — 미착수 45분 = ⚠️(발송기 ①-4 가 거둔다 · 회수가 안 돌면 dispatch ❌).
    const uc = (d.dispatch && d.dispatch.stale_lock && d.dispatch.stale_lock.unclaimed) || []
    add('stale_lock_unclaimed', '미착수 분석 회차(잡기 없음) 45분 넘음 — 자동 회수 대상', uc.length === 0 ? 'pass' : 'warn',
      uc.length ? uc.map(s => `run ${s.id} 발송 뒤 ${s.age_min}분 · 잡기 없음`).join(', ') + ' — 사용량 창이 닫혀 있으면 다음 판정이 다시 보낸다' : 0,
      '0 — 잡기 없이 발송 45분이면 발송기가 거두고 다시 보낸다(analysis_dispatch_tick ①-4 · 직전 미착수 회수 60분 안이면 기다림 · 6시간 6번 상한) · 넘으면 ⚠️ 경고만 · 회수 가능 시각을 20분 넘기면 dispatch ❌')
    const rc = (d.dispatch && d.dispatch.auto_reclaim_24h) || []
    add('auto_reclaim_24h', '24시간 안 발송기 자동 회수(루틴 세션이 끊긴 흔적)', rc.length === 0 ? 'pass' : 'warn',
      rc.length ? rc.map(x => `run ${x.id} ${x.at} KST · 공고 ${x.ann || '—'} · 마감 정리 ${x.fu || '없음(분석 행 없음)'}`).join(', ') : 0,
      '0 — finish_note 「자동 회수 …」(사람 풀기는 「잠금 풀기: …」) · ⚠️ 경고만 · 「run N 마감 정리」가 120분 넘게 안 실리면 dispatch ❌ · 실린 뒤 결과 없음·실패는 followup_unreported ⚠️')
  }
  // ⑧-2 정정본 분석 없음(2026-10-06 · 우편함 「코드 — Z-1 …」 PR-A A3 · run 119 고령다산2 …20809) — 감시 SQL 첫 항목.
  //    🔴 실패(❌)가 아니라 ⚠️ 경고다 — 루틴은 열린 health-ops 이슈가 있으면 착수하지 않는데, 이 항목이 걸렸다는 것은 루틴이 정정본을
  //    분석해야 한다는 뜻이라 착수를 막으면 스스로 풀리지 않는다(#328 ops_gap 과 같은 처리). 결과 파일·요약 표에 ⚠️ 로 남는다.
  //    발송기(analysis_dispatch_tick)가 같은 정정본을 후보로 올리므로, 스위치가 켜져 있으면 다음 발송에서 풀린다.
  {
    const ids = d.revision_gap || []
    add('revision_gap', '열린 정정공고 중 정정본 분석 없음(정정 60분 넘음)', ids.length === 0 ? 'pass' : 'warn',
      ids.length ? `${ids.length}: ${ids.slice(0, 5).join(', ')}` : 0,
      '0 — 대표 ∧ is_revised ∧ 정정 60분 넘음 ∧ 열림(apply_end ≥ 오늘) ∧ 정정 전 분석 있음 ∧ get_revision_analysis_done 거짓 · 넘으면 ⚠️ 경고만(이슈를 열지 않는다 — 루틴 착수를 막지 않게)')
  }
  // ⑧-2a 대기열에서 조용히 사라진 후보(2026-10-16 · 우편함 「코드 — 정정 몫 누락 …」 4 · …0877).
  //    revision_gap ⚠️ 는 「루틴이 아직 안 했다」(대기열에 있으면 정상)와 「발송기가 넣지 못했다」(결함)를 가르지 못해 14시간 아무도 안 봤다.
  //    여기는 후자만 — 분석할 것이 있는 열린 대표인데 대기열에 산 행(waiting·sent·claimed)이 없다 → ❌.
  //    🔴 gate.mjs HARD 에 넣지 않는다(안 멈춤 → health-ops-soft) — 루틴을 멈추면 정정본·후보가 더 늦어질 뿐이고 분석이 틀린 값을 쓰게 되지는 않는다.
  //    오탐 가능: 대표가 바뀐 지 10분 안(발송기 다음 틱 전) — 60분 문턱은 들어온·정정된 시각 기준이라 대표 교체만으로는 걸릴 수 있다(다음 점검에 풀린다).
  {
    const ids = d.dispatch_orphan || []
    add('dispatch_orphan', '분석할 것이 있는 열린 대표인데 대기열에 없음(발송기 누락)', ids.length === 0 ? 'pass' : 'fail',
      ids.length ? `${ids.length}: ${ids.slice(0, 5).join(', ')}` : 0,
      '0 — 대표 ∧ 들어온·정정된 지 60분 ∧ 묶음 첨부 > 0 ∧ (정정본 분석 없음(apply_end ≥ 오늘) ∨ 같은 회차 완료 분석 없음(apply_end ≥ 오늘+3)) ∧ 대기열 waiting·sent·claimed 행 없음 · 넘으면 ❌(health-ops-soft — 루틴 착수를 막지 않는다)')
  }
  // ⑧-2b 판정 대기 잔존(2026-10-15 · 우편함 「코드 — 불변식 … · health-ops-soft 「판정완료인데 판정 대기」 감지」 2).
  //    🔴 ⚠️ 경고만이다(이슈를 열지 않는다 — revision_gap·followup_unreported 와 같은 처리) — 고치는 길이 코드가 아니라 「운영 — 데이터 쓰기」(상태만)라
  //    이슈로 열면 판정과 데이터 쓰기 사이 내내 열린 채 회차마다 ②에 걸린다. 결과 파일·요약 표·ops_health_findings 에 남는다.
  //    정보 한 줄(pending_old)은 판정하지 않는다(ℹ️ — 판정이 오래 안 끝난 공고 수).
  {
    const ids = d.pending_done || []
    add('pending_done', '판정이 났는데 「완료(판정 대기)」로 남은 공고', ids.length === 0 ? 'pass' : 'warn',
      ids.length ? `${ids.length}: ${ids.slice(0, 5).join(', ')}` : 0,
      '0 — 상태 「완료(판정 대기)」 ∧ pending_fields 에 「[판정완료] YYYY-MM-DD …」 줄 · 넘으면 ⚠️ 경고만(상태 정리는 운영 데이터 쓰기 몫 · 이슈를 열지 않는다)')
    const old = d.pending_old || []
    add('pending_old', '「완료(판정 대기)」로 분석 뒤 7일 넘은 공고(정보)', 'info',
      old.length ? `${old.length}: ${old.slice(0, 5).map(x => `${x.id}(${x.days}일)`).join(', ')}` : 0,
      '정보 — 판정하지 않는다(판정이 오래 안 끝난 공고 수 · analyzed_at 기준)')
  }
  // ⑧-3 후속 처리 결과(2026-10-06 · 우편함 「코드 — 1-B 후속 처리가 실제로 일했는가」 4) — 루틴이 analysis_queue_finish 넷째 인자로 남긴 결과.
  //    🔴 실패가 아니라 ⚠️ 경고다 — 이슈를 열면 루틴이 착수하지 않아(열린 health-ops 이슈) 스스로 풀리지 않는다(#328 · revision_gap 과 같은 처리).
  {
    const xs = d.followup_unreported || []
    add('followup_unreported', '후속 처리 요청 결과 없음(실린 지 30분 넘음) · 미착수 · 실패', xs.length === 0 ? 'pass' : 'warn',
      xs.length ? xs.slice(0, 5).map(x => `#${x.id} run ${x.run} ${x.result || '결과 없음'}`).join(', ') : 0,
      '0 — 24시간 안 실린 요청 중 (결과 빈 채 실린 지 30분 넘음 ∨ 결과 미착수·실패) · 같은 페이지의 뒤 요청이 처리면 뺀다 · 2026-10-06_06 적용 뒤 요청만 · 넘으면 ⚠️ 경고만(이슈를 열지 않는다)')
  }
  // ⑧-4 원문 키 정기 대조(2026-10-08 · 우편함 「코드 — 3-B ③ …」 3) — 하루 두 회차(UTC 11:30 · 21:30 · 5분 간격 다섯 번).
  //    🔴 cron 이 26시간 넘게 끝까지 돈 실행이 없으면 실패 · 어긋남 둘은 ⚠️ 경고만(이슈를 열지 않는다 — 루틴 착수를 막지 않게 · revision_gap 과 같은 처리).
  //    cron 등록(2026-10-08_02) 뒤 첫 26시간 안에 실행이 하나도 없으면 「첫 회차 전」으로 건너뛴다.
  {
    const x = d.source_check || {}
    if (!x.runs && (x.since_cron_min == null || x.since_cron_min < 1560)) {
      add('source_check_fresh', '원문 키 대조 마지막 실행 경과(분)', 'skip', x.since_cron_min == null ? 'cron 등록 전' : '첫 회차 전', 'cron 등록 뒤 첫 26시간은 판정하지 않는다')
    } else {
      add('source_check_fresh', '원문 키 대조 마지막 실행 경과(분)', x.last_ok_age_min != null && x.last_ok_age_min <= 1560 ? 'pass' : 'fail',
        x.last_ok_age_min == null ? '끝까지 돈 실행 없음' : Math.round(x.last_ok_age_min), '≤ 1560분(하루 두 회차 UTC 11:30·21:30 — 하루 넘게 안 돌면 실패 · 여유 2시간)')
    }
    const cl = x.closed || [], edAll = x.enddiff || []
    const ed = edAll.filter(e => !e.known).map(e => e.t), edKnown = edAll.filter(e => e.known).map(e => e.t)
    add('source_closed', '열린 카드인데 공급기관 페이지가 접수마감', cl.length === 0 ? 'pass' : 'warn', cl.length ? `${cl.length}: ${cl.slice(0, 5).join(', ')}` : 0,
      '0 — 키마다 26시간 안 마지막 대조 · 카드가 아직 열림 · 넘으면 ⚠️ 경고만(값 반영은 2단계)')
    add('source_end_diff', '열린 카드 접수 끝 ≠ 공급기관 페이지', ed.length === 0 ? 'pass' : 'warn',
      (ed.length ? `${ed.length}: ${ed.slice(0, 5).join(', ')}` : '0') + (edKnown.length ? ` · 알고 있음 ${edKnown.length}(⚠️ 정책 행 있음): ${edKnown.slice(0, 5).join(', ')}` : ''),
      '0 — 페이지 일정 중 가장 늦은 접수 끝 ≠ 카드 apply_end · 넘으면 ⚠️ 경고만(값 반영은 2단계) · 같은 공고 묶음에 「⚠️ … 기간 끝 날짜 …」 정책 행이 있으면 알고 있음(정보)')
  }
  // ⑦ 함수 정의 = supabase/rpc/ 사본(2026-09-30 우편함 「운영 — 함수 사본 드리프트」). 읽기만 한다.
  //   대조 규칙은 .github/db/migrate.py rpc_md5() 와 같다 — 파일 그대로 또는 끝 줄바꿈을 걷은 md5 가 DB md5 와 같으면 통과.
  //   걸리는 것: 정의가 다름 · 사본 없음(새 함수) · 같은 이름 둘 이상(한 파일로 대조 불가) · 함수 없는 사본(지운 함수의 사본 잔존).
  //   확장 소유 함수는 뺀다(pg_depend deptype 'e'). README.md · triggers.sql(트리거 바인딩)은 함수 사본이 아니다.
  //   🔵 2026-10-07(Z-2 9) — zipfit_ops 함수도 본다: 이름 키 「zipfit_ops.이름」 ↔ 사본 supabase/rpc/zipfit_ops/<이름>.sql(migrate.py 와 같은 키).
  {
    const t0 = Date.now()
    const [fr] = await sqlRead(`
      select coalesce(json_agg(json_build_object('name', case when n.nspname = 'public' then p.proname else n.nspname || '.' || p.proname end,
               'sig', p.oid::regprocedure::text, 'md5', md5(pg_get_functiondef(p.oid))) order by n.nspname, p.proname), '[]'::json) j
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'zipfit_ops') and p.prokind in ('f','p')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)
    const fns = fr.j || []
    const RPC_DIR = 'supabase/rpc'
    const NOT_COPIES = new Set(['README.md', 'triggers.sql'])
    const md5 = x => createHash('md5').update(x, 'utf8').digest('hex')
    const copyOf = path => { const s = readFileSync(path, 'utf8'); return new Set([md5(s), md5(s.replace(/\n+$/, ''))]) }
    const copies = new Map(readdirSync(RPC_DIR).filter(f => f.endsWith('.sql') && !NOT_COPIES.has(f)).map(f => [f.slice(0, -4), copyOf(`${RPC_DIR}/${f}`)]))
    for (const f of readdirSync(`${RPC_DIR}/zipfit_ops`).filter(f => f.endsWith('.sql'))) copies.set(`zipfit_ops.${f.slice(0, -4)}`, copyOf(`${RPC_DIR}/zipfit_ops/${f}`))
    const byName = new Map()
    for (const f of fns) byName.set(f.name, [...(byName.get(f.name) || []), f])
    const bad = []
    for (const [name, list] of byName) {
      if (list.length > 1) { bad.push(`${name}: 같은 이름 ${list.length}개`); continue }
      const c = copies.get(name)
      if (!c) bad.push(`${list[0].sig}: 사본 없음`)
      else if (!c.has(list[0].md5)) bad.push(`${list[0].sig}: DB ${list[0].md5.slice(0, 8)}… ≠ 사본`)
    }
    for (const name of copies.keys()) if (!byName.has(name)) bad.push(`${name.replace('.', '/')}.sql: DB에 함수 없음`)
    add('fn_copy', 'public·zipfit_ops 함수 정의 = supabase/rpc/ 사본', bad.length === 0 ? 'pass' : 'fail',
      bad.length ? bad.join(' · ') : `${fns.length}개 모두 같음 · ${Date.now() - t0}ms`,
      'DB 정의 md5 = 사본 md5(끝 줄바꿈 무시 — migrate.py 와 같은 규칙) · 사본 없는 함수·함수 없는 사본 0 · 확장 함수 제외')
  }
  // ⑨ 점검 자체가 도는가(2026-10-02 · 우편함 「… health-ops 정기 실행」 4) — GitHub 가 예약 실행을 건너뛴다(10-02 00:25Z·01:25Z).
  //    이 워크플로의 직전 실행(main · 이번 실행 제외) 시작 뒤 경과를 내장 토큰(actions: read)으로 읽는다 — 새 비밀값 0.
  //    30분 주기라 한 번 빠지면 60분 · 두 번 연속 빠지면 90분을 넘는다.
  //    🔵 2026-10-03(#328) — 실패가 아니라 ⚠️ 경고다. GitHub 예약 실행이 하루 몇 번뿐이라(10-02 08:39Z → 14:5xZ 없음) 예약 실행마다
  //    이 항목이 실패해 이슈가 닫히지 않았고, 루틴은 열린 이슈가 있으면 착수하지 않는다. 점검 예약은 pg_cron(25·55분)이 부른다 —
  //    그 경로가 죽었는지는 아래 ⑩ ops_dispatch 가 실패로 잡는다. 실패로 다시 올릴지는 1주 실측 뒤 판단.
  //    🔵 2026-10-09(고지 회차 1 · 7 ①) — 축을 GitHub 실행 목록에서 DB(ops_health_runs — 점검이 끝에 남기는 실행 요약)로 옮겼다.
  //    GitHub 목록은 10-07 00:25 KST 에 DB 에는 있는 실행을 못 보고 240분 경고를 냈다. 경고만은 그대로(10-09 판단 — 루틴 착수를 막지 않는다).
  //    ⚠️ 이 축은 「요약을 남긴 실행」만 센다 — 관리 API 를 못 써 요약이 빠진 실행은 공백으로 보인다(그 경우는 점검 불능 라벨이 따로 잡는다).
  {
    const age = d.last_health_run_age_min
    if (age == null) {
      add('ops_gap', '직전 운영 점검 뒤 경과(분)', 'warn', 'ops_health_runs 기록 없음', '직전 실행 요약을 읽는다(경고만)')
    } else {
      let gap = Number(age)
      if (process.env.SIMULATE === 'gap') gap += 180   // 알림 경로 시험 — 점검이 빠진 것처럼
      add('ops_gap', '직전 운영 점검 뒤 경과(분)', gap <= 90 ? 'pass' : 'warn', Math.round(gap) + (process.env.SIMULATE === 'gap' ? '(시험 +180)' : ''),
        '≤ 90분 — 직전 ops_health_runs 기록 뒤 경과(pg_cron 25·55분 30분 주기 · 넘으면 ⚠️ 경고만 · 이슈를 열지 않는다)')
    }
  }
  // 🔵 2026-10-09(고지 회차 1 · 7 ②) — 24시간 안 발송 중 204 아닌 응답 · 응답을 못 옮긴 발송(health-ops · health-screen · 백업 · 생존 신호).
  //    ⚠️ 경고만 — 한 번 빠진 회차는 다음 발송이 메운다. 막아야 할 사고(경로가 죽음)는 아래 ⑩ 마지막 발송 판정이 실패로 잡는다.
  {
    const rows = d.dispatch_bad_24h || []
    const bad = rows.filter(r => r.non204 > 0 || r.lost > 0)
    const n = rows.reduce((s, r) => s + r.n, 0)
    if (process.env.SIMULATE === 'dispatch_bad') bad.push({ target: '시험', non204: 1, lost: 0 })
    add('dispatch_bad_24h', '24시간 안 발송 중 204 아닌 응답 · 응답 못 옮김', bad.length ? 'warn' : 'pass',
      bad.length ? bad.map(r => `${r.target} 204 아님 ${r.non204} · 응답 없음 ${r.lost}`).join(' · ') + ` (발송 ${n})` : `0 (발송 ${n})`,
      '0 — ops_dispatch_log 24시간(⚠️ 경고만 · 마지막 발송만 보는 ⑩이 덮는 500 을 남긴다)')
  }
  // ⑩ 운영 점검 예약 경로(2026-10-03 · 우편함 「코드 — #328 해소 · 운영 점검 예약을 GitHub 밖으로」) — pg_cron 이 30분마다
  //    ops_health_dispatch() 로 이 워크플로를 workflow_dispatch 로 부른다. 그 경로가 죽으면 이 점검은 GitHub 예비 schedule 실행에서만 돈다
  //    → 그때 「마지막 발송 40분 넘음」 또는 「응답 204 아님(토큰 만료·권한)」이면 실패.
  {
    const x = d.ops_dispatch
    if (!x) {
      add('ops_dispatch', '운영 점검 발송(pg_cron → workflow_dispatch) 마지막', 'fail', '기록 없음', 'ops_dispatch_log 마지막 행 ≤ 40분 · 응답 204')
    } else {
      const okAge = x.age_min <= 40
      const okResp = x.pending ? x.age_min <= 5 : x.status === 204
      add('ops_dispatch', '운영 점검 발송(pg_cron → workflow_dispatch) 마지막', okAge && okResp ? 'pass' : 'fail',
        `${Math.round(x.age_min)}분 전 · ${x.pending ? '응답 대기' : `HTTP ${x.status}`}${x.err ? ' · ' + x.err : ''}`, '≤ 40분(25·55분) · 응답 204(GitHub workflow_dispatch)')
    }
    // 🔵 2026-10-06 화면 점검 발송(하루 1번 23:50 UTC) — 첫 발송 전(기록 없음)은 건너뛴다.
    const y = d.screen_dispatch
    if (!y) {
      add('screen_dispatch', '화면 점검 발송(pg_cron → workflow_dispatch) 마지막', 'skip', '기록 없음(첫 발송 전)', '≤ 25시간(매일 23:50 UTC) · 응답 204')
    } else {
      const ok = y.age_min <= 25 * 60 && (y.pending ? y.age_min <= 5 : y.status === 204)
      add('screen_dispatch', '화면 점검 발송(pg_cron → workflow_dispatch) 마지막', ok ? 'pass' : 'fail',
        `${Math.round(y.age_min)}분 전 · ${y.pending ? '응답 대기' : `HTTP ${y.status}`}${y.err ? ' · ' + y.err : ''}`, '≤ 25시간(매일 23:50 UTC) · 응답 204(GitHub workflow_dispatch)')
    }
    // 🔵 2026-10-08(운영 기반 후속 1) — 백업(18:00 UTC)·생존 신호(18:40 UTC) 발송 — 첫 발송 전(기록 없음)은 건너뛴다.
    for (const [key, id, name, when] of [['zipfit-backup/backup.yml', 'backup_dispatch', '백업 발송(pg_cron → zipfit-backup workflow_dispatch) 마지막', '매일 18:00 UTC'],
                                         ['zipfit-backup/heartbeat.yml', 'heartbeat_dispatch', '생존 신호 발송(pg_cron → zipfit-backup workflow_dispatch) 마지막', '매일 18:40 UTC']]) {
      const b = (d.backup_dispatch || {})[key]
      if (!b) { add(id, name, 'skip', '기록 없음(첫 발송 전)', `≤ 25시간(${when}) · 응답 204`); continue }
      const ok = b.age_min <= 25 * 60 && (b.pending ? b.age_min <= 5 : b.status === 204)
      add(id, name, ok ? 'pass' : 'fail', `${Math.round(b.age_min)}분 전 · ${b.pending ? '응답 대기' : `HTTP ${b.status}`}${b.err ? ' · ' + b.err : ''}`, `≤ 25시간(${when}) · 응답 204(GitHub workflow_dispatch)`)
    }
  }
  // ⑬ 바깥 감시 1단계(2026-10-08 · 우편함 「운영 기반 묶음」 5) — cron zipfit-uptime-ping 이 10분마다 배포 사이트·공개 REST 를 부르고
  //    응답은 다음 회차가 ops_uptime_log 로 옮긴다. 대상마다 부른 지 12분 지난 최근 기록을 새것부터 보아
  //    연속 실패 3회(30분) = 실패 · 1~2회 = ⚠️ · 마지막 기록 25분 넘음 = 실패(감시 멈춤). 성공 = HTTP 2xx·3xx + 본문 표식.
  //    적용 뒤 30분까지는 기록이 없어도 건너뛴다(첫 회차 전). 🔴 DB 가 죽으면 이 감시도 함께 죽는다(바깥 서비스는 2단계).
  try {
    const [u] = await sqlRead(UPTIME_SQL)
    const x = u.j
    if (!x.applied_min || (x.applied_min < 30 && !(x.rows ?? []).length)) {
      add('uptime', '바깥 감시(사이트·공개 REST) 연속 실패', 'skip', x.applied_min ? `첫 기록 전(적용 ${Math.round(x.applied_min)}분)` : '마이그레이션 적용 전', '적용 뒤 30분까지는 판정하지 않는다')
    } else {
      const bad = [], warn = [], parts = []
      for (const t of ['site', 'rest']) {
        const rs = (x.rows ?? []).filter(r => r.target === t)       // 새것부터
        let streak = 0
        for (const r of rs) { if (r.ok) break; streak++ }
        const fails = rs.filter(r => !r.ok).length
        const last = x.last_at_min?.[t]
        if (last == null || last > 25) bad.push(`${t} 감시 멈춤(마지막 ${last == null ? '없음' : Math.round(last) + '분 전'})`)
        else if (streak >= 3) bad.push(`${t} 연속 ${streak}회 실패(${rs[0]?.code ?? rs[0]?.err ?? '응답 없음'})`)
        else if (streak >= 1) warn.push(`${t} 연속 ${streak}회 실패(${rs[0]?.code ?? rs[0]?.err ?? '응답 없음'})`)
        parts.push(`${t} 24시간 ${rs.length - fails}/${rs.length}`)
      }
      add('uptime', '바깥 감시(사이트·공개 REST) 연속 실패', bad.length ? 'fail' : warn.length ? 'warn' : 'pass',
        [...bad, ...warn, parts.join(' · ')].join(' · '), '대상마다 연속 실패 3회(30분) = 실패 · 1~2회 = ⚠️ · 마지막 기록 ≤ 25분')
    }
  } catch (e) {
    add('uptime', '바깥 감시(사이트·공개 REST) 연속 실패', 'fail', String(e).slice(0, 200), 'ops_uptime_log 를 읽는다')
  }
  // ⑭ ⑮ ⑯ — 표가 없으면(적용 전) 쿼리가 실패한다 — 그래서 UPTIME_SQL 처럼 따로 돈다(적용 기록이 없으면 건너뜀).
  try {
    const [pr] = await sqlRead(PROBE_SQL)
    const x = pr.j
    if (x.applied_min == null) throw Object.assign(new Error('마이그레이션 적용 전'), { skip: true })
    const day = x.day || {}
    // 🔵 2026-10-17(목록 RPC 안정화 3) — ms = 새 연결 첫 실행(판정) · ms2 = 같은 연결 둘째 실행(함수 자체 속도 · 「첫/둘째」로 적는다).
    const daySum = `24시간 ${day.n ?? 0}회 · 중앙 첫 ${day.p50 ?? '-'}ms · 둘째 ${day.p50_2 ?? '-'}ms · 최대 ${day.max ?? '-'}ms · 2초 넘음 ${day.over2 ?? 0} · 한도·오류 ${day.bad ?? 0}`
    if (x.last_age_min == null && x.applied_min < 30) {
      add('list_rpc_time', '공개 목록 RPC anon 실행 시간(DB 안 10분마다)', 'skip', `첫 기록 전(적용 ${Math.round(x.applied_min)}분)`, '적용 뒤 30분까지는 판정하지 않는다')
    } else {
      const rec = x.recent || []
      const bad = rec.filter(r => !r.ok), slow = rec.filter(r => r.ok && r.ms >= 2000)
      const stop = x.last_age_min == null || x.last_age_min > 25
      add('list_rpc_time', '공개 목록 RPC anon 실행 시간(DB 안 10분마다)', stop || bad.length ? 'fail' : slow.length ? 'warn' : 'pass',
        [stop ? `기록 멈춤(마지막 ${x.last_age_min == null ? '없음' : Math.round(x.last_age_min) + '분 전'})` : null,
         rec.length ? `지난 35분 ${rec.map(r => (r.ok ? '' : '❌') + r.ms + (r.ms2 != null ? '/' + r.ms2 : '') + 'ms').join(', ')}` : null,
         ...bad.filter(r => r.err).slice(0, 2).map(r => String(r.err).slice(0, 80)), daySum].filter(Boolean).join(' · '),
        '지난 35분 기록 중 새 연결 첫 실행(첫/둘째의 앞)이 3초(anon 한도) 넘음·오류 = 실패 · 2초 넘음 = ⚠️ · 마지막 기록 ≤ 25분 · 원인은 단정하지 않는다(24시간 요약을 쌓아 판정)')
    }
    let rest = 0, restBody = ''
    try {
      const r = await fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/_http_response?select=id&limit=1`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Accept-Profile': 'net' } })
      rest = r.status; restBody = (await r.text()).slice(0, 120)
    } catch (e) { restBody = String(e).slice(0, 120) }
    const restOk = rest === 406 && restBody.includes('PGRST106')
    const fns = x.exposed_net_fns || []
    add('net_secret', 'pg_net 비밀값 — 거두기·노출 함수·바깥 REST', x.tok_old === 0 && fns.length === 0 && restOk ? 'pass' : 'fail',
      `10분 넘은 토큰 꼴 응답 ${x.tok_old} · anon·authenticated 가 부르는 net 함수 ${fns.length ? fns.join(', ') : 0} · REST net ${rest}${restOk ? '(PGRST106)' : ' ' + restBody}`,
      '0 · 0 · 406 PGRST106 — net 표 권한은 회수 불가(supabase_admin 이 PUBLIC 에 줌)라 거두기(5분)·노출 0 으로 막는다')
    const es = x.extras_src || {}
    add('extras_source_url', '갤러리 새 행 원본 위치(source_url) 빔(정보)', 'info', `칸 추가 뒤 새 행 ${es.new ?? 0} · 빔 ${es.empty ?? 0}`,
      '정보 — 판정하지 않는다(새 행은 갤러리를 넣는 분석이 채운다 · LH = lhFile.do?fileid=<file_sn>)')
  } catch (e) {
    if (e.skip) add('list_rpc_time', '공개 목록 RPC anon 실행 시간(DB 안 10분마다)', 'skip', String(e.message), '마이그레이션 2026-10-17_01 적용 뒤 판정한다')
    else add('list_rpc_time', '공개 목록 RPC anon 실행 시간(DB 안 10분마다)', 'fail', String(e).slice(0, 200), 'zipfit_ops.list_rpc_probe_log 를 읽는다')
  }
  // ⑥ 백업 — 🔴 zipfit-backup(비공개) 커밋을 이 실행의 내장 토큰(github.token · zipfit 한정)으로는 읽을 수 없다.
  //    2026-10-09(고지 회차 1 · 7 ③ 조사) — 발송 토큰(Vault github_actions_dispatch_token)은 zipfit-backup 에 닿지만 이 점검은 DB 를
  //    읽기 전용 트랜잭션(sqlRead)으로만 읽어 Vault 토큰으로 GitHub 를 부를 수 없다. 발송 자체(≤ 25시간 · 204)는 위 ⑩ backup_dispatch 가 본다.
  //    🔵 2026-10-11(고지 회차 2 · 10) — 살렸다: pg_cron(zipfit-backup-poll)이 매시 backup.yml 실행 기록을 ops_backup_seen 에 남기고 여기서는 읽기만 한다.
  //    커밋 목록(/commits)은 발송 토큰에 내용 읽기 권한이 없어 403 — 실행 기록(Actions 읽기)으로 잰다. 「실제 백업」 = 성공 ∧ ≥ 45초(BACKUP_SQL 위 주석).
  //    수집이 3시간 넘게 200 을 못 받으면 ⚠️(수집 멈춤 — 판정 재료가 낡는다) · 적용 뒤 2시간까지는 첫 수집 전이라 건너뛴다.
  const BACKUP_RULE = '「실제 백업」(backup.yml 성공 ∧ ≥ 45초)의 가장 늦은 실행 UTC 날짜 ≥ (지금 UTC − 22시간)의 날짜(매일 18:00 UTC 정기 + 여유 4시간 — 같은 날 승인 실행으로 정기 회차가 건너뛰어도 그날 백업이 있으면 통과) · 수집(zipfit-backup-poll 매시 12분) 200 ≤ 3시간'
  try {
    const [b] = await sqlRead(BACKUP_SQL)
    const x = b.j
    if (!x.applied_min || (x.applied_min < 120 && x.real_age_h == null)) {
      add('backup', '최근 백업(실행 기록) — 기한 날짜의 백업', 'skip', x.applied_min ? `첫 수집 전(적용 ${Math.round(x.applied_min)}분)` : '마이그레이션 적용 전', BACKUP_RULE)
    } else {
      const fail = x.real_last_date == null || String(x.real_last_date) < String(x.due_date)
      const pollStale = x.poll_ok_age_h == null || x.poll_ok_age_h > 3
      const lf = x.last_fail ? ` · 마지막 실패 실행 ${String(x.last_fail.at).slice(0, 16)} ${x.last_fail.conclusion}` : ''
      const poll = x.poll_last ? ` · 수집 HTTP ${x.poll_last.code}(${Math.round(x.poll_last.age_min)}분 전)` : ' · 수집 기록 없음'
      add('backup', '최근 백업(실행 기록) — 기한 날짜의 백업', fail ? 'fail' : pollStale ? 'warn' : 'pass',
        `${x.real_age_h == null ? '실제 백업 기록 없음' : `${x.real_age_h.toFixed(1)}시간 전 · 실행 날짜(UTC) ${x.real_last_date} · 기한 날짜 ${x.due_date}`}${lf}${poll}`, BACKUP_RULE)
    }
  } catch (e) {
    add('backup', '최근 백업(실행 기록) — 기한 날짜의 백업', 'warn', String(e).slice(0, 200), 'ops_backup_seen 을 읽는다(경고만 — 표가 없거나 읽기 실패)')
  }
  // ⑭ 상세 지도 끝 상태(MAP_SQL 위 주석) — 🔴 셋 다 실패가 아니라 ⚠️ 경고·정보다. 이슈를 열면 루틴이 착수하지 않는데(열린 health-ops 이슈),
  //    고침은 데이터·코드 회차라 착수를 막으면 스스로 풀리지 않는다(revision_gap 과 같은 처리). 읽기 실패도 ⚠️.
  try {
    const t0 = Date.now()
    const [m] = await sqlRead(MAP_SQL)
    const x = m.j, ms = Date.now() - t0
    const ids = a => `${a.length}: ${a.slice(0, 5).join(', ')}`
    const ap = x.approx || [], op = x.multi_one_point || [], mc = x.multi_closed || []
    add('map_approx', '열린 카드 중 상세 지도 대략 핀(시·군·구 중심)', ap.length === 0 ? 'pass' : 'warn', ap.length ? ids(ap) : 0,
      '0 — 세대 행 0 ∧ 정밀주소 없음 ∧ 블록 1 ∧ 폴백 주소가 시·구 수준 ∧ 한 지역(여러 지역이면 닫힘) ∧ 전세임대 아님 · 넘으면 ⚠️ 경고만(이슈를 열지 않는다) · 브라우저 지오코딩 실패(Lv3)는 세지 못한다')
    add('map_multi_one_point', '여러 지역 공고인데 상세 지도가 한 점으로 눌림', op.length === 0 ? 'pass' : 'warn', op.length ? ids(op) : 0,
      '0 — region_names(접두 흡수) 2곳 이상 ∧ 블록 1 ∧ 세대 행 0 ∧ 전세임대 아님 ∧ (정밀주소 있음 ∨ region 3어절 이상) · 넘으면 ⚠️ 경고만')
    add('map_multi_closed', '여러 지역이라 상세 지도를 닫은 열린 카드(정보)', 'pass', `${mc.length ? ids(mc) : 0} · 열린 ${x.open} · ${ms}ms`,
      '정보 — 판정하지 않는다(closeMapAsMultiRegion 거울: 세대 행 0 ∧ 정밀주소 없음 ∧ 폴백 시·구 수준 ∧ region_names 2곳 이상)')
  } catch (e) {
    add('map_approx', '열린 카드 중 상세 지도 대략 핀(시·군·구 중심)', 'warn', String(e).slice(0, 200), 'MAP_SQL 을 읽는다(경고만 — 읽기 실패)')
  }
  // ⑮ 해마다 바뀌는 밑값 표 — 새 연도 경고(yearly.mjs 머리 주석 · 2026-10-14). 전부 ⚠️ 경고만 · 읽기 실패도 ⚠️.
  try {
    const [y] = await sqlRead(YEARLY_SQL)
    for (const c of judgeYearly(y.j)) add(c.id, c.name, c.status, c.value, c.rule)
  } catch (e) {
    add('yearly_base', '해마다 바뀌는 밑값 표 — 새 연도', 'warn', String(e).slice(0, 200), 'YEARLY_SQL 을 읽는다(경고만 — 읽기 실패)')
  }
  // ⑯ SH 수집 회차가 런 로그를 남겼나 · SH 런 140초(sh-run.mjs 머리 주석 · 2026-10-15). 읽기 실패는 ❌(sh_fresh 와 같은 축 — 안 멈춤).
  try {
    const [x] = await sqlRead(SH_RUN_SQL)
    for (const c of judgeShRun(x.j)) add(c.id, c.name, c.status, c.value, c.rule)
  } catch (e) {
    add('sh_run', 'SH 수집 회차가 런 로그를 남겼나', 'fail', String(e).slice(0, 200), 'SH_RUN_SQL 을 읽는다')
  }
  // ⑰ 홍보물·단지 이미지 목록 수집 — cron 두 번 지나도록 처리 안 된 대상(collect-backlog.mjs 머리 주석 · 2026-10-15). 읽기 실패는 ❌(안 멈춤).
  try {
    const [x] = await sqlRead(BACKLOG_SQL)
    for (const c of judgeBacklog(x.j)) add(c.id, c.name, c.status, c.value, c.rule)
  } catch (e) {
    add('promo_backlog', '홍보물·단지 이미지 목록 수집 — 처리 안 된 대상', 'fail', String(e).slice(0, 200), 'BACKLOG_SQL 을 읽는다')
  }
} catch (e) {
  addBlind('runner', '점검 실행', 'fail', String(e).slice(0, 300), '점검 스크립트가 끝까지 돈다')
}

// ⑫ Supabase 보안 권고(2026-10-08 · 우편함 「운영 기반 묶음」 2) — 관리 API advisors/security 를 읽어 허용 목록
//    (.github/health/security-allowlist.json · intended = 의도 확인 · known = 알려진 미결) 밖의 새 지적이 있으면 ⚠️.
//    키 = cache_key 에서 끝 32자리 해시를 뗀 것(함수 지적의 해시가 정의를 따라 바뀌어도 같은 함수는 같은 키).
//    🔴 경고만 한다 — 새 표·새 정의자 함수가 생기면 의도를 확인해 허용 목록에 이유와 함께 넣는다(원칙 15).
try {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN 이 없다')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/advisors/security`, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  if (!res.ok) throw new Error(`관리 API ${res.status}: ${text.slice(0, 200)}`)
  const lints = JSON.parse(text).lints ?? []
  const allow = new Map(JSON.parse(readFileSync(new URL('./security-allowlist.json', import.meta.url), 'utf8')).entries.map(e => [e.key, e.kind]))
  if (process.env.SIMULATE === 'sec') allow.delete([...allow.keys()][0])   // 경고 경로 시험 — 허용 목록에서 한 줄을 뺀 것처럼
  const keyOf = l => String(l.cache_key ?? l.name).replace(/_[0-9a-f]{32}$/, '')
  const seen = new Set(lints.map(keyOf))
  const fresh = lints.filter(l => !allow.has(keyOf(l)))
  const n = k => lints.filter(l => allow.get(keyOf(l)) === k).length
  const gone = [...allow.keys()].filter(k => !seen.has(k)).length
  add('sec_advisor', 'Supabase 보안 권고 — 허용 목록 밖 새 지적', fresh.length === 0 ? 'pass' : 'warn',
    fresh.length
      ? `${fresh.length}: ${fresh.slice(0, 5).map(l => `${l.level} ${keyOf(l)}`).join(', ')}${process.env.SIMULATE === 'sec' ? '(시험)' : ''}`
      : `지적 ${lints.length} · 의도 ${n('intended')} · 미결 ${n('known')} · 해소 ${gone}`,
    '0(.github/health/security-allowlist.json 밖 · 있으면 ⚠️ — 의도를 확인해 목록에 넣거나 고친다)')
} catch (e) {
  add('sec_advisor', 'Supabase 보안 권고 — 허용 목록 밖 새 지적', 'warn', String(e).slice(0, 200), '관리 API advisors/security 를 읽는다(경고만)')
}

// ⑰ 목록 RPC 사용자 실패(2026-10-17 · 우편함 「코드·운영 — 목록 RPC 안정화 …」 2) — 관리 API 로그(PostgREST 접근 기록 postgrest_logs)에서 지난 24시간
//    /rpc/get_announcements_deduped 의 5xx(거의 전부 57014 — anon 3초 한도)를 센다. 점검·위 list_rpc_time 은 자기 호출만 보아 사용자가 겪은 500 을 못 셌다(2026-10-17 조사 G).
//    사람 브라우저와 자동 브라우저(UA HeadlessChrome — 우리 health-screen·로컬 렌더·Playwright)를 가른다 — 2026-10-17 24시간 12건 중 11건이 자동 브라우저였다.
//    🔴 ⚠️만(❌ 없음 — 안정화 안이 선 뒤 문턱을 다시 본다) · 사람 실패 1건 이상 = ⚠️ · gate.mjs HARD 밖(루틴을 막지 않는다) · 관리자 상태판 health.list_user_fail 이
//    ops_health_findings 기록을 읽는다. 로그 조회가 실패하면 ⚠️(판정 못 함).
try {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN 이 없다')
  const sql = `select countIf(event_message not like '%HeadlessChrome%') human, countIf(event_message like '%HeadlessChrome%') headless,
    toString(maxIf(timestamp, event_message not like '%HeadlessChrome%')) last_human
    from logs where source = 'postgrest_logs' and event_message like '%/rpc/get_announcements_deduped%' and match(event_message, '" 5[0-9][0-9] ')`
  const q = new URLSearchParams({ sql, iso_timestamp_start: new Date(now.getTime() - 24 * 3600 * 1000).toISOString(), iso_timestamp_end: now.toISOString() })
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs?${q}`, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  if (!res.ok) throw new Error(`관리 API ${res.status}: ${text.slice(0, 200)}`)
  const body = JSON.parse(text)
  if (body.error) throw new Error(`로그 조회: ${String(body.error).slice(0, 200)}`)
  const r = (body.result || [])[0] || {}
  const human = Number(r.human ?? 0), headless = Number(r.headless ?? 0)
  const last = human > 0 && r.last_human ? new Date(String(r.last_human).replace(' ', 'T').slice(0, 23) + 'Z') : null
  const lastKst = last ? new Date(last.getTime() + 9 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ') + ' KST' : null
  add('list_user_fail', '목록 RPC 사용자 실패(5xx · 57014) 24시간', human > 0 ? 'warn' : 'pass',
    `사람 브라우저 ${human}${lastKst ? `(마지막 ${lastKst})` : ''} · 자동 브라우저 ${headless} · 합 ${human + headless}`,
    '사람 브라우저 0 — 1건 이상이면 ⚠️(❌ 없음 · 기준선이 있어 안정화 안이 선 뒤 문턱을 다시 본다) · 자동 브라우저(HeadlessChrome)는 세기만 한다')
} catch (e) {
  // 🔵 2026-10-20 — 로그 조회 실패(2026-10-19 22:25 「관리 API 500: Failed to get project's logs」)는 사람 실패가 아니라 점검 불능 — ⚠️ 그대로 · blind.
  addBlind('list_user_fail', '목록 RPC 사용자 실패(5xx · 57014) 24시간 — 점검 불능(로그 조회 실패)', 'warn', String(e).slice(0, 200), '관리 API 로그(postgrest_logs)를 읽는다(경고만)')
}

// ⑱ 비밀값 만료(2026-10-17 · 우편함 「코드·운영 — 인스턴스 지표 정기 기록 · Vault 밖 만료 표 · 비밀값 30일 전 ⚠️ …」 3) — zipfit_ops.secret_expiry_list() 한 정의
//    (Vault 설명칸 「expires=…」 + Vault 밖 표 zipfit_ops.secret_expiry_external · 관리자 상태판 secrets 와 같다)를 읽는다.
//    날짜 있는 것 중 남은 날 ≤ 30 = ⚠️(이름·날짜) · 지난 것 = ❌(안 멈춤 — gate.mjs HARD 밖) · 설명칸 꼴이 없는 Vault 비밀(missing) = ⚠️.
//    종전 ops_dispatch_token(GitHub 발송 토큰 하나 · 파일 상수 날짜)을 이 항목이 대신한다 — 토큰을 갈면 Vault 설명칸이나 표 한 줄만 고친다.
try {
  const [x] = await sqlRead(`select coalesce(json_agg(json_build_object('source', source, 'name', name, 'state', state, 'expires', expires, 'days_left', days_left)), '[]'::json) as j
    from zipfit_ops.secret_expiry_list()`)
  const rows = x.j
  const dated = rows.filter(r => r.state === 'date')
  const soon = dated.filter(r => r.days_left <= 30)
  const gone = soon.filter(r => r.days_left < 0)
  const missing = rows.filter(r => r.state === 'missing')
  const first = dated[0]
  const fmt = r => `${r.name} ${r.expires}(${r.days_left}일)`
  add('secret_expiry', '비밀값 만료(30일 안 ⚠️)', gone.length ? 'fail' : soon.length || missing.length ? 'warn' : 'pass',
    soon.length || missing.length
      ? [soon.length ? `30일 안 ${soon.length}: ${soon.map(fmt).join(', ')}` : '', missing.length ? `설명칸 expires= 없음 ${missing.length}: ${missing.map(r => r.name).join(', ')}` : ''].filter(Boolean).join(' · ')
      : `가장 이른 ${first ? fmt(first) : '없음'} · 날짜 ${dated.length} · 만료 없음 ${rows.filter(r => r.state === 'none').length} · 모름 ${rows.filter(r => r.state === 'unknown').length}`,
    '남은 날 > 30(KST) — 30일 안 ⚠️ · 지나면 ❌(안 멈춤) · Vault 설명칸 꼴 없음 ⚠️ · 정의 zipfit_ops.secret_expiry_list()')
} catch (e) {
  add('secret_expiry', '비밀값 만료(30일 안 ⚠️)', 'warn', String(e).slice(0, 200), 'zipfit_ops.secret_expiry_list() 를 읽는다(못 읽으면 ⚠️)')
}

// ⑳ 공고 원문 문자열 오염(2026-10-18 · 우편함 「코드·운영 — G8 확정 고침 …」 5 · 정보) — 화면 저장형 XSS 두 자리(제목 → innerHTML ·
//    URL → href)의 진입은 수집 원문뿐이다. 열린 공고(공고중·접수중·정정공고중)의 제목 꺾쇠 · 공고·첨부 URL 중 http(s) 아닌 것 · 따옴표 든 것을 센다.
//    처음엔 정보(ℹ️ · 판정하지 않음)다 — 0이 아니면 ⚠️로 올릴지는 따로 정한다. gate.mjs HARD 밖(안 멈춤).
try {
  const [x] = await sqlRead(`with o as (select announcement_id, title, url, attachment_urls from public.announcements where status in ('공고중','접수중','정정공고중')),
u as (select announcement_id, url as u from o where coalesce(url, '') <> ''
      union all
      select o.announcement_id, e->>'url' from o, jsonb_array_elements(case when jsonb_typeof(o.attachment_urls) = 'array' then o.attachment_urls else '[]'::jsonb end) e
       where coalesce(e->>'url', '') <> '')
select jsonb_build_object(
  'open', (select count(*) from o),
  'urls', (select count(*) from u),
  'title_angle', (select count(*) from o where title ~ '[<>]'),
  'url_not_http', (select count(*) from u where u.u !~* '^https?://'),
  'url_quote', (select count(*) from u where u.u ~ '["'']'),
  'ids', (select coalesce(jsonb_agg(distinct x.announcement_id), '[]'::jsonb) from (
            select announcement_id from o where title ~ '[<>]'
            union all select announcement_id from u where u.u !~* '^https?://' or u.u ~ '["'']') x)
) as j`)
  const c = x.j
  add('source_text_taint', '열린 공고 원문 문자열 오염 — 제목 꺾쇠 · http 아닌 URL · 따옴표 든 URL(정보)', 'info',
    `${c.title_angle} · ${c.url_not_http} · ${c.url_quote}(열린 ${c.open} · URL ${c.urls})${c.ids.length ? ' · ' + c.ids.slice(0, 5).join(', ') : ''}`,
    '정보 — 판정하지 않는다(0 · 0 · 0 이 정상 · 공고 URL과 첨부 attachment_urls[].url 을 함께 센다)')
} catch (e) {
  add('source_text_taint', '열린 공고 원문 문자열 오염 — 제목 꺾쇠 · http 아닌 URL · 따옴표 든 URL(정보)', 'info', String(e).slice(0, 200), '공고 표를 읽는다(못 읽어도 정보)')
}

// ㉑ 한부모 갈래 나이 조건 누락(2026-10-19 · 우편함 「코드·운영 — CLAUDE.md 원칙 「개인정보 값 출력 금지」 · 점검 항목 …」 2 · 조사 「큐 B 첫 회차」 회신 ②(c)).
//    원문이 「한부모 … N세 이하」(자녀 나이)를 말하는데 키 갈래 {"대상":"한부모"}에 확인필요가 없으면 화면이 자녀 나이를 안 보고 ok·no 를 낸다
//    (2026-10-19 열린 5공고 14행 — 같은 날 확인필요를 채웠다). 재발 막기는 코드 안전망이 아니라 이 점검이다.
//    열린 카드 = docs/launch-gates.sql G2 와 같은 식(apply_end ≥ 오늘 KST ∧ 제목에 「조기…마감」 없음) · 키 행 = 그 카드와 같은 제목 키 묶음의 공급대상 객체 행
//    (화면 zfTargetRowsFor 는 자기 행 → 형제 행 순이라 이쪽이 넓다 — 화면에 안 쓰이는 형제 행도 센다).
//    원문 = 키 행과 같은 공고의 정책 행 content_raw 에 /한부모[^.]{0,40}[0-9]+\s*세\s*이하/ · ⚠️ 경고만(이슈를 열지 않는다 · gate.mjs HARD 밖).
try {
  const [x] = await sqlRead(`with oc as materialized (select announcement_dedup_key(d.title) k from public.get_announcements_deduped() d
        where d.apply_end >= (now() at time zone 'Asia/Seoul')::date and d.title not like '%조기%마감%'),
     kr as materialized (select distinct e.id, e.announcement_id, e.verification_requirements->'공급대상' g
        from public.announcements a join oc on public.announcement_dedup_key(a.title) = oc.k
        join public.eligibility_criteria e on e.announcement_id = a.announcement_id
       where jsonb_typeof(e.verification_requirements->'공급대상') = 'object' and jsonb_typeof(e.verification_requirements->'공급대상'->'갈래') = 'array'),
     hit as (select kr.id, kr.announcement_id from kr
        where exists (select 1 from jsonb_array_elements(kr.g->'갈래') b where b->>'대상' = '한부모' and not (b ? '확인필요'))
          and exists (select 1 from public.announcement_policies p where p.announcement_id = kr.announcement_id
                       and p.content_raw ~ '한부모[^.]{0,40}[0-9]+\\s*세\\s*이하'))
select json_build_object('n', (select count(*) from hit), 'key_rows', (select count(*) from kr),
  'hanbumo', (select count(*) from kr, jsonb_array_elements(kr.g->'갈래') b where b->>'대상' = '한부모'),
  'ids', (select coalesce(json_agg(distinct announcement_id), '[]'::json) from hit)) j`)
  const c = x.j
  add('target_hanbumo_age', '열린 카드 한부모 갈래에 확인필요 없음 ∧ 원문 「한부모 … N세 이하」', c.n === 0 ? 'pass' : 'warn',
    c.n === 0 ? `0(키 행 ${c.key_rows} · 한부모 갈래 ${c.hanbumo})` : `${c.n}행: ${c.ids.slice(0, 5).join(', ')}`,
    '0 — 열린 카드(G2 식) 제목 키 묶음의 공급대상 키 행 중 갈래 대상 「한부모」 ∧ 확인필요 없음 ∧ 같은 공고 정책 행 content_raw 에 「한부모 … N세 이하」 · 넘으면 ⚠️ 경고만(확인필요 채우기는 운영 데이터 쓰기 몫)')
} catch (e) {
  add('target_hanbumo_age', '열린 카드 한부모 갈래에 확인필요 없음 ∧ 원문 「한부모 … N세 이하」', 'warn', String(e).slice(0, 200), '공고·키·정책 표를 읽는다(못 읽으면 ⚠️)')
}

// ㉒ 청년 갈래 혼인 조건 누락(2026-10-19 · 우편함 「코드·운영 — 점검 항목 target_youth_marital …」 1 · 조사 「G3 후보 실측」 ⓒ).
//    행복주택 등 청년·대학생·사회초년생 갈래는 원문이 「혼인 중이 아닐 것」을 거는데, 키 갈래에 조건.혼인도 확인필요도 없으면
//    화면이 혼인한 진단 사용자에게도 ok 를 낸다(2026-10-19 …20850 · …20854 — 같은 날 운영 데이터 쓰기로 채웠다).
//    청년 갈래 = 대상 청년·대학생·사회초년생·취업준비생 ∨ (대상 「계층」 또는 대상 없음 ∧ 계층_중_하나에 그 낱말).
//    확인필요가 있는 갈래는 화면이 이미 check 라 세지 않는다(SH 청년 창업가·예술인 꼴 · 원문이 혼인을 걸지 않는 대상).
//    열린 카드 · 키 행 범위는 ㉑ 과 같다 · ⚠️ 경고만(이슈를 열지 않는다 · gate.mjs HARD 밖).
try {
  const [x] = await sqlRead(`with oc as materialized (select announcement_dedup_key(d.title) k from public.get_announcements_deduped() d
        where d.apply_end >= (now() at time zone 'Asia/Seoul')::date and d.title not like '%조기%마감%'),
     kr as materialized (select distinct e.id, e.announcement_id, e.verification_requirements->'공급대상' g
        from public.announcements a join oc on public.announcement_dedup_key(a.title) = oc.k
        join public.eligibility_criteria e on e.announcement_id = a.announcement_id
       where jsonb_typeof(e.verification_requirements->'공급대상') = 'object' and jsonb_typeof(e.verification_requirements->'공급대상'->'갈래') = 'array'),
     yb as (select kr.id, kr.announcement_id, b from kr, jsonb_array_elements(kr.g->'갈래') b
        where b->>'대상' in ('청년', '대학생', '사회초년생', '취업준비생')
           or (coalesce(b->>'대상', '계층') = '계층' and jsonb_typeof(b->'조건'->'계층_중_하나') = 'array'
               and (b->'조건'->'계층_중_하나')::text ~ '(청년|대학생|사회초년생|취업준비생)')),
     hit as (select * from yb where not (jsonb_typeof(b->'조건') = 'object' and (b->'조건') ? '혼인') and not (b ? '확인필요'))
select json_build_object('n', (select count(*) from hit), 'key_rows', (select count(*) from kr), 'youth', (select count(*) from yb),
  'ids', (select coalesce(json_agg(distinct announcement_id), '[]'::json) from hit)) j`)
  const c = x.j
  add('target_youth_marital', '열린 카드 청년·대학생·사회초년생 갈래에 혼인 조건도 확인필요도 없음', c.n === 0 ? 'pass' : 'warn',
    c.n === 0 ? `0(키 행 ${c.key_rows} · 청년 갈래 ${c.youth})` : `${c.n}갈래: ${c.ids.slice(0, 5).join(', ')}`,
    '0 — 열린 카드(G2 식) 제목 키 묶음의 공급대상 키 행 중 갈래 대상 청년·대학생·사회초년생·취업준비생(또는 계층_중_하나에 그 낱말) ∧ 조건.혼인 없음 ∧ 확인필요 없음 · 넘으면 ⚠️ 경고만(혼인 조건 채우기는 운영 데이터 쓰기 몫)')
} catch (e) {
  add('target_youth_marital', '열린 카드 청년·대학생·사회초년생 갈래에 혼인 조건도 확인필요도 없음', 'warn', String(e).slice(0, 200), '공고·키 표를 읽는다(못 읽으면 ⚠️)')
}

// ㉓ LH 목록에서 사라진 열린 카드(2026-10-22 · 김제하동 …20908) — 판정·SQL 은 lh-gone.mjs 머리 주석. ⚠️만 · 못 읽으면 ⚠️ 점검 불능.
try {
  const [x] = await sqlRead(lhGoneSql())
  const j = judgeLhGone(x.j)
  add('lh_list_gone', 'LH 목록에서 안 보이는 열린 LH 카드', j.status, j.value, j.rule)
} catch (e) {
  addBlind('lh_list_gone', 'LH 목록에서 안 보이는 열린 LH 카드 — 점검 불능', 'warn', String(e).slice(0, 200), '공고·수집 기록 표를 읽는다(못 읽으면 ⚠️)')
}

// ㉔·㉕ 열린 카드 데이터 빈칸 둘(2026-10-22) — 판정·SQL 은 open-gaps.mjs 머리 주석. ⚠️만 · 못 읽으면 ⚠️ 점검 불능.
for (const [id, name, sql, judge] of [
  ['elig_form_null', '열린 카드 자격 행 공급 형태(supply_form) 빔', ELIG_FORM_NULL_SQL, judgeEligFormNull],
  ['rent_null_not_jeonse', '열린 카드 전세 아닌 세대 행 월세(monthly_rent) 빔', RENT_NULL_SQL, judgeRentNull],
  ['round_mix', '열린 카드 묶음에 다른 회차 경로·서류 행(정보 — 화면 회차 거르기가 받쳐야 함)', ROUND_MIX_SQL, judgeRoundMix],   // 2026-10-29 ㉖
]) {
  try {
    const [x] = await sqlRead(sql)
    const j = judge(x.j)
    add(id, name, j.status, j.value, j.rule)
  } catch (e) {
    addBlind(id, `${name} — 점검 불능`, 'warn', String(e).slice(0, 200), '공고·자격·세대 표를 읽는다(못 읽으면 ⚠️)')
  }
}

// ㉗ 재고 통계 원천 판 날짜(2026-10-29 · 우편함 「코드·운영 — 런칭 뒤 묶음」 2ⓒ · 백로그 「임대주택 통계 이력이 안 쌓인다」).
//    rental_housing_stats.source_updated_at 최댓값이 오늘(KST)에서 400일 넘게 그대로면 ⚠️ — 포털 원천은 해마다 갱신되는데(정기 조사)
//    collect-rental-stats 가 판 날짜를 상수(index.ts SOURCE_UPDATED_AT)로 넣어 cron 이 매주 성공해도 새 판을 못 받는다(이력도 안 쌓인다).
//    문턱 400일 = 연 1회 갱신 + 한 달 여유(제안값 — 판정은 claude.ai). ⚠️ 경고만 · gate.mjs HARD 밖 · 못 읽으면 ⚠️ 점검 불능.
try {
  const [x] = await sqlRead(`select json_build_object('src', max(source_updated_at)::date, 'days', (now() at time zone 'Asia/Seoul')::date - max(source_updated_at)::date,
      'rows', count(*), 'collected_age_h', round((extract(epoch from now() - max(collected_at)) / 3600)::numeric, 1)) j from public.rental_housing_stats`)
  const j = x.j
  const rule = '≤ 400일 — 재고 통계 원천 판 날짜(source_updated_at 최댓값)가 오늘(KST)에서 400일 넘게 그대로면 ⚠️(연 1회 갱신 + 여유 · 판 날짜가 코드 상수라 새 판을 못 받는 꼴)'
  add('rental_stats_src', '재고 통계 원천 판 날짜 경과(일)', j.days != null && j.days <= 400 ? 'pass' : 'warn',
    `${j.days ?? '판 날짜 없음'}일(판 ${j.src ?? '—'} · ${j.rows}행 · 마지막 수집 ${j.collected_age_h ?? '—'}시간 전)`, rule)
} catch (e) {
  addBlind('rental_stats_src', '재고 통계 원천 판 날짜 — 점검 불능', 'warn', String(e).slice(0, 200), '재고 통계 표를 읽는다(못 읽으면 ⚠️)')
}

// ⑲ 인스턴스 메모리(2026-10-17 · 같은 우편 1 · 조사 「인스턴스 지표 경로」 ⓑ) — 관리 API 지표 끝점(베타)에서 숫자만 골라(instance.mjs) zipfit_ops.instance_metrics_log 에 한 행.
//    🔴 본문 원문은 어디에도 남기지 않는다(값 칸은 고른 숫자 요약뿐 · 실패하면 HTTP 상태만). ⚠️만(❌ 없음 · 문턱 잠정 — instance.mjs).
//    베타 끝점이라 받기·고르기·기록이 실패하면 이 항목만 ℹ️ — 점검 전체를 막지 않는다.
try {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN 이 없다')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 30000)
  let res, text
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}${METRICS_PATH}`, { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal })
    text = await res.text()
  } finally { clearTimeout(timer) }
  if (!res.ok) throw new Error(`지표 끝점 HTTP ${res.status}`)
  const scraped_at = new Date().toISOString()
  const { values, missing } = pickMetrics(text)
  text = null
  if (values.mem_total == null) throw new Error(`지표 끝점 200 · 고를 계열 없음(${missing.length}/${missing.length + Object.keys(values).length})`)
  const id = await recordInstanceMetrics({ scraped_at, ...values })
  const j = judgeInstance(values)
  add('instance_mem', '인스턴스 메모리(swap · commit)', j.status,
    `${j.value} · 계열 ${Object.keys(values).length}개${missing.length ? `(없음 ${missing.join(',')})` : ''} · 기록 #${id}`, j.rule)
} catch (e) {
  add('instance_mem', '인스턴스 메모리(swap · commit)', 'info', String(e).slice(0, 200), '관리 API 지표 끝점(베타) — 실패면 ℹ️만(점검을 막지 않는다)')
}

if (process.env.SIMULATE === 'fail') add('simulate', '실패 흉내(수동 입력 simulate=fail) — 안 멈추는 실패', 'fail', '시험', '알림 경로 확인용 — 평소에는 없다 · 라벨 health-ops-soft')
// 🔵 2026-10-15(관문 항목별 4) — 멈추는 실패 흉내: gate.mjs HARD 의 simulate_hard → 라벨 health-ops.
if (process.env.SIMULATE === 'fail_hard') add('simulate_hard', '실패 흉내(수동 입력 simulate=fail_hard) — 멈추는 실패', 'fail', '시험', '관문 시험용 — 평소에는 없다 · 라벨 health-ops')
// 🔵 2026-10-08(우편함 「운영 기반 묶음」 4) — notify: 실제 장치와 같은 경로(github-actions 봇 · 라벨 health-ops)로 시험 이슈를 연다 · 다음 통과 실행이 닫는다.
if (process.env.SIMULATE === 'notify') add('simulate', '시험 — 알림 확인(수동 입력 simulate=notify)', 'fail', '다운님 휴대폰 알림 확인용', '알림 경로 확인용 — 다음 통과 실행이 이 이슈를 닫는다')

// ⑪ 경고·실패 DB 기록(2026-10-06 · 우편함 「코드 — 1-B …」 6) — public.ops_health_findings 에 실행 1회당 항목 1행(30일 보관).
//    + 실행 요약 1행(통과 포함) public.ops_health_runs(1-C 3) — 발송(ops_dispatch_log)했는데 요약이 없으면 그 실행은 관리 API를 못 썼다.
//    claude.ai 가 SQL 한 줄로 본다: select * from ops_health_findings order by run_at desc, id; · select * from ops_health_runs order by run_at desc;
//    기록이 실패하면 ⚠️ 경고 하나를 더한다(판정은 결과 파일·이슈가 그대로 낸다 — DB 를 못 읽은 실행이면 기록도 못 한다).
{
  const run_url = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null
  // 🔵 2026-10-06 1-C 3 — 전 항목을 넘긴다: 함수가 경고·실패는 ops_health_findings 에, 실행 요약(통과 포함)은 ops_health_runs 에 1행.
  const all = checks.map(c => ({ id: c.id, name: c.name, status: c.status, value: String(c.value ?? ''), ...(c.blind ? { blind: true } : {}) }))
  try {
    const n = await recordFindings({ at: now.toISOString(), run_url, ref: process.env.GITHUB_REF_NAME || null, checks: all })
    console.log(`경고·실패 기록 ${n}행`)
  } catch (e) {
    add('findings_log', '경고·실패 DB 기록(ops_health_findings)', 'warn', String(e).slice(0, 200), '기록 실패는 ⚠️ 경고만 — 판정은 결과 파일·이슈가 낸다')
  }
}

// 🔵 2026-10-15(관문 항목별 4) — 실패를 멈춤(HARD)·안 멈춤으로 가른다 · issue.sh 가 failed_hard 로 라벨을 고른다(gate.mjs 머리 주석).
for (const c of checks) if (c.status === 'fail') c.gate = c.id === 'runner' ? 'blind' : HARD.has(c.id) ? 'hard' : 'soft'
const g = splitFailed(checks.filter(c => c.status === 'fail').map(c => c.id))
const r = report('ops', 'B. 운영 건강 점검', checks, { daytime: DAYTIME, failed_hard: g.hard, failed_soft: g.soft })
process.exitCode = 0     // 판정은 결과 파일로 넘긴다 — 이슈 단계가 그것을 읽는다
