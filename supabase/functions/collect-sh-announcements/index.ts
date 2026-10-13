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

import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'

// 코딩원칙 16번: `Deno.env.get()!`는 타입 단언일 뿐 런타임 검사가 아니라서
// 미설정 시 undefined로 조용히 잘못 동작한다. 없으면 명시적으로 throw 한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL              = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
// 🔴 시크릿 게이트 — 값은 CRON_SECRET_V2 하나만 받는다.
// 2026-09-04 교체 완료. 이중 수용(구 CRON_SECRET 병행)은 cron 잡 3개가 신 값으로
// 도는 것을 확인한 뒤 걷어냈다 — 대시보드에서 구 값을 지우기 *전에* 걷어내야 한다.
// requireEnv가 필수 참조라 순서를 뒤집으면 EF가 부팅 즉시 throw하기 때문이다.
// 다음 교체 때도 같은 순서로 한다: 이중 수용 배포 → cron 전환·확인 → 단일 수용 배포 → 구 값 삭제.
const CRON_SECRET = requireEnv('CRON_SECRET_V2')

const matchCronSecret = (req: Request): boolean =>
  req.headers.get('x-cron-secret') === CRON_SECRET

// 인증만 확인하고 즉시 반환한다(수집·외부 호출 없음). 시크릿에 관한 어떤 값도 담지 않는다.
// 미인증 요청은 이 지점에 도달하지 못하므로(401) 외부에 드러나는 정보가 없고,
// 주기가 긴 EF를 부작용 없이 검증할 유일한 수단이라 교체 후에도 남긴다.
const authcheckResponse = () => new Response(JSON.stringify({ mode: 'authcheck', ok: true }),
  { headers: { 'Content-Type': 'application/json' } })

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const BASE = 'https://housing.seoul.go.kr'
const LIST_PATH = '/site/main/sh/publicLease/list'
const UA = 'Mozilla/5.0 (compatible; ZipFitBot/1.0; +https://kkokzip.com)'
const MAX_PAGES_HARD_CAP = 50   // 파싱 실패로 페이지 수가 폭주해도 무한 순회하지 않도록
const PAGE_DELAY_MS = 1000      // 요청 간 최소 간격. 동시 요청하지 않는다.

const listUrl = (cp: number) => `${BASE}${LIST_PATH}?cp=${cp}&supplyType=publicLease`
// 🔵 2026-10-12(우편함 「코드 — B′ ② SH · ③ 부산도시공사 원문 운반」) — 열린 공고만 상세(i-sh 게시글)를 열어 첨부 목록을 읽는다.
//    상세 HTML 의 `initParam.downList = [{brdId, seq, fileSeq, fileSize, oriFileNm, fileTp}, …]` 를 그대로 옮긴다(짓지 않는다).
//    받기 주소는 같은 게시판의 innoFD.do — fetch-attachment 허용목록(www.i-sh.co.kr)에 이미 있다.
const SH_FILE_BASE = 'https://www.i-sh.co.kr/main/com/file/innoFD.do'
const DETAIL_CAP = 30            // 한 런에서 상세를 여는 상한(열린 공고는 보통 한 자리 수)

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
 *  ⚠️ announcement_id는 반드시 i-sh.co.kr 링크의 seq를 쓴다.
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

// 비모집 공고(당첨자·서류심사·연기·운영기관 안내·경쟁률 게시)와 비주택(상가임대·용지분양)을 가리는 규칙.
// 버리지 않고 hidden_from_listing=true로 적재한다 — 수집을 좁히면 되돌릴 수 없고,
// 향후 발표일 알림 기능에 과거분이 필요하다. RPC의 base CTE가 이 플래그를 걸러낸다.
const HIDDEN_TYPES = ['상가임대', '용지분양']
const HIDDEN_TITLE_KEYWORDS = ['당첨자', '예비자 발표', '서류심사', '서류제출', '발표', '연기', '운영기관', '모집 일정', '경쟁률']

function isHidden(row: ShRow): boolean {
  if (row.housingType && HIDDEN_TYPES.some(t => row.housingType!.includes(t))) return true
  return HIDDEN_TITLE_KEYWORDS.some(k => row.title.includes(k))
}

type ShFile = { url: string; label: string; filename: string }

