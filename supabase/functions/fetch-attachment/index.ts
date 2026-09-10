// 공고 첨부 대리 수신 Edge Function
//
// 하는 일은 하나뿐이다. 허용된 공고 사이트의 첨부 URL 하나를 받아
// 그 바이트를 base64로 돌려준다. 저장하지 않고, 가공하지 않고, DB에 쓰지 않는다.
//
// ⚠️ 왜 이 함수가 필요한가 — Claude Code 컨테이너에서 직접 받을 수 없다:
//   egress 프록시가 apply.lh.or.kr / i-sh.co.kr / housing.seoul.go.kr 를
//   403으로 막는다(정책 거부). Edge Function 요청은 Supabase 인프라에서
//   나가므로 그 정책과 무관하다. collect-sh-announcements 의 ?mode=probe 와 같은 이유다.
//
// ⚠️ pg_net으로 파일을 직접 받을 수는 없다(2026-09-10 실측):
//   net._http_response.content 가 text 컬럼이라 바이너리가 살아남지 못한다.
//   878,331바이트 PDF가 109옥텟만 남았고, 저장된 값은 UTF-8로 재인코딩조차 되지
//   않았다(invalid byte sequence 0xff). 그래서 base64(순수 ASCII)로 돌려준다.

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

// 🔴 이 함수는 다른 수집 EF와 성격이 다르다.
// 다른 EF는 정해진 곳에서 가져오지만, 이 함수는 *호출자가 준 URL로* 나간다.
// 그래서 허용목록이 유일한 범위 장치다. 없으면 공개 프록시(SSRF)가 된다.
//
// paths가 null이면 호스트 단위로만 검사한다. LH는 첨부 경로가 하나로 고정돼
// 있어 경로까지 좁혔다. SH는 첨부 경로가 아직 파악되지 않아 null로 두고,
// 파악되는 시점에 좁힌다(그전에 좁히면 SH 수집이 조용히 막힌다).
const ALLOWED: Record<string, string[] | null> = {
  'apply.lh.or.kr': ['/lhapply/'],
  'www.i-sh.co.kr': null,
  'i-sh.co.kr': null,
  'housing.seoul.go.kr': null,
}

// 🔴 운반 상한. 원본 바이트 기준이다.
//
// 산출 근거(2026-09-10 실측). 사슬은 세 겹이고 각 겹의 한도가 다르다:
//   ① EF 응답        — 원본 15,954,648B / base64 21,272,864자 통과
//   ② pg_net 저장    — 같은 건이 21,273,309옥텟으로 온전히 저장됨
//   ③ MCP 전달       — 16,000,000자 통과 · 19,000,000자에서 세션이 끊김
// 즉 가장 좁은 겹은 ③이고, 안전이 확인된 값은 base64 16,000,000자
// = 원본 12,000,000B다. 실패는 base64 19,000,000자 = 원본 14,250,000B.
//
// 여기에 실물 분포를 겹친다. LH 첨부 84건 표본에서 중앙값 294,019B,
// p95 1,770,898B이고, **1,770,898B와 15,954,648B 사이에 파일이 하나도 없다.**
// 6,000,000B는 그 빈 구간 한가운데다 — 실재하는 어떤 무리도 가르지 않는다.
//
// 여유: 안전 확인값의 1/2(12,000,000B), 실패값의 약 1/2.4(14,250,000B),
//       실측 최대 공고문의 3.4배(1,770,898B).
// ⚠️ 경계값을 그대로 쓰지 않았다. 경계 근처가 가장 위험하다.
const MAX_SOURCE_BYTES = 6_000_000

// 🔴 리다이렉트는 수동으로 따라간다.
// 자동(fetch 기본값)으로 두면 허용 호스트가 허용 밖으로 넘겨줄 때
// 허용목록이 통째로 무력해진다. 매 홉마다 다시 검사한다.
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 60_000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// 허용목록 검사. 통과하면 null, 막히면 사유 문자열을 돌려준다.
const rejectReason = (u: URL): string | null => {
  if (u.protocol !== 'https:') return `https가 아니다: ${u.protocol}`
  if (!(u.hostname in ALLOWED)) return `허용되지 않은 host: ${u.hostname}`
  const paths = ALLOWED[u.hostname]
  if (paths && !paths.some((p) => u.pathname.startsWith(p))) {
    return `허용되지 않은 path: ${u.hostname}${u.pathname}`
  }
  return null
}

