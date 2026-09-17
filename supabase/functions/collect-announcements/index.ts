import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'

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
  '경기':'경기도','강원':'강원특별자치도','충북':'충청북도','충남':'충청남도',
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

// 🔴 2026-09-17: 반환이 「첫 원소」에서 **원소 배열 전체**로 바뀌었고, 통짜 try/catch가
// 실패 **분류**를 함께 돌려주도록 갈라졌다(C-2). 분류는 collection_run_log.errors에
// 분류별 건수 한 줄로만 남는다 — 런마다 수십 줄이 쌓이지 않게.
// ⚠️ 게이트는 종전과 같다 — 종전 `r.sbd || r.scdl`(첫 원소가 있는가)과
// 새 `sbds.length || scdls.length`(원소가 있는가)는 같은 집합이다.
// ⚠️ `empty_containers`는 200인데 dsSbd·dsSplScdl이 둘 다 빈 경우다. 종전에도 실패로
// 셌지만 네트워크 실패와 한 덩어리였다 — 매입임대 계열이 여기 들어온다(⑩).
type DetailResult = {
  sbds: SbdItem[]; scdls: SplScdlItem[]
  etcInfo: EtcInfoItem | null; ahflInfo: AhflInfoItem[] | null
  fail: string | null
}

async function fetchDetailWithTimeout(item: NoticeItem, timeoutMs: number): Promise<DetailResult> {
  const empty = (fail: string): DetailResult =>
    ({ sbds: [], scdls: [], etcInfo: null, ahflInfo: null, fail })

  const url = `https://apis.data.go.kr/B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1` +
    `?serviceKey=${LH_API_KEY}` +
    `&SPL_INF_TP_CD=${item.SPL_INF_TP_CD}&CCR_CNNT_SYS_DS_CD=${item.CCR_CNNT_SYS_DS_CD}` +
    `&PAN_ID=${item.PAN_ID}&UPP_AIS_TP_CD=${item.UPP_AIS_TP_CD}&AIS_TP_CD=${item.AIS_TP_CD}`

  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    return empty(`network:${e instanceof Error ? e.name : 'Error'}`)
  }

  const contentType = res.headers.get('content-type')
  const text = await res.text().catch(() => '')
  if (!res.ok) return empty(`http_${res.status}`)
  if (!/(application|text)\/(json|.*\+json)/i.test(contentType ?? '')) return empty('not_json_content_type')

  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return empty('json_parse_failed') }
  if (!Array.isArray(parsed)) return empty('not_an_array')

  const raw = parsed as Record<string, unknown>[]
  const arrOf = <T,>(k: string): T[] => {
    const c = raw.find(x => Array.isArray(x[k]))
    return c ? (c[k] as T[]) : []
  }
  const sbds  = arrOf<SbdItem>('dsSbd')
  const scdls = arrOf<SplScdlItem>('dsSplScdl')
  const etcs  = arrOf<EtcInfoItem>('dsEtcInfo')
  const ahfls = arrOf<AhflInfoItem>('dsAhflInfo')

  return {
    sbds, scdls,
    etcInfo:  etcs[0] ?? null,
    ahflInfo: ahfls.length ? ahfls : null,
    fail: (sbds.length === 0 && scdls.length === 0) ? 'empty_containers' : null,
  }
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

// ── 다단지 전 원소 매핑 (2026-09-17 신설) ─────────────────────────
// 🔴 `dsSbd`와 `dsSplScdl`은 같은 순서로 오지 않는다(2026-09-17 실측 — 다단지 표본 4건
// 전부 어긋났고 순서가 같은 공고는 0건이었다). 그래서 아래 어느 함수도 두 배열의 같은
// 인덱스를 한 단지로 가정하지 않는다. 짝이 필요하면 이름(LCC_NT_NM ↔ SBD_LGO_NM)으로
// 조인해야 하는데, 지금 저장하는 값 중 짝을 필요로 하는 것이 없어 짝짓기 자체를 두지 않는다.
//
// 🔴 필드 이름과 실물이 다르다(2026-09-17 실측, 9공고 전 원소) — `SUM_TOT_HSH_CNT`·
// `MIN_MAX_RSDN_DDO_AR`·`LCT_ARA_ADR`은 **전부 NULL**이고 값을 싣는 것은 각각
// `HSH_CNT`·`DDO_AR`·`LGDN_ADR`이다. 아래 `??` 폴백이 매번 오른쪽으로 떨어진다.
const distinctNames = (sbds: SbdItem[]): string[] =>
  [...new Set(sbds.map(x => san(x.LCC_NT_NM)).filter((v): v is string => !!v))]

// 「첫 원소 + 외 N개 단지」. N은 **이름이 다른 원소 수 − 1**이다(원소 수가 아니다 —
// 같은 단지가 두 번 오면 수가 부풀려진다).
const buildingNameOf = (sbds: SbdItem[]): string | null => {
  const first = san(sbds[0]?.LCC_NT_NM)
  if (!first) return null
  const n = distinctNames(sbds).length
  return n >= 2 ? `${first} 외 ${n - 1}개 단지` : first
}