/** 상세 HTML 의 downList 를 첨부 목록으로. 못 읽으면 null(→ 그 행의 attachment_urls 를 싣지 않아 기존 값이 남는다). */
function parseDownList(html: string): ShFile[] | null {
  const m = html.match(/initParam\.downList\s*=\s*(\[[\s\S]*?\])\s*;/)
  if (!m) return null
  let arr: unknown
  try { arr = JSON.parse(m[1]) } catch { return null }
  if (!Array.isArray(arr)) return null
  const out: ShFile[] = []
  for (const f of arr as Record<string, unknown>[]) {
    const brdId = String(f?.brdId ?? ''), seq = String(f?.seq ?? ''), fileSeq = String(f?.fileSeq ?? '')
    const fileTp = String(f?.fileTp ?? 'A'), name = String(f?.oriFileNm ?? '').trim()
    if (!brdId || !seq || !fileSeq || !name) continue
    const q = new URLSearchParams({ brdId, seq, fileTp, fileSeq })
    out.push({ url: `${SH_FILE_BASE}?${q.toString()}`, label: name, filename: name })
  }
  return out.length ? out : null
}

// 🔵 2026-10-13(우편함 「코드 — SH 새 공고 진입 지연 · SH 자치구」 4) — 제목에 서울 자치구 이름이 **하나만** 있을 때만 그 구를 쓴다.
//    여러 구·없음은 null(추측하지 않는다 — 「신혼·신생아 매입임대Ⅰ」처럼 여러 구에 걸친 공고는 제목에 구가 없다).
//    앞이 글자(한글)면 구 이름의 일부로 보지 않는다(「집중구」 같은 낱말에서 「중구」를 줍지 않게).
const SEOUL_GU = ['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구',
  '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구']
function guFromTitle(title: string): string | null {
  const t = String(title ?? '')
  const hit = new Set(SEOUL_GU.filter(g => new RegExp(`(^|[^가-힣])${g}`).test(t)))
  // 「동대문구」 안의 「대문구」처럼 겹치는 짧은 이름은 없다(25개 실측) · 「중구」는 「중랑구」와 겹치지 않는다(뒤 글자가 다르다).
  return hit.size === 1 ? [...hit][0] : null
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
    // 🔴 sigungu_nm 은 싣지 않는다(2026-10-13) — 종전에는 null 을 실어 매 수집마다 덮었다. 제목에서 구 하나를 읽은 행만
    //    upsert 뒤 따로 「비어 있는 행만」 채운다(collect · fillGu). 목록·상세에 자치구 칸은 없다.
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

// 🔴 로그 쓰기가 실패해도 수집을 멈추지 않는다 — 부수적인 일이다.
// supabase-js 는 던지지 않고 { error } 로 돌려주므로 두 축을 모두 삼킨다.
async function logRun(row: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await supabase.from('sh_collection_run_log').insert(row)
    if (error) console.error(`SH 런 로그 기록 실패: ${error.message}`)
  } catch (e) {
    console.error(`SH 런 로그 기록 실패: ${e}`)
  }
}

