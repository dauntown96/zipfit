// 인스턴스 지표 — 관리 API GET /v1/projects/{ref}/analytics/endpoints/metrics(베타 · Prometheus 본문 약 520 KB)에서 숫자만 고른다
// (2026-10-17 · 우편함 「코드·운영 — 인스턴스 지표 정기 기록(관리 API 지표 끝점 · health-ops) · …」 1 · 조사 「인스턴스 지표 경로」 ⓑ 채택).
// 🔴 본문 원문은 로그·결과 파일·이슈·DB 어디에도 남기지 않는다 — 아래 SERIES 의 숫자만 꺼내 zipfit_ops.instance_metrics_record() 로 넘긴다.
//    Auth(GoTrue) 경로별 집계와 그 밖 계열은 읽지 않는다(서비스 db 의 node_* 만).
// 🔴 자격은 기존 Actions Secret SUPABASE_ACCESS_TOKEN 하나(새 비밀 0 · service_role 키 0).
export const METRICS_PATH = '/analytics/endpoints/metrics'

// [저장 키, 계열 이름, 라벨 조건, 합침] — 합침 = CPU 처럼 코어마다 나오는 것을 더한다. 디스크 root = nvme0n1 · data = nvme1n1(조사 실측).
export const SERIES = [
  ['mem_total', 'node_memory_MemTotal_bytes', {}],
  ['mem_available', 'node_memory_MemAvailable_bytes', {}],
  ['swap_total', 'node_memory_SwapTotal_bytes', {}],
  ['swap_free', 'node_memory_SwapFree_bytes', {}],
  ['committed_as', 'node_memory_Committed_AS_bytes', {}],
  ['commit_limit', 'node_memory_CommitLimit_bytes', {}],
  ['pswpin', 'node_vmstat_pswpin', {}],
  ['pswpout', 'node_vmstat_pswpout', {}],
  ['cpu_user_s', 'node_cpu_seconds_total', { mode: 'user' }, 'sum'],
  ['cpu_system_s', 'node_cpu_seconds_total', { mode: 'system' }, 'sum'],
  ['cpu_iowait_s', 'node_cpu_seconds_total', { mode: 'iowait' }, 'sum'],
  ['cpu_idle_s', 'node_cpu_seconds_total', { mode: 'idle' }, 'sum'],
  ['disk_root_read_b', 'node_disk_read_bytes_total', { device: 'nvme0n1' }],
  ['disk_root_written_b', 'node_disk_written_bytes_total', { device: 'nvme0n1' }],
  ['disk_data_read_b', 'node_disk_read_bytes_total', { device: 'nvme1n1' }],
  ['disk_data_written_b', 'node_disk_written_bytes_total', { device: 'nvme1n1' }],
]

// 🔵 문턱(2026-11-04 · 우편함 「코드·운영 — swap 처방 …」 2 · 조사 「DB 인스턴스 swap 증가」 처방 2 채택) — 판정 축은 swap 「양」이 아니라
//    ① swapin 속도(직전 기록 대비 pswpin 증가 · 30분당 쪽 수 · 4 KB 쪽) ② 가용 메모리(MemAvailable) 하한이다.
//    근거 = zipfit_ops.instance_metrics_log 시계열(조사 회신 1절 · 2026-11-04 재집계):
//      Nano(10-18~21) — 가용 최소 82~117 MB · 평균 132~144 MB · swapin 30분당 중앙 9만~11만 · 최대 52만~91만 쪽 · 탐침 p50 1.25초(성능에 닿던 꼴)
//      Small(10-23~11-04) — 가용 최소 690 MB(10-29) · 평균 979~1,079 MB · swapin 30분당 최대 1,870 쪽(11-02) · 탐침 p50 0.40~0.47초
//    ⚠️ = swapin > 5,000 쪽/30분(≈ 20 MB · 지금 최대의 약 2.7배 · Nano 중앙의 약 1/18) ∨ 가용 < 400 MB(지금 최소 690의 약 0.6배)
//    「Nano 꼴」 = swapin > 50,000 쪽/30분 ∨ 가용 < 200 MB → ❌ 안 멈춤(2026-11-04 우편함 「코드·운영 — 가격 요약 RPC known_sg …」 4 · gate.mjs HARD 밖 → 라벨 health-ops-soft ·
//    ops_health_runs.ok=false · 게이트 셈 real_fail_7d 에 든다 — 사용자가 느리게 겪는 상태라서). 그 사이(⚠️ 문턱 넘음)는 ⚠️.
//    swap 사용량·commit 비율은 값 문구에 그대로 보이되 판정에서 뺀다(swap 은 낮 봉우리마다 계단으로 올라 내려오지 않는 래칫이라 「양」은 성능과 상관이 약하다 —
//    탐침 지연과 상관 0.22 · commit 은 Small 이후 내내 1.04~1.24배라 매 회차 ⚠️ 였다).
export const SWAPIN_WARN = 5000        // 쪽/30분
export const SWAPIN_SEVERE = 50000
export const AVAIL_WARN_MB = 400
export const AVAIL_SEVERE_MB = 200
// 직전 기록과의 간격이 이 범위 밖이면(첫 기록 · 재시작 · 끊김) swapin 속도를 판정하지 않는다(가용 하한만 본다).
const RATE_GAP_MIN_S = 60, RATE_GAP_MAX_S = 7200

