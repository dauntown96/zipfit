import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'

// 의견 보내기(처리방침 1 「의견」) — 화면이 표에 직접 쓰지 않고 이 함수 하나로만 받는다(2026-10-26 · 우편함 「코드·운영 — 런칭 날 병합 리허설 + 의견 표 남용 막기」 2).
// 왜: anon INSERT 가 열려 있으면 누구나 속도 제한 없이 넣을 수 있었다(1000자 · CHECK 만). 그래서 표 권한은 service_role 만 두고 여기서 거른다.
// 🔴 고지 밖 항목을 저장하지도 읽지도 않는다 — 회원·세션 식별자 칸 없음 · IP 를 읽지 않는다(처리방침 1 접속 기록 「IP 주소는 읽지 않습니다」).
//    그래서 회수 제한은 「같은 출처」가 아니라 이미 저장되는 값(받은 시각 · 본문)으로 건다 — 전체 10분 · 하루 상한 + 같은 글 하루 한 번.
// 🔴 가림은 여기서도 한 번 더(화면 zfFbMask 와 같은 세 꼴) — 화면을 거치지 않은 요청도 가린 뒤 저장한다. DB CHECK(user_feedback_body_masked)가 마지막 벽이다.

// 코딩원칙 16번: Deno.env.get('X')! 금지. 미설정이면 조용히 undefined로 잘못 동작한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

// CORS — save-user-profile 과 같은 허용 목록(요청 Origin 과 문자열로 완전히 같을 때만 돌려준다 · '*' 금지).
const ALLOWED_ORIGINS = new Set([
  'https://dauntown96.github.io',
  'https://kkokzip.com',
  'https://www.kkokzip.com',
])

const CORS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

// 회수 제한 — 전체 기준(출처를 가르지 않는다 · 위 머리 주석). 숫자를 바꾸면 이유를 커밋에 적는다.
const LIMIT_10MIN = 20     // 10분에 받는 의견 수 상한
const LIMIT_DAY = 200      // 24시간에 받는 의견 수 상한
const MAX_REQUEST_BYTES = 8192

// 화면(index.html ZF_FB_MASK · ZF_FB_SCREENS)과 같은 규칙 — 한쪽을 바꾸면 다른 쪽도 같은 PR 에서.
const MASK = [/[^\s@]+@[^\s@]+\.[^\s@]+/g, /\d{2,4}-\d{3,4}-\d{4}/g, /\d{6,}/g]
const mask = (t: string) => MASK.reduce((s, re) => s.replace(re, '(가림)'), t)
const SCREENS = new Set(['추천', '공고', '인사이트', '관리', '설정'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

const handle = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const raw = await req.text()
  if (raw.length > MAX_REQUEST_BYTES) return json({ error: 'too_large' }, 413)
  let p: Record<string, unknown>
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object' || Array.isArray(o)) return json({ error: 'invalid' }, 400)
    p = o as Record<string, unknown>
  } catch {
    return json({ error: 'invalid' }, 400)
  }

  // 받는 칸은 고지의 넷뿐 — 그 밖의 키는 읽지 않는다.
  const body = mask(String(p.body ?? '').trim()).slice(0, 1000)
  if (!body) return json({ error: 'empty' }, 400)
  const screen = typeof p.screen === 'string' && SCREENS.has(p.screen) ? p.screen : null
  const ann = typeof p.announcement_id === 'string' && p.announcement_id.trim()
    ? p.announcement_id.trim().slice(0, 64) : null
  let reply: string | null = null
  if (p.reply_email != null && String(p.reply_email).trim() !== '') {
    reply = String(p.reply_email).trim()
    if (reply.length > 254 || !EMAIL_RE.test(reply)) return json({ error: 'email' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const since = (ms: number) => new Date(Date.now() - ms).toISOString()

  const [m10, d1, dup] = await Promise.all([
    supabase.from('user_feedback').select('id', { count: 'exact', head: true }).gte('received_at', since(10 * 60 * 1000)),
    supabase.from('user_feedback').select('id', { count: 'exact', head: true }).gte('received_at', since(24 * 3600 * 1000)),
    supabase.from('user_feedback').select('id', { count: 'exact', head: true }).gte('received_at', since(24 * 3600 * 1000)).eq('body', body),
  ])
  if (m10.error || d1.error || dup.error) return json({ error: 'server' }, 500)
  if ((m10.count ?? 0) >= LIMIT_10MIN || (d1.count ?? 0) >= LIMIT_DAY) return json({ error: 'busy' }, 429)
  if ((dup.count ?? 0) > 0) return json({ error: 'duplicate' }, 409)

  const { error } = await supabase.from('user_feedback').insert({ body, screen, announcement_id: ann, reply_email: reply })
  if (error) return json({ error: error.code === '23514' ? 'invalid' : 'server' }, error.code === '23514' ? 400 : 500)
  return json({ ok: true }, 201)
}

Deno.serve(async (req: Request) => {
  let res: Response
  try {
    res = await handle(req)
  } catch {
    res = json({ error: 'server' }, 500)
  }
  const origin = req.headers.get('Origin') ?? ''
  if (ALLOWED_ORIGINS.has(origin)) res.headers.set('Access-Control-Allow-Origin', origin)
  return res
})
