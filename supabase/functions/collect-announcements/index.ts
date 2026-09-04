import { createClient } from 'jsr:@supabase/supabase-js@2'

// 시크릿은 전부 환경변수 필수. 하드코딩 폴백을 두지 않는다.
// TypeScript의 `!`는 타입 단언일 뿐 런타임 검사가 아니라서, 미설정 시 undefined로
// 조용히 잘못 동작한다(예: serviceKey=undefined로 API 호출). 명시적으로 throw 한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL              = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const LH_API_KEY                = requireEnv('LH_API_KEY')
// 🔴 CRON_SECRET 교체 구간(2026-09-04) — 구 값과 신 값을 모두 수용한다.
// 값 교체는 원자적이지 않다: 대시보드 시크릿 변경과 cron 잡 재작성 사이에 발화한 잡이
// 401로 조용히 실패하고 collection_run_log에 흔적조차 남지 않는다. 그 구간을 없애려고
// 이중 수용을 둔다. 교체가 끝나면 구 값 수용을 걷어낸 뒤에 대시보드에서 구 값을 삭제한다
// (순서 역전 금지 — requireEnv('CRON_SECRET')이 필수라 먼저 삭제하면 EF가 부팅 즉시 throw).
const CRON_SECRET    = requireEnv('CRON_SECRET')
const CRON_SECRET_V2 = Deno.env.get('CRON_SECRET_V2') ?? null

const matchCronSecret = (req: Request): 'v1' | 'v2' | null => {
  const got = req.headers.get('x-cron-secret')
  if (!got) return null
  if (CRON_SECRET_V2 !== null && got === CRON_SECRET_V2) return 'v2'
  if (got === CRON_SECRET) return 'v1'
  return null
}

// 인증만 확인하고 즉시 반환한다(수집·외부 호출 없음). 시크릿 값은 담지 않는다.
const authcheckResponse = (matched: 'v1' | 'v2') => new Response(JSON.stringify({
  mode: 'authcheck', ok: true, matched, v2_configured: CRON_SECRET_V2 !== null,
}), { headers: { 'Content-Type': 'application/json' } })

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const san = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return (s === '' || s === 'null' || s === 'undefined') ? null : s
}
const sanNum = (v: unknown): number | null => {
  if (v == null) return null
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}
const parseDate = (v: unknown): string | null => {
  if (!v) return null
  const s = String(v).replace(/[.\-/]/g, '').trim()
  return /^\d{8}$/.test(s) ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : null
}
const normalizeTitle = (v: string | null): string | null =>
  v ? v.replace(/^(\[정정공고\]\s*)+/, '[정정공고]') : v
const SIDO_MAP: Record<string,string> = {
  '서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시',
  '광주':'광주광역시','대전':'대전광역시','울산':'울산광역시','세종':'세종특별자치시',
  '경기':'경기도','강원':'강원특믄자치도','충북':'충청북도','충남':'충청남도',
  '전북':'전북특별자치도','전남':'전라남도','경북':'경상북도','경남':'경상남도',
  '제주':'제주특별자치도',
}
const normSido = (v: string): string => SIDO_MAP[v] ?? v

const MERGED_SIDO_MAP: Record<string,string> = {
  '광주광역시': '전남광주통합특별시',
  '전라남도':   '전남광주통합특별시',
}
const applySidoMerge = (v: string | null): string | null => v ? (MERGED_SIDO_MAP[v] ?? v) : v

type NoticeItem = {
  PAN_ID: string; PAN_NM: string; CNP_CD_NM: string
  UPP_AIS_TP_NM: string; AIS_TP_CD_NM: string
  UPP_AIS_TP_CD: string; AIS_TP_CD: string
  SPL_INF_TP_CD: string; CCR_CNNT_SYS_DS_CD: string
  PAN_SS: string; PAN_NT_ST_DT: string; CLSG_DT: string; PAN_DT: string; DTL_URL: string
}
type SbdItem = {
  MIN_MAX_RSDN_DDO_AR?: string; DDO_AR?: string
  SUM_TOT_HSH_CNT?: string; HSH_CNT?: string
  HTN_FMLA_DS_CD_NM?: string; HTN_FMLA_DESC?: string
  MVIN_XPC_YM?: string; LCT_ARA_ADR?: string; LGDN_ADR?: string
  LCC_NT_NM?: string
}
type SplScdlItem = {
  SBSC_ACP_ST_DT?: string; SBSC_ACP_CLSG_DT?: string
  PPR_SBM_OPE_ANC_DT?: string; PPR_ACP_ST_DT?: string; PPR_ACP_CLSG_DT?: string
  PZWR_ANC_DT?: string; CTRT_ST_DT?: string; CTRT_ED_DT?: string
}
type EtcInfoItem = { ETC_CTS?: string; CRC_RSN?: string }
type AhflInfoItem = { AHFL_URL?: string; SL_PAN_AHFL_DS_CD_NM?: string; CMN_AHFL_NM?: string }
type MyHomeItem = Record<string, string | number | null>