// 전 원소 면적의 합집합 — min들의 min · max들의 max. 값 없는 원소는 건너뛴다.
const areaUnion = (sbds: SbdItem[]): [number | null, number | null] => {
  let lo: number | null = null
  let hi: number | null = null
  for (const x of sbds) {
    const [a, b] = parseArea(san(x.MIN_MAX_RSDN_DDO_AR ?? x.DDO_AR))
    if (a !== null && (lo === null || a < lo)) lo = a
    if (b !== null && (hi === null || b > hi)) hi = b
  }
  return [lo, hi]
}

// 🔴 다단지면 null이다. 「단지 규모」는 한 단지의 수인데 다단지에서 첫 원소 값을 실으면
// 그 수가 무엇의 규모도 아니게 된다(실측: 군산 5단지에서 831 = A-3블록 하나의 값).
// ⚠️ `HSH_CNT`가 빈 문자열인 원소가 실재한다(울산 구영2BL) — sanNum이 null로 접는다.
const totalUnitsOf = (sbds: SbdItem[]): number | null => {
  if (distinctNames(sbds).length >= 2) return null
  const n = sanNum(sbds[0]?.HSH_CNT ?? sbds[0]?.SUM_TOT_HSH_CNT)
  return n ? Math.round(n) : null
}

// 주소 한 줄에서 「<시도>|<시군구>」 키를 만든다.
// 🔴 「시 구」 두 마디를 살린다 — 앞 두 토큰만 보면 특례시·일반시의 행정구가 떨어져
// 서로 다른 구가 같은 시로 뭉개지고 수렴이 거짓으로 참이 된다(청주시 흥덕구/서원구).
// ⑩ 「`sigungu_nm`은 두 가지 모양으로 저장된다」와 같은 모양으로 맞춘다.
const sidoSigunguKey = (addr: string | null): string | null => {
  if (!addr) return null
  const t = addr.trim().split(/\s+/)
  if (t.length < 2) return null
  if (t.length >= 3 && /시$/.test(t[1]) && /구$/.test(t[2])) return `${t[0]}|${t[1]} ${t[2]}`
  if (!/(시|군|구)$/.test(t[1])) return null
  return `${t[0]}|${t[1]}`
}

// 🔴 전 원소가 한 곳으로 수렴할 때만 싣는다. 하나라도 주소가 없거나 갈리면 null이고,
// 그러면 protect_detail_columns의 coalesce가 기존 값을 지킨다(2026-09-17 가드 추가).
// ⚠️ 수렴하지 않는 공고가 실재한다 — 울산 정례모집이 네 자치구다(2026-09-17 실측).
// 🔴 목록 CNP_CD_NM 파생은 폴백으로도 두지 않는다. 그것은 지역본부명이라 실측상
// 「<시도> 외」 하나뿐이었고 진짜 시군구를 만든 적이 한 번도 없다(⑩ 실측 NULL 840 + '외' 70).
const sigunguOf = (sbds: SbdItem[]): string | null => {
  if (sbds.length === 0) return null
  const keys = new Set<string>()
  for (const x of sbds) {
    const k = sidoSigunguKey(san(x.LGDN_ADR))
    if (!k) return null
    keys.add(k)
  }
  return keys.size === 1 ? [...keys][0].split('|')[1] : null
}

// 일정이 몇 벌인가. ⚠️ `SBD_LGO_NM`(단지명)은 원소마다 다르므로 키에 넣지 않는다 —
// 넣으면 모든 공고가 「여러 벌」이 된다.
const scdlKey = (x: SplScdlItem): string =>
  [x.SBSC_ACP_ST_DT, x.SBSC_ACP_CLSG_DT, x.PPR_SBM_OPE_ANC_DT, x.PPR_ACP_ST_DT,
   x.PPR_ACP_CLSG_DT, x.PZWR_ANC_DT, x.CTRT_ST_DT, x.CTRT_ED_DT]
    .map(v => san(v) ?? '').join('|')

// 원소가 없으면 null(모름) — false가 아니다. 가드가 기존 값을 지키게 하려면 null이어야 한다.
const scheduleVariesOf = (scdls: SplScdlItem[]): boolean | null =>
  scdls.length === 0 ? null : new Set(scdls.map(scdlKey)).size >= 2

// 여러 벌일 때만 쓴다 — 가장 이른 접수 시작.
const earliestApplyStart = (scdls: SplScdlItem[]): string | null => {
  let best: string | null = null
  for (const x of scdls) {
    const d = parseDate(x.SBSC_ACP_ST_DT)
    if (d && (best === null || d < best)) best = d
  }
  return best
}

