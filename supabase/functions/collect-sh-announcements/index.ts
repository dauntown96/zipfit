// SH(서울주택도시개발공사) 공고 수집 Edge Function
//
// ⚠️ 이 함수가 collect-announcements와 별도로 존재하는 이유(합치지 말 것):
// collect-announcements는 LH 상세조회 슬롯이 90칸 상한인데 이미 87~88건으로 포화다.
// SH를 같은 함수에 넣으면 그 슬롯과 150초 wall-clock 예산을 직접 잠식한다.
//
// ⚠️ Claude Code 컨테이너에서는 이 함수를 직접 테스트할 수 없다.
// 컨테이너 egress 프록시가 housing.seoul.go.kr / www.i-sh.co.kr 를 403으로 막는다(정책 거부).
// Edge Function 요청은 Supabase 인프라에서 나가므로 그 정책과 무관하다.
// 그래서 `?mode=probe`(DB 미기록 진단 모드)를 두고 DB의 net.http_post로 호출해 확인한다.
//
// robots.txt 실측(2026-08-19): `User-agent: * / Allow: /` — 전면 허용, Disallow 없음.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// 코딩원칙 16번: `Deno.env.get()!`는 타입 단언일 뿐 런타임 검사가 아니라서
// 미설정 시 undefined로 조용히 잘못 동작한다. 없으면 명시적으로 throw 한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL              = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const CRON_SECRET               = requireEnv('CRON_SECRET')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const BASE = 'https://housing.seoul.go.kr'
const LIST_PATH = '/site/main/sh/publicLease/list'
const UA = 'Mozilla/5.0 (compatible; ZipFitBot/1.0; +https://dauntown96.github.io/zipfit)'
const MAX_PAGES_HARD_CAP = 50   // 파싱 실패로 페이지 수가 폭주해도 무한 순회하지 않도록
const PAGE_DELAY_MS = 1000      // 요청 간 최소 간격. 동시 요청하지 않는다.

const listUrl = (cp: number) => `${BASE}${LIST_PATH}?cp=${cp}&supplyType=publicLease`

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchText(url: string): Promise<{ status: number; contentType: string | null; utf8: string; euckr: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  const buf = await res.arrayBuffer()
  const dec = (enc: string) => { try { return new TextDecoder(enc).decode(buf) } catch { return '' } }
  return { status: res.status, contentType: res.headers.get('content-type'), utf8: dec('utf-8'), euckr: dec('euc-kr') }
}

/** 한글이 깨지지 않은 쪽을 고른다(치환문자 U+FFFD가 적은 쪽).
 *  실측상 SH는 UTF-8이지만, 국내 공공사이트는 EUC-KR인 경우가 있어 단정하지 않는다. */
function pickDecoded(utf8: string, euckr: string): { text: string; encoding: string } {
  const bad = (s: string) => (s.match(/�/g) ?? []).length
  return bad(utf8) <= bad(euckr) ? { text: utf8, encoding: 'utf-8' } : { text: euckr, encoding: 'euc-kr' }
}

const decodeEntities = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

/** 'YYYY-MM-DD'만 날짜로 인정한다. '-'(발표일 미정)는 null. */
const parseDate = (s: string | null): string | null => {
  if (!s) return null
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** 총 페이지 수를 HTML에서 읽는다(하드코딩 금지).
 *  1순위: "마지막 페이지" 링크의 cp — 페이지 번호가 10개 단위로 윈도잉돼도 항상 진짜 마지막을 가리킨다.
 *  2순위: 페이징 영역 안 cp 값의 최대치. */
function parseTotalPages(html: string): number {
  const last = html.match(/<a[^>]+href="[^"]*[?&]cp=(\d+)[^"]*"[^>]*title="마지막 페이지"/)
  if (last) return Math.max(1, parseInt(last[1]))
  const pagingIdx = html.search(/<div[^>]*class="[^"]*paging/i)
  if (pagingIdx >= 0) {
    const chunk = html.slice(pagingIdx, pagingIdx + 4000)
    const nums = [...chunk.matchAll(/[?&]cp=(\d+)/g)].map(m => parseInt(m[1])).filter(n => !isNaN(n))
    if (nums.length) return Math.max(1, Math.max(...nums))
  }
  return 1
}

type ShRow = {
  seq: string; housingType: string | null; title: string
  announceDate: string | null; winnerDate: string | null
  status: string; dept: string | null; url: string
}