// 업스트림(apis.data.go.kr)이 간헐적으로 JSON이 아닌 응답을 준다(2026-08-25 조사).
// 실측된 두 오류는 뿌리가 같다 — 응답이 기대 형식이 아닌데 검증 없이 파싱한 것.
//   · SyntaxError: Unexpected token '<', "<!DOCTYPE "...  → HTML 페이지가 옴
//   · TypeError: raw.find is not a function              → JSON이지만 배열이 아님
// 타입 단언(as)은 런타임에 아무것도 검사하지 않는다. 아래에서 실제로 확인한다.
type FetchFail = { kind: string; status: number | null; contentType: string | null; snippet: string }

class UpstreamError extends Error {
  constructor(public readonly info: FetchFail) { super(info.kind) }
}

// 응답 본문 선두만 남긴다(전문 아님). URL은 절대 남기지 않는다 — ServiceKey가 섞여 들어간다.
// 다만 일부 오류 페이지는 요청 URL을 본문에 그대로 되비추므로, 본문 쪽에도 방어를 한 겹 둔다.
const SNIPPET_LEN = 200
const redactKey = (text: string): string =>
  text.replace(/(serviceKey|ServiceKey)=[^&\s"'<]*/g, '$1=***')
const snippetOf = (text: string): string =>
  redactKey(text).slice(0, SNIPPET_LEN).replace(/\s+/g, ' ').trim()

// JSON 배열을 기대하는 엔드포인트용 공통 페치.
// 순서: res.ok → Content-Type → text()+JSON.parse → Array.isArray
async function fetchJsonStrict(url: string, timeoutMs: number): Promise<{ value: unknown; status: number; contentType: string | null }> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    // 네트워크 실패·타임아웃. 여기엔 응답 자체가 없다.
    throw new UpstreamError({ kind: `network:${e instanceof Error ? e.name : 'Error'}`, status: null, contentType: null, snippet: String(e).slice(0, SNIPPET_LEN) })
  }

  const contentType = res.headers.get('content-type')
  const text = await res.text().catch(() => '')

  if (!res.ok) {
    throw new UpstreamError({ kind: 'http_error', status: res.status, contentType, snippet: snippetOf(text) })
  }
  if (!/(application|text)\/(json|.*\+json)/i.test(contentType ?? '')) {
    // HTML 점검·차단 페이지가 여기서 걸린다. JSON.parse를 아예 부르지 않는다.
    throw new UpstreamError({ kind: 'not_json_content_type', status: res.status, contentType, snippet: snippetOf(text) })
  }

  try {
    return { value: JSON.parse(text), status: res.status, contentType }
  } catch {
    throw new UpstreamError({ kind: 'json_parse_failed', status: res.status, contentType, snippet: snippetOf(text) })
  }
}

// 배열이 아니면 .find를 부르지 않는다. `raw.find is not a function`의 직접 방어.
function requireArray(parsed: unknown, status: number | null, contentType: string | null): Record<string, unknown>[] {
  if (!Array.isArray(parsed)) {
    throw new UpstreamError({
      kind: 'not_an_array',
      status,
      contentType,
      // 배열이 아닌 응답의 정체(대개 공공데이터포털 오류 봉투)를 남겨야 다음 진단이 추측이 되지 않는다.
      snippet: snippetOf(JSON.stringify(parsed)),
    })
  }
  return parsed as Record<string, unknown>[]
}

const describeFail = (where: string, info: FetchFail): string =>
  `${where}: ${info.kind}` +
  ` status=${info.status ?? '-'}` +
  ` ct=${info.contentType ?? '-'}` +
  ` body="${info.snippet}"`

// 목록 한 페이지를 가져와 dsList까지 뽑아내는 단위.
// requireArray를 이 안에 두는 것이 중요하다 — 밖에 두면 '배열이 아님'(현재 진행 중인
// TypeError의 정체)이 재시도 대상에서 빠져 간헐 장애를 한 번도 못 건진다.
async function fetchListPage(url: string, timeoutMs: number): Promise<NoticeItem[]> {
  const { value, status, contentType } = await fetchJsonStrict(url, timeoutMs)
  const raw  = requireArray(value, status, contentType)
  const body = raw.find(c => Array.isArray(c['dsList']))
  return (body?.['dsList'] as NoticeItem[]) ?? []
}

// 목록 fetch 타임아웃 — 12초 유지(줄이지도 늘리지도 않는다).
// 근거(2026-08-26 실측): 실패 시 포털이 돌려주는 504 SERVICETIMEOUT_ERROR는 콜당
// 5.9~6.8초에 도착한다(실패 실행 6회 duration에서 역산). 즉 타임아웃이 발동하기 전에
// 응답이 오므로 12초를 8초로 줄여도 이 장애에서는 1초도 아끼지 못한다. 반대로 6초 밑으로
// 내리면 504가 도착하기 직전에 우리가 먼저 끊어 `http_error status=504 body=...`라는
// 진단 정보를 `network:TimeoutError`로 잃는다. 정상 응답은 훨씬 빨리 오지만(정상 실행
// 전체가 33~35초), 업스트림이 건강한데도 느린 경우가 실재하므로(상세조회 43초 사례)
// 상한 자체는 여유를 남긴다.
const LIST_TIMEOUT_MS = 12000

