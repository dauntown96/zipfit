// GH(경기주택도시공사) 공고 수집 Edge Function — 청약센터(apply.gh.or.kr) 목록·상세 HTML
//
// 🔵 2026-10-28(우편함 「코드·운영(브랜치만 · 병합 0) — GH 수집기 …」 · 근거: 우편함 「조사(읽기만) — GH 수집 길 …」 2026-10-26 검증 통과)
//   SH 수집기(collect-sh-announcements)를 본뜬 기관별 수집기다(합치지 말 것 — 검증 ⑦ 채택: 수집기는 기관별 · 첨부 받기 설정은 호스트 표 하나).
// 🔴 robots(2026-10-28 다시 잼): apply.gh.or.kr = `User-agent: * / Allow: /*` · apply-cdn.gh.or.kr = 같음.
//   www.gh.or.kr 은 `Disallow: /`(사이트 전체) — 🔴 이 함수는 그 호스트에 한 번도 요청하지 않는다(BASE 하나뿐 · 검증 판정 ⑤-2 「자동 접근 0」).
// 🔴 켜기는 런칭 뒤 — cron 등록 · 쓰기 켜기 · 화면 출처 표기 · 처리방침 열거 고지는 다운님 결정(켜는 순서 4단계 · 조사 회신 5절 ②).
//
// 받는 자리(조사 회신 1절):
//   임대주택 sr7150 · 매입임대 sr7155 — 임대상가 sr7170 · 서류제출 대상 sr7310 은 받지 않는다.
//   목록 1쪽 = GET · 다음 쪽 = POST pageIndex=N · 상세 = GET(쿼리 넷 — 2026-10-28 실측 200 · 화면은 POST 폼).
//   상세 진입 화면의 NetFunnel(대기열 스크립트)은 브라우저 쪽이다 — 서버는 토큰 없이 200(조사 회신 · 2026-10-28 다시 확인).
// ⚠️ 빠르게 이어 부르면 연결을 끊는다(2026-10-28 실측 — 1초 간격 상세 POST 에 reset by peer) → 요청 간격 2초 · 동시 요청 없음.
//
// 들이는 범위(조사 검증 「백필 = 열린 공고만」):
//   열린 공고(상태가 마감이 아니고 마감일이 오늘 이후거나 「-」) ∪ 이미 들인 GH 공고(마감으로 바뀐 것을 반영) — 마감 지난 옛 공고는 새로 들이지 않는다.

import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'
import { parseList, parseTotalPages, parseDetail, applyWindow, winnerDate, sigunguOf, type GhBoard, type GhListRow, type GhFile } from './parse.ts'

// 코딩원칙 16번: `Deno.env.get()!`는 타입 단언일 뿐 런타임 검사가 아니다. 없으면 명시적으로 throw 한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL              = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const CRON_SECRET               = requireEnv('CRON_SECRET_V2')

const matchCronSecret = (req: Request): boolean => req.headers.get('x-cron-secret') === CRON_SECRET
const authcheckResponse = () => new Response(JSON.stringify({ mode: 'authcheck', ok: true }),
  { headers: { 'Content-Type': 'application/json' } })

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const BASE = 'https://apply.gh.or.kr'
const BOARDS: GhBoard[] = ['sr7150', 'sr7155']
const UA = 'Mozilla/5.0 (compatible; ZipFitBot/1.0; +https://kkokzip.com)'
const MAX_PAGES = 5            // 게시판마다 — 열린 공고·이미 들인 공고가 한 줄도 없는 쪽에서 멈춘다(임대주택 1쪽 ≈ 5개월)
const DETAIL_CAP = 15          // 한 런에서 상세를 여는 상한(열린 공고는 한 자리 수 — 2026-10-28 실측 6)
const PAGE_DELAY_MS = 2000
const FETCH_TIMEOUT_MS = 20000
const RUN_FETCH_BUDGET_MS = 105000   // 150초 벽시계 − upsert·런 로그 여유(SH 와 같은 값)
const MIN_FETCH_MS = 3000

