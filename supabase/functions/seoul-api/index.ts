// 서울 실행 공공 API 공용 길 Edge Function (2026-11-12 신설 · 우편함 「코드·운영 — 서울 실행 EF 공용 길 …」 1)
//
// 왜: 키를 싣는 공공 API 중 해외 IP를 TLS 단계에서 끊는 호스트가 있다 — `business.juso.go.kr`(도로명주소 검색) ·
//   `data.myhome.go.kr`(마이홈 공공임대 단지정보 15058476). 컨테이너(해외 출구)는 CONNECT 200 뒤 `Connection reset by peer`,
//   DB(싱가포르 net.http_get)는 시간 초과였다(조사 「juso 검색으로 지번 33주소 …」 회신 · 2026-11-12).
//   그래서 이 함수가 **서울 지역(ap-northeast-2)에서 실행될 때만** 바깥을 부른다 — `fetch-attachment` SEOUL_ONLY(x-region) 선례와 같은 결.
//   다른 지역에서 불리면 같은 요청을 `x-region: ap-northeast-2`로 자신에게 한 번 넘긴다(x-zf-region-hop 으로 두 번 넘기지 않음).
//   이것은 우회가 아니라 우리 함수의 실행 위치 선택이다 — UA·경유는 바꾸지 않는다.
//
// 🔴 범위 장치 넷:
//   ① 호출할 수 있는 API는 아래 APIS 표뿐 — 호스트·경로 고정(호출자가 URL을 주지 않는다 · 공개 프록시가 되지 않는다).
//   ② 키는 EF 비밀값에서만 — 요청 인자로 키를 받지 않고(표의 keyParam 이름이 요청에 오면 400) · 응답 몸에 키가 나오면 「<키>」로 바꾼다 ·
//      로그에 URL을 찍지 않는다.
//   ③ 호출자 인증 — 다른 수집 EF와 같은 x-cron-secret(Vault cron_secret_v2 = 비밀값 CRON_SECRET_V2) · verify_jwt=false.
//   ④ 레이트 제한 — 실행 인스턴스마다 API별 분당 MAX_PER_MIN 회(넘으면 429 · 바깥을 부르지 않음).
//
// 부르는 법: POST(또는 GET) /functions/v1/seoul-api?api=<이름>&<인자들>  · 머리 x-cron-secret
//   응답 200 {ok, api, region, status, content_type, body(글 · 최대 MAX_BODY), truncated, elapsed_ms} · 바깥 응답 코드는 status 칸에(200 밖도 그대로).
//   400 표 밖 api · 표 밖 인자 · 키 인자 / 401 인증 / 429 레이트 / 503 비밀값 없음 · 서울 아님.
// 🔴 쓰기 0 — DB·Drive 를 건드리지 않는다. 부른 쪽(분석·점검 회차)이 결과를 읽고 정한다.

// 코딩원칙 16번: Deno.env.get('X')! 금지.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}
const CRON_SECRET = requireEnv('CRON_SECRET_V2')

const SEOUL_REGION = 'ap-northeast-2'
const MAX_PER_MIN = 60
const MAX_BODY = 1_000_000
const TIMEOUT_MS = 20_000

type Api = {
  host: string
  path: string
  keyParam: string          // 바깥 API의 키 인자 이름
  keyEnv: string            // EF 비밀값 이름(값은 여기서만 읽는다)
  params: string[]          // 호출자가 넘길 수 있는 인자(그 밖 0)
  fixed: Record<string, string>
}
// 🔴 이 표가 유일한 범위다 — 더하려면 PR 로(호스트 · 경로 · 키 비밀값 · 인자 목록을 함께).
export const APIS: Record<string, Api> = {
  // 행정안전부 도로명주소 검색(juso · 승인키 JUSO_SEARCH_KEY · 2026-11-12 발급 · 만료 표시 없음 — docs/data-sources.md 「키·신청·만료」)
  juso_search: {
    host: 'business.juso.go.kr', path: '/addrlink/addrLinkApi.do', keyParam: 'confmKey', keyEnv: 'JUSO_SEARCH_KEY',
    params: ['keyword', 'currentPage', 'countPerPage', 'hstryYn', 'firstSort', 'addInfoYn'], fixed: { resultType: 'json' },
  },
  // LH 공공임대주택 단지정보 15058476(data.myhome.go.kr 전용 · data.go.kr 키 — LH_API_KEY 와 같은 값)
  myhome_rental_list: {
    host: 'data.myhome.go.kr', path: '/rentalHouseList', keyParam: 'serviceKey', keyEnv: 'LH_API_KEY',
    params: ['brtcCode', 'signguCode', 'numOfRows', 'pageNo'], fixed: {},
  },
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } })

// 레이트 제한 — 인스턴스 안 API별 최근 1분 호출 시각
const hits = new Map<string, number[]>()
export const rateOk = (api: string, now = Date.now(), max = MAX_PER_MIN): boolean => {
  const arr = (hits.get(api) ?? []).filter(t => now - t < 60_000)
  if (arr.length >= max) { hits.set(api, arr); return false }
  arr.push(now); hits.set(api, arr); return true
}

// 요청 인자 → 바깥 URL(키 없이 · 키는 부르기 직전에 붙인다). 잘못이면 사유 글.
export const buildTarget = (q: URLSearchParams): { api: string; spec: Api; url: URL } | string => {
  const name = q.get('api') ?? ''
  const spec = APIS[name]
  if (!spec) return `표 밖 api: ${name.slice(0, 40)}`
  const url = new URL(`https://${spec.host}${spec.path}`)
  for (const [k, v] of q) {
    if (k === 'api') continue
    if (k.toLowerCase() === spec.keyParam.toLowerCase()) return `키 인자(${spec.keyParam})는 받지 않는다 — EF 비밀값에서만`
    if (!spec.params.includes(k)) return `표 밖 인자: ${k.slice(0, 40)}`
    url.searchParams.set(k, v.slice(0, 200))
  }
  for (const [k, v] of Object.entries(spec.fixed)) url.searchParams.set(k, v)
  return { api: name, spec, url }
}

const handle = async (req: Request): Promise<Response> => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401)
  if (!['GET', 'POST'].includes(req.method)) return json({ ok: false, error: 'GET·POST 만' }, 405)
  const reqUrl = new URL(req.url)
  const t = buildTarget(reqUrl.searchParams)
  if (typeof t === 'string') return json({ ok: false, error: t }, 400)

  const region = Deno.env.get('SB_REGION') ?? '(없음)'
  // 서울이 아니면 자신에게 한 번 넘긴다(fetch-attachment 와 같은 꼴).
  if (region !== SEOUL_REGION) {
    if (req.headers.get('x-zf-region-hop') === '1') return json({ ok: false, error: `서울 지역 실행이 필요하다 — 지금 ${region}` }, 503)
    const base = requireEnv('SUPABASE_URL')
    const res = await fetch(`${base}/functions/v1/seoul-api${reqUrl.search}`, {
      method: 'GET', headers: { 'x-cron-secret': CRON_SECRET, 'x-region': SEOUL_REGION, 'x-zf-region-hop': '1' },
    })
    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store', 'x-zf-region-hop': `${region}->${res.headers.get('x-sb-edge-region') ?? '?'}` },
    })
  }

  const key = Deno.env.get(t.spec.keyEnv)
  if (!key) return json({ ok: false, api: t.api, error: `EF 비밀값 없음: ${t.spec.keyEnv}` }, 503)
  if (!rateOk(t.api)) return json({ ok: false, api: t.api, error: `레이트 제한 — 분당 ${MAX_PER_MIN}회` }, 429)

  const url = new URL(t.url)
  url.searchParams.set(t.spec.keyParam, key)
  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'ZipFitBot/1.0 (+https://kkokzip.com)' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    // 오류 글에 URL(키)이 실릴 수 있어 이름만 돌려준다.
    return json({ ok: false, api: t.api, region, error: `바깥 호출 실패: ${e instanceof Error ? e.name : 'error'}`, elapsed_ms: Date.now() - t0 })
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  const truncated = buf.length > MAX_BODY
  let body = new TextDecoder('utf-8').decode(truncated ? buf.subarray(0, MAX_BODY) : buf)
  if (body.includes(key)) body = body.split(key).join('<키>')
  return json({ ok: true, api: t.api, region, status: res.status, content_type: res.headers.get('content-type'), body, truncated, elapsed_ms: Date.now() - t0 })
}

Deno.serve(handle)
