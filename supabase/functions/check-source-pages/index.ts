// 열린 원문 키 정기 대조 Edge Function — 1단계 기록만 (2026-10-08 · 우편함 「코드 — 3-B ③ 열린 원문 키 정기 대조 …」 2)
//
// 무엇을 하나: 열린 대표 카드의 원문 키(LH panId · SH seq — source_check_targets())마다 공급기관 공고 페이지를 읽어
//   공고상태·접수기간(구조화된 값만 — parse.ts 머리)을 카드 값과 나란히 source_page_checks 에 남긴다.
//   🔴 기록만 한다 — announcements · apply_*_confirmed · status 를 쓰지 않는다(값 반영은 2단계 · 별도 페이지).
//   SH 는 공고 목록의 모집상태 + 같은 공고를 제목으로 가리키는 게시판 후속 공지 후보를 남긴다(접수기간은 본문 글자뿐이라 읽지 않는다).
//
// ⚠️ collect-lh-images · collect-lh-promo 와 합치지 말 것 — 대상(열린 카드 전부 · 매입 포함)과 주기(하루 2회)가 다르고
//   두 함수의 시간 예산을 잠식하지 않는다. 한 실행은 시간 예산 안에서 「최근 6시간 안에 대조하지 않은 키」를 앞에서부터 처리하고,
//   남은 것은 같은 회차의 다음 cron 호출(5분 간격)이 이어 받는다.
//
// 모드: collect(기본) · probe(DB 미기록 — ?id=<원문 키> 한 건의 파싱 결과) · authcheck.

import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'
import { parseLhPage, compareLh, parseShList, parseShBoard, matchFollowups, type ShPost } from './parse.ts'

const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL              = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const CRON_SECRET               = requireEnv('CRON_SECRET_V2')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const UA = 'Mozilla/5.0 (compatible; ZipFitBot/1.0; +https://kkokzip.com)'
const PAGE_TIMEOUT_MS = 30000
const PAGE_DELAY_MS = 700          // 페이지 호출 사이 간격 — 동시 호출하지 않는다
const RUN_BUDGET_MS = 100000       // 새 키를 시작하지 않는 문턱(150초 wall-clock 한도 안쪽)
const RUN_ERROR_LIMIT = 3          // 연속 페이지 오류가 이만큼이면 실행을 멈춘다
const DONE_WINDOW_H = 6            // 이 시간 안에 오류 없이 대조한 키는 건너뛴다(같은 회차의 다음 호출)
const SH_LIST_PAGES = 5            // SH 공고 목록에서 열린 seq 를 찾을 때 읽는 쪽 상한
const SH_BOARD_PAGES = 3           // SH 게시판에서 후속 공지를 찾을 때 읽는 쪽 수(10행씩 · 약 일주일)
const SH_LIST = (cp: number) => `https://housing.seoul.go.kr/site/main/sh/publicLease/list?cp=${cp}&supplyType=publicLease`
const SH_BOARD = (p: number) => `https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/list.do?page=${p}`

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

type Target = {
  source: 'LH' | 'SH'; source_key: string; card_id: string; page_url: string | null; title: string | null
  announcement_date: string | null; card_status: string | null; card_apply_start: string | null; card_apply_end: string | null
  card_apply_end_confirmed: string | null; card_notice_ends: unknown; card_soonest_open_end: string | null
}

async function getText(url: string): Promise<{ status: number; text: string }> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), PAGE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal })
    return { status: res.status, text: await res.text() }
  } finally {
    clearTimeout(timer)
  }
}

function lhUrl(t: Target): string {
  // 수집이 채운 url(유형 코드 포함)을 쓴다 — panId 만으로 만든 주소는 유형 코드가 다르면 오류 쪽이다(2026-10-08 실측).
  try {
    const u = new URL(t.page_url ?? '')
    if (u.hostname === 'apply.lh.or.kr' && u.pathname.endsWith('/selectWrtancInfo.do')) return u.toString()
  } catch { /* 아래로 */ }
  return `https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=${encodeURIComponent(t.source_key)}&ccrCnntSysDsCd=03&uppAisTpCd=06&mi=1026`
}

