// 시험 로그인 묶음 — 실사용·조사 회차가 매번 새로 짜던 것(실사용 5·6회차 ⑦ · 2026-10-28 우편함 「코드·운영 — 실사용 시험 로그인 묶음을 저장소로」)
//
// 쓰는 법(세 줄 · 자세한 것은 scripts/login-walk.mjs 머리):
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/login-walk.mjs --persona P2          # 배포본 한 바퀴 + 정리
//   … node scripts/login-walk.mjs --persona P1 --base http://127.0.0.1:8201 --width 1280                                 # 로컬 판(목록 RPC 는 캐시 대역)
//   라이브러리: import { withTestLogin, openLoggedIn, applyPersona, fixClock } from '/home/user/zipfit/scripts/test-login.mjs'
//
// 🔴 ⑦ 1-3 시험 계정 예외(다운님 승인 2026-10-13)를 장치로 지킨다:
//   1. 시험 사용자는 EF test-login 의 상수 주소 하나(실사람 아님 · app_metadata.zf_test). 이 파일은 주소·사용자 id 를 받지도 돌려주지도 않는다.
//   2. 1회용 링크(action_link)는 **이 프로세스 메모리에만** 산다 — 출력·파일·예외 메시지에 싣지 않는다(LinkSecret 감싸개 · toString/JSON 은 「[가림]」).
//      브라우저 주소에도 토큰이 실리므로 page.url() 을 찍지 않는다(이 파일의 어떤 함수도 찍지 않는다).
//   3. 링크는 DB net.http_post 로 받는다(비밀값 = Vault cron_secret_v2 · 컨테이너에 비밀 0). 응답 행(net._http_response)은 **읽는 같은 문장에서 지운다**.
//   4. 끝 정리: withTestLogin 이 finally 에서 cleanup(이용 기록 → 계정 삭제 · 저장 행은 FK CASCADE) 뒤 verifyClean(계정 0 · 링크 응답 행 0)을 돌린다.
//   5. 운영 표지: 배포본 redirect_to 가 ?ops=1 이고, 모든 쪽에 localStorage zf_ops=1 을 미리 심는다 → usage_events 에 props.ops=1(집계에서 빠진다).
// DB 는 관리 API(api.supabase.com · 프록시가 인증을 넣는다)로만 부른다 — 이 파일이 내는 SQL 은 아래 셋뿐이다(링크 받기 · 정리 · 확인).

const PROJECT = 'khdpjjyspmlqtzperoqg'
const QUERY_URL = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`
const EF_URL = `https://${PROJECT}.supabase.co/functions/v1/test-login`
export const DEPLOYED = 'https://kkokzip.com'
const SEP = '\n'

