// 시험 로그인 Edge Function (2026-10-13 신설 · 우편함 「코드 — 시험 로그인 함수」 · 길 A · 다운님 승인)
//
// 실사람이 아닌 시험 사용자 하나로 배포본의 로그인 화면(찜·관리·설정)을 쓰기 위한 함수다. 일은 둘이다.
//   ① mode=link    — 시험 사용자가 없으면 만들고, 그 사용자의 1회용 로그인 링크(action_link)를 돌려준다.
//                    메일은 보내지 않는다(관리자 링크 발급은 링크만 돌려준다). 브라우저가 그 링크를 열면
//                    Auth 서버 /verify 가 세션을 발급하고 화면 redirect_to 로 303 한다(암묵 흐름).
//   ② mode=cleanup — 그 사용자의 usage_events 를 지우고 계정을 지운다(delete-account 와 같은 순서 —
//                    usage_events 에는 auth.users FK 가 없어 먼저 지운다 · 나머지는 FK CASCADE).
//
// 🔴 범위를 가두는 겹 — 하나라도 빠지면 「아무 회원의 로그인 링크를 만드는 도구」가 된다.
//   1. 주소는 코드 상수 TEST_EMAIL 하나다. 본문·주소창의 email 은 받지 않는다 — 실리면 400 으로 거부한다.
//   2. 링크 발급·삭제 전에 그 사용자의 app_metadata.zf_test === true 를 확인한다. 아니면 409 — 링크를 만들지 않는다.
//   3. 게이트는 기존 수집 EF 와 같다 — verify_jwt=false + x-cron-secret(Vault cron_secret_v2 · 새 비밀 0).
//   4. redirect_to 는 상수 REDIRECT_TO(배포본 ?ops=1 — 운영 표지)다. Auth 가 허용 목록 밖이라 site_url 로
//      떨어뜨렸으면 링크를 돌려주지 않고 409 로 멈춘다(설정을 바꿔 풀지 않는다 — 요청서 멈춤 조건).
// 🔴 응답·로그에 실리는 비밀은 action_link(1회용 · 1시간 만료 · 토큰 해시 포함) 하나뿐이다.
//    email_otp·hashed_token·세션 토큰은 돌려주지 않는다. 로그에는 건수만 쓴다(링크·사용자 id 없음).
// 🔴 예시용 예약 도메인(example.com)이라 실존할 수 없다 — 카카오 자동 계정 연결(같은 확인된 이메일)도 일어나지 않는다.
// ⚠️ 쓰는 규칙(CLAUDE.md 원칙 14 · ⑦ 1-3 예외): 링크는 받은 자리에서 Playwright 가 곧바로 연다 · Notion·저장소·회신에 쓰지 않는다 ·
//    회차 끝에 cleanup 으로 지운다.
import { createClient, type User } from 'jsr:@supabase/supabase-js@2.116.0'

// 코딩원칙 16번: Deno.env.get('X')! 금지. 미설정이면 조용히 undefined로 잘못 동작한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
// 🔴 service role 키는 여기(EF 런타임 자동 주입)에만 있다. 응답·로그로 나가는 경로를 만들지 않는다.
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const CRON_SECRET = requireEnv('CRON_SECRET_V2')

const TEST_EMAIL = 'zf-test-login@example.com'
const REDIRECT_TO = 'https://kkokzip.com/?ops=1'
// 사용자 목록을 넘겨 보는 상한 — 시험 사용자 하나를 찾는 데 이만큼 넘길 일은 없다(넘으면 찾지 못한 것으로 멈춘다).
const LIST_PER_PAGE = 1000
const LIST_MAX_PAGES = 20

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Admin = ReturnType<typeof createClient>['auth']['admin']

// 상수 주소의 사용자를 찾는다(없으면 null). 대소문자는 Auth 가 소문자로 저장한다.
const findTestUser = async (admin: Admin): Promise<User | null> => {
  for (let page = 1; page <= LIST_MAX_PAGES; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: LIST_PER_PAGE })
    if (error) throw new Error(`사용자 목록 조회 실패: ${error.message}`)
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === TEST_EMAIL)
    if (hit) return hit
    if (data.users.length < LIST_PER_PAGE) return null
  }
  throw new Error('사용자 목록 상한을 넘었다 — 시험 사용자를 찾지 못했다')
}