// 카테고리를 인자로 받는다 — 후반 재시도에서 실패한 카테고리만 다시 부르기 위해서다.
// 반환의 failedTps가 그 대상이 된다.
async function fetchNoticeList(tps: string[]): Promise<{ items: NoticeItem[]; failures: string[]; failedTps: string[] }> {
  const today  = new Date()
  const past   = new Date(today); past.setDate(today.getDate() - 90)
  const future = new Date(today); future.setDate(today.getDate() + 365)
  const fmt    = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  const all: NoticeItem[] = []
  const failures: string[] = []
  const failedTps: string[] = []
  // 2026-07-13 추가 실측 확인(다운님 제보): 카테고리 39는 "공공분양(매매)"과 "행복주택(임대)"이
  // 뒤섞여 있음 — AIS_TP_CD_NM에 "분양"이 포함되면 매매 확정, 아니면(행복주택 등) 임대로 정상 수집.
  for (const tp of tps) {
    let page = 1
    while (true) {
      const url = `https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1` +
        `?ServiceKey=${LH_API_KEY}&PG_SZ=100&PAGE=${page}&UPP_AIS_TP_CD=${tp}` +
        `&PAN_ST_DT=${fmt(past)}&PAN_ED_DT=${fmt(today)}` +
        `&CLSG_ST_DT=${fmt(past)}&CLSG_ED_DT=${fmt(future)}`

      // 페이지 단위로 실패를 가둔다. 예외가 이 루프 밖으로 나가면 카테고리 3종이 통째로
      // 죽어 lh_fetched가 항상 0이 됐다(2026-08-25 조사). 이제 실패는 그 카테고리만 중단한다.
      //
      // 2026-08-26: 여기 있던 "1.5초 대기 후 즉시 1회 재시도"를 제거했다. 실측상 성공 0건이고
      // (실패 6회 전부 카테고리당 오류 1건 = page=1에서 재시도까지 실패), 실패 실행 시간만
      // 늘렸다. 같은 게이트웨이가 몇 초 안에 회복될 확률이 낮기 때문이다. 재시도는 실행
      // 후반으로 옮겼다(collect()의 후반 재시도 블록).
      let rawItems: NoticeItem[]
      try {
        rawItems = await fetchListPage(url, LIST_TIMEOUT_MS)
      } catch (e) {
        const info: FetchFail = e instanceof UpstreamError
          ? e.info
          : { kind: `unexpected:${e instanceof Error ? e.name : 'Error'}`, status: null, contentType: null, snippet: String(e).slice(0, SNIPPET_LEN) }
        failures.push(describeFail(`LH 목록 tp=${tp} page=${page}`, info))
        failedTps.push(tp)
        break   // 이 카테고리만 중단. 다음 카테고리는 그대로 시도하고, 이미 모은 all은 유지한다.
      }

      const items = tp === '39' ? rawItems.filter(i => !(i.AIS_TP_CD_NM ?? '').includes('분양')) : rawItems
      all.push(...items)
      if (rawItems.length < 100) break
      page++; if (page > 10) break
    }
  }
  const seen = new Set<string>()
  const deduped = all.filter(i => { if (!i.PAN_ID || seen.has(i.PAN_ID)) return false; seen.add(i.PAN_ID); return true })
  return { items: deduped, failures, failedTps }
}

async function fetchDetailWithTimeout(item: NoticeItem, timeoutMs: number): Promise<{ sbd: SbdItem | null; scdl: SplScdlItem | null; etcInfo: EtcInfoItem | null; ahflInfo: AhflInfoItem[] | null }> {
  try {
    const url = `https://apis.data.go.kr/B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1` +
      `?serviceKey=${LH_API_KEY}` +
      `&SPL_INF_TP_CD=${item.SPL_INF_TP_CD}&CCR_CNNT_SYS_DS_CD=${item.CCR_CNNT_SYS_DS_CD}` +
      `&PAN_ID=${item.PAN_ID}&UPP_AIS_TP_CD=${item.UPP_AIS_TP_CD}&AIS_TP_CD=${item.AIS_TP_CD}`
    const raw  = await (await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })).json() as Record<string,unknown>[]
    const sbdBody   = raw.find(c => Array.isArray(c['dsSbd']))
    const scdlBody  = raw.find(c => Array.isArray(c['dsSplScdl']))
    const etcBody   = raw.find(c => Array.isArray(c['dsEtcInfo']))
    const ahflBody  = raw.find(c => Array.isArray(c['dsAhflInfo']))
    const sbds  = (sbdBody?.['dsSbd'] as SbdItem[]) ?? []
    const scdls = (scdlBody?.['dsSplScdl'] as SplScdlItem[]) ?? []
    const etcs  = (etcBody?.['dsEtcInfo'] as EtcInfoItem[]) ?? []
    const ahfls = (ahflBody?.['dsAhflInfo'] as AhflInfoItem[]) ?? []
    return { sbd: sbds[0] ?? null, scdl: scdls[0] ?? null, etcInfo: etcs[0] ?? null, ahflInfo: ahfls.length ? ahfls : null }
  } catch { return { sbd: null, scdl: null, etcInfo: null, ahflInfo: null } }
}
async function fetchDetail(item: NoticeItem) {
  return fetchDetailWithTimeout(item, 5000)
}

