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

// 🔵 잠정 문턱(2026-10-17) — 한 주 기록 뒤 claude.ai 가 정한다. ⚠️만 낸다(❌ 없음 · gate.mjs HARD 밖).
//    지금 인스턴스(메모리 426 MB)는 commit 이 한도를 넘고 swap 을 상시 쓰고 있어(조사 실측) 처음에는 매 회차 ⚠️ 가 정상이다.
export const COMMIT_RATIO_WARN = 1.0      // Committed_AS / CommitLimit 이 이보다 크면 ⚠️
export const SWAP_USED_WARN = 0.25        // (SwapTotal − SwapFree) / SwapTotal 이 이보다 크면 ⚠️

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
// v = pickMetrics().values → { status: warn|pass, value, rule }
export function judgeInstance(v) {
  const swapUsed = v.swap_total != null && v.swap_free != null ? v.swap_total - v.swap_free : null
  const swapRatio = swapUsed != null && v.swap_total > 0 ? swapUsed / v.swap_total : null
  const commitRatio = v.committed_as != null && v.commit_limit > 0 ? v.committed_as / v.commit_limit : null
  const warn = (commitRatio != null && commitRatio > COMMIT_RATIO_WARN) || (swapRatio != null && swapRatio > SWAP_USED_WARN)
  const parts = []
  if (v.mem_total != null) parts.push(`메모리 가용 ${MB(v.mem_available ?? 0)}/${MB(v.mem_total)} MB`)
  if (swapUsed != null) parts.push(`swap 사용 ${MB(swapUsed)}/${MB(v.swap_total)} MB(${Math.round(swapRatio * 100)}%)`)
  if (commitRatio != null) parts.push(`commit ${(v.committed_as / 1073741824).toFixed(2)}/${(v.commit_limit / 1073741824).toFixed(2)} GB(${commitRatio.toFixed(2)}배)`)
  return {
    status: warn ? 'warn' : 'pass',
    value: parts.join(' · '),
    rule: `잠정 — commit/한도 ≤ ${COMMIT_RATIO_WARN} ∧ swap 사용 ≤ ${SWAP_USED_WARN * 100}% · 넘으면 ⚠️만(❌ 없음 · 문턱은 한 주 기록 뒤) · 숫자는 zipfit_ops.instance_metrics_log`,
  }
}
