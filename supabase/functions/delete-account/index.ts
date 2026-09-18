import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'

// 코딩원칙 16번: Deno.env.get('X')! 금지. 미설정이면 조용히 undefined로 잘못 동작한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
// 🔴 service role 키는 여기(EF 환경변수)에만 있다. 프론트로 나가는 경로를 만들지 않는다.
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

// CORS는 배포 오리진으로 고정한다('*' 금지 — 이 함수는 계정을 지운다).
const ALLOWED_ORIGIN = 'https://dauntown96.github.io'

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ── 신원 확인 ──────────────────────────────────────────────
  // 🔴 지우는 대상은 오직 토큰의 sub 다. 본문의 사용자 id 는 받지도 쓰지도 않는다 —
  //    받아 두면 남의 계정을 지우는 우회 경로가 그대로 생긴다.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Authorization bearer token required' }, 401)

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user?.id) {
    return json({ error: 'Invalid or expired token' }, 401)
  }
  const uid = userData.user.id

  // ── 확인 값 ────────────────────────────────────────────────
  // 실수 호출로 계정이 사라지지 않게 한다.
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  if (body?.confirm !== 'DELETE') {
    return json({ error: 'confirm must be "DELETE"' }, 400)
  }

  // ── 1) usage_events ────────────────────────────────────────
  // 🔴 이 표에는 auth.users FK 가 없어 계정을 지워도 함께 사라지지 않는다.
  //    그래서 계정보다 먼저 지운다 — 순서를 뒤집으면 uid 를 잃고 고아 행이 남는다.
  const { data: removed, error: ueErr } = await supabase
    .from('usage_events')
    .delete()
    .eq('user_id', uid)
    .select('id')

  if (ueErr) {
    // 🔴 부분 실패를 성공으로 덮지 않는다. 계정은 아직 살아 있다.
    console.error('delete-account: usage_events 삭제 실패')
    return json({ error: 'usage_events 삭제 실패', stage: 'usage_events', detail: ueErr.message }, 500)
  }
  const usageEventsDeleted = Array.isArray(removed) ? removed.length : 0

  // ── 2) 계정 ────────────────────────────────────────────────
  // user_profiles · saved_announcements 는 auth.users FK 가 CASCADE 라 함께 사라진다.
  const { error: delErr } = await supabase.auth.admin.deleteUser(uid)
  if (delErr) {
    console.error('delete-account: 계정 삭제 실패(이용 기록은 이미 삭제됨)')
    return json({
      error: '계정 삭제 실패',
      stage: 'auth_user',
      detail: delErr.message,
      usage_events_deleted: usageEventsDeleted,
      account_deleted: 0,
    }, 500)
  }

  // 🔴 지운 사용자 id 를 로그에 남기지 않는다.
  console.log(`delete-account: 계정 1건 삭제(이용 기록 ${usageEventsDeleted}건)`)

  return json({
    success: true,
    usage_events_deleted: usageEventsDeleted,
    account_deleted: 1,
  })
})
