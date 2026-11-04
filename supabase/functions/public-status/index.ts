// 공개 상태 끝점 Edge Function (2026-11-04 신설 · 우편함 「코드·운영 — 점검 시험 실행(simulate) 표지 · 바깥 감시용 키 없는 공개 상태 끝점 …」 2)
//
// 바깥 가용성 감시(Better Stack — 다운님 결정 2026-11-04 · 무료 · 3분)가 「데이터가 오는가」를 키 없이 보게 하는 끝점 하나.
//   공개 목록 REST(/rest/v1/rpc/get_announcements_deduped)는 apikey 머리가 필요해 바깥 서비스 칸에 키를 넣어야 했다 —
//   그 대신 이 함수가 안에서 화면과 같은 길(anon 키 · PostgREST · 인자 없음)로 목록 RPC 를 한 번 부르고 결과만 말한다.
//
// 응답(몸은 이것뿐 — 데이터·내부 오류 글·시각·행 수를 싣지 않는다):
//   200 {"ok":true}   — 목록 RPC 200 ∧ 행 1 이상
//   503 {"ok":false}  — 그 밖(오류 · 0행 · 시간 초과 8초)
//   405              — GET·HEAD 밖
// 🔴 남용 막기: 결과를 60초 담아 둔다(그 안의 요청은 목록 RPC 를 부르지 않는다) — 감시 3분이면 하루 목록 RPC 약 480회 ·
//    아무리 두드려도 실행 인스턴스 하나당 목록 RPC 는 분당 1회를 넘지 않는다. 받는 칸은 announcement_id 하나 · limit 1(전송 최소).
// 🔴 비밀값 0 — anon 키(공개 값 · EF 런타임 자동 주입)만 쓴다. verify_jwt=false(supabase/config.toml) · 게이트 없음(공개가 목적).
// 응답 머리: cache-control no-store · CORS 없음(브라우저용이 아니다).

// 코딩원칙 16번: Deno.env.get('X')! 금지 — 미설정이면 시작에서 던진다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}
const SUPABASE_URL = requireEnv('SUPABASE_URL')
const ANON_KEY = requireEnv('SUPABASE_ANON_KEY')

const CACHE_MS = 60_000
const TIMEOUT_MS = 8_000
let cached: { ok: boolean; at: number } | null = null
let inflight: Promise<boolean> | null = null

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_announcements_deduped?select=announcement_id&limit=1`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status !== 200) { await res.body?.cancel(); return false }
    const j = await res.json().catch(() => null)
    return Array.isArray(j) && j.length > 0
  } catch {
    return false
  }
}

// 담아 둔 결과가 60초 안이면 그대로 · 아니면 한 번만 부른다(동시에 온 요청은 같은 호출을 기다린다).
async function status(): Promise<boolean> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) return cached.ok
  if (!inflight) {
    inflight = probe().then(ok => { cached = { ok, at: Date.now() }; return ok }).finally(() => { inflight = null })
  }
  return inflight
}

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } })
  }
  const ok = await status()
  const body = req.method === 'HEAD' ? null : JSON.stringify({ ok })
  return new Response(body, { status: ok ? 200 : 503, headers: HEADERS })
})