function parseArea(s: string | null | undefined): [number|null, number|null] {
  if (!s) return [null, null]
  const parts = s.split('~').map(p => parseFloat(p.replace(/[^0-9.]/g,'')))
  const min = isNaN(parts[0]) ? null : parts[0]
  const max = (parts.length > 1 && !isNaN(parts[1])) ? parts[1] : min
  return [min, max]
}

function mapLHRow(item: NoticeItem, sbd: SbdItem | null, scdl: SplScdlItem | null, ahflInfo: AhflInfoItem[] | null) {
  const areaStr = san(sbd?.MIN_MAX_RSDN_DDO_AR ?? sbd?.DDO_AR)
  const [areaMin, areaMax] = parseArea(areaStr)
  const units   = sanNum(sbd?.SUM_TOT_HSH_CNT ?? sbd?.HSH_CNT)
  const regionRaw = san(item.CNP_CD_NM) ?? ''
  const parts   = regionRaw.split(' ')
  const sido    = applySidoMerge(normSido(parts[0]) || null)
  const sigungu = parts.length > 1 ? parts.slice(1).join(' ') : null
  const addr    = san(sbd?.LCT_ARA_ADR ?? sbd?.LGDN_ADR)
  const title   = normalizeTitle(san(item.PAN_NM))
  return {
    source:            'LH',
    announcement_id:   san(item.PAN_ID),
    title,
    region:            addr ?? (regionRaw || null),
    sido_nm:           sido,
    sigungu_nm:        sigungu,
    housing_type:      ([san(item.UPP_AIS_TP_NM), san(item.AIS_TP_CD_NM)].filter(Boolean).join(' - ')) || null,
    supply_org:        'LH',
    announcement_date: parseDate(item.PAN_NT_ST_DT),
    apply_start:       parseDate(scdl?.SBSC_ACP_ST_DT),
    apply_end:         parseDate(item.CLSG_DT),
    status:            san(item.PAN_SS),
    url:               san(item.DTL_URL),
    is_revised:        String(item.PAN_SS ?? '').includes('정정') || (title ?? '').startsWith('[정정공고]'),
    area_min:          areaMin,
    area_max:          areaMax,
    total_units:       units ? Math.round(units) : null,
    heating_type:      san(sbd?.HTN_FMLA_DS_CD_NM ?? sbd?.HTN_FMLA_DESC),
    move_in_date:      san(sbd?.MVIN_XPC_YM),
    doc_submit_announce_date: parseDate(scdl?.PPR_SBM_OPE_ANC_DT),
    doc_submit_start:         parseDate(scdl?.PPR_ACP_ST_DT),
    doc_submit_end:           parseDate(scdl?.PPR_ACP_CLSG_DT),
    winner_announce_date:     parseDate(scdl?.PZWR_ANC_DT),
    contract_start:           parseDate(scdl?.CTRT_ST_DT),
    contract_end:             parseDate(scdl?.CTRT_ED_DT),
    building_name:     san(sbd?.LCC_NT_NM),
    attachment_urls:   ahflInfo ? ahflInfo.map(a => ({
      url: san(a.AHFL_URL), label: san(a.SL_PAN_AHFL_DS_CD_NM), filename: san(a.CMN_AHFL_NM)
    })) : null,
    updated_at:        new Date().toISOString(),
  }
}

// 2026-08-25: 여기서 실패해도 errors에 아무것도 남지 않아(console.error + break),
// LH·MYHOME이 동시에 죽은 장애를 "LH 단독 문제"로 오진했다. 이제 errors에 남긴다.
const MYHOME_TIMEOUT_MS = 15000

async function fetchMyHome(): Promise<{ items: MyHomeItem[]; failures: string[]; failed: boolean }> {
  const all: MyHomeItem[] = []
  const failures: string[] = []
  let failed = false
  let totalCount = 0
  let page = 1
  while (true) {
    const url = `https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList` +
      `?serviceKey=${LH_API_KEY}&numOfRows=100&pageNo=${page}&type=json`
    try {
      // LH 목록과 같은 검증 경로를 쓴다(상태코드·Content-Type·본문 선두).
      // 단 이 엔드포인트는 배열이 아니라 객체를 주므로 requireArray는 부르지 않는다.
      const { value } = await fetchJsonStrict(url, MYHOME_TIMEOUT_MS)
      const raw = value as { response?: { body?: { totalCount?: unknown; item?: unknown } } }
      if (page === 1) totalCount = parseInt(String(raw?.response?.body?.totalCount ?? 0))
      const itemsRaw = raw?.response?.body?.item
      const items: MyHomeItem[] = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw as MyHomeItem] : []
      all.push(...items)
      if (items.length < 100) break
      page++; if (page > 20) break
    } catch(e) {
      const info: FetchFail = e instanceof UpstreamError
        ? e.info
        : { kind: `unexpected:${e instanceof Error ? e.name : 'Error'}`, status: null, contentType: null, snippet: String(e).slice(0, SNIPPET_LEN) }
      failures.push(describeFail(`MYHOME 목록 page=${page}`, info))
      console.error(`MYHOME page${page} 오류: ${info.kind}`)
      failed = true
      break
    }
  }
  console.log(`[MYHOME] totalCount=${totalCount} collected=${all.length}`)
  return { items: all, failures, failed }
}

