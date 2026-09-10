// 첨부 파일 운반 경로 검증용 임시 Edge Function (2026-09-10 신설)
//
// 🔴 임시다. 「누가 파일을 받느냐」 하나를 가르려고 만들었다.
// 판정이 끝나면 내린다(작업지시서 3장 「철회」).
//
// 배경 — 왜 이게 필요한가:
//   ① Claude Code 컨테이너는 egress 프록시가 apply.lh.or.kr / i-sh.co.kr /
//      housing.seoul.go.kr 를 403으로 막는다(정책 거부). 파일을 못 받는다.
//   ② claude.ai도 원본 바이트를 못 얻는다.
//   ③ pg_net으로 직접 받는 것은 실패했다 — net._http_response.content 가 text라
//      바이너리가 첫 NUL에서 잘린다(878,331바이트 중 109옥텟만 남았다).
//   → 그래서 EF가 받아서 base64(순수 ASCII)로 돌려준다. text 파이프를 탈 수 있다.
//
// 하는 일은 하나뿐이다. URL 하나를 받아 그 응답을 base64로 돌려준다.
// 🔴 저장하지 않는다. DB에 쓰지 않는다. 가공하지 않는다.

// 코딩원칙 16번: `Deno.env.get()!`는 타입 단언일 뿐 런타임 검사가 아니다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

// 기존 수집 EF와 같은 기준 — verify_jwt=false + x-cron-secret 게이트.
const CRON_SECRET = requireEnv('CRON_SECRET_V2')
const matchCronSecret = (req: Request): boolean =>
  req.headers.get('x-cron-secret') === CRON_SECRET

// 🔴 호스트 허용목록. 이게 없으면 이 함수는 누구나 쓰는 공개 프록시가 된다(SSRF).
// 조사 대상 도메인만 연다.
const ALLOWED_HOSTS = new Set([
  'apply.lh.or.kr',
  'www.i-sh.co.kr',
  'i-sh.co.kr',
  'housing.seoul.go.kr',
])

const FETCH_TIMEOUT_MS = 60_000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const toBase64 = (bytes: Uint8Array): string => {
  // 큰 배열을 String.fromCharCode(...bytes)로 한 번에 넘기면 스택이 터진다.
  // 청크로 나눠 이어붙인다.
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,x-cron-secret',
      },
    })
  }

  if (!matchCronSecret(req)) return json({ ok: false, error: 'unauthorized' }, 401)

  const reqUrl = new URL(req.url)
  const target = reqUrl.searchParams.get('url')
  // meta=1 이면 base64를 빼고 메타데이터만 돌려준다(도달성만 싸게 확인할 때).
  const metaOnly = reqUrl.searchParams.get('meta') === '1'

  if (!target) return json({ ok: false, error: 'url 파라미터가 없다' }, 400)

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return json({ ok: false, error: 'url을 파싱할 수 없다' }, 400)
  }
  if (parsed.protocol !== 'https:') {
    return json({ ok: false, error: 'https만 허용한다' }, 400)
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return json({ ok: false, error: `허용되지 않은 host: ${parsed.hostname}` }, 403)
  }

  const started = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(parsed.toString(), { signal: ac.signal })
    const buf = new Uint8Array(await res.arrayBuffer())
    clearTimeout(timer)

    const payload: Record<string, unknown> = {
      ok: true,
      status: res.status,
      elapsed_ms: Date.now() - started,
      content_type: res.headers.get('content-type'),
      content_disposition: res.headers.get('content-disposition'),
      header_content_length: res.headers.get('content-length'),
      // 🔴 실제로 받은 바이트 수. header와 어긋나면 그 자체가 정보다.
      bytes: buf.length,
      sha256: await sha256Hex(buf),
      // 앞 8바이트 시그니처 — %PDF / PK 판별용.
      head_hex: Array.from(buf.subarray(0, 8))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
    }
    if (!metaOnly) {
      payload.base64 = toBase64(buf)
      payload.base64_len = (payload.base64 as string).length
    }
    return json(payload)
  } catch (e) {
    clearTimeout(timer)
    return json({
      ok: false,
      error: String(e instanceof Error ? e.message : e),
      elapsed_ms: Date.now() - started,
    }, 502)
  }
})