async function collect() {
  const startedAt = Date.now()
  const errors: string[] = []
  // 목록 페이지 중 200이 아니었거나 예외가 난 수. 0이 아니면 그 런은 「전량을 봤다」고 말할 수 없다.
  let pagesFailed = 0

  try {
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
      if (r.status !== 200) { errors.push(`목록 cp=${cp}: status=${r.status}`); pagesFailed++; continue }
      allRows.push(...parseListPage(pickDecoded(r.utf8, r.euckr).text))
    } catch (e) { errors.push(`목록 cp=${cp}: ${e}`); pagesFailed++ }
  }

  // 같은 seq가 여러 페이지에 걸쳐 나오면(목록 갱신 중 밀림) 배치 upsert가 통째로 거부되므로
  // 미리 병합한다 — MYHOME에서 실제로 겪은 "ON CONFLICT ... cannot affect row a second time".
  const map = new Map<string, ReturnType<typeof mapRow>>()
  for (const r of allRows) { const m = mapRow(r); map.set(m.announcement_id, m) }
  const rows: (ReturnType<typeof mapRow> & { attachment_urls?: ShFile[] })[] = [...map.values()]
  const dedupMerged = allRows.length - rows.length

  // 🔵 열린(보이고 마감 아닌) 공고만 상세를 연다 — 첨부 목록. 🔴 상세 실패는 errors 에 넣지 않는다:
  //    errors 가 비지 않은 런은 sh_close_missing 의 「봤다」 판정에서 빠진다(목록을 다 봤는지와 상세는 다른 물음).
  const detail = { tried: 0, with_files: 0, files: 0, failed: [] as string[] }
  for (const r of rows.filter(r => !r.hidden_from_listing && r.status !== '접수마감').slice(0, DETAIL_CAP)) {
    await sleep(PAGE_DELAY_MS)
    detail.tried++
    try {
      const d = await fetchText(r.url)
      if (d.status !== 200) { detail.failed.push(`${r.announcement_id}: status=${d.status}`); continue }
      const files = parseDownList(pickDecoded(d.utf8, d.euckr).text)
      if (!files) { detail.failed.push(`${r.announcement_id}: downList 없음`); continue }
      r.attachment_urls = files
      detail.with_files++; detail.files += files.length
    } catch (e) { detail.failed.push(`${r.announcement_id}: ${e}`) }
  }

  let upserted = 0
  for (let i = 0; i < rows.length; i += 50) {
    const { data, error } = await supabase.from('announcements')
      .upsert(rows.slice(i, i + 50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
      .select('id')
    if (error) errors.push(`SH upsert[${i}]: ${error.message}`)
    else upserted += data?.length ?? 0
  }

  // 🔵 2026-10-13 — 제목에 서울 자치구 하나가 있는 행의 시군구를 채운다(비어 있는 행만 · 이미 있는 값은 덮지 않는다).
  //    🔴 errors 에 넣지 않는다 — sh_close_missing 의 「목록을 다 봤다」 판정과 다른 물음이다(상세 실패와 같은 처리 · 응답에만 싣는다).
  const gu = { filled: 0, failed: [] as string[] }
  for (const r of rows) {
    const g = guFromTitle(r.title)
    if (!g) continue
    const { data, error } = await supabase.from('announcements').update({ sigungu_nm: g })
      .eq('source', 'SH').eq('announcement_id', r.announcement_id).is('sigungu_nm', null).select('id')
    if (error) gu.failed.push(`${r.announcement_id}: ${error.message}`)
    else gu.filled += data?.length ?? 0
  }

  const result = {
    total_pages: totalPages,
    pages_failed: pagesFailed,
    parsed: allRows.length,
    dedup_merged: dedupMerged,
    upserted,
    hidden: rows.filter(r => r.hidden_from_listing).length,
    visible: rows.filter(r => !r.hidden_from_listing).length,
    duration_ms: Date.now() - startedAt,
    errors,
  }
  await logRun(result)
  return { ...result, detail, gu }   // detail · gu 는 런 로그 표 칸이 아니라 응답에만 싣는다

  } catch (e) {
    // 🔴 1페이지부터 죽은 런도 남긴다 — 「무엇이 실패했는지 사후에 볼 방법이 없다」가 이 표의 이유다.
    // ⚠️ 미검출 횟수를 셀 때는 pages_failed > 0 이거나 errors 가 비지 않은 런을 제외한다
    //    (「안 보였다」와 「못 봤다」를 가르기 위해서다).
    await logRun({
      total_pages: null, pages_failed: pagesFailed, parsed: null, dedup_merged: null,
      upserted: null, hidden: null, visible: null,
      duration_ms: Date.now() - startedAt,
      errors: [...errors, String(e)],
    })
    throw e
  }
}

async function probe(probeSeq: string | null) {
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

  // ?seq=<i-sh 게시글 seq> — 상세 한 건의 첨부 목록 파싱(DB 미기록)
  const seq = probeSeq
  if (seq) {
    try {
      const r = await fetchText(`https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/view.do?seq=${encodeURIComponent(seq)}`)
      const p = pickDecoded(r.utf8, r.euckr)
      out.detail = { status: r.status, encoding_guess: p.encoding, html_length: p.text.length, files: parseDownList(p.text) }
    } catch (e) { out.detail = { error: String(e) } }
  }

  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-cron-secret',
  }})
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  if (!matchCronSecret(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (new URL(req.url).searchParams.get('mode') === 'authcheck') return authcheckResponse()

  const mode = new URL(req.url).searchParams.get('mode') ?? 'collect'
  try {
    if (mode === 'probe') {
      return new Response(JSON.stringify({ mode: 'probe', ...(await probe(new URL(req.url).searchParams.get('seq'))) }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (mode === 'collect') {
      return new Response(JSON.stringify({ mode: 'collect', ...(await collect()) }), { headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: `미구현 mode: ${mode}` }), { status: 400 })
  } catch (e) {
    return new Response(JSON.stringify({ mode, error: String(e) }), { status: 500 })
  }
})