// prev = 직전 기록 { scraped_at, pswpin } · now = 이번 고른 값 + scraped_at → 30분당 쪽 수 또는 null(재지 못함)
export function swapinRate(prev, cur) {
  if (!prev || prev.pswpin == null || cur.pswpin == null || !prev.scraped_at || !cur.scraped_at) return null
  const dt = (new Date(cur.scraped_at) - new Date(prev.scraped_at)) / 1000
  if (!(dt >= RATE_GAP_MIN_S && dt <= RATE_GAP_MAX_S)) return null
  const d = Number(cur.pswpin) - Number(prev.pswpin)
  if (d < 0) return null      // 카운터가 0부터 다시(재시작)
  return d * 1800 / dt
}

const LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(\S+)/
const LABEL_RE = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g

// text = 지표 본문 → { values: {키: 수}, missing: [키] } · 서비스 db(service_type="db") 줄만 본다.
export function pickMetrics(text) {
  const want = new Map()
  for (const [, metric] of SERIES) want.set(metric, [])
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue
    const m = LINE_RE.exec(line)
    if (!m || !want.has(m[1])) continue
    const labels = {}
    for (const l of (m[2] || '').matchAll(LABEL_RE)) labels[l[1]] = l[2]
    if (labels.service_type !== 'db') continue
    const v = Number(m[3])
    if (Number.isFinite(v)) want.get(m[1]).push([labels, v])
  }
  const values = {}, missing = []
  for (const [key, metric, cond, agg] of SERIES) {
    const hit = want.get(metric).filter(([labels]) => Object.entries(cond).every(([k, v]) => labels[k] === v))
    if (!hit.length) { missing.push(key); continue }
    values[key] = agg === 'sum' ? hit.reduce((s, [, v]) => s + v, 0) : hit[0][1]
  }
  return { values, missing }
}

const MB = b => Math.round(b / 1048576)
// v = pickMetrics().values · rate = swapinRate() 결과(쪽/30분 또는 null) → { status: fail|warn|pass, value, rule, severe }
export function judgeInstance(v, rate = null) {
  const swapUsed = v.swap_total != null && v.swap_free != null ? v.swap_total - v.swap_free : null
  const swapRatio = swapUsed != null && v.swap_total > 0 ? swapUsed / v.swap_total : null
  const commitRatio = v.committed_as != null && v.commit_limit > 0 ? v.committed_as / v.commit_limit : null
  const availMb = v.mem_available != null ? v.mem_available / 1048576 : null
  const severe = (rate != null && rate > SWAPIN_SEVERE) || (availMb != null && availMb < AVAIL_SEVERE_MB)
  const warn = severe || (rate != null && rate > SWAPIN_WARN) || (availMb != null && availMb < AVAIL_WARN_MB)
  const parts = []
  if (severe) parts.push('Nano 꼴')
  if (v.mem_total != null) parts.push(`메모리 가용 ${MB(v.mem_available ?? 0)}/${MB(v.mem_total)} MB`)
  parts.push(rate != null ? `swapin ${Math.round(rate).toLocaleString('en-US')}쪽/30분` : 'swapin 속도 못 잼(직전 기록 없음·간격 밖·재시작)')
  if (swapUsed != null) parts.push(`swap 사용 ${MB(swapUsed)}/${MB(v.swap_total)} MB(${Math.round(swapRatio * 100)}% · 판정 밖)`)
  if (commitRatio != null) parts.push(`commit ${(v.committed_as / 1073741824).toFixed(2)}/${(v.commit_limit / 1073741824).toFixed(2)} GB(${commitRatio.toFixed(2)}배 · 판정 밖)`)
  return {
    status: severe ? 'fail' : warn ? 'warn' : 'pass',
    severe,
    value: parts.join(' · '),
    rule: `swapin ≤ ${SWAPIN_WARN.toLocaleString('en-US')}쪽/30분 ∧ 가용 ≥ ${AVAIL_WARN_MB} MB — 넘으면 ⚠️ · ${SWAPIN_SEVERE.toLocaleString('en-US')}쪽 넘음 ∨ ${AVAIL_SEVERE_MB} MB 밑 = Nano 꼴 ❌(안 멈춤 · health-ops-soft) · swap 양·commit 은 판정 밖(2026-11-04) · 숫자는 zipfit_ops.instance_metrics_log`,
  }
}