const baseRow = (t: Target, runId: number) => ({
  run_id: runId, source: t.source, source_key: t.source_key, card_id: t.card_id,
  card_status: t.card_status, card_apply_start: t.card_apply_start, card_apply_end: t.card_apply_end,
  card_apply_end_confirmed: t.card_apply_end_confirmed, card_notice_ends: t.card_notice_ends,
  card_soonest_open_end: t.card_soonest_open_end,
})

async function checkLh(t: Target, runId: number) {
  const url = lhUrl(t)
  const r = await getText(url)
  if (r.status !== 200) throw new Error(`페이지 HTTP ${r.status}`)
  const p = parseLhPage(r.text, t.source_key)
  if (!p.pageOk) throw new Error('공고 페이지 꼴이 아니다(게시글 정보 없음 — 오류 페이지 등)')
  return {
    ...baseRow(t, runId), page_url: url, http_status: r.status, page_form: p.form, page_status: p.status,
    page_apply_start: p.applyStart, page_apply_end: p.applyEnd, page_schedules: p.schedules,
    ...compareLh(p, { apply_start: t.card_apply_start, apply_end: t.card_apply_end }),
  }
}

async function shContext(keys: string[]) {
  // SH 공고 목록 모집상태(열린 seq 를 다 찾을 때까지 · 상한 SH_LIST_PAGES) + 게시판 첫 SH_BOARD_PAGES 쪽 글.
  const want = new Set(keys.map(k => k.replace(/^SH_/, '')))
  const status = new Map<string, string>()
  let listUrl: string | null = null
  for (let cp = 1; cp <= SH_LIST_PAGES && [...want].some(s => !status.has(s)); cp++) {
    if (cp > 1) await sleep(PAGE_DELAY_MS)
    const r = await getText(SH_LIST(cp))
    if (r.status !== 200) throw new Error(`SH 목록 cp=${cp} HTTP ${r.status}`)
    for (const row of parseShList(r.text)) if (want.has(row.seq)) { status.set(row.seq, row.status); listUrl ??= SH_LIST(cp) }
  }
  const posts: ShPost[] = []
  for (let p = 1; p <= SH_BOARD_PAGES; p++) {
    await sleep(PAGE_DELAY_MS)
    const r = await getText(SH_BOARD(p))
    if (r.status !== 200) throw new Error(`SH 게시판 page=${p} HTTP ${r.status}`)
    posts.push(...parseShBoard(r.text))
  }
  return { status, posts }
}

function checkSh(t: Target, runId: number, ctx: { status: Map<string, string>; posts: ShPost[] }) {
  const seq = t.source_key.replace(/^SH_/, '')
  const st = ctx.status.get(seq) ?? null
  return {
    ...baseRow(t, runId), page_url: t.page_url, http_status: 200, page_form: 'list', page_status: st,
    page_apply_start: null, page_apply_end: null, page_schedules: null,
    closed_mismatch: !!st && /마감|종료/.test(st), end_diff: false, start_diff: false,
    followups: matchFollowups(t.title ?? '', t.announcement_date, ctx.posts),
    error: st === null ? `SH 공고 목록 ${SH_LIST_PAGES}쪽 안에 seq ${seq} 없음` : null,
  }
}

