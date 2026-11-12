// B. 운영 건강 점검 — 사람 손 없이 도는가(런칭 조건 ③). 읽기·알림만 한다.
// 기준값은 2026-09-29 지난 7일 collection_run_log(441런) 분포에서 정했다 — 근거는 각 점검의 rule 칸.
//   주간(UTC 0~9시) 런 간격 p50 10.0분 · p99 10.2분 · 최대 11.1분 / 야간 최대 간격 490분(09:50 → 18:00)
//   소요 p50 50.6초 · p95 57.6초 · 최대 97.2초 / LH 0건 런: 7일 중 하루 1회 / MYHOME 0건 런: 0
//   「상세조회 마감 … 미시도」 오류는 441런 중 193런(하루 최대 59런)이라 런 단위로는 기준이 되지 않는다 →
//   「활성 LH 공고 중 6시간 넘게 상세조회를 시도하지 않은 수」(지금 3)로 잰다.
// 🔴 첫 주는 넉넉하게 — 오탐이 잦으면 알림이 읽히지 않는다.
import { sqlRead, anonRpc, report, recordFindings, recordInstanceMetrics, callRecord, SITE, PROJECT_REF, ANON_KEY } from './lib.mjs'
import { METRICS_PATH, pickMetrics, judgeInstance, swapinRate } from './instance.mjs'
import { YEARLY_SQL, judgeYearly } from './yearly.mjs'
import { SH_RUN_SQL, judgeShRun } from './sh-run.mjs'
import { BACKLOG_SQL, judgeBacklog } from './collect-backlog.mjs'
import { HARD, splitFailed } from './gate.mjs'
import { lhGoneSql, judgeLhGone } from './lh-gone.mjs'
import { waveNoticeSql, judgeWaveNotice } from './wave-notice.mjs'
import { LH_LEASE_MATCH_SQL, judgeLhLeaseMatch } from './lh-lease-match.mjs'
import { chainMatchSql, judgeChainMatch } from './chain-match.mjs'
import { judgeCronNames } from './cron-names.mjs'
import { screenRunSql, judgeScreenRun } from './screen-run.mjs'
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
  'zipfit-purge-cron-run-details',   // 2026-11-02 pg_cron 실행 기록 30일 보관(마이그레이션 2026-11-02_01)
  'zipfit-purge-collection-run-log', // 2026-11-02 LH·MYHOME 수집 런 로그 90일 보관(마이그레이션 2026-11-02_02)
  'zipfit-collect-lh-cutoff',      // 2026-11-04 LH 건설임대 당첨 합격점수 주 1회(마이그레이션 2026-11-04_04 · ㉔ lh_cutoff)
  'zipfit-collect-lh-notices',     // 2026-11-05 LH 대상주택 공지 감지 하루 4회(마이그레이션 2026-11-05_04 · ㉘ wave_notice_missing 값)
  'zipfit-purge-lh-file-fetch-log', // 2026-11-09 LH 첨부 문지기 기록 90일 보관(마이그레이션 2026-11-09_01)
  'zipfit-complex-link-pending', // 2026-11-12 새 분석 공고 단지 잇기 안전망(마이그레이션 2026-11-12_04)
  'zipfit-gh-observe',             // 2026-11-03 GH 공고 목록 관찰(마이그레이션 2026-11-03_04) — 2026-11-09 사본 재추출 때 빠진 것을 더함
  'zipfit-purge-stale-sessions',   // 로그인 세션 30일 정리(jobid 57) — 2026-11-09 사본 재추출 때 빠진 것을 더함
]