const listUrl = (b: GhBoard) => `${BASE}/sb/sr/${b}/selectPbancRentHouseList.do`
const detailUrl = (r: GhListRow) => `${BASE}/sb/sr/${r.board}/selectPbancDetailView.do?` +
  new URLSearchParams({ previewYn: r.previewYn, pbancNo: r.pbancNo, pbancKndCd: r.pbancKndCd, bizTyNm: r.bizTyNm }).toString()

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchText(url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, text: new TextDecoder('utf-8').decode(await res.arrayBuffer()) }   // 청약센터는 UTF-8(Content-Type 실측)
}

const fetchList = (b: GhBoard, page: number, timeoutMs?: number) => page === 1
  ? fetchText(listUrl(b), {}, timeoutMs)
  : fetchText(listUrl(b), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ pageIndex: String(page) }).toString() }, timeoutMs)

const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

/** 목록 상태 → ZipFit status. 「-」(운영기관 상시 접수 등)는 SH 와 같이 '공고중'(없는 정보로 '접수중'을 붙이지 않는다). */
function mapStatus(r: GhListRow, today: string): string {
  if (/마감|종료/.test(r.status)) return '접수마감'
  if (r.closeDate && r.closeDate < today) return '접수마감'
  if (r.status === '접수중') return '접수중'
  return '공고중'
}

const isOpen = (r: GhListRow, today: string) => mapStatus(r, today) !== '접수마감'

// 비모집 공고(발표·서류·경쟁률 게시)와 임대 아닌 매각(「분양전환 후 잔여세대 일반매각」 769)은 버리지 않고 hidden_from_listing=true(SH 와 같은 축).
const HIDDEN_TITLE_KEYWORDS = ['당첨자', '예비자 발표', '서류심사', '서류제출', '발표', '연기', '경쟁률', '매각']
const isHidden = (r: GhListRow) => HIDDEN_TITLE_KEYWORDS.some(k => r.title.includes(k))