const isTestUser = (u: User): boolean =>
  (u.email ?? '').toLowerCase() === TEST_EMAIL && u.app_metadata?.zf_test === true

const link = async (admin: Admin): Promise<Response> => {
  let user = await findTestUser(admin)
  let created = false
  if (!user) {
    const { data, error } = await admin.createUser({
      email: TEST_EMAIL,
      email_confirm: true,
      app_metadata: { zf_test: true },
    })
    if (error || !data?.user) return json({ error: '시험 사용자 생성 실패', detail: error?.message ?? null }, 500)
    user = data.user
    created = true
  }
  // 🔴 링크 발급 전에 확인한다 — 표지가 없는 사용자에게는 링크를 만들지 않는다.
  if (!isTestUser(user)) return json({ error: '시험 표지(app_metadata.zf_test)가 없는 사용자 — 링크를 만들지 않는다' }, 409)

  const { data, error } = await admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
    options: { redirectTo: REDIRECT_TO },
  })
  const actionLink = data?.properties?.action_link
  if (error || !actionLink) return json({ error: '링크 발급 실패', detail: error?.message ?? null }, 500)

  // Auth 가 redirect_to 를 허용 목록 밖으로 보고 site_url 로 바꿨으면 멈춘다(링크는 돌려주지 않는다 · 1시간 뒤 스스로 만료).
  let redirect: string | null = null
  let linkHost = ''
  try {
    const u = new URL(actionLink)
    redirect = u.searchParams.get('redirect_to')
    linkHost = u.origin
  } catch { /* 아래에서 거른다 */ }
  if (linkHost !== new URL(SUPABASE_URL).origin) return json({ error: '링크 주소가 이 프로젝트 Auth 가 아니다', link_origin: linkHost }, 409)
  if (redirect !== REDIRECT_TO) return json({ error: 'redirect_to 가 요청값과 다르다(허용 목록 밖으로 떨어졌을 수 있다)', redirect_to: redirect }, 409)

  console.log(`test-login: link 발급 1(사용자 ${created ? '새로 만듦' : '있던 것'})`)
  return json({ mode: 'link', created, user_id: user.id, redirect_to: redirect, action_link: actionLink })
}

const cleanup = async (admin: Admin, supabase: ReturnType<typeof createClient>): Promise<Response> => {
  const user = await findTestUser(admin)
  if (!user) return json({ mode: 'cleanup', found: false, usage_events_deleted: 0, account_deleted: 0 })
  if (!isTestUser(user)) return json({ error: '시험 표지(app_metadata.zf_test)가 없는 사용자 — 지우지 않는다' }, 409)

  // usage_events 에는 auth.users FK 가 없다 — 계정보다 먼저 지운다(delete-account 와 같은 순서).
  const { data: removed, error: ueErr } = await supabase.from('usage_events').delete().eq('user_id', user.id).select('id')
  if (ueErr) return json({ error: 'usage_events 삭제 실패', stage: 'usage_events', detail: ueErr.message }, 500)
  const usageEventsDeleted = Array.isArray(removed) ? removed.length : 0

  // user_profiles · saved_announcements · auth.sessions · identities · one_time_tokens 는 FK CASCADE 로 함께 사라진다.
  const { error: delErr } = await admin.deleteUser(user.id)
  if (delErr) {
    return json({ error: '계정 삭제 실패', stage: 'auth_user', detail: delErr.message, usage_events_deleted: usageEventsDeleted, account_deleted: 0 }, 500)
  }
  console.log(`test-login: cleanup 계정 1 삭제(이용 기록 ${usageEventsDeleted}건)`)
  return json({ mode: 'cleanup', found: true, user_id: user.id, usage_events_deleted: usageEventsDeleted, account_deleted: 1 })
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Unauthorized' }, 401)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  // 🔴 주소는 인자로 받지 않는다 — 실려 오면 값이 무엇이든 거부한다(상수와 같아도).
  if ('email' in body || url.searchParams.has('email')) {
    return json({ error: 'email 은 받지 않는다 — 시험 주소는 함수 상수 하나다' }, 400)
  }
  const mode = String(body.mode ?? url.searchParams.get('mode') ?? '')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  try {
    if (mode === 'link') return await link(supabase.auth.admin)
    if (mode === 'cleanup') return await cleanup(supabase.auth.admin, supabase)
    return json({ error: 'mode 는 link 또는 cleanup' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
