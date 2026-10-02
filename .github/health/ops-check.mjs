// B. 운영 건강 점검 — 사람 손 없이 도는가(런칭 조건 ③). 읽기·알림만 한다.
// 기준값은 2026-09-29 지난 7일 collection_run_log(441런) 분포에서 정했다 — 근거는 각 점검의 rule 칸.
//   주간(UTC 0~9시) 런 간격 p50 10.0분 · p99 10.2분 · 최대 11.1분 / 야간 최대 간격 490분(09:50 → 18:00)
//   소요 p50 50.6초 · p95 57.6초 · 최대 97.2초 / LH 0건 런: 7일 중 하루 1회 / MYHOME 0건 런: 0
//   「상세조회 마감 … 미시도」 오류는 441런 중 193런(하루 최대 59런)이라 런 단위로는 기준이 되지 않는다 →
//   「활성 LH 공고 중 6시간 넘게 상세조회를 시도하지 않은 수」(지금 3)로 잰다.
// 🔴 첫 주는 넉넉하게 — 오탐이 잦으면 알림이 읽히지 않는다.
import { sqlRead, anonRpc, report, SITE } from './lib.mjs'
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const now = new Date()
const hourUtc = now.getUTCHours()
const DAYTIME = hourUtc >= 0 && hourUtc <= 10           // 수집 cron */10 0-9 UTC(+10시대 마지막 09:50 런)
const PROMO_DAYTIME = hourUtc >= 0 && hourUtc <= 9      // 홍보물 cron 5,35 0-9 UTC — 10시대에는 09:35 가 마지막(40분을 넘는다)
// 🔵 2026-10-02 — 점검이 밤에도 30분마다 돈다(25·55분). 하루 첫 런(홍보물 00:05 · 이미지 00:17) 전에는 전날 마지막 런을 보므로
//    UTC 0시 40분 전은 밤 문턱(900분)으로 잰다 — 23:55 점검이 00시 넘어 밀려 돌 때의 오탐을 막는다.
const minuteUtc = now.getUTCMinutes()
const FIRST_RUN_DONE = PROMO_DAYTIME && !(hourUtc === 0 && minuteUtc < 40)
const checks = []
const add = (id, name, status, value, rule) => checks.push({ id, name, status, value, rule })

const EXPECTED_JOBS = [
  'zipfit-collect-announcements', 'zipfit-collect-announcements-warmup', 'zipfit-collect-announcements-night',
  'zipfit-collect-sh-announcements', 'zipfit-sh-close-missing', 'zipfit-collect-rental-stats',
  'zipfit-collect-lh-promo', 'zipfit-purge-usage-events', 'zipfit-purge-sh-run-log',
  'zipfit-refresh-post-links',   // 2026-09-30 같은 게시물 링크 자동 채움(마이그레이션 04)
  'zipfit-analysis-dispatch',    // 2026-10-01 공고 분석 루틴 발송기(마이그레이션 2026-10-01_03)
  'zipfit-collect-lh-images',    // 2026-10-02 LH 단지 이미지 탭 목록(마이그레이션 2026-10-02_02)
  'zipfit-health-ops-dispatch',  // 2026-10-03 운영 점검 예약을 GitHub 밖으로 — pg_cron → workflow_dispatch(마이그레이션 2026-10-02_05)
]
// 🔵 2026-10-03 — workflow_dispatch 토큰(Vault github_actions_dispatch_token · fine-grained · zipfit 하나 · Actions 읽기·쓰기) 만료일.
//    토큰을 갈면 이 날짜도 함께 고친다(다운님이 알려 준 값 · 값 자체는 Vault 에만 있다).
const DISPATCH_TOKEN_EXPIRES = '2027-10-03'