function mapMyHomeRow(it: MyHomeItem) {
  const pblancId = san(it['pblancId'])
  const houseSn  = String(it['houseSn'] ?? '0').trim()

  const sttusNm  = san(it['sttusNm']) ?? ''
  let status = '공고중'
  if (sttusNm.includes('정정')) status = '정정공고중'
  else if (sttusNm.includes('마감') || sttusNm.includes('종료')) status = '접수마감'
  else if (sttusNm.includes('접수')) status = '접수중'

  const depositRaw = sanNum(it['rentGtn'])
  const rentRaw    = sanNum(it['mtRntchrg'])
  const unitsRaw   = sanNum(it['sumSuplyCo'])
  const brtcNm     = san(it['brtcNm']) ?? ''
  const signguNm   = san(it['signguNm']) ?? ''
  const region     = [brtcNm, signguNm].filter(Boolean).join(' ') || null
  const beforePblancId = san(it['beforePblancId'])

  const annId = [pblancId, houseSn !== '0' ? houseSn : null, brtcNm, signguNm]
    .filter(Boolean).join('_')

  const title = normalizeTitle(san(it['pblancNm']))
  return {
    source:            'MYHOME',
    announcement_id:   annId,
    title,
    region,
    sido_nm:           applySidoMerge(brtcNm || null),
    sigungu_nm:        signguNm || null,
    housing_type:      san(it['suplyTyNm']),
    supply_org:        san(it['suplyInsttNm']),
    announcement_date: parseDate(it['rcritPblancDe']),
    apply_start:       parseDate(it['beginDe']),
    apply_end:         parseDate(it['endDe']),
    status,
    url:               san(it['url']),
    before_pblanc_id:  beforePblancId,
    is_revised:        sttusNm.includes('정정') || (title ?? '').startsWith('[정정공고]'),
    total_units:       unitsRaw ? Math.round(unitsRaw) : null,
    deposit_min:       (depositRaw && depositRaw !== 0) ? depositRaw : null,
    rent_min:          (rentRaw && rentRaw !== 0) ? rentRaw : null,
    winner_announce_date: parseDate(it['przwnerPresnatnDe']),
    building_name:     san(it['hsmpNm']),
    precise_address:   san(it['fullAdres']) || null,
    updated_at:        new Date().toISOString(),
  }
}

async function markExpired(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('announcements')
    .update({ status: '접수마감', updated_at: new Date().toISOString() })
    .lt('apply_end', today).not('status','eq','접수마감').not('apply_end','is',null)
    .select('id')
  return data?.length ?? 0
}