/** 목록 테이블 한 페이지를 파싱한다.
 *
 *  ⚠️ announcement_id는 반드시 i-sh.co.kr 링크의 seq를 쓴다(아래 상세 주석 참조).
 *  같은 페이지에 있는 `/site/main/sh/publicLease/view?seq=N`의 N은 **그 페이지 안에서의
 *  행 번호(1..10)**일 뿐이라 새 공고가 올라올 때마다 가리키는 공고가 바뀐다. 그걸 식별자로
 *  쓰면 매 수집마다 기존 행의 내용이 다른 공고로 덮어써진다. 게다가 그 링크는 HTML에서
 *  주석 처리되어 실제로 동작하지도 않는다. */
function parseListPage(html: string): ShRow[] {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '')
  const tbodyM = noComments.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
  if (!tbodyM) return []
  const rows: ShRow[] = []

  for (const trM of tbodyM[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tr = trM[1]
    const cells = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map(m => ({
      cls: (m[1].match(/class\s*=\s*"([^"]*)"/) ?? [, ''])[1] ?? '',
      text: stripTags(m[2]),
      raw: m[2],
    }))
    if (!cells.length) continue

    const linkCell = cells.find(c => /\btd5\b/.test(c.cls)) ?? cells[cells.length - 1]
    const hrefM = linkCell?.raw.match(/href="([^"]*view\.do\?[^"]*seq=(\d+)[^"]*)"/)
    if (!hrefM) continue   // 링크 없는 행(빈 목록 안내 등)은 건너뛴다
    const seq = hrefM[2]
    const url = decodeEntities(hrefM[1])

    const housingType = cells.find(c => /\btd3\b/.test(c.cls))?.text || null
    const title = cells.find(c => /\btxl\b/.test(c.cls))?.text || ''
    const announceDate = parseDate(cells.find(c => /\btd4\b/.test(c.cls))?.text ?? null)

    // 발표일 / 모집상태 / 담당부서는 셋 다 class="td-mdisn"이라 클래스로 구분되지 않는다.
    // thead 실측상 순서는 [발표일, 모집상태, 담당부서]이며, 모집상태 컬럼은 템플릿상
    // 조건부라 없을 수 있다. 그래서 개수로 분기한다(2개면 모집상태 컬럼 자체가 없는 경우).
    const mdisn = cells.filter(c => /\btd-mdisn\b/.test(c.cls)).map(c => c.text)
    const winnerDate = parseDate(mdisn[0] ?? null)
    const status = mdisn.length >= 3 ? (mdisn[1] ?? '') : ''
    const dept = (mdisn.length >= 3 ? mdisn[2] : mdisn[1]) || null

    if (!title) continue
    rows.push({ seq, housingType, title, announceDate, winnerDate, status, dept, url })
  }
  return rows
}

/** SH 모집상태 → ZipFit status.
 *  '모집중'을 '접수중'이 아니라 '공고중'으로 두는 이유: SH 목록에는 접수기간이 없다.
 *  없는 정보로 '접수중'을 붙이면 사용자에게 "오늘 신청할 수 있다"는 잘못된 신호가 된다.
 *  상세 파싱으로 접수기간이 들어오면 그때 승격한다. */
function mapStatus(shStatus: string): string {
  const s = (shStatus ?? '').trim()
  if (s.includes('마감') || s.includes('종료')) return '접수마감'
  return '공고중'
}

// 비모집 공고(당첨자·서류심사·연기·운영기관 안내)와 비주택(상가임대·용지분양)을 가리는 규칙.
// 버리지 않고 hidden_from_listing=true로 적재한다 — 수집을 좁히면 되돌릴 수 없고,
// 향후 발표일 알림 기능에 과거분이 필요하다. RPC의 base CTE가 이 플래그를 걸러낸다.
const HIDDEN_TYPES = ['상가임대', '용지분양']
const HIDDEN_TITLE_KEYWORDS = ['당첨자', '예비자 발표', '서류심사', '서류제출', '발표', '연기', '운영기관', '모집 일정']

function isHidden(row: ShRow): boolean {
  if (row.housingType && HIDDEN_TYPES.some(t => row.housingType!.includes(t))) return true
  return HIDDEN_TITLE_KEYWORDS.some(k => row.title.includes(k))
}