// 링크를 담는 감싸개 — 실수로 console.log·JSON.stringify·문자열 잇기에 실려도 값이 나가지 않는다.
class LinkSecret {
  #v
  constructor(v) { this.#v = v }
  reveal() { return this.#v }
  toString() { return '[가림]' }
  toJSON() { return '[가림]' }
  [Symbol.for('nodejs.util.inspect.custom')]() { return 'LinkSecret([가림])' }
}

async function sql(query) {
  const r = await fetch(QUERY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const text = await r.text()
  // 🔴 실패 본문은 SQL 오류문이다(링크가 들어 있을 수 없는 문장만 보낸다) — 그래도 길이를 자른다.
  if (r.status !== 201 && r.status !== 200) throw new Error(`관리 API ${r.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

// EF 를 DB 에서 부르고(pg_net) 응답이 오면 **읽으면서 지운다**. 돌려주는 것은 상태와 본문 JSON(호출자가 무엇을 꺼낼지 고른다).
async function callTestLogin(mode, { waitMs = 30000 } = {}) {
  if (!['link', 'cleanup'].includes(mode)) throw new Error('mode 는 link · cleanup')
  const [{ id }] = await sql(
    `select net.http_post(url := '${EF_URL}', body := '{"mode":"${mode}"}'::jsonb,` + SEP +
    ` headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',` +
    ` (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_v2')),` +
    ` timeout_milliseconds := 20000) as id`)
  if (!Number.isInteger(id)) throw new Error('net.http_post 요청 번호를 받지 못했다')
  const until = Date.now() + waitMs
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, 1500))
    const rows = await sql(`with d as (delete from net._http_response where id = ${id} returning status_code, content, error_msg) select * from d`)
    if (rows.length) {
      const { status_code, content, error_msg } = rows[0]
      let body = null
      try { body = JSON.parse(content ?? 'null') } catch { body = null }
      return { status: status_code, body, error: error_msg }
    }
  }
  // 응답이 끝내 안 오면 행이 나중에 생길 수 있다 — verifyClean 이 링크 응답 행 0 을 다시 본다.
  throw new Error(`test-login ${mode}: ${waitMs}ms 안에 응답 없음(요청 ${id})`)
}

/** 1회용 링크를 받는다 — LinkSecret 과 「새로 만들었나」만 돌려준다(사용자 id 는 버린다). */
export async function getLink() {
  const r = await callTestLogin('link')
  const link = r.body && typeof r.body.action_link === 'string' ? r.body.action_link : null
  if (r.status !== 200 || !link) {
    const err = r.body && typeof r.body.error === 'string' ? r.body.error : (r.error || '본문 없음')
    throw new Error(`test-login link 실패: HTTP ${r.status} · ${err}`)   // error 칸에는 링크가 없다(EF 코드)
  }
  return { link: new LinkSecret(link), created: r.body.created === true }
}

/** 시험 사용자 정리 — 건수만 돌려준다. */
export async function cleanup() {
  const r = await callTestLogin('cleanup')
  if (r.status !== 200) throw new Error(`test-login cleanup 실패: HTTP ${r.status} · ${r.body?.error ?? r.error ?? ''}`)
  return { found: !!r.body?.found, account_deleted: r.body?.account_deleted ?? 0, usage_events_deleted: r.body?.usage_events_deleted ?? 0 }
}

/** 끝 확인 — 시험 주소 계정 수 · 링크가 든 응답 행 수(둘 다 0 이어야 한다). 개인정보 표는 count 만 본다(원칙 36). */
export async function verifyClean() {
  const [row] = await sql(
    `select (select count(*) from auth.users where lower(email) = 'zf-test-login@example.com')::int as test_accounts,` +
    ` (select count(*) from net._http_response where content like '%action_link%')::int as link_rows`)
  return row
}

/** 링크 받기 → fn(link) → (무슨 일이 있어도) 정리·확인. fn 의 반환값과 정리 결과를 함께 돌려준다. */
export async function withTestLogin(fn) {
  let result, failure = null
  try {
    const { link, created } = await getLink()
    result = await fn(link, { created })
  } catch (e) { failure = e }
  let cleaned = null, clean = null
  try { cleaned = await cleanup() } catch (e) { failure = failure ?? e }
  try { clean = await verifyClean() } catch (e) { failure = failure ?? e }
  const out = { result, cleaned, clean }
  if (failure) { failure.zf = out; throw failure }
  return out
}

/**
 * 링크로 로그인한 쪽을 연다. base 가 배포본이 아니면(로컬 판) Auth /verify 의 303 을 가로채 Location 의 origin 만 base 로 바꾼다
 * (해시의 세션 토큰은 그대로 · redirect_to 는 EF 상수라 바꿀 수 없다). 🔴 page.url() 을 찍지 않는다 — 해시에 토큰이 있다.
 */
export async function openLoggedIn(context, link, { base = DEPLOYED, timeout = 30000, clock = null, stub = null } = {}) {
  await context.addInitScript(() => { try { localStorage.setItem('zf_ops', '1') } catch (e) {} })   // 운영 표지(첫 쪽부터)
  const page = await context.newPage()
  if (clock) await fixClock(page, clock)
  // 로컬 판은 목록 RPC 를 캐시 대역으로(원칙 26 · scripts/render-list-stub.mjs) — 배포본은 측정이라 대역을 쓰지 않는다.
  if (stub) await stub(page)
  const target = new URL(base)
  if (target.origin !== DEPLOYED) {
    const verifyPrefix = new URL(link.reveal()).origin + '/auth/v1/verify'
    await page.route(u => u.href.startsWith(verifyPrefix), async route => {
      const resp = await route.fetch({ maxRedirects: 0 })
      const loc = resp.headers()['location']
      if (!loc) return route.fulfill({ response: resp })
      const l = new URL(loc)
      if (l.origin !== DEPLOYED) return route.fulfill({ response: resp })   // 오류 쪽(만료 등)은 그대로
      const to = target.origin + (target.pathname.replace(/\/$/, '')) + l.pathname + l.search + l.hash
      return route.fulfill({ status: 303, headers: { location: to } })
    })
  }
  await page.goto(link.reveal(), { waitUntil: 'domcontentloaded', timeout })
  // 세션이 들어오면 설정 탭 본체가 열린다(이메일 로그인 사용자는 알림 이메일 게이트를 거치지 않는다).
  await page.waitForFunction(() => {
    const b = document.getElementById('settingsBody')
    return typeof currentUser !== 'undefined' && currentUser && b && !b.classList.contains('hidden')
  }, null, { timeout })
  const state = await page.evaluate(() => ({
    hashLeft: location.hash.includes('access_token'),          // detectSessionInUrl 이 지웠는가
    ops: (() => { try { return localStorage.getItem('zf_ops') } catch (e) { return null } })(),
    opsBadge: !!document.getElementById('zfOpsBadge'),
  }))
  if (state.hashLeft) throw new Error('주소 해시에 세션 토큰이 남았다 — 화면을 찍지 말고 멈춘다')
  return { page, state }
}

// 페르소나 정본(scripts/target-personas.json)의 지역은 이름 괄호(관악·성동 → 서울 · 사하 → 부산 · 화성 → 경기 · 수성 → 대구)뿐이다 — 설정 칩 글자(시도 정식 이름)로 옮긴다.
// 🔴 칩은 글자가 **같은** 것만 누른다(부분 일치는 「광주」처럼 둘을 집을 수 있다 · 2026-10-28 칩: 서울특별시 · 부산광역시 · 경기도 · 대구광역시 …).
const REGION_OF = { P1: '서울특별시', P2: '서울특별시', P3: '경기도', P4: '부산광역시', P5: '대구광역시' }

/** 설정 탭에 페르소나 입력을 넣고 저장한다(「✅ 조건이 저장됐어요.」까지). 설정 폼에 없는 칸(맞벌이 · 출산 · 계층)은 넣지 않는다. */
export async function applyPersona(page, persona) {
  const p = persona.inputs
  const region = REGION_OF[persona.id] ?? null
  const birthYear = p.birthYear ?? (p.age != null ? new Date().getFullYear() - p.age : null)
  await page.evaluate(() => goMain(5))
  await page.waitForSelector('#settingsBody:not(.hidden) #set_marital', { timeout: 15000 })
  if (p.marital) await page.selectOption('#set_marital', p.marital)
  const fill = async (id, v) => { if (v != null) await page.fill(id, String(v)) }
  await fill('#set_children', p.children)
  await fill('#set_members', p.members)
  await fill('#set_income', p.income)
  await fill('#set_birthYear', birthYear)
  let regionOk = null
  if (region) {
    const chip = page.locator('#settingsRegionChips .chip').filter({ hasText: new RegExp(`^\\s*${region}\\s*$`) }).first()
    regionOk = (await chip.count()) > 0
    if (regionOk && (await chip.getAttribute('aria-pressed')) !== 'true') await chip.click()
  }
  await page.click('button[onclick="saveSettings()"]')
  // 결과 문구가 「저장 중...」에서 바뀔 때까지(성공 · 실패 · 만료 · 프로필 못 불러옴 — 어느 것이든 그대로 돌려준다).
  // ⚠️ 로컬 판(127.0.0.1)은 프로필 EF 의 CORS 허용 목록 밖이라 프로필을 못 불러 저장되지 않는다 — 저장 흐름은 배포본에서 본다.
  await page.waitForFunction(() => { const t = (document.getElementById('settingsSaveMsg')?.textContent || '').trim(); return t && !/^저장 중/.test(t) }, null, { timeout: 20000 })
  const msg = await page.textContent('#settingsSaveMsg')
  return { saved: /저장됐어요/.test(msg || ''), msg: (msg || '').trim(), region, regionOk, birthYear }
}

/** 새로고침 — 세션(localStorage)은 남고 「세션 진입」이 다시 돈다(저장한 조건이 진단 칸에 채워지는 길 · G3-B 재현 꼴). 주소에 토큰이 없을 때만 부른다. */
export async function reloadLoggedIn(page, { timeout = 30000 } = {}) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout })
  await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && typeof zfProfileLoaded !== 'undefined' && zfProfileLoaded, null, { timeout })
  await page.waitForTimeout(1000)
}

