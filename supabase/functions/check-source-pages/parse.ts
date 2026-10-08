// 공급기관 공고 페이지 → 공고상태 · 접수기간(구조화된 값만) 파서 — check-source-pages 가 쓴다(2026-10-08 · 우편함 「코드 — 3-B ③ …」).
// 🔴 화면에 보이는 글자와 같은 값만 쓴다 — 숨은 공용 템플릿·display:none 문자열은 쓰지 않는다(run 103 교훈).
//   LH 공고 페이지(apply.lh.or.kr selectWrtancInfo.do)에는 세 꼴이 있다(2026-10-08 열린 60쪽 실측).
//   ⓐ 임대(scd)   — 공급일정 단지 탭 데이터 `splScdlist.push({ panId, ltrUntNo, sbscAcpStDt, sbscAcpClsgDt, … })`.
//                   단지 탭을 누르면 이 값이 「접수기간」 라벨(#sta_acpDt)에 그대로 보인다 · 첫 단지 값은 서버가 라벨에 미리 그린다.
//                   🔴 panId 가 이 공고가 아닌 항목은 버린다(공용 템플릿 방지 — 60쪽 실측 0).
//   ⓑ 매입(buy)   — `if(true){ // ====공급일정===== var sbscAcpStDt = '…'; var sbscAcpClsgDt = '…';` 가 로드 때 라벨에 들어간다.
//                   🔴 조건이 if(true) 일 때만 쓴다(if(false) 면 화면에 안 보인다).
//   ⓒ 분양계통(table) — ccrCnntSysDsCd=02 페이지의 「공급일정」 표(구분 · 신청일시 · 신청방법) 행.
//   공고상태는 세 꼴 모두 게시글 정보 `<ul class="bbsV_data"> … <strong>공고상태</strong><span …>공고중</span>`.
//   SH 는 공고 목록(housing.seoul.go.kr publicLease/list)의 「모집상태」 칸이 구조화된 상태다. 접수기간은 상세 본문 글자뿐이라 읽지 않는다.
//   SH 후속 공지(접수결과·접수마감·2순위·후순위 안내)는 i-sh.co.kr 공고 게시판(m_241) 목록 행(글 번호 · 제목 · 등록일)에서 찾는다.

export type LhSchedule = { unit: string | null; start: string | null; end: string | null }
export type LhPage = {
  pageOk: boolean
  status: string | null
  form: 'scd' | 'buy' | 'table' | null
  schedules: LhSchedule[]
  label: string | null
  applyStart: string | null
  applyEnd: string | null
}