async function collect() {
  const startedAt = Date.now()
  const { data: run, error: re } = await supabase.from('source_page_check_runs').insert({ mode: 'collect' }).select('id').single()
  if (re) throw new Error(`실행 기록: ${re.message}`)
  const runId = run.id as number
  const finish = async (patch: Record<string, unknown>) => {
    await supabase.from('source_page_check_runs').update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId)
  }
  try {
    const { data: tg, error: te } = await supabase.rpc('source_check_targets')
    if (te) throw new Error(`대상 조회: ${te.message}`)
    const since = new Date(Date.now() - DONE_WINDOW_H * 3600 * 1000).toISOString()
    const { data: done, error: de } = await supabase.from('source_page_checks')
      .select('source_key').gte('checked_at', since).is('error', null)
    if (de) throw new Error(`대조 이력 조회: ${de.message}`)
    const doneKeys = new Set((done ?? []).map(d => d.source_key as string))
    const todo = ((tg ?? []) as Target[]).filter(t => !doneKeys.has(t.source_key))
      .sort((a, b) => (a.source === b.source ? a.source_key.localeCompare(b.source_key) : a.source === 'SH' ? 1 : -1))
    let checked = 0, failed = 0, closed = 0, ends = 0, streak = 0
    let stoppedBy: string | null = null
    let shCtx: { status: Map<string, string>; posts: ShPost[] } | null = null
    for (const t of todo) {
      if (Date.now() - startedAt >= RUN_BUDGET_MS) { stoppedBy = 'budget'; break }
      if (checked + failed) await sleep(PAGE_DELAY_MS)
      let row: Record<string, unknown>
      try {
        if (t.source === 'SH') {
          shCtx ??= await shContext(todo.filter(x => x.source === 'SH').map(x => x.source_key))
          row = checkSh(t, runId, shCtx)
        } else {
          row = await checkLh(t, runId)
        }
        streak = 0
      } catch (e) {
        row = { ...baseRow(t, runId), page_url: t.source === 'LH' ? lhUrl(t) : t.page_url, error: String(e).slice(0, 500) }
        streak++
      }
      const { error: ie } = await supabase.from('source_page_checks').insert(row)
      if (ie) throw new Error(`대조 행 저장: ${ie.message}`)
      if (row.error) failed++; else checked++
      if (row.closed_mismatch) closed++
      if (row.end_diff) ends++
      if (streak >= RUN_ERROR_LIMIT) { stoppedBy = 'page_errors'; break }
    }
    const res = { targets: todo.length, checked, failed, closed_mismatch: closed, end_diff: ends, stopped_by: stoppedBy }
    await finish(res)
    return { run_id: runId, ...res, duration_ms: Date.now() - startedAt }
  } catch (e) {
    await finish({ error: String(e).slice(0, 500) })
    throw e
  }
}

async function probe(id: string) {
  if (/^SH_\d+$/.test(id)) {
    const ctx = await shContext([id])
    return { id, sh_status: ctx.status.get(id.slice(3)) ?? null, board_posts: ctx.posts.length, posts: ctx.posts.slice(0, 10) }
  }
  const { data, error } = await supabase.from('announcements').select('url').eq('announcement_id', id).maybeSingle()
  if (error) throw new Error(`url 조회: ${error.message}`)
  const url = lhUrl({ source: 'LH', source_key: id, page_url: (data?.url as string) ?? null } as Target)
  const r = await getText(url)
  return { id, url, http_status: r.status, bytes: r.text.length, ...parseLhPage(r.text, id) }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Unauthorized' }, 401)
  const params = new URL(req.url).searchParams
  const mode = params.get('mode') ?? 'collect'
  if (mode === 'authcheck') return json({ mode, ok: true })
  try {
    if (mode === 'probe') {
      const id = (params.get('id') ?? '').trim()
      if (!/^(\d{10,20}|SH_\d+)$/.test(id)) return json({ error: 'probe 는 ?id=<panId 또는 SH_seq> 하나' }, 400)
      return json({ mode, ...(await probe(id)) })
    }
    if (mode === 'collect') return json({ mode, ...(await collect()) })
    return json({ error: `미구현 mode: ${mode}` }, 400)
  } catch (e) {
    return json({ mode, error: String(e) }, 500)
  }
})