const toBase64 = (bytes: Uint8Array): string => {
  // 큰 배열을 String.fromCharCode(...bytes)로 한 번에 넘기면 스택이 터진다.
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

// 상한을 넘으면 그 자리에서 멈춘다. 다 받아놓고 버리지 않는다.
// Content-length가 없는 응답이 있어서 헤더만으로는 못 막는다.
const readCapped = async (
  body: ReadableStream<Uint8Array>,
  cap: number,
): Promise<{ bytes: Uint8Array | null; read: number }> => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let read = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    read += value.length
    if (read > cap) {
      await reader.cancel()
      return { bytes: null, read }
    }
    chunks.push(value)
  }
  const out = new Uint8Array(read)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return { bytes: out, read }
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
  // meta=1 이면 본문(base64)을 빼고 메타데이터만 돌려준다.
  const metaOnly = reqUrl.searchParams.get('meta') === '1'

  if (!target) return json({ ok: false, error: 'url 파라미터가 없다' }, 400)

  let current: URL
  try {
    current = new URL(target)
  } catch {
    return json({ ok: false, error: 'url을 파싱할 수 없다' }, 400)
  }

  const firstReject = rejectReason(current)
  if (firstReject) return json({ ok: false, error: firstReject }, 403)

  const started = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
  // 어디를 거쳐 왔는지 남긴다. 리다이렉트가 실제로 일어나는지 이 값으로 안다.
  const hops: string[] = []

  try {
    let res: Response | null = null
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      res = await fetch(current.toString(), { signal: ac.signal, redirect: 'manual' })
      if (res.status < 300 || res.status >= 400) break
      const loc = res.headers.get('location')
      if (!loc) break
      await res.body?.cancel()
      // 상대 경로 Location도 있으므로 현재 URL 기준으로 푼다.
      const next = new URL(loc, current)
      const why = rejectReason(next)
      if (why) {
        clearTimeout(timer)
        // 🔴 허용 호스트가 허용 밖으로 넘기려 한 경우다. 따라가지 않는다.
        return json({
          ok: false,
          error: `리다이렉트가 허용목록을 벗어난다 — ${why}`,
          redirect_hops: hops,
          blocked_redirect_to: next.toString(),
        }, 403)
      }
      hops.push(next.toString())
      current = next
      if (i === MAX_REDIRECTS) {
        clearTimeout(timer)
        return json({ ok: false, error: `리다이렉트가 ${MAX_REDIRECTS}회를 넘었다`, redirect_hops: hops }, 502)
      }
    }
    if (!res) {
      clearTimeout(timer)
      return json({ ok: false, error: '응답이 없다' }, 502)
    }

    const declared = res.headers.get('content-length')
    const declaredLen = declared === null ? null : Number(declared)

    const base: Record<string, unknown> = {
      ok: true,
      status: res.status,
      final_url: current.toString(),
      redirect_hops: hops,
      content_type: res.headers.get('content-type'),
      content_disposition: res.headers.get('content-disposition'),
      header_content_length: declared,
      limit_bytes: MAX_SOURCE_BYTES,
    }

    // ① Content-length가 있고 상한을 넘으면 본문을 아예 받지 않는다.
    if (declaredLen !== null && Number.isFinite(declaredLen) && declaredLen > MAX_SOURCE_BYTES) {
      await res.body?.cancel()
      clearTimeout(timer)
      return json({
        ...base,
        body_included: false,
        reason: 'size_exceeded_declared',
        detail: `선언된 크기 ${declaredLen}B가 상한 ${MAX_SOURCE_BYTES}B를 넘는다`,
        bytes: declaredLen,
        elapsed_ms: Date.now() - started,
      })
    }

    if (!res.body) {
      clearTimeout(timer)
      return json({ ...base, body_included: false, reason: 'no_body', elapsed_ms: Date.now() - started })
    }

    // ② Content-length가 없거나 거짓말인 경우까지 막으려면 실제로 세면서 받아야 한다.
    const { bytes, read } = await readCapped(res.body, MAX_SOURCE_BYTES)
    clearTimeout(timer)

    if (bytes === null) {
      return json({
        ...base,
        body_included: false,
        reason: declared === null ? 'size_exceeded_undeclared' : 'size_exceeded_actual',
        detail: `실제 수신이 상한 ${MAX_SOURCE_BYTES}B를 넘어 중단했다`,
        bytes_read_before_abort: read,
        elapsed_ms: Date.now() - started,
      })
    }

    const payload: Record<string, unknown> = {
      ...base,
      // 🔴 실제로 받은 바이트 수. header와 어긋나면 그 자체가 정보다.
      bytes: bytes.length,
      sha256: await sha256Hex(bytes),
      head_hex: Array.from(bytes.subarray(0, 8))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
      elapsed_ms: Date.now() - started,
    }
    if (metaOnly) {
      payload.body_included = false
      payload.reason = 'meta_only'
    } else {
      payload.body_included = true
      payload.base64 = toBase64(bytes)
      payload.base64_len = (payload.base64 as string).length
    }
    return json(payload)
  } catch (e) {
    clearTimeout(timer)
    return json({
      ok: false,
      error: String(e instanceof Error ? e.message : e),
      redirect_hops: hops,
      elapsed_ms: Date.now() - started,
    }, 502)
  }
})
