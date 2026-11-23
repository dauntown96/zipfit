// 넓은 조회 ⚠️(2026-11-23 · 우편함 「코드·운영 — 여섯째 묶음」 2 · 백로그 「max_rows에 닿는 넓은 조회」 ⑦2 · 조사 「max_rows(2000)에 조용히 잘리는 화면·점검 조회 전수」 11-22)
//    화면(index.html)·화면 점검(screen-check.mjs)이 표를 쪽 나눔 없이 한 번에 받는 자리의 「지금 돌아올 행 수」가 PostgREST max_rows × 0.8 이상이면 ⚠️(안 멈춤 · health-ops-soft).
//    max_rows 를 넘으면 PostgREST 가 말없이 자른다(limit=10000 도 못 넘는다) — 넘기 전에 알린다.
//    🔵 쪽 나눔이 들어간 자리는 저절로 빠진다: 자리마다 그 함수 본문(소스 파일에서 떠냄)에 `offset=` 이나 쪽 나눔 헬퍼 `zfGetAll(`(표시층 기술 판 #1215)이 있으면 「쪽 나눔 있음」으로 세지 않는다
//       — 표시층 회차가 같은 자리에 쪽 나눔을 넣으면, 두 회차 병합 순서와 관계없이 그 자리는 다음 점검부터 대상 밖이다(이 파일 고침 0).
//    max_rows 값은 관리 API GET /v1/projects/{ref}/postgrest 로 읽는다(조회만) · 못 읽으면 MAX_ROWS_FALLBACK(🔴 다운님이 설정을 바꾸면 여기도 고친다 — 2026-11-22 13:10 2000).
//    행 수 SQL 은 ops-check.mjs(WIDE_FETCH_SQL) — 화면 요청의 거름과 같은 조건이다. 자리를 더하면 SPOTS 한 줄 + SQL 한 칸.
//    🔵 2026-11-23(일곱째 묶음 4) — 값 칸에 「SPOTS 밖 통째 조회 n」 ℹ️(판정 0 · 수치만): index.html 에서 `/rest/v1/` 를 부르는 줄 중
//       거름·쪽 표지(PAGED_OR_FILTERED)가 하나도 없고 SPOTS 함수 밖인 자리 — 새 통째 조회가 SPOTS 에 안 오른 채 지나가지 않게 본다(`outsideSpots`).
export const MAX_ROWS_FALLBACK = 2000
export const PAGED_RE = /offset=|zfGetAll\(/
export const PAGED_OR_FILTERED = ['limit=', 'offset=', 'zfGetAll(', 'idFilterFor', 'eq.']
export const WARN_RATIO = 0.8

// file = 저장소 루트 기준 · fn = 그 파일 안에서 본문을 떠낼 표지(함수 선언 또는 변수 이름) · key = SQL 칸 이름
export const SPOTS = [
  { key: 'tier_ec', file: 'index.html', fn: 'function zfLoadTierTags(', what: 'zfLoadTierTags ① 자격 행 전부(eligibility_criteria)' },
  { key: 'tier_hu', file: 'index.html', fn: 'function zfLoadTierTags(', what: 'zfLoadTierTags ② 세대 공급대상 있음(housing_units supply_target)' },
  { key: 'tier_vt', file: 'index.html', fn: 'function zfLoadTierTags(', what: 'zfLoadTierTags ③ 자격 행 갈래 조건 계층_중_하나' },
  { key: 'price_ids', file: 'index.html', fn: 'async function zfEnsurePriceSummaries(', what: 'zfEnsurePriceSummaries 가격 요약(id 하나에 한 행 · 목록 전체 = 마감 포함 목록 행 수)' },
  { key: 'win_sched', file: 'index.html', fn: 'function zfLoadWinSched(', what: 'zfLoadWinSched 결과발표·계약 ∪ 열린 접수(announcement_schedule)' },
  { key: 'obj_render', file: '.github/health/screen-check.mjs', fn: 'const objRender = ', what: 'screen-check objRender 자격 행 원문 칸 있음(점검만)' },
]

// 소스에서 표지부터, 표지 줄과 같은 들여쓰기(또는 더 얕은)로 시작하는 다음 줄 앞까지를 본문으로 본다(최상위 함수면 다음 최상위 줄 · 함수 안 const 면 같은 깊이 다음 문장).
//    닫는 괄호만 있는 줄(`}` · `})` …)은 본문에 넣고 계속 본다.
export function bodyOf(src, marker) {
  src = String(src || '')
  const i = src.indexOf(marker)
  if (i < 0) return null
  const ls = src.lastIndexOf('\n', i) + 1
  const indent = /^[ \t]*/.exec(src.slice(ls, i))[0].length
  const lines = src.slice(i + marker.length).split('\n')
  const out = [lines[0]]
  for (const l of lines.slice(1)) {
    if (!l.trim()) { out.push(l); continue }
    const d = /^[ \t]*/.exec(l)[0].length
    if (d <= indent && !/^[ \t]*[})\]]/.test(l)) break
    out.push(l)
  }
  return out.join('\n')
}