function mapRow(row: ShRow) {
  return {
    source:               'SH',
    // ⚠️ i-sh.co.kr 게시글 seq. publicLease/view?seq=N(행 번호)이 아니다 — parseListPage 주석 참조.
    announcement_id:      `SH_${row.seq}`,
    title:                row.title,
    url:                  row.url,
    housing_type:         row.housingType,
    supply_org:           '서울주택도시개발공사',
    region:               '서울',
    sido_nm:              '서울특별시',
    sigungu_nm:           null,   // 목록·상세에 자치구 정보가 없다. 추측하지 않는다.
    announcement_date:    row.announceDate,
    winner_announce_date: row.winnerDate,
    apply_start:          null,   // 목록에 접수기간이 없다. 상세 파싱은 이번 범위 밖.
    apply_end:            null,
    status:               mapStatus(row.status),
    // SH는 수정본 접두를 '(수정) '뿐 아니라 '[수정] '·'[정정]'·'[재정정_배점표 등 수정]'처럼
    // 대괄호로도 붙인다(실측). 괄호만 보면 대괄호 수정본이 is_revised=false로 남아,
    // dedup에서 원본이 승자가 되어 사용자에게 옛 내용이 보인다(사당동 공공원룸 실측 사례).
    is_revised:           /^\s*[\[(]\s*(재)?(수정|정정)/.test(row.title),
    hidden_from_listing:  isHidden(row),
    updated_at:           new Date().toISOString(),
  }
}

async function collect() {
  const startedAt = Date.now()
  const errors: string[] = []

  const first = await fetchText(listUrl(1))
  if (first.status !== 200) throw new Error(`SH 목록 1페이지 status=${first.status}`)
  const firstHtml = pickDecoded(first.utf8, first.euckr).text
  const totalPages = Math.min(parseTotalPages(firstHtml), MAX_PAGES_HARD_CAP)

  const allRows: ShRow[] = []
  allRows.push(...parseListPage(firstHtml))

  for (let cp = 2; cp <= totalPages; cp++) {
    await sleep(PAGE_DELAY_MS)
    try {
      const r = await fetchText(listUrl(cp))
      if (r.status !== 200) { errors.push(`목록 cp=${cp}: status=${r.status}`); continue }
      allRows.push(...parseListPage(pickDecoded(r.utf8, r.euckr).text))
    } catch (e) { errors.push(`목록 cp=${cp}: ${e}`) }
  }

  // 같은 seq가 여러 페이지에 걸쳐 나오면(목록 갱신 중 밀림) 배치 upsert가 통째로 거부되므로
  // 미리 병합한다 — MYHOME에서 실제로 겪은 "ON CONFLICT ... cannot affect row a second time".
  const map = new Map<string, ReturnType<typeof mapRow>>()
  for (const r of allRows) { const m = mapRow(r); map.set(m.announcement_id, m) }
  const rows = [...map.values()]
  const dedupMerged = allRows.length - rows.length

  let upserted = 0
  for (let i = 0; i < rows.length; i += 50) {
    const { data, error } = await supabase.from('announcements')
      .upsert(rows.slice(i, i + 50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
      .select('id')
    if (error) errors.push(`SH upsert[${i}]: ${error.message}`)
    else upserted += data?.length ?? 0
  }

  return {
    total_pages: totalPages,
    parsed: allRows.length,
    dedup_merged: dedupMerged,
    upserted,
    hidden: rows.filter(r => r.hidden_from_listing).length,
    visible: rows.filter(r => !r.hidden_from_listing).length,
    duration_ms: Date.now() - startedAt,
    errors,
  }
}

async function probe() {
  const out: Record<string, unknown> = {}
  try {
    const r = await fetchText(`${BASE}/robots.txt`)
    const p = pickDecoded(r.utf8, r.euckr)
    out.robots = { status: r.status, content_type: r.contentType, body: p.text.slice(0, 4000) }
  } catch (e) { out.robots = { error: String(e) } }

  try {
    const r = await fetchText(listUrl(1))
    const p = pickDecoded(r.utf8, r.euckr)
    const rows = parseListPage(p.text)
    out.list = {
      status: r.status,
      content_type: r.contentType,
      encoding_guess: p.encoding,
      html_length: p.text.length,
      total_pages: parseTotalPages(p.text),
      parsed_count: rows.length,
      sample: rows.slice(0, 5).map(mapRow),
    }
  } catch (e) { out.list = { error: String(e) } }

  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-cron-secret',
  }})
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const mode = new URL(req.url).searchParams.get('mode') ?? 'collect'
  try {
    if (mode === 'probe') {
      return new Response(JSON.stringify({ mode: 'probe', ...(await probe()) }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (mode === 'collect') {
      return new Response(JSON.stringify({ mode: 'collect', ...(await collect()) }), { headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: `미구현 mode: ${mode}` }), { status: 400 })
  } catch (e) {
    return new Response(JSON.stringify({ mode, error: String(e) }), { status: 500 })
  }
})