async function collect() {
  const startedAt = Date.now()
  const errors: string[] = []

  const LH_CATEGORIES = ['06','13','39']
  let lhNotices: NoticeItem[] = []
  let failedTps: string[] = []
  try {
    // 부분 실패를 견딘다. 카테고리 3종 중 하나만 성공해도 그만큼은 수집되고,
    // 전부 실패했을 때만 빈 배열이 된다.
    const listed = await fetchNoticeList(LH_CATEGORIES)
    lhNotices = listed.items
    failedTps = listed.failedTps
    errors.push(...listed.failures)
    console.log(`[LH] 목록 ${lhNotices.length}건 (실패 ${listed.failures.length}건)`)
  } catch(e) {
    errors.push(`LH 목록(예상치 못한 오류): ${e}`)
  }

  const lhBaseRows = lhNotices.map(n => mapLHRow(n, null, null, null)).filter(r => r.announcement_id && r.title)
  let lhUpserted = 0
  for (let i = 0; i < lhBaseRows.length; i += 50) {
    const { data, error } = await supabase.from('announcements')
      .upsert(lhBaseRows.slice(i, i+50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
      .select('id')
    if (error) errors.push(`LH upsert[${i}]: ${error.message}`)
    else lhUpserted += data?.length ?? 0
  }
  console.log(`[LH] upsert ${lhUpserted}건`)

  const activeNotices = lhNotices.filter(n => ['접수중','공고중','정정공고중'].includes(n.PAN_SS ?? ''))

  const nullApplyStartIds = new Set<string>()
  const failCountMap = new Map<string, number>()
  try {
    const activeIds = activeNotices.map(n => n.PAN_ID)
    const { data: existing } = await supabase.from('announcements')
      .select('announcement_id, apply_start, detail_fetch_fail_count')
      .eq('source', 'LH')
      .in('announcement_id', activeIds)
    const knownIds = new Set((existing ?? []).map(r => r.announcement_id as string))
    for (const r of (existing ?? [])) {
      if (r.apply_start === null) nullApplyStartIds.add(r.announcement_id as string)
      failCountMap.set(r.announcement_id as string, (r.detail_fetch_fail_count as number) ?? 0)
    }
    for (const id of activeIds) {
      if (!knownIds.has(id)) nullApplyStartIds.add(id)
    }
  } catch(e) {
    errors.push(`상세조회 우선순위 조회: ${e}`)
  }

  // 정정사유(CRC_RSN)는 목록이 아니라 상세조회(dsEtcInfo) 산물이라, 처음 수집될 때 이미 마감이던
  // 정정공고는 위 활성 게이트에 걸려 상세조회를 단 한 번도 시도하지 않는다(2026-08-31 조사: 142건).
  // 그래서 "정정 + 사유 없음 + 시도 이력 없음"인 건에 한해 마감이어도 대상에 넣는다.
  // detail_fetch_last_attempt 조건이 핵심 — 성공이든 실패든 시도하면 기록되므로(성공: 상세 upsert,
  // 실패: bump_detail_fetch_fail) 매 회차 같은 건을 무한 재시도하지 않는다.
  const revisionBackfillIds = new Set<string>()
  try {
    const { data: pending } = await supabase.from('announcements')
      .select('announcement_id')
      .eq('source', 'LH')
      .eq('is_revised', true)
      .is('revision_note', null)
      .is('detail_fetch_last_attempt', null)
    for (const r of (pending ?? [])) revisionBackfillIds.add(r.announcement_id as string)
  } catch(e) {
    errors.push(`정정사유 보강 대상 조회: ${e}`)
  }

  const activeIdSet = new Set(activeNotices.map(n => n.PAN_ID))
  const revisionBackfillNotices = lhNotices.filter(
    n => !activeIdSet.has(n.PAN_ID) && revisionBackfillIds.has(n.PAN_ID)
  )

  // 캡은 종전대로 90건 하나이며, 활성 공고가 항상 앞에 온다 — 보강분은 남는 자리만 쓰므로
  // 활성 공고의 상세조회가 보강분에 밀리지 않는다(실측 활성 80건 < 90).
  const needDetail = [...activeNotices, ...revisionBackfillNotices]
    .sort((a, b) => {
      const aBackfill = activeIdSet.has(a.PAN_ID) ? 0 : 1
      const bBackfill = activeIdSet.has(b.PAN_ID) ? 0 : 1
      if (aBackfill !== bBackfill) return aBackfill - bBackfill
      const aNull = nullApplyStartIds.has(a.PAN_ID) ? 0 : 1
      const bNull = nullApplyStartIds.has(b.PAN_ID) ? 0 : 1
      return aNull - bNull
    })
    .slice(0, 90)
  console.log(`[LH] 상세대상 ${needDetail.length}건 (활성 ${activeNotices.length}, 정정보강 후보 ${revisionBackfillNotices.length})`)

  let lhDetailOk = 0
  const detailRows: ReturnType<typeof mapLHRow>[] = []
  const failedIds: string[] = []
  const revisionCandidates: { id: string; note: string }[] = []
  for (let i = 0; i < needDetail.length; i += 5) {
    const batch   = needDetail.slice(i, i+5)
    const results = await Promise.all(batch.map(n => fetchDetail(n)))
    batch.forEach((n, j) => {
      const r = results[j]
      if (r.sbd || r.scdl) {
        lhDetailOk++
        detailRows.push({
          ...mapLHRow(n, r.sbd, r.scdl, r.ahflInfo),
          detail_fetch_fail_count: 0,
          detail_fetch_last_attempt: new Date().toISOString(),
        })
        const crcRsn = san(r.etcInfo?.CRC_RSN)
        if (crcRsn) revisionCandidates.push({ id: n.PAN_ID, note: crcRsn })
      } else {
        failedIds.push(n.PAN_ID)
      }
    })
    if (i + 5 < needDetail.length) await new Promise(r => setTimeout(r, 150))
  }

  // 만성 실패 항목 전용 "느린 재시도" 패스.
  // 배경: 일부 공고는 정상 응답을 주지만 응답 자체가 30~40초대로 느려(예: 물금2천년나무
  // PAN_ID=2015122300020266, 실측 43초) 5초 타임아웃 안에서는 몇 번을 재시도해도 성공 불가.
  // 이전에 2회 이상(이번까지 3연속) 실패한 소수 항목만 골라 훨씬 긴 타임아웃으로 한 번 더 시도한다.
  //
  // 타임아웃/시간예산 값은 지시서 원안(SLOW_TIMEOUT_MS=35000, TIME_BUDGET_MS=90000)에서 조정했다.
  // 조정 근거(Supabase 공식 문서 확인): Free 플랜 Edge Function wall-clock 한도는 150초(고정,
  // 컨트롤 불가) — 그런데 이 함수의 메인 패스만으로도 최근 실행 기록상 45~133초까지 관측됨
  // (collection_run_log 실측: id 38=132.9초). 만약 원안대로 TIME_BUDGET_MS=90000에서 게이트를
  // 통과한 뒤 SLOW_TIMEOUT_MS=35000 만큼 더 실행하면 90+35=125초, 이후 MyHome 수집·만료처리·
  // 로그기록까지 더해질 경우 150초 한도에 근접하거나 초과할 위험이 있었음. 또한 원안의
  // SLOW_TIMEOUT_MS=35000은 애초에 지시서가 인용한 실측 재현 시간(43초)보다 짧아 정작 목표
  // 사례조차 못 잡을 모순이 있었음. 이에 SLOW_TIMEOUT_MS=45000(43초 실측치를 여유있게 커버)
  // /TIME_BUDGET_MS=70000(메인 패스가 이미 70초를 넘겼으면 느린 재시도 자체를 건너뛰어, 이미
  // 오래 걸린 실행을 150초 한도 쪽으로 더 밀어붙이지 않도록)으로 하향 조정.
  const CHRONIC_THRESHOLD = 2
  const MAX_SLOW_RETRY = 5
  const SLOW_TIMEOUT_MS = 45000
  const TIME_BUDGET_MS = 70000

  let slowRetryOk = 0
  const chronicIds = failedIds.filter(id => (failCountMap.get(id) ?? 0) >= CHRONIC_THRESHOLD)
    .slice(0, MAX_SLOW_RETRY)

  if (chronicIds.length > 0 && (Date.now() - startedAt) < TIME_BUDGET_MS) {
    const chronicNotices = needDetail.filter(n => chronicIds.includes(n.PAN_ID))
    const slowResults = await Promise.all(
      chronicNotices.map(n => fetchDetailWithTimeout(n, SLOW_TIMEOUT_MS))
    )
    chronicNotices.forEach((n, j) => {
      const r = slowResults[j]
      if (r.sbd || r.scdl) {
        slowRetryOk++
        detailRows.push({
          ...mapLHRow(n, r.sbd, r.scdl, r.ahflInfo),
          detail_fetch_fail_count: 0,
          detail_fetch_last_attempt: new Date().toISOString(),
        })
        const idx = failedIds.indexOf(n.PAN_ID)
        if (idx >= 0) failedIds.splice(idx, 1)
        const crcRsn = san(r.etcInfo?.CRC_RSN)
        if (crcRsn) revisionCandidates.push({ id: n.PAN_ID, note: crcRsn })
      }
    })
    console.log(`[LH] 느린 재시도 ${slowRetryOk}/${chronicIds.length}건 (대상 ${chronicIds.length}건)`)
  }

  for (let i = 0; i < detailRows.length; i += 50) {
    const { error } = await supabase.from('announcements')
      .upsert(detailRows.slice(i, i+50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
    if (error) errors.push(`LH detail_upsert[${i}]: ${error.message}`)
  }
  console.log(`[LH] 상세 ${lhDetailOk}/${needDetail.length}건`)

  if (failedIds.length > 0) {
    const { error } = await supabase.rpc('bump_detail_fetch_fail', { p_ids: failedIds })
    if (error) errors.push(`상세조회 실패추적: ${error.message}`)
  }

  if (revisionCandidates.length > 0) {
    const { error } = await supabase.rpc('bulk_set_revision_note', {
      p_ids: revisionCandidates.map(r => r.id),
      p_notes: revisionCandidates.map(r => r.note),
    })
    if (error) errors.push(`정정사유 자동채움: ${error.message}`)
  }

  let mhUpserted = 0
  let mhFetched  = 0
  let mhDedupMerged = 0
  let mhFailed = false
  try {
    const fetchedMh = await fetchMyHome()
    const mhItems = fetchedMh.items
    errors.push(...fetchedMh.failures)
    mhFailed = fetchedMh.failed
    mhFetched = mhItems.length
    const mhRowsRaw = mhItems.map(mapMyHomeRow).filter(r => r.announcement_id && r.title)

    const mhMap = new Map<string, ReturnType<typeof mapMyHomeRow>>()
    for (const row of mhRowsRaw) mhMap.set(row.announcement_id, row)
    mhDedupMerged = mhRowsRaw.length - mhMap.size
    const mhRows = Array.from(mhMap.values())
    if (mhDedupMerged > 0) console.log(`[MYHOME] dedup으로 ${mhDedupMerged}건 병합 (annId 충돌)`)

    for (let i = 0; i < mhRows.length; i += 50) {
      const { data, error } = await supabase.from('announcements')
        .upsert(mhRows.slice(i, i+50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
        .select('id')
      if (error) errors.push(`MYHOME upsert[${i}]: ${error.message}`)
      else mhUpserted += data?.length ?? 0
    }
    console.log(`[MYHOME] upsert ${mhUpserted}건`)
  } catch(e) {
    errors.push(`MYHOME: ${e}`)
  }

  // ── 실행 후반 재시도 (2026-08-26 신설) ─────────────────────────────
  // 종전엔 실패한 자리에서 1.5초 뒤 즉시 재시도했다. 실측 성공 0건이었고, 같은
  // 게이트웨이가 몇 초 만에 회복될 확률이 낮기 때문이다. 그래서 재시도를 여기로 옮긴다 —
  // MYHOME 수집·상세조회 등 다른 작업을 먼저 끝낸 뒤, 실패한 경로만 한 번 더 부른다.
  //
  // 🔴 재시도는 1회뿐이다. 여기서 또 실패하면 포기하고 20분 뒤 정기 실행에 맡긴다
  // (7일 실측상 실패 72회 중 40회(56%)가 다음 회차에 바로 복구된 고립 실패였다).
  //
  // ⚠️ LH를 건져도 상세조회(dsSbd/dsSplScdl)는 여기서 하지 않는다. 90건 상세조회는
  // 실행 시간을 크게 늘려 20분 주기를 위협한다. 목록만 upsert해두면 apply_start가 NULL로
  // 남고, 기존 nullApplyStartIds 우선순위 로직이 다음 회차에 그것들을 먼저 상세조회한다.
  const LATE_RETRY_BUDGET_MS = 70000
  let lateRetryLhOk = 0
  let lateRetryMhOk = 0
  const needLateRetry = failedTps.length > 0 || mhFailed

  if (needLateRetry && (Date.now() - startedAt) >= LATE_RETRY_BUDGET_MS) {
    errors.push(`late_retry: 시간 예산(${LATE_RETRY_BUDGET_MS}ms) 초과로 건너뜀`)
  } else if (needLateRetry) {
    const notes: string[] = []

    if (failedTps.length > 0) {
      try {
        const again = await fetchNoticeList(failedTps)
        const rows = again.items.map(n => mapLHRow(n, null, null, null)).filter(r => r.announcement_id && r.title)
        for (let i = 0; i < rows.length; i += 50) {
          const { data, error } = await supabase.from('announcements')
            .upsert(rows.slice(i, i+50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
            .select('id')
          if (error) errors.push(`late_retry LH upsert[${i}]: ${error.message}`)
          else lhUpserted += data?.length ?? 0
        }
        lateRetryLhOk = again.items.length
        lhNotices = lhNotices.concat(again.items)
        const recovered = failedTps.filter(tp => !again.failedTps.includes(tp))
        notes.push(`LH ${recovered.length}/${failedTps.length}개 카테고리 복구(${lateRetryLhOk}건)`)
      } catch(e) {
        notes.push(`LH 재시도 예외: ${e}`)
      }
    }

    if (mhFailed) {
      try {
        const againMh = await fetchMyHome()
        if (!againMh.failed) {
          const rowsRaw = againMh.items.map(mapMyHomeRow).filter(r => r.announcement_id && r.title)
          const m = new Map<string, ReturnType<typeof mapMyHomeRow>>()
          for (const row of rowsRaw) m.set(row.announcement_id, row)
          const rows = Array.from(m.values())
          for (let i = 0; i < rows.length; i += 50) {
            const { data, error } = await supabase.from('announcements')
              .upsert(rows.slice(i, i+50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
              .select('id')
            if (error) errors.push(`late_retry MYHOME upsert[${i}]: ${error.message}`)
            else mhUpserted += data?.length ?? 0
          }
          lateRetryMhOk = againMh.items.length
          mhFetched += againMh.items.length
          notes.push(`MYHOME 복구(${lateRetryMhOk}건)`)
        } else {
          notes.push('MYHOME 재시도 실패')
        }
      } catch(e) {
        notes.push(`MYHOME 재시도 예외: ${e}`)
      }
    }

    // 전용 컬럼이 없으므로 errors에 남긴다(스키마 변경은 이번 범위 밖).
    // 이 방식이 효과가 있는지 판정할 유일한 근거이므로, 성공/실패 양쪽 다 남긴다.
    errors.push(`late_retry: ${notes.join(' / ')}`)
    console.log(`[LATE_RETRY] ${notes.join(' / ')}`)
  }

  const expired = await markExpired()
  const durationMs = Date.now() - startedAt

  try {
    const { error: logError } = await supabase.from('collection_run_log').insert({
      lh_fetched:          lhNotices.length,
      lh_detail_ok:        lhDetailOk,
      lh_upserted:         lhUpserted,
      lh_slow_retry_ok:    slowRetryOk,
      myhome_fetched:      mhFetched,
      myhome_upserted:     mhUpserted,
      myhome_dedup_merged: mhDedupMerged,
      expired_marked:      expired,
      errors:              errors.length ? errors : null,
      duration_ms:         durationMs,
    })
    if (logError) errors.push(`collection_run_log insert: ${logError.message}`)
  } catch(e) {
    errors.push(`collection_run_log insert exception: ${e}`)
  }

  return {
    lh:     { fetched: lhNotices.length, detail_ok: lhDetailOk, upserted: lhUpserted, slow_retry_ok: slowRetryOk, late_retry_ok: lateRetryLhOk },
    myhome: { fetched: mhFetched, upserted: mhUpserted, dedup_merged: mhDedupMerged, late_retry_ok: lateRetryMhOk },
    expired,
    errors,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,x-cron-secret'
  }})
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'Method not allowed'}), {status:405})
  const matched = matchCronSecret(req)
  if (!matched) return new Response(JSON.stringify({error:'Unauthorized'}), {status:401})
  if (new URL(req.url).searchParams.get('mode') === 'authcheck') return authcheckResponse(matched)

  const started = new Date().toISOString()
  const result  = await collect()
  const res = { started, finished: new Date().toISOString(), ...result }
  console.log('[DONE]', JSON.stringify(res))
  return new Response(JSON.stringify(res), {headers:{'Content-Type':'application/json'}})
})