try {
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
      'ops_dispatch', (select json_build_object('age_min', extract(epoch from now() - l.at)/60, 'status', r.status_code, 'pending', r.id is null,
                              'err', left(coalesce(r.error_msg, case when r.status_code >= 300 then r.content end), 200))
                         from ops_dispatch_log l left join net._http_response r on r.id = l.net_request_id
                        order by l.id desc limit 1),
      'dispatch', (select json_build_object(
         'enabled', c.enabled, 'grace_min', extract(epoch from c.grace)/60, 'max_wait_min', extract(epoch from c.max_wait)/60,
         'waiting', (select count(*) from analysis_dispatch_queue where state = 'waiting'),
         'overdue', (select count(*) from analysis_dispatch_queue where state = 'waiting'
           and (case when returned then greatest(ready_at, state_at) else ready_at end) < now() - (c.grace + c.max_wait)  -- 되돌린 공고는 되돌린 때부터(2026-10-01 진전 없는 되돌림)
           and coalesce((select max(created_at) from analysis_dispatch_runs where reason <> 'followup'), '-infinity') < now() - (c.grace + c.max_wait)),  -- 몫 상한(한 발송 batch_size건)이라 긴 대기열은 정상 — 그동안 발송이 하나도 없을 때만 센다(2026-10-01 · 후속 전용 followup 회차는 세지 않는다 2026-10-02)
         'batch_size', c.batch_size,
         'not_ready_24h', (select count(*) from analysis_dispatch_queue where state = 'waiting' and ready_at is null and enqueued_at < now() - interval '24 hours'),
         'stale_lock', (select count(*) from analysis_dispatch_runs where state in ('firing','running') and coalesce(claimed_at, created_at) < now() - interval '90 minutes'),
         'fail_streak', (select count(*) = 3 and bool_and(state = 'failed') from (select state from analysis_dispatch_runs order by id desc limit 3) z),
         'zero_streak', (select count(*) = 3 and bool_and(state = 'finished' and done = 0) from (select r.state,
           (select count(*) from analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done') as done
           from analysis_dispatch_runs r where r.reason <> 'followup' order by r.id desc limit 3) z),
         'followup_stuck', (select count(*) from analysis_followup_requests where state = 'waiting' and requested_at < now() - interval '120 minutes'))
       from analysis_dispatch_config c where c.id = 1)
    ) j`)
  const d = db.j

  // ① 수집 런 신선도 · 실패 런
  const ageLimit = DAYTIME ? 40 : 720
  add('collect_fresh', '마지막 LH·MYHOME 수집 런 경과(분)', d.last_run_age_min <= ageLimit ? 'pass' : 'fail',
    Math.round(d.last_run_age_min), `주간(UTC 0~10시) ≤ 40분(10분 주기 · p99 간격 10.2분 → 3회 연속 빠짐) · 야간 ≤ 720분(최대 간격 490분)`)
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
  // ③ 비로그인 목록·요약 함수
  const list = await anonRpc('get_announcements_deduped', {})
  const listOk = list.status === 200 && Array.isArray(list.data) && list.data.length > 0
  add('anon_list', '비로그인 get_announcements_deduped', listOk && list.ms <= 10000 ? 'pass' : 'fail',
    `${list.status} · ${Array.isArray(list.data) ? list.data.length : 0}행 · ${list.ms}ms${list.snippet ? ' · ' + list.snippet : ''}`,
    '200 · 행 > 0 · 왕복 ≤ 10초(서버 한도 3초는 200 여부로 잰다 — 넘으면 500. 왕복은 러너↔싱가포르 1.9MB라 넉넉히)')
  // ③-2 화면이 실제로 보내는 인자 모양(2026-10-01 — 명시 null 은 함수가 인라인되지 않아 따로 잰다 · 우편함 「운영 — 감지 루틴 발송기」 3)
  for (const [id, body] of [['anon_list_null', { p_region: null, p_type: null, p_status: null }], ['anon_list_region', { p_region: '경기도' }], ['anon_list_type', { p_type: '국민임대' }]]) {
    const x = await anonRpc('get_announcements_deduped', body)
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
    try { const r = await fetch(url, { cache: 'no-store' }); st = r.status; const t = await r.text(); ok = r.ok && (id === 'site_sw' ? t.includes('CACHE_NAME') : t.includes('ZipFit')) } catch (e) { st = String(e).slice(0, 80) }
    add(id, `배포 사이트 ${id === 'site_sw' ? 'sw.js' : 'index'}`, ok ? 'pass' : 'fail', st, '200 · 본문 표식')
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
      if (x.stale_lock > 0) bad.push(`90분 넘게 안 풀린 잠금 ${x.stale_lock} — 세션 확인 뒤 analysis_run_release`)
      if (x.fail_streak) bad.push('연속 3번 발송 실패(자동 발송 멈춤)')
      if (x.zero_streak) bad.push('연속 3회차 끝낸 공고 0건(자동 발송 멈춤 — 공통 원인 확인)')
      // 🔵 2026-10-02 — 우편함 후속 처리 요청(analysis_followup_request)이 120분 넘게 루틴에 실리지 않음(잠금 · 멈춤 · 스위치).
      if (x.followup_stuck > 0) bad.push(`120분 넘게 실리지 않은 후속 처리 요청 ${x.followup_stuck}`)
      add('dispatch', '분석 발송기', bad.length ? 'fail' : 'pass', bad.length ? bad.join(' · ') : `대기 ${x.waiting} · 이상 없음`,
        '켜짐: grace+max_wait 동안 발송 0인데 그보다 오래 기다린 대기 0(몫 상한 — 한 발송 batch_size건) · 홍보물 24시간 대기 0 · 90분 넘은 잠금(잡은 때 기준) 0 · 연속 3실패 아님 · 연속 3회차 0건 끝 아님(후속 전용 회차 제외) · 120분 넘은 후속 처리 요청 0')
    }
  }
  // ⑦ 함수 정의 = supabase/rpc/ 사본(2026-09-30 우편함 「운영 — 함수 사본 드리프트」). 읽기만 한다.
  //   대조 규칙은 .github/db/migrate.py rpc_md5() 와 같다 — 파일 그대로 또는 끝 줄바꿈을 걷은 md5 가 DB md5 와 같으면 통과.
  //   걸리는 것: 정의가 다름 · 사본 없음(새 함수) · 같은 이름 둘 이상(한 파일로 대조 불가) · 함수 없는 사본(지운 함수의 사본 잔존).
  //   확장 소유 함수는 뺀다(pg_depend deptype 'e'). README.md · triggers.sql(트리거 바인딩)은 함수 사본이 아니다.
  {
    const t0 = Date.now()
    const [fr] = await sqlRead(`
      select coalesce(json_agg(json_build_object('name', p.proname, 'sig', p.oid::regprocedure::text, 'md5', md5(pg_get_functiondef(p.oid))) order by p.proname), '[]'::json) j
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind in ('f','p')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)
    const fns = fr.j || []
    const RPC_DIR = 'supabase/rpc'
    const NOT_COPIES = new Set(['README.md', 'triggers.sql'])
    const copies = new Map(readdirSync(RPC_DIR).filter(f => f.endsWith('.sql') && !NOT_COPIES.has(f)).map(f => {
      const s = readFileSync(`${RPC_DIR}/${f}`, 'utf8')
      const md5 = x => createHash('md5').update(x, 'utf8').digest('hex')
      return [f.slice(0, -4), new Set([md5(s), md5(s.replace(/\n+$/, ''))])]
    }))
    const byName = new Map()
    for (const f of fns) byName.set(f.name, [...(byName.get(f.name) || []), f])
    const bad = []
    for (const [name, list] of byName) {
      if (list.length > 1) { bad.push(`${name}: 같은 이름 ${list.length}개`); continue }
      const c = copies.get(name)
      if (!c) bad.push(`${list[0].sig}: 사본 없음`)
      else if (!c.has(list[0].md5)) bad.push(`${list[0].sig}: DB ${list[0].md5.slice(0, 8)}… ≠ 사본`)
    }
    for (const name of copies.keys()) if (!byName.has(name)) bad.push(`${name}.sql: DB에 함수 없음`)
    add('fn_copy', 'public 함수 정의 = supabase/rpc/ 사본', bad.length === 0 ? 'pass' : 'fail',
      bad.length ? bad.join(' · ') : `${fns.length}개 모두 같음 · ${Date.now() - t0}ms`,
      'DB 정의 md5 = 사본 md5(끝 줄바꿈 무시 — migrate.py 와 같은 규칙) · 사본 없는 함수·함수 없는 사본 0 · 확장 함수 제외')
  }
  // ⑨ 점검 자체가 도는가(2026-10-02 · 우편함 「… health-ops 정기 실행」 4) — GitHub 가 예약 실행을 건너뛴다(10-02 00:25Z·01:25Z).
  //    이 워크플로의 직전 실행(main · 이번 실행 제외) 시작 뒤 경과를 내장 토큰(actions: read)으로 읽는다 — 새 비밀값 0.
  //    30분 주기라 한 번 빠지면 60분 · 두 번 연속 빠지면 90분을 넘는다.
  //    🔵 2026-10-03(#328) — 실패가 아니라 ⚠️ 경고다. GitHub 예약 실행이 하루 몇 번뿐이라(10-02 08:39Z → 14:5xZ 없음) 예약 실행마다
  //    이 항목이 실패해 이슈가 닫히지 않았고, 루틴은 열린 이슈가 있으면 착수하지 않는다. 점검 예약은 pg_cron(25·55분)이 부른다 —
  //    그 경로가 죽었는지는 아래 ⑩ ops_dispatch 가 실패로 잡는다. 실패로 다시 올릴지는 1주 실측 뒤 판단.
  {
    const tok = process.env.GH_API_TOKEN, repo = process.env.GITHUB_REPOSITORY
    if (!tok || !repo) {
      add('ops_gap', '직전 운영 점검 뒤 경과(분)', 'skip', '토큰 없음(로컬 실행)', 'Actions 에서만 잰다')
    } else {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/health-ops.yml/runs?branch=main&per_page=20`,
          { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' } })
        const j = await res.json()
        const prev = (j.workflow_runs || [])
          .filter(x => String(x.id) !== String(process.env.GITHUB_RUN_ID))
          .map(x => Date.parse(x.run_started_at || x.created_at)).filter(Number.isFinite)
          .sort((a, b) => b - a)[0]
        if (!res.ok || !prev) {
          add('ops_gap', '직전 운영 점검 뒤 경과(분)', 'warn', `GitHub API ${res.status} · 직전 실행 ${prev ? '있음' : '없음'}`, '직전 실행을 읽는다(경고만)')
        } else {
          let gap = (now.getTime() - prev) / 60000
          if (process.env.SIMULATE === 'gap') gap += 180   // 알림 경로 시험 — 점검이 빠진 것처럼
          add('ops_gap', '직전 운영 점검 뒤 경과(분)', gap <= 90 ? 'pass' : 'warn', Math.round(gap) + (process.env.SIMULATE === 'gap' ? '(시험 +180)' : ''),
            '≤ 90분(pg_cron 25·55분 30분 주기 — 넘으면 ⚠️ 경고만 · 이슈를 열지 않는다)')
        }
      } catch (e) {
        add('ops_gap', '직전 운영 점검 뒤 경과(분)', 'warn', String(e).slice(0, 120), '직전 실행을 읽는다(경고만)')
      }
    }
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
    const daysLeft = (Date.parse(DISPATCH_TOKEN_EXPIRES + 'T00:00:00Z') - now.getTime()) / 86400000
    add('ops_dispatch_token', '발송 토큰 만료까지(일)', daysLeft > 30 ? 'pass' : daysLeft > 0 ? 'warn' : 'fail', Math.floor(daysLeft),
      `> 30일(만료 ${DISPATCH_TOKEN_EXPIRES} · 30일 안이면 ⚠️ · 지나면 실패 — 토큰을 갈면 Vault github_actions_dispatch_token 과 이 날짜를 함께)`)
  }
  // ⑥ 백업 — 🔴 zipfit-backup(비공개) 실행 기록을 이 저장소 토큰으로는 읽을 수 없다(새 토큰 필요 → 요청서 멈춤). 설계만.
  add('backup', '최근 백업 성공', 'skip', '미구현', 'zipfit-backup 은 비공개 — 읽으려면 새 권한이 필요해 멈춤(우편함 회신 참고). 백업 실패는 그 저장소 자체 이슈(backup-failure)로 알린다')
} catch (e) {
  add('runner', '점검 실행', 'fail', String(e).slice(0, 300), '점검 스크립트가 끝까지 돈다')
}

if (process.env.SIMULATE === 'fail') add('simulate', '실패 흉내(수동 입력 simulate=fail)', 'fail', '시험', '알림 경로 확인용 — 평소에는 없다')

const r = report('ops', 'B. 운영 건강 점검', checks, { daytime: DAYTIME })
process.exitCode = 0     // 판정은 결과 파일로 넘긴다 — 이슈 단계가 그것을 읽는다