// index.html 의 `/rest/v1/` 자리 중 거름·쪽 표지가 없고 SPOTS 함수 밖인 것 → [{ line, fn }] · fn = 그 자리 위 가장 가까운 함수 선언 이름
//    🔵 2026-11-23(여덟째 묶음 1) — 줄 단위 → 「호출 한 덩이」 단위: 그 줄(또는 세 줄 위까지)에서 가장 가까운 앞쪽 `fetch(` 부터 짝 괄호까지(최대 4000자 ·
//       못 찾으면 그 줄). 거름이 다음 줄에 붙는 조회(`zfFilterExistingAnnouncementIds` 등)가 거짓 양성으로 잡히던 것을 뺀다.
//       덩이에서 빼는 것: PAGED_OR_FILTERED 표지 · RPC 인자의 id 묶음(ID_ARG_RE — p_ids · p_id · p_announcement_id) · 표의 `in.(` 거름(id 묶음) · 표에 POST(쓰기).
export const ID_ARG_RE = /\bp_(?:ids|id|announcement_id|announcement_ids)\b/
export function callChunk(lines, i) {
  const from = Math.max(0, i - 3)
  const head = lines.slice(from, i + 1).join('\n')
  const k = head.lastIndexOf('fetch(')
  if (k < 0) return lines[i]
  const rest = head.slice(k) + '\n' + lines.slice(i + 1, i + 40).join('\n')
  let depth = 0
  for (let p = 0; p < rest.length && p < 4000; p++) {
    const c = rest[p]
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return rest.slice(0, p + 1) }
  }
  return rest.slice(0, 4000)
}
export function outsideSpots(src) {
  const lines = String(src || '').split('\n')
  const spotFns = new Set(SPOTS.filter(s => s.file === 'index.html').map(s => s.fn.replace(/^(async )?function |\($/g, '')))
  const out = []
  let fn = ''
  lines.forEach((l, i) => {
    const m = /^(?:async )?function ([A-Za-z0-9_$]+)\(/.exec(l)
    if (m) fn = m[1]
    if (!l.includes('/rest/v1/') || /^\s*\/\//.test(l)) return
    if (spotFns.has(fn)) return
    const ch = callChunk(lines, i)
    if (PAGED_OR_FILTERED.some(k => ch.includes(k))) return
    const rpc = /\/rest\/v1\/rpc\//.test(ch)
    if (rpc && ID_ARG_RE.test(ch)) return
    if (!rpc && (ch.includes('in.(') || /method\s*:\s*['"]POST['"]/.test(ch))) return
    out.push({ line: i + 1, fn: fn || '(최상위)' })
  })
  return out
}

// sources = { 'index.html': 글, '.github/health/screen-check.mjs': 글 } · counts = { key: 행 수 } · maxRows = 수 또는 null
export function judgeWideFetch({ sources, counts, maxRows, ratio = WARN_RATIO }) {
  const cap = Number(maxRows) > 0 ? Number(maxRows) : MAX_ROWS_FALLBACK
  const line = Math.floor(cap * ratio)
  const rows = [], near = [], gone = [], paged = []
  for (const s of SPOTS) {
    const body = bodyOf(sources[s.file], s.fn)
    if (body == null) { gone.push(s); continue }
    if (PAGED_RE.test(body)) { paged.push(s); continue }
    const n = counts[s.key]
    rows.push({ ...s, n })
    if (n == null || Number(n) >= line) near.push({ ...s, n })
  }
  const fmt = r => `${r.what} ${r.n == null ? '셈 못 함' : Number(r.n).toLocaleString('en-US')}`
  const status = near.length || gone.length ? 'warn' : 'pass'
  const head = `max_rows ${cap}${Number(maxRows) > 0 ? '' : '(설정 못 읽음 · 상수)'} · 문턱 ${line}`
  const value = [
    head,
    near.length ? `문턱 넘음 ${near.length}: ${near.map(fmt).join(' · ')}` : `가장 큰 ${rows.length ? fmt(rows.reduce((a, b) => (Number(b.n) > Number(a.n) ? b : a))) : '없음'}`,
    paged.length ? `쪽 나눔 있음(대상 밖) ${[...new Set(paged.map(p => p.fn.replace(/^(async )?function |^const |\($| = $/g, '')))].join(', ')}` : '',
    (() => { const o = outsideSpots(sources['index.html']); return `ℹ️ SPOTS 밖 통째 조회 ${o.length}(판정 0)${o.length ? ' — ' + [...new Set(o.map(x => x.fn))].join(', ') : ''}` })(),
    gone.length ? `소스에서 자리를 못 찾음 ${gone.map(g => g.fn).join(', ')}(wide-fetch.mjs SPOTS 를 고친다)` : '',
  ].filter(Boolean).join(' · ')
  return { status, value, near, paged, gone, line, cap }
}
