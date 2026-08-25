import { createClient } from 'jsr:@supabase/supabase-js@2'

// 코딩원칙 16번: Deno.env.get('X')! 금지. 미설정이면 조용히 undefined로 잘못 동작한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

// CORS는 배포 오리진으로 고정한다('*' 금지 — 이 함수는 개인정보를 다룬다).
const ALLOWED_ORIGIN = 'https://dauntown96.github.io'

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

// 프론트가 실제로 소비하는 컬럼만 반환한다(select('*') 금지).
const PROFILE_COLUMNS = [
  'email',
  'alert_email',
  'regions',
  'types',
  'marital',
  'children',
  'members',
  'income',
  'assets',
  'max_deposit',
  'min_rooms',
  'alert_on',
  'new_notice_alert',
  'marketing_alert',
  'theme',
  'font_size',
].join(', ')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

const toArray = (v: unknown): string[] | null => {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean)
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
  return null
}

const toIntOrNull = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

const toBool = (v: unknown): boolean => v === true || v === 'Y' || v === 'true'

const toTextOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

const toLowerTextOrNull = (v: unknown): string | null => {
  const s = toTextOrNull(v)
  return s ? s.toLowerCase() : null
}

// v12: 부분 갱신. body에 "키가 존재하는" 항목만 UPDATE 대상에 넣는다.
// 판단 기준은 반드시 `key in body` — undefined/null 여부로 판단하면
// null("명시적으로 비우기")을 표현할 수 없다.
// alert_email도 더 이상 예외가 아니다. 모든 컬럼이 같은 규칙을 따른다.
const FIELD_MAP: Record<string, { col: string; conv: (v: unknown) => unknown }> = {
  regions: { col: 'regions', conv: toArray },
  types: { col: 'types', conv: toArray },
  marital: { col: 'marital', conv: toTextOrNull },
  children: { col: 'children', conv: toIntOrNull },
  members: { col: 'members', conv: toIntOrNull },
  income: { col: 'income', conv: toTextOrNull },
  assets: { col: 'assets', conv: toTextOrNull },
  maxDeposit: { col: 'max_deposit', conv: toIntOrNull },
  minRooms: { col: 'min_rooms', conv: toIntOrNull },
  alertOn: { col: 'alert_on', conv: toBool },
  newNoticeAlert: { col: 'new_notice_alert', conv: toBool },
  marketingAlert: { col: 'marketing_alert', conv: toBool },
  theme: { col: 'theme', conv: toTextOrNull },
  fontSize: { col: 'font_size', conv: toTextOrNull },
  alertEmail: { col: 'alert_email', conv: toLowerTextOrNull },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ── 신원 확인 ──────────────────────────────────────────────
  // 식별자는 오직 JWT의 sub(auth.uid())다.
  // body/쿼리의 email은 신원으로 쓰지 않는다 — 남겨두면 이메일만 알면
  // 남의 프로필을 읽고 덮어쓰는 우회 경로가 그대로 살아난다.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Authorization bearer token required' }, 401)

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user?.id) {
    return json({ error: 'Invalid or expired token' }, 401)
  }
  const user = userData.user

  // ── GET: 본인 프로필 조회 ─────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return json({ error: error.message }, 500)
    // 행이 없으면 data=null. 신규 사용자로 취급하면 된다.
    return json({ success: true, data })
  }

  // ── POST: 본인 프로필 부분 갱신(행이 없으면 생성) ──────────
  if (req.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const patch: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(FIELD_MAP)) {
      if (key in body) patch[spec.col] = spec.conv(body[key])
    }

    // 로그인 신원의 이메일(있을 때만). 카카오처럼 이메일을 주지 않는 provider는 null로 남는다.
    // body.email은 의도적으로 무시한다.
    if (user.email) patch.email = user.email.trim().toLowerCase()

    const { data: existing, error: findErr } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (findErr) return json({ error: findErr.message }, 500)

    // 보낼 값이 하나도 없으면 아무것도 건드리지 않는다(빈 UPDATE 방지).
    if (Object.keys(patch).length === 0 && existing) {
      return json({ success: true, data: [{ id: existing.id, user_id: user.id }], updated: [] })
    }

    patch.updated_at = new Date().toISOString()

    const query = existing
      ? supabase.from('user_profiles').update(patch).eq('user_id', user.id)
      : supabase.from('user_profiles').insert({ ...patch, user_id: user.id })
    // 신규 INSERT에서 빠진 컬럼은 테이블 기본값(alert_on=true 등)이 채운다.

    const { data, error } = await query.select('id, user_id')
    if (error) return json({ error: error.message }, 500)
    return json({ success: true, data, updated: Object.keys(patch).filter((k) => k !== 'updated_at') })
  }

  return json({ error: 'Method not allowed' }, 405)
})
