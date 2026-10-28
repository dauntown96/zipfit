// 시험 로그인 한 바퀴 — 로그인 → 설정 저장(페르소나) → 추천 탭 → 정리 (2026-10-28 우편함 「코드·운영 — 실사용 시험 로그인 묶음을 저장소로」)
//
// 쓰는 법:
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/login-walk.mjs --persona P2
//     --persona  scripts/target-personas.json 의 id(기본 P2) · 여러 개면 쉼표(P1,P2,P4 — 한 세션에서 차례로 저장 → 추천)
//     --base     기본 https://kkokzip.com(배포본 · 측정이라 목록 대역 없음) · 로컬 판이면 http://127.0.0.1:8201 처럼(목록 RPC = render-list-stub 캐시)
//                ⚠️ 로컬 판은 로그인까지만 된다 — 프로필 EF(save-user-profile)의 CORS 허용 목록이 배포 도메인 셋뿐이라 저장은 「불러오지 못함」으로 끝난다(2026-10-28 실측).
//     --width    390(기본) · 1280
//     --clock    KST 시각 고정(예 '2026-10-28 16:01')
//     --reload   첫 페르소나 저장 뒤 한 번 새로고침(저장한 조건을 든 채 세션에 다시 들어온 꼴 — G3-B 「설정 바꿔 저장 → 진단 옛 값」 재현)
//     --shot     캡처 폴더(쪽마다 png — 세션 scratchpad 를 준다 · 🔴 저장소 안에 두지 않는다)
//   끝에 JSON 한 줄(링크·토큰·사용자 id 0)과 정리 결과(계정 0 · 링크 응답 행 0)를 찍고, 정리가 깨끗하지 않으면 종료 코드 1.
// 🔴 규칙은 scripts/test-login.mjs 머리(⑦ 1-3 시험 계정 예외). 로컬 판은 미리 띄워 둔다(예: python3 -m http.server 8201 — 저장소 뿌리에서).
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { withTestLogin, openLoggedIn, applyPersona, openRecommend, reloadLoggedIn, DEPLOYED } from './test-login.mjs'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const base = arg('base', DEPLOYED)
const width = parseInt(arg('width', '390'))
const clock = arg('clock')
const shot = arg('shot')
const reload = process.argv.includes('--reload')
const ids = arg('persona', 'P2').split(',').map(s => s.trim()).filter(Boolean)
const all = JSON.parse(readFileSync(new URL('./target-personas.json', import.meta.url), 'utf8')).personas
const personas = ids.map(id => all.find(p => p.id === id) ?? (() => { throw new Error(`페르소나 없음: ${id}`) })())
if (shot) mkdirSync(shot, { recursive: true })

const local = new URL(base).origin !== DEPLOYED
const stub = local ? (await import('./render-list-stub.mjs')).stubListRpc : null

// playwright 는 저장소에 없다 — 컨테이너 전역 것을 쓴다(scripts/target-persona-check.mjs 와 같은 꼴).
const req = createRequire(import.meta.url)
const { chromium } = (() => {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { return req(p) } catch {} }
  throw new Error('playwright 를 찾지 못했다(컨테이너: /opt/node22/lib/node_modules/playwright)')
})()
const browser = await chromium.launch()
let out
try {
  out = await withTestLogin(async (link, { created }) => {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
    const rpc = { list: 0, profile: 0, usage: 0 }
    context.on('request', r => {
      const u = r.url()
      if (u.includes('/rest/v1/rpc/get_announcements_deduped')) rpc.list++
      else if (u.includes('/functions/v1/save-user-profile')) rpc.profile++
      else if (u.includes('/rest/v1/usage_events')) rpc.usage++
    })
    const { page, state } = await openLoggedIn(context, link, { base, clock, stub: stub ? (pg) => stub(pg) : null })
    const steps = []
    for (const p of personas) {
      const saved = await applyPersona(page, p)
      if (shot) await page.screenshot({ path: join(shot, `${p.id}-settings-${width}.png`), fullPage: false })
      const rec = await openRecommend(page)
      if (shot) await page.screenshot({ path: join(shot, `${p.id}-recommend-${width}.png`), fullPage: true })
      steps.push({ persona: p.id, saved: saved.saved, msg: saved.msg, region: saved.region, regionChip: saved.regionOk, cards: rec.cards, prompt: rec.promptTitle, diag: rec.diag })
      if (reload && p === personas[0] && personas.length > 1) { await reloadLoggedIn(page); steps.push({ reloaded: true, diag: (await openRecommend(page)).diag }) }
    }
    // 이용 기록이 운영 표지를 달고 나갔는지 — 화면 함수로 직접 본다(보낸 본문은 찍지 않는다)
    const ops = await page.evaluate(() => (typeof zfOpsOn === 'function' ? zfOpsOn() : null))
    await context.close()
    return { base: local ? 'local' : 'deployed', width, clock, createdUser: created, opsFlag: state.ops, opsBadge: state.opsBadge, opsOn: ops, rpc, steps }
  })
} catch (e) {
  // 🔴 오류문에는 링크가 없다(test-login.mjs 가 싣지 않는다) — 정리 결과(e.zf)는 함께 찍는다.
  console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e), ...(e?.zf ?? {}) }))
  await browser.close()
  process.exit(1)
} finally {
  await browser.close().catch(() => {})
}
const ok = out.clean && out.clean.test_accounts === 0 && out.clean.link_rows === 0 && out.result.steps.every(s => s.reloaded || s.saved)
console.log(JSON.stringify({ ok, ...out }))
process.exit(ok ? 0 : 1)