function mapRow(r: GhListRow, today: string) {
  return {
    source:               'GH',
    // 🔴 data-pbancNo(게시글 ID). 목록 「번호」 칸(행 번호)이 아니다 — parse.ts 머리 참조.
    announcement_id:      `GH_${r.pbancNo}`,
    title:                r.title,
    url:                  detailUrl(r),
    housing_type:         r.type,
    supply_org:           '경기주택도시공사',
    region:               '경기도',
    sido_nm:              '경기도',
    // sigungu_nm 은 싣지 않는다 — 상세 지구 소재지가 한 시·군일 때만 upsert 뒤 「비어 있는 행만」 채운다(목록 지역 칸은 공고 단위가 아니다).
    announcement_date:    r.announceDate,
    // 접수기간·당첨자발표일은 상세에서 하나로 읽힐 때만(아래 collect) — null 은 저장값을 지우지 않는다(protect_detail_columns).
    apply_start:          null as string | null,
    apply_end:            null as string | null,
    winner_announce_date: null as string | null,
    status:               mapStatus(r, today),
    is_revised:           r.pbancKndCd === '02' || /^\s*[\[(]\s*(재)?(수정|정정)/.test(r.title),
    hidden_from_listing:  isHidden(r),
    updated_at:           new Date().toISOString(),
  }
}

type Mapped = ReturnType<typeof mapRow> & { attachment_urls?: Omit<GhFile, 'bytes'>[] }

/** 목록을 읽어 들일 행을 고른다. known = 이미 들인 GH announcement_id(probe 는 빈 집합 — DB 를 읽지 않는다). */
async function readLists(known: Set<string>, startedAt: number, errors: string[]) {
  const today = todayKst()
  const remain = () => RUN_FETCH_BUDGET_MS - (Date.now() - startedAt)
  const pages: Record<string, { total: number; read: number; failed: number }> = {}
  const picked: GhListRow[] = []
  let parsed = 0
  for (const b of BOARDS) {
    const st = { total: 1, read: 0, failed: 0 }
    pages[b] = st
    for (let p = 1; p <= Math.min(st.total, MAX_PAGES); p++) {
      if (p > 1 || b !== BOARDS[0]) await sleep(PAGE_DELAY_MS)
      if (remain() < MIN_FETCH_MS) { errors.push(`${b} p=${p}: 시간 예산 넘음 — 열지 않음`); st.failed++; break }
      let rows: GhListRow[]
      try {
        const r = await fetchList(b, p, Math.min(FETCH_TIMEOUT_MS, remain()))
        if (r.status !== 200) { errors.push(`${b} p=${p}: status=${r.status}`); st.failed++; break }
        if (p === 1) st.total = parseTotalPages(r.text)
        rows = parseList(r.text, b)
      } catch (e) { errors.push(`${b} p=${p}: ${e}`); st.failed++; break }
      st.read++
      parsed += rows.length
      if (!rows.length) { errors.push(`${b} p=${p}: 행 0(꼴 바뀜?)`); break }
      const take = rows.filter(r => isOpen(r, today) || known.has(`GH_${r.pbancNo}`))
      picked.push(...take)
      if (!take.length) break   // 이 쪽에 열린·들인 공고가 없으면 더 옛 쪽도 없다(게시일 내림차순 — 실측)
    }
  }
  // 같은 pbancNo 가 쪽 사이에 밀려 두 번 나오면 배치 upsert 가 거부된다 — 미리 합친다.
  const map = new Map<string, GhListRow>()
  for (const r of picked) map.set(r.pbancNo, r)
  return { pages, parsed, rows: [...map.values()], today }
}

type DetailLog = { tried: number; with_files: number; files: number; failed: string[];
  windows: { id: string; start: string; end: string; closed: boolean }[]; unread: string[]; sigungu: Record<string, string> }

/** 열린(보이고 마감 아닌) 행만 상세를 연다 — 첨부 목록 · 접수 창 · 당첨자발표일 · 시·군. 🔴 상세 실패는 errors 에 넣지 않는다(SH 와 같음). */
async function readDetails(list: GhListRow[], rows: Mapped[], startedAt: number, today: string): Promise<DetailLog> {
  const remain = () => RUN_FETCH_BUDGET_MS - (Date.now() - startedAt)
  const log: DetailLog = { tried: 0, with_files: 0, files: 0, failed: [], windows: [], unread: [], sigungu: {} }
  const byId = new Map(list.map(r => [`GH_${r.pbancNo}`, r]))
  for (const m of rows.filter(r => !r.hidden_from_listing && r.status !== '접수마감').slice(0, DETAIL_CAP)) {
    await sleep(PAGE_DELAY_MS)
    if (remain() < MIN_FETCH_MS) { log.failed.push(`시간 예산 넘음 — 남은 상세 열지 않음(${m.announcement_id}부터)`); break }
    log.tried++
    try {
      const r = await fetchText(detailUrl(byId.get(m.announcement_id)!), {}, Math.min(FETCH_TIMEOUT_MS, remain()))
      if (r.status !== 200) { log.failed.push(`${m.announcement_id}: status=${r.status}`); continue }
      const d = parseDetail(r.text)
      const aw = applyWindow(d)
      if (aw.window) {
        m.apply_start = aw.window.start
        m.apply_end = aw.window.end
        const closed = aw.window.end < today
        if (closed) m.status = '접수마감'
        log.windows.push({ id: m.announcement_id, ...aw.window, closed })
      } else log.unread.push(`${m.announcement_id}: ${aw.why}`)
      m.winner_announce_date = winnerDate(d)
      const g = sigunguOf(d)
      if (g) log.sigungu[m.announcement_id] = g
      if (!d.files) { log.failed.push(`${m.announcement_id}: 공고문 첨부 없음`); continue }
      m.attachment_urls = d.files.map(({ url, label, filename }) => ({ url, label, filename }))
      log.with_files++; log.files += d.files.length
    } catch (e) { log.failed.push(`${m.announcement_id}: ${e}`) }
  }
  return log
}

async function logRun(row: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await supabase.from('gh_collection_run_log').insert(row)
    if (error) console.error(`GH 런 로그 기록 실패: ${error.message}`)
  } catch (e) { console.error(`GH 런 로그 기록 실패: ${e}`) }
}

async function collect() {
  const startedAt = Date.now()
  const errors: string[] = []
  try {
    const { data: knownRows, error: kErr } = await supabase.from('announcements').select('announcement_id').eq('source', 'GH')
    if (kErr) throw new Error(`이미 들인 GH 공고 조회 실패: ${kErr.message}`)
    const known = new Set((knownRows ?? []).map(r => r.announcement_id as string))
    const L = await readLists(known, startedAt, errors)
    const rows: Mapped[] = L.rows.map(r => mapRow(r, L.today))
    const detail = await readDetails(L.rows, rows, startedAt, L.today)

    let upserted = 0
    for (let i = 0; i < rows.length; i += 50) {
      const { data, error } = await supabase.from('announcements')
        .upsert(rows.slice(i, i + 50), { onConflict: 'source,announcement_id', ignoreDuplicates: false }).select('id')
      if (error) errors.push(`GH upsert[${i}]: ${error.message}`)
      else upserted += data?.length ?? 0
    }
    const gu = { filled: 0, failed: [] as string[] }
    for (const [id, g] of Object.entries(detail.sigungu)) {
      const { data, error } = await supabase.from('announcements').update({ sigungu_nm: g })
        .eq('source', 'GH').eq('announcement_id', id).is('sigungu_nm', null).select('id')
      if (error) gu.failed.push(`${id}: ${error.message}`)
      else gu.filled += data?.length ?? 0
    }
    const result = {
      pages: L.pages, parsed: L.parsed, picked: rows.length, upserted,
      hidden: rows.filter(r => r.hidden_from_listing).length,
      visible: rows.filter(r => !r.hidden_from_listing).length,
      duration_ms: Date.now() - startedAt, errors,
    }
    await logRun({ ...result, detail })
    console.log(`[GH] ${JSON.stringify({ ...result, detail, gu })}`)
    return { ...result, detail, gu }
  } catch (e) {
    await logRun({ pages: null, parsed: null, picked: null, upserted: null, hidden: null, visible: null,
      duration_ms: Date.now() - startedAt, errors: [...errors, String(e)], detail: null })
    throw e
  }
}

/** DB 를 읽지도 쓰지도 않는다 — robots · 목록(열린 공고) · 상세(열린 공고 · 또는 ?pbanc=<board>:<pbancNo>:<pbancKndCd>:<bizTyNm>) 매핑 결과만 돌려준다. */
async function probe(params: URLSearchParams) {
  const startedAt = Date.now()
  const out: Record<string, unknown> = {}
  try {
    const r = await fetchText(`${BASE}/robots.txt`)
    out.robots = { status: r.status, body: r.text.slice(0, 2000) }
  } catch (e) { out.robots = { error: String(e) } }
  const errors: string[] = []
  const L = await readLists(new Set(), startedAt, errors)
  let list = L.rows
  const one = params.get('pbanc')
  if (one) {
    const [board, pbancNo, pbancKndCd, bizTyNm] = one.split(':')
    if (!BOARDS.includes(board as GhBoard) || !/^\d+$/.test(pbancNo ?? '')) return { ...out, error: 'pbanc=<sr7150|sr7155>:<번호>:<종류>:<유형명>' }
    list = [{ board: board as GhBoard, pbancNo, pbancKndCd: pbancKndCd || '01', bizTyNm: bizTyNm || '', previewYn: 'N', type: bizTyNm || null,
      title: '(probe 지정)', area: null, announceDate: null, closeDate: null, status: '' }]
  }
  const rows: Mapped[] = list.map(r => mapRow(r, L.today))
  const detail = await readDetails(list, rows, startedAt, L.today)
  return { ...out, pages: L.pages, parsed: L.parsed, errors, rows, detail, duration_ms: Date.now() - startedAt }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  if (!matchCronSecret(req)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const params = new URL(req.url).searchParams
  const mode = params.get('mode') ?? 'collect'
  if (mode === 'authcheck') return authcheckResponse()
  try {
    if (mode === 'probe') return new Response(JSON.stringify({ mode, ...(await probe(params)) }), { headers: { 'Content-Type': 'application/json' } })
    if (mode === 'collect') return new Response(JSON.stringify({ mode, ...(await collect()) }), { headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ error: `미구현 mode: ${mode}` }), { status: 400 })
  } catch (e) {
    return new Response(JSON.stringify({ mode, error: String(e) }), { status: 500 })
  }
})