// 🔴 이 함수는 상세(sbd·scdl·ahflInfo)가 없으면 상세 파생 컬럼을 생략하지 않고 null로 채워 반환한다.
// 그 null은 DB의 protect_detail_columns_trigger가 coalesce(NEW.x, OLD.x)로 무시하므로 기존 값이
// 지워지지 않는다. 즉 「값을 지우지 않는다」는 불변식은 이 파일이 아니라 DB 쪽에 있다.
// 🔴 그 트리거를 지우면 이 함수가 매 런 값을 지운다 — 트리거를 되돌릴 때 여기도 함께 본다.
// (2026-09-09: 이 사실을 모르고 EF만 읽으면 「null이 덮어쓴다」로 읽혀서 남긴다. 트리거가 보호하는
//  18컬럼과 보호하지 않는 것(deposit_min·rent_min 등)의 목록은 트리거 함수 주석에 있다.)
// 🔴 region도 2026-09-12부터 같은 트리거가 지킨다 — 다만 축이 다르다. 아래 `addr ?? regionRaw`는
// 상세가 없으면 CNP_CD_NM(지역본부명)을 싣는데, 그것이 NULL이 아니라 「덜 정확한 값」이라
// coalesce로는 안 걸린다. 트리거가 「NEW가 주소형이 아니고 OLD가 주소형이면 OLD 유지」로 막는다.
// 그전까지는 422행 기본 upsert가 매 런 목록 전량의 주소를 지역본부명으로 되돌리고 있었다.
function mapLHRow(item: NoticeItem, sbds: SbdItem[], scdls: SplScdlItem[], ahflInfo: AhflInfoItem[] | null) {
  // 🔴 2026-09-17: 인자가 「첫 원소」에서 **원소 배열 전체**로 바뀌었다. 상세가 없으면 빈 배열을
  // 넘기며, 그때 모든 상세 파생 컬럼은 종전과 똑같이 null이 된다(호출부 네 곳 전부 확인).
  const [areaMin, areaMax] = areaUnion(sbds)
  const regionRaw = san(item.CNP_CD_NM) ?? ''
  const parts   = regionRaw.split(' ')
  const sido    = applySidoMerge(normSido(parts[0]) || null)
  const addr    = san(sbds[0]?.LCT_ARA_ADR ?? sbds[0]?.LGDN_ADR)
  const title   = normalizeTitle(san(item.PAN_NM))
  // 🔴 일정이 여러 벌이면 대표 한 벌을 고르지 않는다 — 어느 단지 것인지 말할 수 없기 때문이다.
  // 접수 시작만 「가장 이른 값」으로 두고(마감은 목록 CLSG_DT가 이미 가장 늦은 값이다),
  // 나머지 scdl 파생은 null로 보내 가드가 기존 값을 지키게 한다.
  const varies  = scheduleVariesOf(scdls)
  const scdl    = scdls[0] ?? null
  const oneKind = varies === false
  return {
    source:            'LH',
    announcement_id:   san(item.PAN_ID),
    title,
    region:            addr ?? (regionRaw || null),
    sido_nm:           sido,
    sigungu_nm:        sigunguOf(sbds),
    housing_type:      ([san(item.UPP_AIS_TP_NM), san(item.AIS_TP_CD_NM)].filter(Boolean).join(' - ')) || null,
    supply_org:        'LH',
    announcement_date: parseDate(item.PAN_NT_ST_DT),
    // 🔴 게시일(PAN_NT_ST_DT)과 최초 공고일(PAN_DT)은 다른 값이다. 정정공고는 PAN_DT에
    // 원공고일을 유지한다(2026-09-17 실측 300행: 정정 44건이 갈리고 정정 아닌 것은 1건뿐).
    first_announcement_date: parseDate(item.PAN_DT),
    apply_start:       varies === true ? earliestApplyStart(scdls) : parseDate(scdl?.SBSC_ACP_ST_DT),
    apply_end:         parseDate(item.CLSG_DT),
    status:            san(item.PAN_SS),
    url:               san(item.DTL_URL),
    is_revised:        String(item.PAN_SS ?? '').includes('정정') || (title ?? '').startsWith('[정정공고]'),
    area_min:          areaMin,
    area_max:          areaMax,
    total_units:       totalUnitsOf(sbds),
    heating_type:      san(sbds[0]?.HTN_FMLA_DS_CD_NM ?? sbds[0]?.HTN_FMLA_DESC),
    move_in_date:      san(sbds[0]?.MVIN_XPC_YM),
    schedule_varies:   varies,
    doc_submit_announce_date: oneKind ? parseDate(scdl?.PPR_SBM_OPE_ANC_DT) : null,
    doc_submit_start:         oneKind ? parseDate(scdl?.PPR_ACP_ST_DT)      : null,
    doc_submit_end:           oneKind ? parseDate(scdl?.PPR_ACP_CLSG_DT)    : null,
    winner_announce_date:     oneKind ? parseDate(scdl?.PZWR_ANC_DT)        : null,
    contract_start:           oneKind ? parseDate(scdl?.CTRT_ST_DT)         : null,
    contract_end:             oneKind ? parseDate(scdl?.CTRT_ED_DT)         : null,
    building_name:     buildingNameOf(sbds),
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

  // 🔴 보증금·월세의 0 (2026-09-17 개정). 업스트림이 실제로 숫자 0을 준다(실측: 1쪽 100행 중
  // 12행). 그런데 그 12행은 **전부 보증금·월세가 동시에 0**인 일반 매입임대 한 공고였다 —
  // 매입임대는 주택마다 조건이 달라 **대표값이 없는 자리**이지 「0원」이 아니다.
  //   · 둘 다 0        → 둘 다 null (대표값 없음)
  //   · 보증금>0·월세 0 → 보증금 값 · 월세 **0** (전세형 — 여기서만 0을 살린다)
  //   · 보증금 0·월세>0 → 보증금 null · 월세 값 (관측 사례 없음. 보증금 0원 임대는 드물어
  //                       대표값 없음으로 본다)
  //   · 부재·빈 문자열  → null (sanNum이 이미 null로 준다 — 0과 갈린다)
  const bothZero  = depositRaw === 0 && rentRaw === 0
  const depositMin = (depositRaw === null || depositRaw === 0) ? null : depositRaw
  const rentMin    = bothZero ? null : rentRaw

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
    deposit_min:       depositMin,
    rent_min:          rentMin,
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

  const lhBaseRows = lhNotices.map(n => mapLHRow(n, [], [], null)).filter(r => r.announcement_id && r.title)
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
  // 🔴 다만 이 게이트는 아래에서 lhNotices(= 이번 회차 LH 목록)를 filter하므로, 목록 윈도우
  // (fetchNoticeList의 PAN_ST_DT = 오늘-90일) 안에 있는 공고에만 닿는다. 윈도우 밖 공고는
  // 여기서 아무리 대상으로 뽑혀도 목록에 없어 상세조회로 이어지지 않는다 — 이 경로로는
  // 영원히 채워지지 않는다(2026-09-05 실측: 미시도 101건 중 95건이 윈도우 밖).
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
  // 🔴 실패한 건의 분류를 id별로 들고 있는다. 느린 재시도가 성공하면 지우므로
  // 런 끝의 집계가 failedIds와 **정확히 같은 수**가 된다(계수를 새로 만들지 않는다).
  const failKindOf = new Map<string, string>()

  // ── 상세조회 마감 (2026-09-09 신설) ──────────────────────────────
  // 문제: 앞단에 마감이 없어서, 업스트림이 열화되면 이 루프가 예산을 통째로 먹고
  // 아래 late_retry 게이트가 열리지 않는다. 2026-09-09 실측 두 런이 그랬다 —
  // 상세대상 80건 중 50건이 5초 타임아웃에 걸려 이 루프만 66.2초를 썼고(전체 88.0초의 75%),
  // 게이트 판정 시점 누계가 88.0초라 late_retry가 통째로 건너뛰어졌다.
  // 배치 하나는 Promise.all이라 5건 중 하나만 느려도 5초를 다 쓴다(배치당 정상 1.9초 대 열화 4.0초).
  //
  // 🔴 한도 산출(절대수를 임의로 정하지 않는다):
  //   게이트가 열리려면  앞단 누계 < LATE_RETRY_BUDGET_MS(70,000)
  //   앞단 = 목록 5,000 + 기본 upsert 1,600 + 우선순위 조회 140
  //          + [이 루프] + 상세 upsert·bump·정정사유 300 + MYHOME 최악 15,000
  //   ∴ 이 루프의 몫 상한 = 70,000 − 22,040 ≈ 47,960
  //   배치 경계에서만 검사하므로 마지막 배치가 최대 5,000을 더 쓴다 → 한도 ≤ 42,960
  //   정상 런 실측(60런, 2026-09-08~09) 24.78~31.11초, 배치당 최악 1.928초.
  //   캡 90건(18배치)으로 외삽하면 37.25초 → 한도 ≥ 37,250
  //   [37,250 , 42,960] 구간의 가운데를 배치 단위로 올림해 40,000을 쓴다.
  //   정상 실측 최대(31.11초) 대비 +8.9초, 90건 외삽 대비 +2.75초, 상한 대비 −2.96초.
  //
  // 🔴 중단해도 안전한 이유: 시도하지 않은 건은 fetchDetail을 아예 부르지 않으므로
  // detail_fetch_last_attempt도 detail_fetch_fail_count도 찍히지 않는다. 다음 런에서
  // nullApplyStartIds 우선순위(apply_start가 NULL인 활성 공고가 1순위)로 그대로 앞자리에 돌아온다.
  // 새 상태를 만들지 않는다 — 이것이 이 처방을 고른 이유다.
  //
  // ⚠️ LATE_RETRY_BUDGET_MS·TIME_BUDGET_MS·타임아웃 값은 건드리지 않았다. Free 플랜 wall-clock
  // 150초 한도가 그대로라, 예산을 올리는 방향은 EF 자체를 죽여 회차 전체를 잃는다.
  const DETAIL_BUDGET_MS = 40000
  const detailStartedAt = Date.now()
  let detailSkipped = 0

  for (let i = 0; i < needDetail.length; i += 5) {
    if (Date.now() - detailStartedAt >= DETAIL_BUDGET_MS) {
      detailSkipped = needDetail.length - i
      break
    }
    const batch   = needDetail.slice(i, i+5)
    const results = await Promise.all(batch.map(n => fetchDetail(n)))
    batch.forEach((n, j) => {
      const r = results[j]
      if (r.sbds.length > 0 || r.scdls.length > 0) {
        lhDetailOk++
        detailRows.push({
          ...mapLHRow(n, r.sbds, r.scdls, r.ahflInfo),
          detail_fetch_fail_count: 0,
          detail_fetch_last_attempt: new Date().toISOString(),
        })
        const crcRsn = san(r.etcInfo?.CRC_RSN)
        if (crcRsn) revisionCandidates.push({ id: n.PAN_ID, note: crcRsn })
      } else {
        failedIds.push(n.PAN_ID)
        failKindOf.set(n.PAN_ID, r.fail ?? 'unknown')
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
      if (r.sbds.length > 0 || r.scdls.length > 0) {
        slowRetryOk++
        detailRows.push({
          ...mapLHRow(n, r.sbds, r.scdls, r.ahflInfo),
          detail_fetch_fail_count: 0,
          detail_fetch_last_attempt: new Date().toISOString(),
        })
        const idx = failedIds.indexOf(n.PAN_ID)
        if (idx >= 0) failedIds.splice(idx, 1)
        failKindOf.delete(n.PAN_ID)
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
  // 전용 컬럼이 없으므로 errors에 남긴다(스키마 변경은 범위 밖). late_retry와 같은 방식이며,
  // 마감이 실제로 발동했는지를 collection_run_log만 보고 판정할 유일한 근거다.
  if (detailSkipped > 0) {
    errors.push(`상세조회 마감(${DETAIL_BUDGET_MS}ms) 초과로 ${detailSkipped}건 미시도`)
  }
  console.log(`[LH] 상세 ${lhDetailOk}/${needDetail.length}건` +
    (detailSkipped > 0 ? ` (마감 초과로 ${detailSkipped}건 미시도)` : ''))

  if (failedIds.length > 0) {
    const { error } = await supabase.rpc('bump_detail_fetch_fail', { p_ids: failedIds })
    if (error) errors.push(`상세조회 실패추적: ${error.message}`)

    // 🔴 분류별 건수 한 줄. 실패가 0건인 런은 이 줄을 만들지 않는다.
    const tally = new Map<string, number>()
    for (const id of failedIds) {
      const k = failKindOf.get(id) ?? 'unknown'
      tally.set(k, (tally.get(k) ?? 0) + 1)
    }
    errors.push(`상세조회 실패 ${failedIds.length}건: ` +
      [...tally.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k} ${v}`).join(' · '))
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
        const rows = again.items.map(n => mapLHRow(n, [], [], null)).filter(r => r.announcement_id && r.title)
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

// ── 관측 전용 probe (2026-09-17 신설) ─────────────────────────────
// 🔴 무엇인가: `?mode=probe`로 부르면 **DB에 한 줄도 쓰지 않고** LH 목록·상세와 MYHOME 목록을
// 받아 업스트림 원문을 요약해 JSON으로 돌려준다. 매퍼를 바꾸기 전에 「원문이 실제로 무엇을
// 주는가」를 봐야 하는데, 컨테이너 프록시가 apis.data.go.kr에 닿지 않아 EF 안에서 볼 수밖에 없다.
// collect-sh-announcements의 `?mode=probe`와 같은 자리·같은 모양이다.
//
// 🔴 의존 방향이 한쪽이다 — probe가 수집 쪽 함수를 부르는 것은 있어도(fetchListPage·
// fetchJsonStrict·snippetOf·mapLHRow) **그 반대는 없다.** collect()도 mapLHRow도 이 블록을 모른다.
// 그래서 이 블록을 통째로 지워도 정기 실행은 글자 그대로 같다.
//
// 🔴 DB에 쓰지 않는다 — 이 블록 어디에서도 supabase.*를 부르지 않는다. collection_run_log에도
// 남지 않는다(로그 기록은 collect() 안에만 있다).
//
// 🔴 외부 요청 상한은 호출당 고정이다: LH 목록 1쪽 + LH 상세 최대 5건 + MYHOME 1쪽 = 최대 7회.
// 목록의 쪽·카테고리는 파라미터로 받되 **한 번에 한 쪽**이다. 더 보려면 다시 부른다.
//
// 🔴 비밀값은 어떤 형태로도 응답에 싣지 않는다. 응답 문자열 전체에 scrubSecrets()를 한 번 더
// 건다 — URL을 담지 않는 것이 1차 방어이고, 이것이 2차 방어다.
const PROBE_MAX_DETAIL   = 5
const PROBE_MAX_ELEMENTS = 20    // 원소 배열을 통째로 싣되 이 수에서 자른다
const PROBE_LIST_TIMEOUT_MS   = 12000
const PROBE_DETAIL_TIMEOUT_MS = 20000   // 관측용이라 수집(5초)보다 길게 — 느린 공고도 봐야 한다

// 키가 URL 인코딩된 형태로 섞여 들어갈 수 있어 변형까지 함께 막는다.
const secretVariants = (v: string): string[] => {
  const out = new Set<string>([v])
  try { out.add(encodeURIComponent(v)) } catch { /* 무시 */ }
  try { out.add(decodeURIComponent(v)) } catch { /* 무시 */ }
  return [...out].filter(s => s.length >= 8)
}
const PROBE_SECRETS = [...secretVariants(LH_API_KEY), ...secretVariants(CRON_SECRET)]
const scrubSecrets = (text: string): string => {
  let out = redactKey(text)
  for (const s of PROBE_SECRETS) out = out.split(s).join('***')
  return out
}

// 「0」과 「"0"」과 「""」과 「없음」을 갈라 말한다 — mapMyHomeRow의 0 접기를 판정할 유일한 근거다.
// DB로는 못 가른다(넷이 전부 NULL로 합류한다).
const rawKind = (v: unknown): string => {
  if (v === undefined) return 'absent'
  if (v === null) return 'null'
  if (typeof v === 'number') return v === 0 ? 'number:0' : 'number'
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return 'string:empty'
    if (/^0+(\.0+)?$/.test(t)) return 'string:zero'
    return 'string'
  }
  return typeof v
}
const isZeroKind = (k: string): boolean => k === 'number:0' || k === 'string:zero'

const probeListRow = (i: NoticeItem) => ({
  PAN_ID: i.PAN_ID, PAN_NM: i.PAN_NM, PAN_SS: i.PAN_SS,
  PAN_NT_ST_DT: i.PAN_NT_ST_DT, PAN_DT: i.PAN_DT,
  CLSG_DT: i.CLSG_DT, CNP_CD_NM: i.CNP_CD_NM,
})

// 목록 1쪽. 🔴 fetchNoticeList를 부르지 않는다 — 그 함수는 카테고리를 끝까지 페이징해서
// 상한(1쪽)을 넘긴다. 윈도우 산출은 그 함수와 같은 식을 쓰되 **읽기만** 한다.
async function probeList(tp: string, page: number, sampleN: number, panIds: string[]) {
  const today  = new Date()
  const past   = new Date(today); past.setDate(today.getDate() - 90)
  const future = new Date(today); future.setDate(today.getDate() + 365)
  const fmt    = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`

  const url = `https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1` +
    `?ServiceKey=${LH_API_KEY}&PG_SZ=100&PAGE=${page}&UPP_AIS_TP_CD=${tp}` +
    `&PAN_ST_DT=${fmt(past)}&PAN_ED_DT=${fmt(today)}` +
    `&CLSG_ST_DT=${fmt(past)}&CLSG_ED_DT=${fmt(future)}`

  const items = await fetchListPage(url, PROBE_LIST_TIMEOUT_MS)

  let same = 0, differ = 0, panDtMissing = 0, panNtMissing = 0
  for (const i of items) {
    const a = san(i.PAN_NT_ST_DT), b = san(i.PAN_DT)
    if (!b) panDtMissing++
    if (!a) panNtMissing++
    if (a && b) (parseDate(a) === parseDate(b) ? same++ : differ++)
  }

  const revised = items.filter(i =>
    String(i.PAN_SS ?? '').includes('정정') || String(i.PAN_NM ?? '').startsWith('[정정공고]'))

  const wanted = new Set(panIds)
  const matched = items.filter(i => wanted.has(String(i.PAN_ID)))

  return {
    summary: {
      upp_ais_tp_cd: tp, page,
      window: { PAN_ST_DT: fmt(past), PAN_ED_DT: fmt(today), CLSG_ED_DT: fmt(future) },
      count: items.length,
      // 🔴 A-1의 핵심 관측 — 목록이 PAN_DT와 PAN_NT_ST_DT를 실제로 다르게 주는가.
      date_compare: { same, differ, pan_dt_missing: panDtMissing, pan_nt_st_dt_missing: panNtMissing },
      list_row_keys: items.length ? Object.keys(items[0] as unknown as Record<string, unknown>) : [],
    },
    sample:   items.slice(0, sampleN).map(probeListRow),
    revised:  revised.map(probeListRow),          // 이 쪽 안의 정정 전수
    requested: {
      asked: panIds,
      found: matched.map(probeListRow),
      missing: panIds.filter(id => !matched.some(i => String(i.PAN_ID) === id)),
    },
    _items: items,   // 상세조회에 넘길 원본. 응답에서는 지운다.
  }
}

// 상세 1건. 🔴 fetchDetailWithTimeout을 쓰지 않는다 — 그쪽은 실패를 분류로 접어
// 버리는데, 여기서 보려는 것은 원문 그 자체(원소가 몇 개이고 각각 무엇을 담는가)다.
async function probeDetail(item: NoticeItem): Promise<Record<string, unknown>> {
  const url = `https://apis.data.go.kr/B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1` +
    `?serviceKey=${LH_API_KEY}` +
    `&SPL_INF_TP_CD=${item.SPL_INF_TP_CD}&CCR_CNNT_SYS_DS_CD=${item.CCR_CNNT_SYS_DS_CD}` +
    `&PAN_ID=${item.PAN_ID}&UPP_AIS_TP_CD=${item.UPP_AIS_TP_CD}&AIS_TP_CD=${item.AIS_TP_CD}`

  const base = { pan_id: item.PAN_ID, list_row: probeListRow(item) }
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(PROBE_DETAIL_TIMEOUT_MS) })
  } catch (e) {
    return { ...base, error: `network:${e instanceof Error ? e.name : 'Error'}` }
  }
  const contentType = res.headers.get('content-type')
  const text = await res.text().catch(() => '')
  if (!res.ok) return { ...base, error: 'http_error', status: res.status, content_type: contentType, snippet: snippetOf(text) }

  let parsed: unknown
  try { parsed = JSON.parse(text) }
  catch { return { ...base, error: 'json_parse_failed', content_type: contentType, snippet: snippetOf(text) } }
  if (!Array.isArray(parsed)) {
    return { ...base, error: 'not_an_array', content_type: contentType, snippet: snippetOf(JSON.stringify(parsed)) }
  }

  const containers = parsed as Record<string, unknown>[]
  const arrOf = (k: string): Record<string, unknown>[] => {
    const c = containers.find(x => Array.isArray(x[k]))
    return c ? (c[k] as Record<string, unknown>[]) : []
  }
  const sbd  = arrOf('dsSbd')
  const scdl = arrOf('dsSplScdl')
  const etc  = arrOf('dsEtcInfo')
  const ahfl = arrOf('dsAhflInfo')

  return {
    ...base,
    container_keys: containers.flatMap(c => Object.keys(c)),
    ds_sbd_count: sbd.length,
    ds_sbd: sbd.slice(0, PROBE_MAX_ELEMENTS),
    ds_spl_scdl_count: scdl.length,
    ds_spl_scdl: scdl.slice(0, PROBE_MAX_ELEMENTS),
    ds_etc_info_count: etc.length,
    ds_ahfl_info_count: ahfl.length,
    // 🔴 C-3 (2026-09-17): 원문 옆에 **새 mapLHRow가 만들 행**을 함께 보여준다. DB에는
    // 쓰지 않는다 — 배포 직후 정기 런 전에 표본을 대조하려고 두는 것이다.
    mapped_row: mapLHRow(
      item,
      sbd as unknown as SbdItem[],
      scdl as unknown as SplScdlItem[],
      ahfl.length ? (ahfl as unknown as AhflInfoItem[]) : null,
    ),
  }
}

// MYHOME 목록 1쪽. 임대료·보증금·공급호수의 **원시 값과 타입**을 그대로 본다.
const PROBE_MYHOME_FIELDS = ['rentGtn', 'mtRntchrg', 'sumSuplyCo'] as const

async function probeMyHome(sampleN: number, page: number) {
  const url = `https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList` +
    `?serviceKey=${LH_API_KEY}&numOfRows=100&pageNo=${page}&type=json`
  const { value } = await fetchJsonStrict(url, MYHOME_TIMEOUT_MS)
  const raw = value as { response?: { body?: { totalCount?: unknown; item?: unknown } } }
  const itemsRaw = raw?.response?.body?.item
  const items: MyHomeItem[] = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw as MyHomeItem] : []

  const kinds: Record<string, Record<string, number>> = {}
  for (const f of PROBE_MYHOME_FIELDS) kinds[f] = {}
  for (const it of items) {
    for (const f of PROBE_MYHOME_FIELDS) {
      const k = rawKind((it as Record<string, unknown>)[f])
      kinds[f][k] = (kinds[f][k] ?? 0) + 1
    }
  }

  const viewOf = (it: MyHomeItem) => {
    const o: Record<string, unknown> = {
      pblancId: it['pblancId'], houseSn: it['houseSn'], pblancNm: it['pblancNm'],
      brtcNm: it['brtcNm'], signguNm: it['signguNm'],
    }
    for (const f of PROBE_MYHOME_FIELDS) {
      const v = (it as Record<string, unknown>)[f]
      o[f] = { value: v, typeof: typeof v, kind: rawKind(v) }
    }
    return o
  }

  // 🔴 A-6의 핵심 관측 — 업스트림이 실제로 0을 주는가. 주면 어떤 공고인가.
  const zeroRows = items.filter(it =>
    PROBE_MYHOME_FIELDS.some(f => isZeroKind(rawKind((it as Record<string, unknown>)[f]))))

  return {
    summary: {
      page,
      total_count: raw?.response?.body?.totalCount ?? null,
      page_count: items.length,
      item_keys: items.length ? Object.keys(items[0] as Record<string, unknown>) : [],
      kinds,
      zero_row_count: zeroRows.length,
    },
    zero_rows: zeroRows.slice(0, PROBE_MAX_ELEMENTS).map(viewOf),
    sample: items.slice(0, sampleN).map(viewOf),
  }
}

async function probe(params: URLSearchParams): Promise<Record<string, unknown>> {
  const tp      = (params.get('tp') ?? '06').replace(/[^0-9]/g, '').slice(0, 2) || '06'
  const page    = Math.min(Math.max(parseInt(params.get('page') ?? '1', 10) || 1, 1), 10)
  const sampleN = Math.min(Math.max(parseInt(params.get('n') ?? '10', 10) || 10, 1), 100)
  const panIds  = (params.get('pan_ids') ?? '').split(',')
    .map(s => s.trim()).filter(Boolean).slice(0, PROBE_MAX_DETAIL)
  const wantMyHome = params.get('myhome') !== '0'
  const mhPage  = Math.min(Math.max(parseInt(params.get('mh_page') ?? '1', 10) || 1, 1), 20)

  const out: Record<string, unknown> = {
    params: { tp, page, n: sampleN, pan_ids: panIds, myhome: wantMyHome, mh_page: mhPage },
    limits: { list_pages: 1, detail_max: PROBE_MAX_DETAIL, myhome_pages: wantMyHome ? 1 : 0 },
  }

  let listItems: NoticeItem[] = []
  try {
    const l = await probeList(tp, page, sampleN, panIds)
    listItems = l._items
    const { _items, ...rest } = l
    out.lh_list = rest
  } catch (e) {
    out.lh_list = { error: e instanceof UpstreamError ? describeFail('LH 목록', e.info) : String(e) }
  }

  if (panIds.length > 0) {
    const targets = listItems.filter(i => panIds.includes(String(i.PAN_ID))).slice(0, PROBE_MAX_DETAIL)
    const details: unknown[] = []
    for (const id of panIds) {
      if (!targets.some(t => String(t.PAN_ID) === id)) {
        // 🔴 상세조회에 필요한 코드 4종(SPL_INF_TP_CD·CCR_CNNT_SYS_DS_CD·UPP_AIS_TP_CD·AIS_TP_CD)은
        // 목록 행에만 있다. 이 쪽에 없으면 지어내지 않고 「못 찾았다」고 적는다 — tp·page를 바꿔 다시 부른다.
        details.push({ pan_id: id, error: 'not_in_list_page', hint: 'tp·page를 바꿔 다시 부른다' })
      }
    }
    for (const t of targets) {
      try { details.push(await probeDetail(t)) }
      catch (e) { details.push({ pan_id: t.PAN_ID, error: String(e) }) }
    }
    out.lh_detail = details
  } else {
    out.lh_detail = { skipped: 'pan_ids 미지정 — 상세 호출 0회' }
  }

  if (wantMyHome) {
    try { out.myhome = await probeMyHome(sampleN, mhPage) }
    catch (e) {
      out.myhome = { error: e instanceof UpstreamError ? describeFail('MYHOME 목록', e.info) : String(e) }
    }
  } else {
    out.myhome = { skipped: 'myhome=0' }
  }

  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,x-cron-secret'
  }})
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'Method not allowed'}), {status:405})
  if (!matchCronSecret(req)) return new Response(JSON.stringify({error:'Unauthorized'}), {status:401})
  if (new URL(req.url).searchParams.get('mode') === 'authcheck') return authcheckResponse()

  // 🔴 관측 전용 경로. 여기서 반환하면 collect()는 아예 호출되지 않는다 — DB에 한 줄도 쓰지 않고,
  // collection_run_log에도 남지 않는다. 정기 실행(mode 미지정 = collect)은 이 분기를 지나치기만 한다.
  const probeParams = new URL(req.url).searchParams
  if (probeParams.get('mode') === 'probe') {
    const probed = await probe(probeParams)
    return new Response(scrubSecrets(JSON.stringify({ mode: 'probe', ...probed })),
      { headers: { 'Content-Type': 'application/json' } })
  }

  const started = new Date().toISOString()
  const result  = await collect()
  const res = { started, finished: new Date().toISOString(), ...result }
  console.log('[DONE]', JSON.stringify(res))
  return new Response(JSON.stringify(res), {headers:{'Content-Type':'application/json'}})
})