// ③④ 관리 API 가 필요 없는 점검(비로그인 목록·요약 · 배포 사이트)은 DB 점검과 다른 try 로 먼저 돈다
//    (2026-10-06 · 우편함 「코드 — 1-C …」 2) — 관리 API 가 죽어 DB 점검이 「점검 실행」(runner) 하나로 끝나도 화면 쪽 결과는 남는다.
try {
  // ③ 비로그인 목록·요약 함수
  // 🔵 2026-11-10(우편함 「코드·운영 — 목록 RPC … 운영 REST 1000행 상한」 · #941) — 전체 행 수를 함께 받는다(count=exact). 응답이 REST 상한
  //    (PostgREST max_rows)에서 잘리면 206 이고 행 수 < 전체다 — 판정은 아래 anon_list_cap(⚠️ · 안 멈춤)이 한다. anon_list 는 206 도 응답으로 친다.
  const list = await anonRpc('get_announcements_deduped', {}, 30000, { count: true })
  const listOk = (list.status === 200 || list.status === 206) && Array.isArray(list.data) && list.data.length > 0
  add('anon_list', '비로그인 get_announcements_deduped', listOk && list.ms <= 10000 ? 'pass' : 'fail',
    `${list.status} · ${Array.isArray(list.data) ? list.data.length : 0}행 · ${list.ms}ms${list.snippet ? ' · ' + list.snippet : ''}`,
    '200 · 행 > 0 · 왕복 ≤ 10초(서버 한도 3초는 200 여부로 잰다 — 넘으면 500. 왕복은 러너↔싱가포르 1.9MB라 넉넉히)')
  // ③-1 REST 상한 — 한 응답 행 수 < 전체 행 수면 화면은 이어 받기(index.html zfListRpc · ?offset=)로 목록 호출을 한 번 더 한다(함수가 한 번 더 돈다).
  //    화면은 맞게 나오므로 ❌ 가 아니라 ⚠️(안 멈춤) — 상한을 올리면(다운님 · Supabase 설정 API 「Max rows」) 다시 한 번 호출로 돌아간다.
  if (listOk) {
    const cut = list.total != null && list.data.length < list.total
    add('anon_list_cap', '목록 응답이 REST 상한에서 잘리나(화면이 이어 받는 중인가)', list.total == null || cut ? 'warn' : 'pass',
      list.total == null ? `전체 행 수 머리(content-range) 없음 · ${list.data.length}행` : `${list.data.length}행 / 전체 ${list.total}행${cut ? ' — 잘림(화면은 ?offset= 으로 이어 받는다 · 목록 호출 2회)' : ''}`,
      '응답 행 수 = 전체 행 수(상한 안) — 잘리면 화면이 목록 함수를 한 번 더 부른다')
  }
  // ③-2 화면이 실제로 보내는 인자 모양 — 칩을 고른 목록(loadNoticeData · matchHouses)은 p_region · p_type 을 붙여 부른다(index.html zfRpcArgs).
  //    🔵 2026-11-04(우편함 「코드·운영 — swap 처방 …」 4 · 처방 6 — 목록 호출 4 → 2) — 종전 셋(명시 null · 지역 · 유형)을 「인자 있는 길」 하나로 합친다.
  //    · 명시 null 모양은 뺀다 — 화면은 2026-10-01 뒤 null 인자를 빼고 보낸다(index.html zfRpcArgs) · 인라인이 막히는 회귀는 마이그레이션 check
  //      (-- zipfit:anon 줄 · 적용 전후 비율 · Function Scan ⚠️)와 탐침(list_rpc_time · 10분)이 잡는다.
  //    · 지역 · 유형은 한 호출에 함께 싣는다 — 인자를 상수로 넘겨 WHERE 가 서버에서 도는 길(판정 의미: 「인자 있는 호출이 3초 한도 안 200 · 행 > 0」)은 같다.
  //      전 칸 응답(위 anon_list)에서 지역·유형을 걸러 나눠 쓰지 않는 이유: 그러면 서버의 인자 길을 한 번도 안 부른다(판정 의미가 바뀐다).
  //    announcement_id 칸만 받는다(?select=) — 받는 양 약 42KB → 그보다 작다.
  {
    const body = { p_region: '경기도', p_type: '국민임대' }
    const x = await anonRpc('get_announcements_deduped?select=announcement_id', body)
    const ok = x.status === 200 && Array.isArray(x.data) && x.data.length > 0
    add('anon_list_args', `비로그인 get_announcements_deduped ${JSON.stringify(body)}`, ok && x.ms <= 10000 ? 'pass' : 'fail',
      `${x.status} · ${Array.isArray(x.data) ? x.data.length : 0}행 · ${x.ms}ms${x.snippet ? ' · ' + x.snippet : ''}`,
      '200 · 행 > 0(서버 한도 3초는 200 여부로 잰다) — 칩을 고른 목록과 같은 인자 길 · 2026-11-04 뒤 명시 null·지역·유형 셋을 이 하나로')
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
      -- 🔵 2026-10-30(우편함 「코드·운영 — 런칭 날 마감」 B · 이슈 #792) — 판정은 「최근 런부터 이어진 0건 런 수」(마지막으로 1건 이상 받은 런 뒤의 런 · 24시간 안).
      --    하루 누적(*_today)은 18:10~18:30 503 세 번 뒤 18:40 회복해도 자정까지 ❌였다 — 누적 수는 값 칸에만 남긴다.
      --    수집이 쉬는 밤(KST 19~09시 — 아침 워밍·야간 1회뿐)에는 마지막 저녁 런들의 상태가 그대로 남는다(끝이 0건 셋이면 아침 첫 정상 런까지 ❌ — 원천이 정말 안 돌아온 것).
      'lh0_streak', (select count(*) from collection_run_log r where r.run_at > now() - interval '24 hours'
         and r.run_at > coalesce((select max(run_at) from collection_run_log where coalesce(lh_fetched,0) > 0 and run_at > now() - interval '24 hours'), '-infinity'::timestamptz)),
      'mh0_streak', (select count(*) from collection_run_log r where r.run_at > now() - interval '24 hours'
         and r.run_at > coalesce((select max(run_at) from collection_run_log where coalesce(myhome_fetched,0) > 0 and run_at > now() - interval '24 hours'), '-infinity'::timestamptz)),
      'detail_stale', (select count(*) from announcements where source='LH' and status in ('공고중','접수중','정정공고중')
         and (detail_fetch_last_attempt is null or detail_fetch_last_attempt < now() - interval '6 hours')),
      'jobs', (select json_agg(json_build_object('name', jobname, 'active', active, 'md5', md5(command))) from cron.job),
      'job_fail_24h', (select json_agg(json_build_object('name', j.jobname, 'n', x.n)) from (select jobid, count(*) n from cron.job_run_details
         where start_time > now() - interval '24 hours' and status not in ('succeeded','running','starting') group by jobid) x join cron.job j using (jobid)),
      'promo_last_run_age_min', (select extract(epoch from now() - max(d.start_time))/60 from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'zipfit-collect-lh-promo'),
      'promo_fail_24h', (select count(*) from announcement_promo_fetch where not ok and fetched_at > now() - interval '24 hours'),
      'images_last_run_age_min', (select extract(epoch from now() - max(d.start_time))/60 from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'zipfit-collect-lh-images'),
      'images_fail_24h', (select count(*) from announcement_complex_image_fetch where not ok and fetched_at > now() - interval '24 hours'),
      'sh_last_run_age_min', (select extract(epoch from now() - max(run_at))/60 from sh_collection_run_log),
      -- 🔵 2026-11-03(우편함 「GH 수집 켜기 1단계」 ④) — GH(경기주택도시공사) 수집기: cron 이 붙기 전(1단계)이라 정보만 · 들인 공고 행은 0 이어야 한다.
      -- 🔵 2026-11-03(「GH 2-0 관찰 장치」 2) — 관찰 cron(zipfit-gh-observe) 뒤: 최근 행 · 그 행 목록 오류 수 · 열린 공고 수 · 새로/사라짐.
      'gh', (select json_build_object('last_run_age_min', (select extract(epoch from now() - max(run_at))/60 from gh_collection_run_log),
                 'last', (select json_build_object('mode', mode, 'errors', jsonb_array_length(errors), 'open', jsonb_array_length(observed),
                                                   'appeared', jsonb_array_length(appeared), 'disappeared', jsonb_array_length(disappeared))
                            from gh_collection_run_log order by id desc limit 1),
                 'runs_24h', (select count(*) from gh_collection_run_log where run_at > now() - interval '24 hours'),
                 'rows', (select count(*) from announcements where source = 'GH'),
                 'job', (select count(*) from cron.job where jobname ~ '(^|-)gh-'))),
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
             join announcements a on a.announcement_id = z.card_id where z.closed_mismatch and a.status <> '접수마감'
               -- 🔵 2026-10-29(우편함 「코드·운영 — 런칭 전날」 1) — 자연 마감은 세지 않는다: 카드 접수 끝이 오늘(KST)보다 앞 ∧ 끝 날짜가 같음(end_diff 참 아님).
               --    카드가 「열림」으로 남은 것은 MYHOME 대표 status 「공고중」이 굳은 탓(10-29 태백철암1 …20735 · 대표 21199_1 apply_end 10-28)이지 원문과 갈린 것이 아니다.
               --    백로그 「원문 키 사이클」 트리거 식과 같은 조건(claude.ai 10-29).
               and not (coalesce(z.card_apply_end < (now() at time zone 'Asia/Seoul')::date, false) and z.end_diff is not true)),
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
      -- 🔵 2026-10-28(우편함 「코드·운영 — 런칭 뒤 첫 주 DB 쪽 묶음」 2 · 백로그 「첨부를 못 받는 공고는 …」) — 첨부 0 · 미분석 열린 대표.
      --    발송기 후보(analysis_dispatch_tick cand)와 dispatch_orphan 이 같은 「묶음 첨부 > 0」 조건이라, 첨부를 못 받는 호스트의 공고는 어디에도 안 잡힌다.
      --    열린 대표(apply_end ≥ 오늘) ∧ 같은 묶음(링크 키 포함) 첨부 0 ∧ 완료 계열 분석 0 ∧ 접수 시작이 오늘+14일 안(이미 시작 포함 · NULL 은 빼지 않고 센다).
      'attach0_unanalyzed', (with lm as (select distinct on (l.linked_announcement_id) l.linked_announcement_id aid, announcement_dedup_key(lh.title) lh_key
             from announcement_post_links l join announcements lh on lh.announcement_id = l.lh_announcement_id
            where lh.title is not null and lh.hidden_from_listing is not true order by l.linked_announcement_id, l.lh_announcement_id),
           kd as materialized (select a.announcement_id, a.attachment_urls, coalesce(lm.lh_key, announcement_dedup_key(a.title)) k
             from announcements a left join lm on lm.aid = a.announcement_id where a.title is not null and a.hidden_from_listing is not true),
           rp as materialized (select d.announcement_id, d.supply_org, d.apply_start, kd.k
             from get_announcements_deduped() d join kd using (announcement_id) where d.apply_end >= (now() at time zone 'Asia/Seoul')::date)
         select coalesce(json_agg(json_build_object('id', rp.announcement_id, 'org', rp.supply_org, 'start', rp.apply_start) order by rp.apply_start nulls first, rp.announcement_id), '[]'::json) from rp
          where (rp.apply_start is null or rp.apply_start <= (now() at time zone 'Asia/Seoul')::date + 14)
            and (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0) from kd g where g.k = rp.k and jsonb_typeof(g.attachment_urls) = 'array') = 0
            and not exists (select 1 from kd g join announcement_analysis aa using (announcement_id)
                             where g.k = rp.k and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)'))),
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
  add('portal_lh0', '최근 런부터 이어진 LH 목록 0건 런', d.lh0_streak < 3 ? 'pass' : 'fail', `연속 ${d.lh0_streak} · 오늘(KST) 누적 ${d.lh0_today}`, '연속 < 3(30분 · 하루 누적은 값만 — 2026-10-30 #792)')
  add('portal_mh0', '최근 런부터 이어진 MYHOME 목록 0건 런', d.mh0_streak < 3 ? 'pass' : 'fail', `연속 ${d.mh0_streak} · 오늘(KST) 누적 ${d.mh0_today}`, '연속 < 3(30분 · 하루 누적은 값만 — 2026-10-30 #792)')
  if (hourUtc >= 1 && hourUtc <= 10) {
    add('portal_detail', '활성 LH 공고 중 6시간 넘게 상세조회 안 된 수', d.detail_stale <= 5 ? 'pass' : 'fail', d.detail_stale, '≤ 5(백로그 기준 · 2026-09-29 3)')
  } else {
    add('portal_detail', '활성 LH 공고 중 6시간 넘게 상세조회 안 된 수', 'skip', d.detail_stale, '주간(UTC 1~10시)에만 판정 — 밤에는 상세조회가 쉰다')
  }
  // ⑤ cron 잡 · 매입 홍보물 수집
  const jobs = new Map((d.jobs || []).map(j => [j.name, j.active]))
  const missing = EXPECTED_JOBS.filter(n => jobs.get(n) !== true)
  add('cron_active', 'cron 잡 활성', missing.length === 0 ? 'pass' : 'fail', missing.length ? `비활성·없음: ${missing.join(', ')}` : `${EXPECTED_JOBS.length}개 모두 활성`, '기대 목록 전부 active')
  // 🔵 2026-11-09(「모드 정의 하나 …」 2장 · #918 ⑦3) — 이름 집합 = 기대 목록 = 사본(docs/cron-jobs.sql · 명령 md5) · ⚠️ 경고만 · gate.mjs HARD 밖.
  {
    let sheet = null
    try { sheet = readFileSync(new URL('../../docs/cron-jobs.sql', import.meta.url), 'utf8') } catch { sheet = null }
    const j = judgeCronNames(d.jobs || [], EXPECTED_JOBS, sheet)
    add('cron_names', 'cron 잡 이름 집합(DB = 기대 목록 = 사본)', j.status, j.value, j.rule)
  }
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
  // 2026-11-03 GH — 1단계(정보) → 2-0 관찰 장치(「GH 2-0 관찰 장치」 2): 최근 행 ≤ 960분 ∧ 그 행 목록 오류 0 이면 통과 · 아니면 ⚠️
  //   (실패 아님 — GH 카드 0 이라 사용자 영향이 없다 · 공고 행은 0 이어야 한다).
  {
    const g = d.gh || {}
    const l = g.last || {}
    const ok = g.last_run_age_min != null && g.last_run_age_min <= 960 && l.errors === 0
    add('gh_runs', 'GH(경기주택도시공사) 관찰 — 최근 런 · 목록 오류 · 들인 공고 행', ok ? 'pass' : 'warn',
      `최근 런 ${g.last_run_age_min == null ? '없음' : Math.round(g.last_run_age_min) + '분 전'}(${l.mode ?? '?'}) · 목록 오류 ${l.errors ?? '?'} · 열린 ${l.open ?? '?'} · 새로 ${l.appeared ?? '?'} · 사라짐 ${l.disappeared ?? '?'} · 24시간 런 ${g.runs_24h ?? '?'} · 공고 행 ${g.rows ?? '?'} · cron ${g.job ?? '?'}`,
      '최근 런 ≤ 960분(하루 4회 09·12·15·18시 31분 KST) ∧ 목록 오류 0 — 아니면 ⚠️(카드 0 · 2-0 은 관찰만 · 공고 행 0)')
  }
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
  // ⑧-2a′ 첨부 0 · 미분석 열린 대표(2026-10-28 · 우편함 「코드·운영 — 런칭 뒤 첫 주 DB 쪽 묶음」 2) — 발송기·dispatch_orphan 이 둘 다 「묶음 첨부 > 0」을 보아
  //    첨부를 못 받는 호스트(나라키움 kohom · 제천 cbdc — 그 기관의 DB 첫 행)의 공고는 조용히 미분석으로 남았다(화면은 「꼭집 미분석」 표지).
  //    🔴 ⚠️ 경고만이다(이슈를 열지 않는다 · gate.mjs HARD 밖) — 고치는 길이 사람 손(원문 1회 받기 · 호스트 허용)이라 루틴을 멈출 까닭이 없다.
  //    기대값(2026-10-28 15:4x KST 관리 API 실측): 열린 대표 68 중 2 — 21471_1_서울특별시_영등포구(한국자산관리공사 · 접수 11-09) · 18430_1_충청북도_제천시(충북개발공사 · 2025-07-03 시작 상시).
  {
    const xs = d.attach0_unanalyzed || []
    add('attach0_unanalyzed', '첨부 0 · 미분석 열린 대표(접수 시작 14일 안) — 원문을 사람이 받아야 함', xs.length === 0 ? 'pass' : 'warn',
      xs.length ? `${xs.length}: ${xs.slice(0, 5).map(x => `${x.id}(${x.org ?? '기관 없음'} · ${x.start ?? '시작 모름'})`).join(', ')}` : 0,
      '0 — 대표 ∧ apply_end ≥ 오늘 ∧ (apply_start ≤ 오늘+14 ∨ NULL) ∧ 같은 묶음(링크 키 포함) 첨부 0 ∧ 완료 계열 분석 0 · 넘으면 ⚠️ 경고만(이슈를 열지 않는다 — 발송기가 집지 못하는 공고를 알리는 자리)')
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
      '0 — 키마다 26시간 안 마지막 대조 · 카드가 아직 열림 · 자연 마감(카드 접수 끝 < 오늘 KST ∧ 끝 날짜 같음)은 뺀다 · 넘으면 ⚠️ 경고만(값 반영은 2단계)')
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

// ㉑ 엣지 요청 일일 셈(2026-11-04 · 우편함 「코드·운영 — swap 처방 …」 5 · 조사 「DB 인스턴스 swap 증가」 ⑦1) — 실사용 성장을 우리 장치 요청과 떼어 읽는다.
//    KST 하루(전날)의 edge_logs 요청 수를 「전체 · 헤드리스(UA HeadlessChrome) · 스크립트(curl·python·Deno·pg_net·node 등) · 나머지」 개수로만 세어
//    zipfit_ops.edge_request_daily 에 한 행(🔴 UA·IP·경로 값은 SELECT 결과에도 없다 — countIf 만 · 원칙 36).
//    언제: KST 01시 뒤 실행마다 「지난 7일 중 아직 못 센 날」을 새 날부터 최대 2개 — 셌으면 그날은 다시 안 센다(하루 평시 로그 조회 1회).
//    로그 끝점 429·오류는 ok=false(개수 NULL · 0 으로 적지 않음)로 남기고 다음 실행이 다시 센다 · 429 면 그 실행은 더 묻지 않는다.
//    ℹ️만(판정 없음 · gate.mjs HARD 밖).
const EDGE_SCRIPT_RE = '(?i)(curl/|python|aiohttp|node-fetch|undici|axios/|go-http-client|deno|wget/|okhttp|java/|libwww|postmanruntime|pg_net|[^a-z0-9_-]node[^a-z0-9_-])'
try {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN 이 없다')
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  const today = kst.toISOString().slice(0, 10)
  const days = []
  for (let i = 1; i <= 7; i++) days.push(new Date(Date.parse(today + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10))
  const have = await sqlRead(`select day::text d, ok, total, headless, script, other, tries from zipfit_ops.edge_request_daily where day >= '${days[6]}'::date order by day`)
  const okDays = new Set(have.filter(r => r.ok).map(r => r.d))
  const todo = kst.getUTCHours() >= 1 ? days.filter(d => !okDays.has(d)).slice(0, 2) : []
  const done = []
  for (const d of todo) {
    const start = new Date(Date.parse(d + 'T00:00:00Z') - 9 * 3600 * 1000).toISOString()
    const end = new Date(Date.parse(d + 'T00:00:00Z') + 15 * 3600 * 1000).toISOString()
    const sql = `select count() total, countIf(event_message like '%HeadlessChrome%') headless,
      countIf(event_message not like '%HeadlessChrome%' and match(event_message, '${EDGE_SCRIPT_RE}')) script
      from logs where source = 'edge_logs'`
    const q = new URLSearchParams({ sql, iso_timestamp_start: start, iso_timestamp_end: end })
    let rec
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs?${q}`, { headers: { Authorization: `Bearer ${token}` } })
    const text = await res.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = null }
    if (res.ok && body && !body.error && Array.isArray(body.result) && body.result[0]) {
      const r = body.result[0]
      rec = { day: d, ok: true, total: Number(r.total), headless: Number(r.headless), script: Number(r.script), note: '관리 API 로그 edge_logs' }
    } else {
      rec = { day: d, ok: false, note: `못 셈 — 로그 끝점 ${res.status}${body && body.error ? ' ' + String(body.error).slice(0, 80) : ''}` }
    }
    const out = await callRecord('zipfit_ops.edge_request_daily_record', rec)
    done.push(`${d.slice(5)} ${rec.ok ? `${rec.total}(헤드리스 ${rec.headless} · 스크립트 ${rec.script})` : rec.note}${out === 'kept' ? ' · 앞 셈 유지' : ''}`)
    if (res.status === 429) break
  }
  const y = done.length ? null : have.find(r => r.d === days[0])
  add('edge_daily', '엣지 요청 일일 셈(전날 KST · 개수만)', 'info',
    done.length ? `이번에 셈 ${done.join(' · ')}`
      : y && y.ok ? `${days[0].slice(5)} 전체 ${y.total} · 헤드리스 ${y.headless} · 스크립트 ${y.script} · 나머지 ${y.other}`
      : `${days[0].slice(5)} 아직 못 셈(${kst.getUTCHours() < 1 ? 'KST 01시 전' : '다음 실행이 다시'})`,
    '판정 없음(ℹ️) — zipfit_ops.edge_request_daily · 지난 7일 중 못 센 날을 실행마다 최대 2개 · 429 는 못 셈으로 남기고 다음 실행이 다시')
} catch (e) {
  add('edge_daily', '엣지 요청 일일 셈(전날 KST · 개수만)', 'info', String(e).slice(0, 200), '관리 API 로그(edge_logs) · 실패면 ℹ️만')
}

// ㉞ 이용 기록 UA 갈래 일일 셈(2026-11-09 · 우편함 「코드·운영 — 모드 정의 하나 … · 이용 기록 갈라 보이기 …」 3장 ② · 조사 「이용 기록 자동 세션 원인」 ⑦1) —
//    KST 하루(전날)의 엣지 로그 POST /rest/v1/usage_events 요청을 「시각 + 갈래(봇·헤드리스·스크립트·그 밖)」로만 받아(UA 원문은 질의 결과에 없다)
//    zipfit_ops.usage_ua_daily_record 에 넘긴다 — 이용 기록과 ±2초로 맞대 세션 갈래 개수를 남기는 일은 DB 함수 안에서만(세션 id 는 DB 밖으로 안 나온다 · 원칙 36).
//    언제: ㉑ 과 같다 — KST 01시 뒤 실행마다 지난 7일 중 못 센 날을 새 날부터 최대 2개(하루 평시 로그 조회 1 · DB 호출 1). 값 = 지난 7일 합. ℹ️만(gate.mjs HARD 밖).
const UA_BOT_RE = '(?i)(bot|crawler|spider|slurp|google-inspectiontool|yeti|daum|facebookexternalhit|kakaotalk-scrap|bytespider|headless-shell)'
try {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN 이 없다')
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  const today = kst.toISOString().slice(0, 10)
  const days = []
  for (let i = 1; i <= 7; i++) days.push(new Date(Date.parse(today + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10))
  const have = await sqlRead(`select day::text d, ok from zipfit_ops.usage_ua_daily where day >= '${days[6]}'::date`)
  const okDays = new Set(have.filter(r => r.ok).map(r => r.d))
  const todo = kst.getUTCHours() >= 1 ? days.filter(d => !okDays.has(d)).slice(0, 2) : []
  const done = []
  for (const d of todo) {
    const start = new Date(Date.parse(d + 'T00:00:00Z') - 9 * 3600 * 1000).toISOString()
    const end = new Date(Date.parse(d + 'T00:00:00Z') + 15 * 3600 * 1000).toISOString()
    const sql = `select toString(timestamp) t, multiIf(event_message like '%HeadlessChrome%', 'h', match(event_message, '${UA_BOT_RE}'), 'b',
        match(event_message, '${EDGE_SCRIPT_RE}'), 's', 'o') c
      from logs where source = 'edge_logs' and event_message like '%POST%' and event_message like '%/rest/v1/usage_events%' order by timestamp limit 10000`
    const q = new URLSearchParams({ sql, iso_timestamp_start: start, iso_timestamp_end: end })
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs?${q}`, { headers: { Authorization: `Bearer ${token}` } })
    const text = await res.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = null }
    let rec
    if (res.ok && body && !body.error && Array.isArray(body.result) && body.result.length < 10000) {
      rec = { day: d, ok: true, hits: body.result.map(r => ({ t: String(r.t).slice(0, 23), c: r.c })), note: '관리 API 로그 edge_logs ↔ usage_events ±2초' }
    } else {
      rec = { day: d, ok: false, note: `못 셈 — 로그 끝점 ${res.status}${body && body.error ? ' ' + String(body.error).slice(0, 80) : ''}${body && Array.isArray(body.result) && body.result.length >= 10000 ? ' 1만 행 넘음' : ''}` }
    }
    const out = await callRecord('zipfit_ops.usage_ua_daily_record', rec)
    done.push(`${d.slice(5)} ${rec.ok ? out : rec.note}`)
    if (res.status === 429) break
  }
  const [w] = await sqlRead(`select count(*) filter (where ok) days, sum(sessions) s, sum(ops) ops, sum(bot) bot, sum(headless) hl, sum(script) sc,
      sum(other) other, sum(other_heavy) heavy, sum(events) ev, sum(matched) m from zipfit_ops.usage_ua_daily where day >= '${days[6]}'::date and ok`)
  add('usage_ua', '이용 기록 세션 UA 갈래(지난 7일 · 개수만)', 'info',
    `${w.days}일 — 세션 ${w.s ?? 0}: 운영 표지 ${w.ops ?? 0} · 봇 ${w.bot ?? 0} · 헤드리스 ${w.hl ?? 0} · 스크립트 ${w.sc ?? 0} · 그 밖 ${w.other ?? 0}(열기 30회 이상 ${w.heavy ?? 0}) · 사건 ${w.ev ?? 0} 중 로그와 맞음 ${w.m ?? 0}${done.length ? ` · 이번에 셈 ${done.join(' · ')}` : ''}`,
    '판정 없음(ℹ️) — zipfit_ops.usage_ua_daily · 갈래 우선순위 운영 표지 > 봇 > 헤드리스 > 스크립트 > 그 밖 · 자정을 넘는 세션은 두 날에 센다 · 지난 7일 중 못 센 날을 실행마다 최대 2개')
} catch (e) {
  add('usage_ua', '이용 기록 세션 UA 갈래(지난 7일 · 개수만)', 'info', String(e).slice(0, 200), '관리 API 로그(edge_logs) · 실패면 ℹ️만')
}

// ㉒ 세대 행 시군구가 「시」만인데 같은 행 주소에 그 시 + 「△△구」가 있다(2026-11-04 · 우편함 「코드·운영 — 가격 요약 RPC known_sg …」 3 · 재발 감시).
//    산식 = 분석 묶음 「세대 행 시군구 … 829행」과 같다: btrim(sigungu_nm) ~ '시$' ∧ address ~ (sigungu_nm || '\s*\S+구(\s|$)') — 기대값 0(그 회차 664행 + 이 회차 165행 뒤).
//    0이 아니면 ⚠️ + 공고 ID 상위 5(행 수 순). 원인은 분석이 세대 행 시군구를 시까지만 적은 것(스킬 규칙 없음 — 백로그 「공고 분석 스킬 개정 후보」 11-04 줄).
//    안 멈춤(⚠️만 · gate.mjs HARD 밖) · 쿼리 하나(housing_units 전 행 · 결과 한 줄).
try {
  const [x] = await sqlRead(`with t as (select h.announcement_id aid from public.housing_units h
      where btrim(h.sigungu_nm) ~ '시$' and h.address ~ (btrim(h.sigungu_nm) || '\\s*\\S+구(\\s|$)'))
    select (select count(*) from t)::int n, (select count(distinct aid) from t)::int a,
      (select coalesce(string_agg(aid || '(' || c || ')', ', ' order by c desc, aid), '') from (select aid, count(*) c from t group by aid order by c desc, aid limit 5) z) top`)
  add('unit_sigungu_city_only', '세대 행 시군구가 「시」만(주소에 같은 시 + 구 있음)', x.n > 0 ? 'warn' : 'pass',
    x.n > 0 ? `${x.n}행 · ${x.a}공고 — ${x.top}` : '0',
    '0 — 넘으면 ⚠️(안 멈춤) · 같은 행 주소 원문의 「시 구」로 고칠 몫(분석 묶음 2026-11-04 산식)')
} catch (e) {
  add('unit_sigungu_city_only', '세대 행 시군구가 「시」만(주소에 같은 시 + 구 있음)', 'warn', String(e).slice(0, 200), 'housing_units 를 읽는다(못 읽으면 ⚠️)')
}

// ㉔ LH 합격점수 수집(2026-11-04 · 우편함 「코드·운영 — LH 건설임대 당첨 합격점수 수집 장치」 4 · ⚠️만 · gate.mjs HARD 밖) —
//    lh_cutoff_run_log 의 years_ago = 0(주 1회 정기 · 최근 1년 창) 마지막 런: 8일 넘게 없음 · 시도 호출 실패(ok_calls < calls) · errors 비지 않음 = ⚠️.
//    거름 위반(남긴 글자 중 금지 낱말 · 신청 5명 이하 · 상태 불일치) = 0 이 아니면 ⚠️(CHECK 가 막으므로 0 이 정상 — 거름이 풀리면 보이게).
//    표 행 수 = 마지막 정기 런 직전 런(소급 포함)의 total_after 와의 차(값만 — 5년 소급 뒤 첫 정기 런이 소급 전 값과 견주지 않게). 표·런이 없으면(적용 전 · 첫 정기 런 전) ℹ️ · 표가 있을 때만 둘째 쿼리(실행당 관리 API +1~2).
try {
  const [t] = await sqlRead(`select to_regclass('public.lh_cutoff_run_log') is not null as ok`)
  const [x] = !t.ok ? [{ j: null }] : await sqlRead(`select jsonb_build_object(
      'runs', (select count(*) from public.lh_cutoff_run_log),
      'last', (select to_jsonb(r) - 'errors' || jsonb_build_object('errors', jsonb_array_length(r.errors), 'age_h', round(extract(epoch from now() - r.run_at) / 3600))
                 from public.lh_cutoff_run_log r where r.years_ago = 0 order by r.id desc limit 1),
      'prev_total', (select p.total_after from public.lh_cutoff_run_log p where p.id < (select max(r.id) from public.lh_cutoff_run_log r where r.years_ago = 0) order by p.id desc limit 1),
      'rows', (select count(*) from public.lh_cutoff_scores),
      'bad', (select count(*) from public.lh_cutoff_scores where (cutoff_text is not null and (coalesce(rqpr_cnt, 0) <= 5 or cutoff_text ~ '(전입|연령|나이|세대구성원|자녀|여부|당해지역|당해단지|거주기간|생년|출생|장애|추천순번)'))
                                                             or ((cutoff_state = 'ok') <> (cutoff_text is not null)))
    ) as j`)
  const c = x.j
  if (!c) add('lh_cutoff', 'LH 합격점수 수집(주 1회) · 거름 위반', 'info', '표 없음(마이그레이션 2026-11-04_04 적용 전)', '적용 뒤 판정')
  else if (!c.last) add('lh_cutoff', 'LH 합격점수 수집(주 1회) · 거름 위반', c.bad ? 'warn' : 'info', `정기 런 전 · 행 ${c.rows} · 거름 위반 ${c.bad} · 런 ${c.runs}(소급 포함)`, '첫 정기 런(월 05:13 KST) 뒤 판정 · 거름 위반은 지금도 0 이 정상')
  else {
    const L = c.last, bad = []
    if (L.age_h > 192) bad.push(`마지막 정기 런 ${L.age_h}시간 전`)
    if (L.ok_calls < L.calls) bad.push(`시도 호출 실패 ${L.calls - L.ok_calls}/${L.calls}`)
    if (L.errors) bad.push(`errors ${L.errors}`)
    if (c.bad) bad.push(`거름 위반 ${c.bad}`)
    const delta = c.prev_total != null && L.total_after != null ? L.total_after - c.prev_total : null
    add('lh_cutoff', 'LH 합격점수 수집(주 1회) · 거름 위반', bad.length ? 'warn' : 'pass',
      `${bad.length ? bad.join(' · ') + ' · ' : ''}행 ${c.rows}(직전 런 대비 ${delta == null ? '—' : (delta >= 0 ? '+' : '') + delta}) · 마지막 ${L.window_from}~${L.window_to} 받음 ${L.rows_in} · 남김 ${L.kept} · 거름 ${L.dropped_filter} · 5명 이하 ${L.dropped_small} · ${L.age_h}시간 전`,
      '정기 런 ≤ 8일 ∧ 시도 호출 실패 0 ∧ errors 0 ∧ 거름 위반 0 — 넘으면 ⚠️(안 멈춤) · 행 수 증감은 값만')
  }
} catch (e) {
  add('lh_cutoff', 'LH 합격점수 수집(주 1회) · 거름 위반', 'warn', String(e).slice(0, 200), 'lh_cutoff_run_log · lh_cutoff_scores 를 읽는다(못 읽으면 ⚠️)')
}

// ㉛ 기본 임대조건 ↔ LH 합격점수 API 대조(2026-11-05) — 판정·SQL 은 lh-lease-match.mjs 머리 주석. ℹ️ 정보만 · 표가 없거나 못 읽어도 ℹ️(판정 전 단계).
try {
  const [x] = await sqlRead(LH_LEASE_MATCH_SQL)
  const j = judgeLhLeaseMatch(x.j)
  add('lh_lease_match', 'LH 합격점수 API 기본 임대조건 ↔ 세대 행(열린 국민·영구·통합공공 · 정보)', j.status, j.value, j.rule)
} catch (e) {
  add('lh_lease_match', 'LH 합격점수 API 기본 임대조건 ↔ 세대 행(열린 국민·영구·통합공공 · 정보)', 'info', String(e).slice(0, 200), '목록 RPC · 합격점수 · 세대 표를 읽는다(못 읽어도 정보)')
}

// ㉜ 커트라인 사슬 규칙 두 곳 대조(2026-11-05) — 판정·SQL 은 chain-match.mjs 머리 주석. 같으면 ℹ️ · 다르면 ⚠️ · 못 읽으면 ⚠️ 점검 불능.
try {
  const [x] = await sqlRead(chainMatchSql())
  const j = judgeChainMatch(x.j)
  add('cutoff_chain_match', '회차 사슬 두 곳(상세 get_announcement_round_chain_ids ↔ 커트라인 get_announcement_cutoff_rounds) 열린 카드 짝 대조', j.status, j.value, j.rule)
} catch (e) {
  addBlind('cutoff_chain_match', '회차 사슬 두 곳 대조 — 점검 불능', 'warn', String(e).slice(0, 200), '목록 RPC · 회차 링크 · 사본 파일을 읽는다(못 읽으면 ⚠️)')
}

// ㉝ LH 첨부 경로 쓰임 가름(2026-11-05 · 우편함 「코드·운영 — LH 첨부 경로(lhFile.do) 사용 중단 …」 「🔴 요청 고침」 2장) — 모드(analysis_dispatch_config.lh_file_mode) ·
//    지난 24시간 lhFile.do 받기 시도(lh_file_fetch_log — fetch-attachment 문지기 lh_file_gate 가 남긴 행): 허락(받음 · 실패) · 막음(사유별) — LH 문의 글에 넣을 실측 빈도 ·
//    발송 대기 몫(paused = LH 원문 몫(#차수 포함) · essential·normal = 0 — 발송기와 같은 조건 · 2026-11-09 essential 은 #차수를 거두지 않음). ℹ️ 정보만 · 못 읽어도 ℹ️.
//    🔵 2026-11-09(「모드 정의 하나」 1장) — 모드·대기 몫은 DB 함수 lh_file_policy() · analysis_lh_file_hold() 를 부른다(발송기·문지기와 한 정의 · 여기서 모드 이름을 비교하지 않는다).
try {
  const [x] = await sqlRead(`with l as (select * from public.lh_file_fetch_log where at > now() - interval '24 hours'),
     m as (select public.lh_file_policy()->>'mode' v)
  select json_build_object(
      'mode', (select v from m),
      'allowed', (select count(*) from l where allowed), 'ok', (select count(*) from l where allowed and outcome = 'ok'),
      'denied', (select count(*) from l where not allowed),
      'reasons', (select coalesce(json_agg(json_build_object('r', reason, 'n', n) order by n desc), '[]'::json) from (select reason, count(*) n from l where not allowed group by 1) z),
      'held', (select count(*) from public.analysis_dispatch_queue q where q.state = 'waiting' and q.ready_at is null
                 and public.analysis_lh_file_hold(q.announcement_id, q.group_key))) j`)
  const c = x.j
  const rs = c.reasons.slice(0, 4).map(r => `${String(r.r).replace(/^\w+ — /, '')} ${r.n}`).join(' · ')
  add('lh_file_mode', 'LH 첨부 경로(lhFile.do) 쓰임 가름 · 24시간 받기 시도(정보)', 'info',
    `모드 ${c.mode} — 허락 ${c.allowed}(받음 ${c.ok}) · 막음 ${c.denied}${rs ? '(' + rs + ')' : ''} · 발송 대기 몫 ${c.held}`,
    '정보 — 판정하지 않는다 · 모드 essential = 열린 공고 첨부만 파일당 한 번(+재시도 한 번) · #차수 몫은 발송(공지 첨부는 막고 본문으로) · paused = 전부 막음(LH 원문 몫 · #차수 몫 발송 대기 — 「발송 대기 몫」이 그 수) · normal = 종전(2026-11-10 복원 · 몰림 막기 · 차단 감지 — ㉞ lh_file_block) · 셈 = lh_file_fetch_log 24시간')
} catch (e) {
  add('lh_file_mode', 'LH 첨부 경로(lhFile.do) 쓰임 가름 · 24시간 받기 시도(정보)', 'info', String(e).slice(0, 200), '설정 · 받기 기록 · 대기열 표를 읽는다(못 읽어도 정보)')
}

// ㉞ LH 첨부 차단 감지(2026-11-10 · 우편함 「코드·운영 — LH 첨부 문지기 복원(멈춤 전 꼴 + 몰림 막기 + 차단 감지) …」 3) —
//    lh_file_gate_done 이 결과가 차단 꼴(upstream_403 · upstream_429 · conn_error · html_response)인 허락 받기가 연속 lh_file_block_streak 번이면
//    그 자리에서 lh_file_mode = 'paused' 로 바꾸고 lh_file_block_at · lh_file_block_reason 을 남긴다. 그 표지가 서 있는 동안 ❌(안 멈춤 · gate.mjs HARD 밖 →
//    health-ops-soft 이슈 — ⚠️ 는 이슈를 열지 않아서) · 다시 켜기는 사람(lh_file_mode = 'normal' · lh_file_block_at = null — 데이터 쓰기).
//    값에 24시간 받기 수 · 차단 꼴 결과 수 · 받기 사이 간격(중앙 · 최소 — 몰림 막기 실측)을 함께 싣는다. 못 읽으면 ⚠️ 점검 불능.
try {
  const [x] = await sqlRead(`with l as (select * from public.lh_file_fetch_log where at > now() - interval '24 hours' and allowed),
     o as (select extract(epoch from at - lag(at) over (order by at)) * 1000 gap from l),
     c as (select lh_file_mode m, lh_file_block_at b, lh_file_block_reason r from public.analysis_dispatch_config where id = 1)
  select json_build_object('mode', (select m from c), 'block_at', (select b from c), 'block_reason', (select r from c),
      'fetched', (select count(*) from l), 'blocky', (select count(*) from l where outcome ~ '^(upstream_(403|429)|conn_error|html_response)'),
      'gap_p50', (select round(percentile_cont(0.5) within group (order by gap)) from o where gap is not null),
      'gap_min', (select round(min(gap)) from o where gap is not null),
      'pol', public.lh_file_policy()) j`)
  const c = x.j
  const gaps = c.fetched > 1 ? ` · 받기 사이 중앙 ${c.gap_p50}ms · 최소 ${c.gap_min}ms` : ''
  const rule = '차단 감지로 스스로 멈춘 표지(lh_file_block_at) 없음 — 서 있으면 ❌(안 멈춤 · 이슈) · 다시 켜기는 사람(lh_file_mode normal · lh_file_block_at null) · 몰림 막기 = 동시 1 · 받기 사이 최소 gap_ms · 10분 상한 cap_10min(lh_file_policy)'
  if (c.block_at) add('lh_file_block', 'LH 첨부(lhFile.do) 차단 감지 — 스스로 멈춤', 'fail', `${c.block_at} 멈춤 · 모드 ${c.mode} · ${c.block_reason || ''}`.slice(0, 300), rule)
  else add('lh_file_block', 'LH 첨부(lhFile.do) 차단 감지 — 스스로 멈춤', 'pass',
    `모드 ${c.mode} · 24시간 받기 ${c.fetched} · 차단 꼴 결과 ${c.blocky}${gaps} · 간격 ${c.pol?.gap_ms}ms · 10분 상한 ${c.pol?.cap_10min} · 연속 ${c.pol?.block_streak}`, rule)
} catch (e) {
  addBlind('lh_file_block', 'LH 첨부(lhFile.do) 차단 감지 — 점검 불능', 'warn', String(e).slice(0, 200), '설정 · 받기 기록 표를 읽는다(못 읽으면 ⚠️)')
}

// ㉟ 공고끼리 같은 요약 정책 행 묶음(2026-11-10 · 우편함 「코드·운영 — 꼭 볼 것 key_rank 칸 … · 0장」 4 · 역전파 4회차 1 「의심 꼴」) — ℹ️ 셈만(판정하지 않는다).
//    묶음 = content_raw(앞뒤 공백 뺀 것) md5 가 같은 정책 행 · 일정·⚠️·모집일정 밖 · 서로 다른 공고 둘 이상.
//    의심 꼴 = 그 묶음 행이 전부 2026-09-18 이전에 만들어졌고 원문 파일(source_file)이 둘 이상 다름 — 다른 원문에서 글자째 같은 요약(옛 배치 요약 의심).
//    역전파 회차가 공고마다 자기 원문으로 고치면 줄어든다(2026-11-10 46묶음 · 176행). 표준 공고문 문장의 정상 겹침(전체 묶음)은 값에 함께 보인다.
//    🔵 2026-11-11(우편함 「코드·운영 — 0장 여섯 …」 2) — 원문 대조를 마친 행은 뺀다: source_page 가 찼거나 · 같은 묶음(get_announcement_group_ids — 분석 행이
//       MYHOME 블록 ID 에 있는 경우)의 분석 행 pending_fields 에 「정책 「<분류>」 … 원문 문장으로」 기록이 있는 (공고, 분류). 역전파가 원문으로 고친 표준 문장이
//       공고끼리 다시 같아져 의심 묶음으로 되잡히던 것(역전파 7회차)을 막는다. 2026-11-11 전 40묶음·125행 → 뒤 37묶음·107행(뺀 행 89).
//    🔵 2026-11-12(우편함 「코드·운영 — 🔴 LH 목록 마감 … + 0장」 4 · 역전파 10회차 ⑤ 판정) — 표준 공고문 정상 겹침을 뺀다: 묶음 행마다 source_file 이 「공고」가 든
//       공고문이고 그 파일 수 = 공고 수(공고마다 자기 공고문)면 지역본부 표준문 문장이 글자째 같은 것이다(10회차 10묶음 · 8회차 9묶음 모두 이 꼴 — 거짓 양성).
//       대조 마친 묶음 장부는 새 표를 두지 않고 위 pending 줄(「정책 「분류」 … 원문 문장으로」)을 그대로 쓴다 — 역전파 회차가 이미 그 줄을 남긴다.
//       2026-11-12 22묶음·71행 → 6묶음·24행(뺀 16묶음 · 남은 것 = QnA 파일 3 · 할증률 표 2 · 신혼 2차 1).
try {
  const [x] = await sqlRead(`with done as materialized (
      select distinct g.gid, m[1] cat from public.announcement_analysis a
        cross join lateral unnest(a.pending_fields) pf
        cross join lateral regexp_matches(pf, '정책 「([^」]+)」[^「]{0,20}원문 문장으로', 'g') m
        cross join lateral public.get_announcement_group_ids(a.announcement_id) g(gid)
       where array_to_string(a.pending_fields, ' ') ~ '원문 문장으로'),
    p as (
      select p.announcement_id, p.source_file, p.created_at, md5(btrim(p.content_raw)) h from public.announcement_policies p
       where coalesce(btrim(p.content_raw), '') <> '' and p.category !~ '^(⚠️|일정|모집일정)'
         and to_jsonb(p) ->> 'source_page' is null
         and not exists (select 1 from done d where d.gid = p.announcement_id and d.cat = p.category)),
    g as (select h, count(*) n, count(distinct source_file) nf, bool_and(created_at < '2026-09-18') old,
            bool_and(coalesce(source_file, '') ~ '공고') all_notice,
            count(distinct source_file) = count(distinct announcement_id) own_file
            from p group by h having count(distinct announcement_id) > 1)
  select json_build_object('groups', count(*) filter (where old and nf > 1 and not (all_notice and own_file)),
      'rows', coalesce(sum(n) filter (where old and nf > 1 and not (all_notice and own_file)), 0),
      'std_groups', count(*) filter (where old and nf > 1 and all_notice and own_file),
      'all_groups', count(*), 'all_rows', coalesce(sum(n), 0)) j from g`)
  const c = x.j
  add('policy_md5_dup_old', '공고끼리 같은 요약 정책 행 — 09-18 이전 · 원문 파일 다름(정보)', 'info',
    `의심 묶음 ${c.groups} · ${c.rows}행(표준 공고문 정상 겹침으로 뺀 ${c.std_groups}묶음 · 전체 겹침 묶음 ${c.all_groups} · ${c.all_rows}행)`,
    '정보 — 판정하지 않는다 · content_raw md5 같은 정책 행 · 일정·⚠️·모집일정 밖 · 원문 대조 마친 행(source_page · pending 「원문 문장으로」) 밖 · 공고 둘 이상 · 의심 = 전부 2026-09-18 이전 ∧ source_file 둘 이상 · 역전파가 고치면 줄어든다(2026-11-10 46 · 11-11 37)')
} catch (e) {
  add('policy_md5_dup_old', '공고끼리 같은 요약 정책 행 — 09-18 이전 · 원문 파일 다름(정보)', 'info', String(e).slice(0, 200), '정책 표를 읽는다(실패면 ℹ️)')
}

// ㊲ LH 목록 마감(CLSG_DT) < 상세 청약 마감(2026-11-12 · 우편함 「코드·운영 — 🔴 LH 목록 마감(CLSG_DT) < 상세 청약 마감 감시·보호」 1 · …21026 꼴)
//    — 열린 LH 행(apply_end ≥ 오늘 KST) 중 apply_end_detail(상세 받은 런의 청약 마감) > apply_end_list(목록 원값) = ⚠️(안 멈춤 · gate.mjs HARD 밖).
//    보호 트리거(protect_detail_columns)가 이미 상세 값을 카드 마감으로 세운다 — 이 항목은 LH 가 목록·상세를 다르게 준 공고가 있다는 신호다(값 칸에 공고 · 두 값 · 지금 카드 마감).
//    칸이 아직 없으면(마이그레이션 2026-11-12_02 적용 전) ℹ️.
try {
  const rows = await sqlRead(`select announcement_id id, apply_end_list l, apply_end_detail d, apply_end e, apply_end_confirmed c
      from public.announcements where source = 'LH' and apply_end >= (now() at time zone 'Asia/Seoul')::date
       and apply_end_list is not null and apply_end_detail is not null and apply_end_detail > apply_end_list
     order by announcement_id desc limit 20`)
  add('lh_list_end_early', 'LH 목록 마감 < 상세 청약 마감 — 열린 LH 행', rows.length ? 'warn' : 'pass',
    rows.length ? rows.map(r => `…${String(r.id).slice(-5)} 목록 ${String(r.l).slice(5)} · 상세 ${String(r.d).slice(5)} → 카드 ${String(r.e).slice(5)}${r.c ? '(확정)' : ''}`).join(' / ') : '0',
    '0 — 넘으면 ⚠️(안 멈춤) · 보호 트리거가 상세 값을 카드 마감으로 세운다 · apply_end_list = 목록 CLSG_DT · apply_end_detail = 상세 SBSC_ACP_CLSG_DT 중 가장 늦은 날')
} catch (e) {
  add('lh_list_end_early', 'LH 목록 마감 < 상세 청약 마감 — 열린 LH 행', 'info', String(e).slice(0, 200), '칸이 없으면(적용 전) ℹ️')
}

// ㊳ 사용자 글 칸 속 영문 식별자(2026-11-12 · 우편함 「코드·운영 — 🔴 LH 목록 마감 … + 0장」 5 · 백로그 「다른 회차 세대 비고에 DB 칸 이름」) — ℹ️ 셈만(판정하지 않는다).
//    칸 = housing_units.extra_note · announcement_policies.content_raw · eligibility_criteria.manual_check_note · age_exception_note(화면이 그대로 보여 주는 글).
//    셈 = 낱말 [a-z]+_[a-z_0-9]+(DB 칸 이름 꼴 — area_sqm · revision_note 등) 이 든 행 · 단독 낱말 null 이 든 행. 첫 값 2026-11-12 세대 비고 27(null 11 · 모두 식별자 행과 겹침) · 정책 1 · 자격 0.
//    2026-11-12 역전파 11회차가 0으로 만든 뒤 ⚠️로 올렸다(claude.ai 판정 · 우편함 「코드·운영 — 단지 키 3차 + …」 3).
try {
  const [x] = await sqlRead(`with t(src, txt) as (
      select 'unit', extra_note from public.housing_units where extra_note is not null
      union all select 'policy', content_raw from public.announcement_policies where content_raw is not null
      union all select 'elig', manual_check_note from public.eligibility_criteria where manual_check_note is not null
      union all select 'elig', age_exception_note from public.eligibility_criteria where age_exception_note is not null)
    select json_object_agg(src, json_build_object('ident', ni, 'nul', nn)) j from (
      select src, count(*) filter (where txt ~ '\\m[a-z]+_[a-z_0-9]+\\M') ni,
                  count(*) filter (where txt ~* '(^|[^a-z_])null($|[^a-z_])') nn from t group by src) y`)
  const c = x.j || {}, f = k => `${(c[k] || {}).ident ?? 0}${(c[k] || {}).nul ? '(null ' + c[k].nul + ')' : ''}`
  const bad = Object.values(c).some(v => (v.ident || 0) + (v.nul || 0) > 0)
  // 🔵 2026-11-12(우편함 「코드·운영 — 단지 키 3차 + …」 3 · claude.ai 판정) — 역전파 11회차가 0으로 만든 뒤 ⚠️ 승격(안 멈춤 · gate.mjs HARD 밖).
  add('user_text_ident', '사용자 글 칸 속 영문 식별자(DB 칸 이름 꼴 · 단독 null)', bad ? 'warn' : 'pass',
    `세대 비고 ${f('unit')} · 정책 ${f('policy')} · 자격 메모 ${f('elig')}`,
    '0 — 넘으면 ⚠️(안 멈춤) · 낱말 [a-z]+_[a-z_0-9]+ 이 든 행 수(괄호 = 단독 null 든 행) · 첫 값 2026-11-12 27(11) · 1 · 0 → 같은 날 역전파 11회차 뒤 0')
} catch (e) {
  add('user_text_ident', '사용자 글 칸 속 영문 식별자(DB 칸 이름 꼴 · 단독 null)', 'warn', String(e).slice(0, 200), '세대·정책·자격 표를 읽는다(못 읽으면 ⚠️ 점검 불능)')
}

// ㊵ 세대 비고 속 우리 문장(2026-11-12 · 우편함 「코드·운영 — Visual 갱신 뒤 승인 멈춤 안 C 시험 + …」 3 · 역전파 12회차 ⑦) — ℹ️ 셈만(판정하지 않는다 · HARD 밖).
//    housing_units.extra_note 에 「⚠️」 또는 낱말 「확인 · 추정 · 임의 · 별도 존재 · 반영 · 유지」가 든 행 — 원문 문장이 아니라 분석이 덧붙인 꼴일 수 있는 줄(역전파가 원문으로 고치면 줄어든다).
//    열린 카드(목록 RPC 열린 대표 → 같은 제목 키 공고 전부) / 전체 따로. 첫 값 2026-11-12 전체 874행 · 51공고(그중 ⚠️ 815) · 열린 카드 1행 · 1공고.
try {
  const [x] = await sqlRead(`with op as materialized (select x.announcement_id rep, public.announcement_dedup_key(a.title) k from public.get_announcements_deduped() x
        join public.announcements a on a.announcement_id = x.announcement_id where x.apply_end >= (now() at time zone 'Asia/Seoul')::date),
      g as materialized (select distinct a.announcement_id aid from op join public.announcements a on public.announcement_dedup_key(a.title) = op.k),
      t as (select h.announcement_id, h.extra_note ~ '⚠️|확인|추정|임의|별도 존재|반영|유지' hit, h.extra_note ~ '⚠️' warn, (g.aid is not null) op
              from public.housing_units h left join g on g.aid = h.announcement_id where h.extra_note is not null)
    select json_build_object('all', count(*) filter (where hit), 'all_ann', count(distinct announcement_id) filter (where hit), 'warn', count(*) filter (where warn),
      'open', count(*) filter (where hit and op), 'open_ann', count(distinct announcement_id) filter (where hit and op)) j from t`)
  const c = x.j
  add('unit_note_ours', '세대 비고 속 우리 문장 꼴(⚠️ · 확인·추정·임의·별도 존재·반영·유지) — 정보', 'info',
    `열린 카드 ${c.open}행 · ${c.open_ann}공고 / 전체 ${c.all}행 · ${c.all_ann}공고(⚠️ ${c.warn})`,
    '정보 — 판정하지 않는다 · extra_note 낱말 셈 · 열린 카드 = 목록 RPC 열린 대표의 같은 제목 키 공고 · 첫 값 2026-11-12 1 · 1 / 874 · 51')
} catch (e) {
  add('unit_note_ours', '세대 비고 속 우리 문장 꼴(⚠️ · 확인·추정·임의·별도 존재·반영·유지) — 정보', 'info', String(e).slice(0, 200), '세대 표를 읽는다(실패면 ℹ️)')
}

// ㊴ 임대조건 한 줄 산술(2026-11-12 · 우편함 「코드·운영 — 단지 키 3차 + …」 4 · run 425 ⑦) — ℹ️ 셈만(판정하지 않는다 · gate.mjs HARD 밖).
//    세대 비고(extra_note)의 「계약금 N원 · 잔금 M원」과 세대 행 deposit 을 견준다:
//    ⓐ 합 어긋남 = N + M ≠ deposit · ⓑ 5% 어긋남 = 같은 공고의 다른 줄이 계약금 = 계 × 5% 꼴인데 이 줄은 |N − deposit × 5%| ≥ 1,000원(LH 는 천 원 미만을 맞춰 적는다 — 그 차이는 정상).
//    🔵 2026-11-12(우편함 「코드·운영 — Visual 갱신 뒤 승인 멈춤 안 C 시험 + …」 4 · run 426 검증 🧭) — 같은 줄 전환 칸도 견준다:
//       증액 구간(「증액」·「(+)」 뒤 「;」·「/」·감액 낱말 앞까지)의 금액 둘 가운데 계 + a = b 인 짝이 있으면 증액 맞음 · 감액 구간(「감액」·「(-)」 뒤)은 계 − a = b.
//       구간에 금액이 둘 미만이면 판정 안 함(월임대료만 적힌 꼴 등). 합 어긋남 행마다 갈래: 계·전환 맞음(계약금·잔금 쪽 결손) / 계약금·잔금 맞음(N + M + a = b · 계 쪽 결손) / 전환 칸 없음 / 둘 다 안 맞음.
//    원문 표 자체의 오기(…21029 「3,973,80」 꼴)도 잡힌다 — 고칠지는 원문을 보고 분석 묶음이 정한다.
//    첫 값 2026-11-12 1,568행 중 ⓐ 13(계·전환 맞음 3 · 계약금·잔금 맞음 0 · 전환 칸 없음 10 · 둘 다 0) · ⓑ 0 · 전환 칸 판정 1,180 중 어긋남 86(21공고 — 한 비고에 주택형이 여럿 섞인 꼴 포함).
try {
  const [x] = await sqlRead(`with r as (select announcement_id a, deposit d,
        replace((regexp_match(extra_note, '계약금\\s*([\\d,]+)\\s*원'))[1], ',', '')::bigint k,
        replace((regexp_match(extra_note, '잔금\\s*([\\d,]+)\\s*원'))[1], ',', '')::bigint j,
        substring(extra_note from '(?:증액|\\(\\+\\))([^;/]*?)(?:감액|\\(-\\)|\\(−\\)|/|;|$)') inc_s,
        substring(extra_note from '(?:감액|\\(-\\)|\\(−\\))([^;/]*)') dec_s
      from public.housing_units where extra_note ~ '계약금\\s*[\\d,]+\\s*원' and extra_note ~ '잔금\\s*[\\d,]+\\s*원' and deposit is not null),
    c as (select r.*,
        (select array_agg(replace(m[1], ',', '')::bigint) from regexp_matches(coalesce(inc_s, ''), '([\\d,]{4,})\\s*원', 'g') m) ni,
        (select array_agg(replace(m[1], ',', '')::bigint) from regexp_matches(coalesce(dec_s, ''), '([\\d,]{4,})\\s*원', 'g') m) nd from r),
    f as (select *, k + j <> d sum_bad, abs(k - d * 0.05) >= 1000 pct_bad,
        case when coalesce(cardinality(ni), 0) < 2 then null else exists (select 1 from unnest(ni) x, unnest(ni) y where d + x = y) end inc_ok,
        case when coalesce(cardinality(nd), 0) < 2 then null else exists (select 1 from unnest(nd) x, unnest(nd) y where d - x = y) end dec_ok,
        exists (select 1 from unnest(coalesce(ni, '{}')) x, unnest(coalesce(ni, '{}')) y where k + j + x = y) kj_conv from c),
    h as (select *, case when inc_ok is null and dec_ok is null then null else coalesce(inc_ok, true) and coalesce(dec_ok, true) end conv_ok from f),
    g as (select a, bool_or(not pct_bad) any5 from h group by a)
    select json_build_object('rows', (select count(*) from h), 'sum_bad', (select count(*) from h where sum_bad),
      'pct_bad', (select count(*) from h join g using (a) where g.any5 and pct_bad and not sum_bad),
      'sb_conv_ok', (select count(*) from h where sum_bad and conv_ok), 'sb_kj_ok', (select count(*) from h where sum_bad and conv_ok is false and kj_conv),
      'sb_no_conv', (select count(*) from h where sum_bad and conv_ok is null), 'sb_neither', (select count(*) from h where sum_bad and conv_ok is false and not kj_conv),
      'conv_n', (select count(*) from h where conv_ok is not null), 'conv_bad', (select count(*) from h where conv_ok is false),
      'conv_bad_ann', (select count(distinct a) from h where conv_ok is false),
      'ann', (select coalesce(json_agg(distinct a), '[]'::json) from h join g using (a) where sum_bad or (g.any5 and pct_bad))) j`)
  const c = x.j
  add('rent_terms_arith', '임대조건 한 줄 산술 — 계약금 + 잔금 = 임대보증금 · 계약금 5% · 전환 칸(정보)', 'info',
    `${c.rows}행 중 합 어긋남 ${c.sum_bad}(계·전환 맞음 ${c.sb_conv_ok} · 계약금·잔금 맞음 ${c.sb_kj_ok} · 전환 칸 없음 ${c.sb_no_conv} · 둘 다 ${c.sb_neither}) · 5% 어긋남 ${c.pct_bad} · 전환 칸 ${c.conv_n} 중 어긋남 ${c.conv_bad}(${c.conv_bad_ann}공고)${c.ann.length ? ' — ' + c.ann.slice(0, 8).map(i => '…' + String(i).slice(-5)).join(' · ') : ''}`,
    '정보 — 판정하지 않는다 · 세대 비고 「계약금 N원 · 잔금 M원」 ↔ deposit · 5% 는 같은 공고에 5% 꼴 줄이 있을 때만 · 천 원 미만 차이 무시 · 전환 = 증액·감액 구간 금액 짝(계 ± a = b) · 첫 값 2026-11-12 1,568 · 13(3·0·10·0) · 0 · 86')
} catch (e) {
  add('rent_terms_arith', '임대조건 한 줄 산술 — 계약금 + 잔금 = 임대보증금 · 계약금 5% · 전환 칸(정보)', 'info', String(e).slice(0, 200), '세대 표를 읽는다(실패면 ℹ️)')
}

// ㊱ 서식 출처 정책 행 · 「모집일정」 정책 행 ∧ 일정 행 0(2026-11-12 · 우편함 「코드·운영 — …21026 마감 원인·고침 + 커트라인 공급 이력 …」 3·4
//    · 역전파 9회차 ⑦ 1·2) — 한 쿼리 · ℹ️ 셈만(판정하지 않는다 · gate.mjs HARD 밖).
//    ⓐ policy_form_source — source_file ~ '신청서|서약|위임장|동의서' 정책 행(신청서·서약서 서식 칸을 원문 요약으로 읽은 꼴 — 역전파 9회차 ③ 광명 4행).
//       「신청서류.pdf」처럼 공고문과 함께 실린 파일도 걸린다 — 값은 행·공고 수(정상 포함) · 첫 값 2026-11-12 10행 · 6공고.
//    ⓑ schedule_rows_missing — 분석 완료(상태 「완료…」 · 블록 ID 묶음은 get_announcement_group_ids 로 편다) 공고 중 category 에 「모집일정」 정책 행이
//       있는데 announcement_schedule 행이 0 인 공고(카드 일정 표가 정책 글로만 남는 꼴) · 첫 값 2026-11-12 75(…20675·…20679·…20723 은 같은 날 역전파 10회차가 채워 밖).
try {
  const [x] = await sqlRead(`with done as materialized (
      select distinct g.gid from public.announcement_analysis a
        cross join lateral public.get_announcement_group_ids(a.announcement_id) g(gid) where a.status like '완료%'),
    sm as (select distinct p.announcement_id from public.announcement_policies p join done d on d.gid = p.announcement_id
            where p.category ~ '모집일정'
              and not exists (select 1 from public.announcement_schedule s where s.announcement_id = p.announcement_id))
    select json_build_object(
      'form_rows', (select count(*) from public.announcement_policies where source_file ~ '신청서|서약|위임장|동의서'),
      'form_ann', (select count(distinct announcement_id) from public.announcement_policies where source_file ~ '신청서|서약|위임장|동의서'),
      'sched_missing', (select count(*) from sm),
      'sched_top', (select coalesce(json_agg(announcement_id order by announcement_id desc), '[]'::json) from (select announcement_id from sm order by 1 desc limit 5) t)) j`)
  const c = x.j
  add('policy_form_source', '서식 출처 정책 행(신청서·서약·위임장·동의서 — 정보)', 'info',
    `${c.form_rows}행 · ${c.form_ann}공고`,
    '정보 — 판정하지 않는다 · source_file ~ 신청서|서약|위임장|동의서 · 「신청서류」 같은 정상 출처도 센다(첫 값 2026-11-12 10행 · 6공고)')
  add('schedule_rows_missing', '「모집일정」 정책 행은 있는데 일정 행 0 — 분석 완료 공고(정보)', 'info',
    `${c.sched_missing}공고${c.sched_missing ? ' — 최근 ' + c.sched_top.map(i => '…' + String(i).slice(-5)).join(' · ') : ''}`,
    '정보 — 판정하지 않는다 · 완료 공고(묶음 펼침) · category ~ 모집일정 ∧ announcement_schedule 0 (첫 값 2026-11-12 75)')
} catch (e) {
  add('policy_form_source', '서식 출처 정책 행(신청서·서약·위임장·동의서 — 정보)', 'info', String(e).slice(0, 200), '정책 표를 읽는다(실패면 ℹ️)')
  add('schedule_rows_missing', '「모집일정」 정책 행은 있는데 일정 행 0 — 분석 완료 공고(정보)', 'info', String(e).slice(0, 200), '정책·일정 표를 읽는다(실패면 ℹ️)')
}

// ㉓ 화면 빈칸 점검 셋 — 한 쿼리(2026-11-04 · 우편함 「옛 주소 걷기·화면 빈칸 점검」 3~5 · 전부 안 멈춤 — gate.mjs HARD 밖).
//    카드 = 목록 RPC 대표 · 같은 카드의 행 = 제목 키(announcement_dedup_key — 화면 zfDedupKey 와 한 벌)가 같은 공고 전부(화면 곁 데이터 붙이기와 같다).
//    ⓐ deadline_hm_missing — 마감이 오늘·내일(KST)인 카드 중 그날 끝나는 경로 표 행 · 일정 표 「접수」 행이 **하나도 없는** 것 = ⚠️(화면이 「오늘 16:00까지」를 못 낸다 · …20923 꼴).
//       그날 끝나는 행은 있는데 어느 글에도 시각(「16:00」·「16시」)이 없는 것 = ℹ️ 따로(원문에 시각이 없는 상시·선착순 꼴 — 값에 「시각 없음」으로만 센다).
//       같은 자리 둘째 셈 — 열린 카드 ∧ 분석 완료 계열 ∧ 일정 표 행 있음 ∧ 「접수」 행 없음 ∧ 경로 표 0(마감 날이 멀어도 미리 잡는다 · …20923 은 이 꼴이었다).
//    ⓑ unit_sigungu_unknown — 세대 행 시군구가 공고 행 시군구 이름(공백 무시)에도 경계 파일 geo/kr-2026-07.json 「cent」 시·군·구 이름에도 없는 것.
//       예외 1: 「양산」(…19919 · 원문 주소에 「시」가 없다 — 2026-11-04 분석 묶음이 그대로 둠). unit_sigungu_city_only(「시」만 ∧ 주소에 구)와는 고칠 몫이 달라 따로 둔다.
//    ⓒ round_policy_diff — 회차 링크 쌍(announcement_round_links)의 같은 칸 이름(category) 정책 글 길이가 크게 다름(짧은 쪽/긴 쪽 < 0.33 ∧ 긴 쪽 ≥ 500자) = ℹ️ 셈만
//       (회차마다 원문이 실제로 다를 수 있어 판정하지 않는다) · 같은 자리 「글자마다 줄바꿈」(50자 이상 ∧ 줄바꿈/글자 > 0.3 · 포항블루밸리 …20963 꼴) 정책 행 수 = 0 넘으면 ⚠️.
const UNIT_SG_EXCEPT = new Set(['2015122300019919|양산'])
try {
  const geoNames = Object.keys(JSON.parse(readFileSync(new URL('../../geo/kr-2026-07.json', import.meta.url), 'utf8')).cent).map(k => k.split('|')[1])
  const lit = `array[${geoNames.map(s => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`
  const [x] = await sqlRead(`with t as (select (now() at time zone 'Asia/Seoul')::date d),
op as (select x.announcement_id rep, x.apply_end dy, public.announcement_dedup_key(a.title) k
         from public.get_announcements_deduped() x join public.announcements a on a.announcement_id = x.announcement_id, t
        where x.apply_end >= t.d),
g as (select op.rep, op.dy, a.announcement_id aid from op join public.announcements a on public.announcement_dedup_key(a.title) = op.k),
r as (select g.rep, ro.period_text p from g join public.announcement_apply_routes ro on ro.announcement_id = g.aid and ro.end_date = g.dy, t where g.dy <= t.d + 1
      union all
      select g.rep, s.period_text from g join public.announcement_schedule s on s.announcement_id = g.aid and s.stage = '접수' and s.end_date = g.dy, t where g.dy <= t.d + 1),
hm as (select op.rep, count(r.rep) n, count(*) filter (where r.p ~ '\\d{1,2}\\s*(:\\s*\\d{2}|시($|[^간]))') hm
         from op join t on op.dy <= t.d + 1 left join r on r.rep = op.rep group by op.rep),
gs as (select g.rep,
         bool_or(exists (select 1 from public.announcement_analysis an where an.announcement_id = g.aid and an.status like '완료%')) done,
         bool_or(exists (select 1 from public.announcement_schedule s where s.announcement_id = g.aid)) sched,
         bool_or(exists (select 1 from public.announcement_schedule s where s.announcement_id = g.aid and s.stage = '접수')) jeopsu,
         bool_or(exists (select 1 from public.announcement_apply_routes ro where ro.announcement_id = g.aid)) route
         from g group by g.rep),
ks as (select distinct replace(btrim(sigungu_nm), ' ', '') sg from public.announcements where nullif(btrim(sigungu_nm), '') is not null
       union select unnest(${lit})),
uu as (select h.announcement_id aid, btrim(h.sigungu_nm) sg, count(*) n from public.housing_units h
        where nullif(btrim(h.sigungu_nm), '') is not null and replace(btrim(h.sigungu_nm), ' ', '') not in (select sg from ks) group by 1, 2),
lk as (select earlier_announcement_id e, later_announcement_id la from public.announcement_round_links),
pc as (select lk.e, lk.la, p.announcement_id aid, p.category, sum(length(p.content_raw)) n
         from lk join public.announcement_policies p on p.announcement_id in (lk.e, lk.la) group by 1, 2, 3, 4),
pd as (select a.e, a.la, a.category from pc a join pc b on b.e = a.e and b.la = a.la and b.category = a.category and a.aid = a.e and b.aid = a.la
        where least(a.n, b.n)::numeric / greatest(a.n, b.n) < 0.33 and greatest(a.n, b.n) >= 500)
select jsonb_build_object(
  'hm_none', (select coalesce(jsonb_agg(rep order by rep), '[]'::jsonb) from hm where n = 0),
  'hm_notime', (select coalesce(jsonb_agg(rep order by rep), '[]'::jsonb) from hm where n > 0 and hm = 0),
  'hm_cards', (select count(*) from hm),
  'no_jeopsu', (select coalesce(jsonb_agg(rep order by rep), '[]'::jsonb) from gs where done and sched and not jeopsu and not route),
  'unit_unknown', (select coalesce(jsonb_agg(jsonb_build_array(aid, sg, n) order by n desc, aid), '[]'::jsonb) from uu),
  'pd_cat', (select count(*) from pd), 'pd_links', (select count(distinct (e, la)) from pd), 'links', (select count(*) from lk),
  'pd_top', (select coalesce(jsonb_agg(z.e || '→' || z.la order by z.e, z.la), '[]'::jsonb) from (select distinct e, la from pd) z),
  'nl_char', (select coalesce(jsonb_agg(announcement_id order by announcement_id), '[]'::jsonb) from public.announcement_policies
                where length(content_raw) >= 50 and (length(content_raw) - length(replace(content_raw, E'\\n', '')))::numeric / length(content_raw) > 0.3)
) as j`)
  const c = x.j
  const top = (a, k = 5) => a.slice(0, k).join(', ') + (a.length > k ? ` 외 ${a.length - k}` : '')
  const bad = c.hm_none.length + c.no_jeopsu.length
  add('deadline_hm_missing', '마감 시각 재료 없음 — 오늘·내일 마감 카드 · 접수 행 없는 분석 완료 카드', bad ? 'warn' : 'pass',
    [`오늘·내일 마감 ${c.hm_cards} 중 그날 끝나는 경로·접수 행 없음 ${c.hm_none.length}${c.hm_none.length ? ': ' + top(c.hm_none) : ''}`,
     `ℹ️ 행은 있는데 원문 시각 없음 ${c.hm_notime.length}${c.hm_notime.length ? ': ' + top(c.hm_notime) : ''}`,
     `열린 분석 완료 ∧ 일정 행 있음 ∧ 접수 행 없음 ∧ 경로 표 0 = ${c.no_jeopsu.length}${c.no_jeopsu.length ? ': ' + top(c.no_jeopsu) : ''}`].join(' · '),
    '앞 셈 0 ∧ 끝 셈 0 — 넘으면 ⚠️(안 멈춤) · 원문 시각 없음은 ℹ️ 값만 · 카드 = 제목 키 같은 공고 전부(화면 zfEndHmOf 재료와 같다)')
  const uu = c.unit_unknown.filter(([aid, sg]) => !UNIT_SG_EXCEPT.has(`${aid}|${sg}`))
  add('unit_sigungu_unknown', '세대 행 시군구가 공고 행·경계 파일 어디에도 없는 이름', uu.length ? 'warn' : 'pass',
    uu.length ? uu.slice(0, 5).map(([aid, sg, n]) => `${aid} 「${sg}」 ${n}행`).join(', ') + (uu.length > 5 ? ` 외 ${uu.length - 5}` : '') + ` · 예외 ${c.unit_unknown.length - uu.length}`
      : `0 · 예외 ${c.unit_unknown.length - uu.length}(양산 …19919)`,
    '0(예외 목록 밖) — 넘으면 ⚠️(안 멈춤) · 공백 무시 · 경계 geo/kr-2026-07.json cent 256 · 예외 = UNIT_SG_EXCEPT')
  add('round_policy_diff', '회차 링크 쌍 같은 칸 정책 글 길이 크게 다름(셈) · 글자마다 줄바꿈 정책 행', c.nl_char.length ? 'warn' : 'info',
    `길이 다름 ${c.pd_cat}칸 · ${c.pd_links}쌍(링크 ${c.links})${c.pd_top.length ? ': ' + top(c.pd_top, 3) : ''} · 글자마다 줄바꿈 ${c.nl_char.length}${c.nl_char.length ? ': ' + top([...new Set(c.nl_char)]) : ''}`,
    '길이 다름 = 짧은/긴 < 0.33 ∧ 긴 ≥ 500자 — ℹ️ 셈만(판정 없음) · 글자마다 줄바꿈 = 50자 이상 ∧ 줄바꿈/글자 > 0.3 — 0 넘으면 ⚠️(안 멈춤)')
} catch (e) {
  add('screen_gaps', '화면 빈칸 점검 셋(마감 시각 · 세대 시군구 · 회차 정책 글)', 'warn', String(e).slice(0, 200), '공고·일정·경로·세대·정책 표를 읽는다(못 읽으면 ⚠️)')
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

// ㉑ 갤러리 새 행 내용 해시 빔(2026-11-03 · 우편함 「코드·운영 — 점검 세 줄 …」 1 · ⚠️ 경고만 · gate.mjs HARD 밖) —
//    announcement_extras.content_sha256(같은 내용 재사용 축 · 마이그레이션 2026-11-03_01)은 분석 스킬이 업로드 응답의 content_sha256 을 적는다.
//    7일 안 새 행 중 원본 위치(source_url)가 있는데 해시가 빈 행 = 그 문장이 빠진 회차 → 다음 회차가 채움 스크립트(LH 원본 sha · Drive 크기 대조)로 메운다.
//    11-03 채움 때 크기 다름으로 일부러 둔 NULL 7행은 created_at 이 7일 창 밖(10-27 이전)이라 세지 않는다.
try {
  const [x] = await sqlRead(`select jsonb_build_object(
  'n', count(*),
  'ids', coalesce(jsonb_agg(distinct e.announcement_id), '[]'::jsonb)
) as j from public.announcement_extras e
 where e.created_at > now() - interval '7 days' and e.source_url is not null and e.content_sha256 is null`)
  const c = x.j
  add('extras_sha_null', '갤러리 새 행 내용 해시(content_sha256) 빔 — 원본 위치 있음 · 7일 안', c.n === 0 ? 'pass' : 'warn',
    c.n === 0 ? 0 : `${c.n}행: ${c.ids.slice(0, 5).join(', ')}${c.ids.length > 5 ? ` 외 ${c.ids.length - 5}` : ''}`,
    '0 — created_at 7일 안 ∧ source_url 있음 ∧ content_sha256 NULL · 넘으면 ⚠️ 경고만(업로드 응답 content_sha256 을 적는 스킬 문장 몫 · 메우기는 채움 스크립트)')
} catch (e) {
  add('extras_sha_null', '갤러리 새 행 내용 해시(content_sha256) 빔 — 원본 위치 있음 · 7일 안', 'warn', String(e).slice(0, 200), 'announcement_extras 를 읽는다(못 읽으면 ⚠️)')
}

// ㉒ 같은 평면도 파일이 다른 주택형 둘 이상에(2026-11-03 · 우편함 「코드·운영 — 점검 세 줄 …」 2 · ℹ️ 정보 — 판정하지 않음) —
//    열린 카드(목록 RPC · apply_end ≥ 오늘 KST)마다 회차 사슬(get_announcement_round_chain_ids) 안 floorplan 행을 같은 content_sha256 으로 묶어
//    unit_key 주택형 부분(:: 뒤)이 둘 이상인 묶음을 센다. 단 묶음의 주택형 표기(블록 이름 뒤 마지막 낱말)가 전부 **한** 캡션에 들어 있으면
//    뺀다(한 장에 여러 형을 그린 합본 — 예 …20958 「평면도(31A형, 31A-1형(주거약자))」 · 「(복층)」 꼴). 형마다 캡션이 따로면(…20198 「(21A)2」·「(26A)1」) 빼지 않는다.
//    남는 것 = 면적이 다른 형에 같은 그림이 붙은 의심.
try {
  const [x] = await sqlRead(`with op as (select d.announcement_id from public.get_announcements_deduped() d
                  where d.apply_end >= (now() at time zone 'Asia/Seoul')::date),
ch as (select distinct op.announcement_id rep, c.announcement_id aid from op cross join lateral public.get_announcement_round_chain_ids(op.announcement_id) c),
fp as (select ch.rep, e.content_sha256 sha, substring(nullif(split_part(e.unit_key, '::', 2), '') from '([^ ]+)$') ty, e.building_address cap
         from ch join public.announcement_extras e on e.announcement_id = ch.aid
        where e.extra_type = 'floorplan' and e.content_sha256 is not null and e.unit_key like '%::%'),
g as (select rep, sha, array_agg(distinct ty order by ty) tys, array_agg(distinct cap) caps from fp where ty is not null
       group by rep, sha having count(distinct ty) >= 2),
r as (select g.*, exists (select 1 from unnest(g.caps) c
                    where not exists (select 1 from unnest(g.tys) t
                                       where position(regexp_replace(t, '\\s', '', 'g') in regexp_replace(coalesce(c, ''), '\\s', '', 'g')) = 0)) all_in_cap from g)
select jsonb_build_object(
  'groups', (select count(*) from r),
  'excluded', (select count(*) from r where all_in_cap),
  'hits', (select coalesce(jsonb_agg(jsonb_build_object('rep', rep, 'sha', left(sha, 8), 'types', tys) order by rep, sha), '[]'::jsonb) from r where not all_in_cap)
) as j`)
  const c = x.j
  add('floorplan_multi_type', '같은 평면도 파일이 다른 주택형 둘 이상에(열린 카드 · 정보)', 'info',
    `${c.hits.length}${c.hits.length ? ': ' + c.hits.slice(0, 5).map(h => `${h.rep}(${h.types.join(' / ')})`).join(', ') : ''} · 캡션에 형이 다 든 합본 제외 ${c.excluded}`,
    '정보 — 판정하지 않는다(0이 정상 · 같은 content_sha256 floorplan 이 unit_key 주택형 둘 이상 · 한 캡션에 그 형들이 다 있으면 합본으로 뺀다)')
} catch (e) {
  add('floorplan_multi_type', '같은 평면도 파일이 다른 주택형 둘 이상에(열린 카드 · 정보)', 'info', String(e).slice(0, 200), '목록 RPC·회차 사슬·갤러리를 읽는다(못 읽어도 정보)')
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

// ㉘ 매입 순위별 후속 공지 미반영(2026-11-02) — 판정·SQL 은 wave-notice.mjs 머리 주석(화면 zfRouteDefaultWin · zfLoadWaveNotes 와 같은 정의). ⚠️만 · 못 읽으면 ⚠️ 점검 불능.
try {
  const [x] = await sqlRead(waveNoticeSql())
  const j = judgeWaveNotice(x.j)
  add('wave_notice_missing', '매입 순위별 둘째 이후 창 — 대상주택 게시가 지났는데 「⚠️ 이번 차수 대상」 행 없음', j.status, j.value, j.rule)
} catch (e) {
  addBlind('wave_notice_missing', '매입 순위별 후속 공지 미반영 — 점검 불능', 'warn', String(e).slice(0, 200), '목록 함수·경로·일정·정책 표를 읽는다(못 읽으면 ⚠️)')
}

// ㉙ 화면 점검 「발송했는데 기록 없음」(2026-11-02) — 판정·SQL 은 screen-run.mjs 머리 주석. ⚠️만 · 못 읽으면 ⚠️ 점검 불능.
try {
  const [x] = await sqlRead(screenRunSql())
  const j = judgeScreenRun(x.j)
  add('screen_run_missing', '화면 점검 발송(204) 뒤 기록 없음', j.status, j.value, j.rule)
} catch (e) {
  addBlind('screen_run_missing', '화면 점검 발송 뒤 기록 없음 — 점검 불능', 'warn', String(e).slice(0, 200), '발송 기록·점검 실행 표를 읽는다(못 읽으면 ⚠️)')
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

// ㉚ 자격 행 결론 낱말(2026-11-03 · 우편함 「코드·운영 — GH 2-0 관찰 장치 · … · 결론 낱말 ⚠️」 4 · 분석 스킬 v11.1 「없음 결론 금지」의 기계 감시).
//    eligibility_criteria.verification_requirements 의 문자열 값 전체가 결론 낱말 하나(배제 · 완화 · 불요 · 필수 · 없음 · 미혼 — 앞뒤 공백·괄호·마침표만 허용)인 키
//    🔵 2026-11-03(「결론 낱말 ⚠️ 넓힘」 1) — 결론 낱말 + 괄호 해설 꼴도 센다(예 「배제(신청자 본인 자동차 미소유 필수)」 · 그 뒤 공백·마침표만).
//    ∧ 행 created_at 14일 안(새 분석 행만)이 0 이면 통과 · 아니면 ⚠️(공고 ID · 키). 객체 꼴 「공급대상」 키는 셈 밖. 14일 밖 옛 행 수는 값 칸에만.
//    ⚠️ 경고만 · gate.mjs HARD 밖 · 못 읽으면 ⚠️ 점검 불능.
try {
  const [x] = await sqlRead(`with k as (
      select e.announcement_id a, kv.key k, e.created_at > now() - interval '14 days' recent
        from public.eligibility_criteria e,
             jsonb_each(case when jsonb_typeof(e.verification_requirements) = 'object' then e.verification_requirements else '{}'::jsonb end) kv
       where kv.key <> '공급대상' and jsonb_typeof(kv.value) = 'string'
         and (kv.value #>> '{}') ~ '^[[:space:]()（）\\[\\].]*(배제|완화|불요|필수|없음|미혼)([[:space:]]*[(（].*[)）])?[[:space:]()（）\\[\\].]*$')
    select json_build_object('recent', (select count(*) from k where recent), 'all', (select count(*) from k),
      'all_ann', (select count(distinct a) from k),
      'list', (select json_agg(a || ' · ' || k order by a, k) from (select a, k from k where recent limit 10) s)) j`)
  const j = x.j
  add('elig_conclusion_word', '자격 행 값이 결론 낱말 하나뿐 · 낱말 + 괄호 해설(새 분석 14일)', j.recent === 0 ? 'pass' : 'warn',
    j.recent === 0 ? `0(14일 밖 옛 행 ${j.all}키 · ${j.all_ann}공고)` : `${j.recent}키 — ${(j.list || []).join(', ')}(전체 ${j.all}키 · ${j.all_ann}공고)`,
    '0 — verification_requirements 문자열 값이 「배제·완화·불요·필수·없음·미혼」 낱말 하나뿐이거나 낱말 + 괄호 해설뿐인 키(공급대상 밖) · 행 created_at 14일 안 — 원문 문장 대신 결론만 적은 꼴')
} catch (e) {
  addBlind('elig_conclusion_word', '자격 행 결론 낱말 — 점검 불능', 'warn', String(e).slice(0, 200), '자격 표를 읽는다(못 읽으면 ⚠️)')
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
//    🔴 본문 원문은 어디에도 남기지 않는다(값 칸은 고른 숫자 요약뿐 · 실패하면 HTTP 상태만). 판정 문턱 = instance.mjs(⚠️ · 「Nano 꼴」 ❌ 안 멈춤 — 2026-11-04).
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
  // 🔵 2026-11-04(swap 처방 2) — swapin 속도는 직전 기록과의 차이다(기록 전에 읽는다 · 못 읽으면 속도 없이 가용 하한만 본다).
  let prev = null
  try { [prev] = await sqlRead(`select scraped_at, pswpin from zipfit_ops.instance_metrics_log order by scraped_at desc limit 1`) } catch { prev = null }
  const id = await recordInstanceMetrics({ scraped_at, ...values })
  const j = judgeInstance(values, swapinRate(prev, { scraped_at, pswpin: values.pswpin }))
  add('instance_mem', '인스턴스 메모리(swapin 속도 · 가용)', j.status,
    `${j.value} · 계열 ${Object.keys(values).length}개${missing.length ? `(없음 ${missing.join(',')})` : ''} · 기록 #${id}`, j.rule)
} catch (e) {
  add('instance_mem', '인스턴스 메모리(swapin 속도 · 가용)', 'info', String(e).slice(0, 200), '관리 API 지표 끝점(베타) — 실패면 ℹ️만(점검을 막지 않는다)')
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
    // 🔵 2026-11-04 — 시험 실행(수동 입력 simulate)이면 그 값을 실행 요약 표지로(ops_health_runs.simulate · 게이트 셈·상태판이 뺀다)
    const n = await recordFindings({ at: now.toISOString(), run_url, ref: process.env.GITHUB_REF_NAME || null, simulate: process.env.SIMULATE || null, checks: all })
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