/** 추천 탭으로 가서 맞춤 추천이 그려질 때까지 — 카드 수와 안내 제목을 돌려준다. */
export async function openRecommend(page) {
  await page.evaluate(() => goMain(1))
  await page.waitForTimeout(1500)
  return page.evaluate(() => ({
    promptTitle: (document.getElementById('personalizedPromptTitle')?.offsetParent ? document.getElementById('personalizedPromptTitle').textContent.trim() : null),
    cards: document.querySelectorAll('#main1 [data-sum-for]').length,
    text: (document.getElementById('main1')?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
    // 🔵 2026-10-28(우편함 「17:25 뒤 A 병합 둘」 덧 2) — 자격 진단 칸·결과 글자(G3-B 재현 판정용 · 페르소나 입력만 — 실사람 값 아님).
    diag: (() => {
      const v = id => document.getElementById(id)?.value ?? null
      const res = document.getElementById('diag-result')
      const t = res && !res.classList.contains('hidden') ? (res.innerText || '').replace(/\s+/g, ' ').trim() : ''
      // 「✅ 신청 가능한 주택 유형 · 국민임대 · 영구임대 … 소득·자산·나이 기준을 충족한 유형이에요」 의 유형 목록
      const m = t.match(/신청 가능한 주택 유형\s*·\s*(.*?)\s+소득·자산/)
      const ok = m ? m[1].split(/\s*·\s*/).filter(Boolean) : null
      return {
        inputs: { marital: v('marital'), members: v('members'), income: v('income'), birthYear: v('birthYear') },
        savedBar: !!document.querySelector('#panel1 .zf3-rsaved:not([hidden])'),
        shown: !!t, okLine: ok, text: t.slice(0, 300),
      }
    })(),
  }))
}

/** 시계 고정 — KST 로 적은 시각(예 '2026-10-28 16:01'). page.goto 전에 부른다. */
export async function fixClock(page, kst) {
  const iso = kst.replace(' ', 'T') + (kst.length <= 16 ? ':00' : '') + '+09:00'
  await page.clock.setFixedTime(new Date(iso))
  return iso
}