// '2026.10.12' · '2026.10.12 10:00' · '2026-10-12' → '2026-10-12'
export const ymd = (s: string | null | undefined): string | null => {
  const m = (s ?? '').match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const stripTags = (s: string) => squash(s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'))

export function parseLhPage(html: string, panId: string): LhPage {
  const out: LhPage = { pageOk: false, status: null, form: null, schedules: [], label: null, applyStart: null, applyEnd: null }
  const bbs = html.match(/<ul class="bbsV_data">([\s\S]*?)<\/ul>/)
  if (!bbs) return out
  out.pageOk = true
  const st = bbs[1].match(/<strong>\s*공고상태\s*<\/strong>\s*<span[^>]*>([^<]*)<\/span>/)
  out.status = st ? squash(st[1]) || null : null
  const lab = html.match(/<label id="sta_acpDt">([^<]*)<\/label>/)
  out.label = lab ? squash(lab[1]) || null : null

  // ⓐ 임대 — 단지 탭 데이터
  const scd: LhSchedule[] = []
  for (const m of html.matchAll(/splScdlist\.push\(\{([\s\S]*?)\}\);/g)) {
    const kv = Object.fromEntries([...m[1].matchAll(/(\w+)\s*:\s*'([^']*)'/g)].map(x => [x[1], x[2]]))
    if (kv.panId !== panId) continue
    scd.push({ unit: kv.ltrUntNo || null, start: ymd(kv.sbscAcpStDt), end: ymd(kv.sbscAcpClsgDt) })
  }
  if (scd.length) { out.form = 'scd'; out.schedules = scd }

  // ⓑ 매입 — if(true){ // ====공급일정===== var sbscAcpStDt = '…'; var sbscAcpClsgDt = '…';
  if (!out.form) {
    const b = html.match(/if\s*\(\s*(true|false)\s*\)\s*\{\s*\/\/\s*=+공급일정=+\s*var sbscAcpStDt\s*=\s*'([^']*)';\s*var sbscAcpClsgDt\s*=\s*'([^']*)'/)
    if (b && b[1] === 'true' && (ymd(b[2]) || ymd(b[3]))) {
      out.form = 'buy'; out.schedules = [{ unit: null, start: ymd(b[2]), end: ymd(b[3]) }]
    }
  }

  // ⓒ 분양계통 — 「공급일정」 표
  if (!out.form) {
    const t = html.match(/<caption>\s*공급일정[^<]*<\/caption>([\s\S]*?)<\/table>/)
    if (t) {
      const body = (t[1].match(/<tbody>([\s\S]*?)<\/tbody>/) ?? [, ''])[1] ?? ''
      const rows: LhSchedule[] = []
      for (const tr of body.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => stripTags(x[1]))
        if (tds.length < 2) continue
        const ds = [...tds[1].matchAll(/\d{4}[.\-]\d{1,2}[.\-]\d{1,2}/g)].map(x => ymd(x[0]))
        if (!ds.length) continue
        rows.push({ unit: tds[0] || null, start: ds[0] ?? null, end: ds[ds.length - 1] ?? null })
      }
      if (rows.length) { out.form = 'table'; out.schedules = rows }
    }
  }

  const starts = out.schedules.map(s => s.start).filter((x): x is string => !!x).sort()
  const ends = out.schedules.map(s => s.end).filter((x): x is string => !!x).sort()
  out.applyStart = starts[0] ?? null
  out.applyEnd = ends[ends.length - 1] ?? null
  return out
}

// ── SH ────────────────────────────────────────────────────────────────────────
export type ShListRow = { seq: string; title: string; status: string }

// collect-sh-announcements parseListPage 와 같은 규칙(i-sh.co.kr 링크의 seq · td-mdisn 셋이면 둘째가 모집상태).
export function parseShList(html: string): ShListRow[] {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '')
  const tbody = noComments.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
  if (!tbody) return []
  const rows: ShListRow[] = []
  for (const trM of tbody[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...trM[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map(m => ({
      cls: (m[1].match(/class\s*=\s*"([^"]*)"/) ?? [, ''])[1] ?? '', text: stripTags(m[2]), raw: m[2],
    }))
    if (!cells.length) continue
    const linkCell = cells.find(c => /\btd5\b/.test(c.cls)) ?? cells[cells.length - 1]
    const href = linkCell?.raw.match(/href="[^"]*view\.do\?[^"]*seq=(\d+)[^"]*"/)
    if (!href) continue
    const title = cells.find(c => /\btxl\b/.test(c.cls))?.text || ''
    const mdisn = cells.filter(c => /\btd-mdisn\b/.test(c.cls)).map(c => c.text)
    rows.push({ seq: href[1], title, status: mdisn.length >= 3 ? (mdisn[1] ?? '') : '' })
  }
  return rows
}

export type ShPost = { seq: string; title: string; date: string | null }

// i-sh.co.kr 공고 게시판 목록 행 — getDetailView('글 번호') · 제목 · 등록일(td.num 첫째).
export function parseShBoard(html: string): ShPost[] {
  const out: ShPost[] = []
  for (const tr of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const a = tr[1].match(/getDetailView\('(\d+)'\)[^>]*>([\s\S]*?)<\/a>/)
    if (!a) continue
    const title = stripTags(a[2].replace(/<span class="icoNew">[\s\S]*?<\/span>/, ''))
    const date = ymd((tr[1].match(/<td class="num">\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/) ?? [, ''])[1])
    out.push({ seq: a[1], title, date })
  }
  return out
}

// 후속 공지 후보 — 같은 공고를 제목으로 가리키는 글. 🔴 기록만 한다(값 반영은 2단계 판정 뒤).
//   ① 후속 낱말(접수결과 · 접수마감 · 2순위 · 후순위 · 추가접수 · 접수 연장 · 잔여) ② 공고 제목 앞부분(괄호 앞)과 글자 두 개 묶음 겹침 ≥ 0.5
//   ③ 공고일 꼬리 날짜가 있으면 같은 날짜(월·일) — 2026-10-08 실례: 「2026년 재개발임대주택 일반모집 공고(2026. 9. 9.)」 ↔
//   「2026년 재개발임대 모집공고(2026.9.9.공고) 1순위 청약접수 결과 및 2순위 청약접수 안내」(앞부분 일치로는 못 잡는다).
const FOLLOW_WORDS = /(접수\s*결과|접수\s*마감|2순위|후순위|추가\s*접수|접수\s*연장|기간\s*연장)/
const core = (t: string) => t.replace(/\(.*$/, '').replace(/[^0-9가-힣A-Za-z]/g, '')
const bigrams = (s: string) => { const b = new Set<string>(); for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2)); return b }
const dateKey = (t: string) => {
  const m = t.match(/\(\s*(?:20)?(\d{2})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})/)
  return m ? `${Number(m[2])}.${Number(m[3])}` : null
}
export function matchFollowups(annTitle: string, annDate: string | null, posts: ShPost[]): (ShPost & { score: number })[] {
  const a = bigrams(core(annTitle))
  const ak = dateKey(annTitle)
  const out: (ShPost & { score: number })[] = []
  for (const p of posts) {
    if (!FOLLOW_WORDS.test(p.title)) continue
    if (annDate && p.date && p.date < annDate) continue
    const b = bigrams(core(p.title))
    let inter = 0
    for (const x of a) if (b.has(x)) inter++
    const score = a.size ? inter / a.size : 0
    const pk = dateKey(p.title)
    if (ak && pk && ak !== pk) continue
    if (score >= 0.5) out.push({ ...p, score: Math.round(score * 100) / 100 })
  }
  return out
}

// 비교 규칙(check-source-pages 가 쓴다 · 재현 시험도 이 함수로) — 대상은 열린 카드뿐이라 「페이지 접수마감」이면 곧 어긋남이다.
// 🔵 2026-10-08(표시층 긴급 2 · 3) — 「차수 일치」: 페이지 시작·끝이 그 공고 경로 표의 한 차수 창(phase_text 있는 행)과 같으면
//   다름에서 뺀다(기록 칸 phase_match 에 차수 이름을 남긴다). 매입 공고는 페이지가 첫 차수(1순위 (우선)) 창만 주고
//   카드 확정값은 공고 전체 창이다 — 카드가 맞다(…20737 · …20875 · …20882 · 2026-10-08 경로 표 대조).
export type Phase = { phase: string | null; start: string | null; end: string | null }
export function compareLh(p: LhPage, card: { apply_start: string | null; apply_end: string | null }, phases: Phase[] = []) {
  const ph = (p.applyStart && p.applyEnd) ? phases.find(x => x.start === p.applyStart && x.end === p.applyEnd) : undefined
  if (ph) return { closed_mismatch: p.status === '접수마감', end_diff: false, start_diff: false, phase_match: ph.phase ?? '' }
  return {
    closed_mismatch: p.status === '접수마감',
    end_diff: !!p.applyEnd && p.applyEnd !== card.apply_end,
    start_diff: !!p.applyStart && p.applyStart !== card.apply_start,
    phase_match: null,
  }
}
