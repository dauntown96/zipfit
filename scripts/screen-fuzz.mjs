// 화면 퍼즈 점검 — 목록 응답을 오염시켜도 스크립트가 한 번도 돌지 않는가(2026-11-19 · 우편함 「코드·운영 — 18장」 2 · 순위표 18위).
//
// 왜: 2026-10-18 G8 감사가 XSS 두 자리(DB 문자열 → innerHTML · URL → href)를 찾았고 PR #620 이 고쳤다. 그때의 퍼즈는 그 회차 손 스크립트라
//   저장소에 없었다 — 새 화면 자리가 바깥 문자열을 다시 innerHTML 에 넣어도 잡을 장치가 없었다. 이것이 그 장치다.
// 🔴 대역만 쓴다 — 목록 RPC = scripts/render-list-stub.mjs 캐시(운영 anon 응답 그대로)를 돌려주기 직전에 오염 · 곁 표(REST GET)는 운영 anon 응답을 받아 오염.
//   배포본·DB 쓰기 0(이용 기록·의견 송신은 stub 가 받아 끝낸다). 🔴 새 구멍을 찾으면 고치지 않는다 — 고침은 표시층 몫(회신으로).
//
// 오염(문자열 칸마다 · 날짜·숫자·id 꼴은 그대로 둔다 — 화면이 아예 안 그려지면 덮는 자리가 줄어든다):
//   글자 칸 → 원값 + `"'><img src=x data-zfx onerror="window.__zfx('s')">`
//   URL 칸(http(s):// 로 시작하거나 키에 url·link·href) → `javascript:window.__zfx('u')`
// 재는 것: ① 실행(__zfx 불린 수) ② 만들어진 요소([data-zfx]) ③ javascript: 링크(a[href^=javascript:]) — 셋 다 0 이어야 통과.
// 덮는 화면: 처음 화면 → 추천(1) · 공고 탭 목록(2) 첫 쪽 카드 N장 펼침 · 다음 쪽들 · 지도 보기 · 설정(3).
//
// 쓰는 법:
//   node scripts/screen-fuzz.mjs                       # 이 저장소 작업 트리를 127.0.0.1:8203 에 띄우고 잰다
//   node scripts/screen-fuzz.mjs --dir <폴더> --open 12 --pages 3
//   node scripts/screen-fuzz.mjs --dir <PR #620 이전 index.html 폴더>   # 양성 시험 — 0 이 아니어야 장치가 산 것이다
//   node scripts/screen-fuzz.mjs --simulate           # 알림 경로 시험 — 구멍 하나를 일부러 만든다(실행 1 · 요소 1 · 링크 1)
// 끝 줄: FUZZ_JSON={...} · 통과면 종료 코드 0, 하나라도 0 이 아니면 1.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { stubListRpc } from './render-list-stub.mjs'

// playwright 찾기 — login-walk.mjs 와 같은 꼴(러너 · 컨테이너 전역 설치 · NODE_PATH)
const { chromium } = (() => {
  const req = createRequire(import.meta.url)
  const extra = (process.env.NODE_PATH || '').split(':').filter(Boolean).map(d => d.replace(/\/$/, '') + '/playwright')
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', ...extra]) { try { return req(p) } catch {} }
  throw new Error('playwright 를 찾지 못했다(컨테이너: /opt/node22/lib/node_modules/playwright)')
})()

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = resolve(arg('--dir', ROOT))
const PORT = Number(arg('--port', 8203))
const OPEN = Number(arg('--open', 12))
const PAGES = Number(arg('--pages', 3))

const TAIL = `"'><img src=x data-zfx onerror="window.__zfx('s')">`
const JS = `javascript:window.__zfx('u')`
const KEEP = /^(\d{4}-\d{2}-\d{2}([ T][\d:.+Z-]*)?|[\d.,:+\- ]*|true|false)$/   // 날짜·시각·숫자 꼴
const ID_KEY = /(^|_)(id|ids|key|code|cd|sn|seq)$/i
const URL_KEY = /url|link|href/i
const stats = { strings: 0, urls: 0, list: 0, side: 0 }

function poison(v, key = '') {
  if (Array.isArray(v)) return v.map(x => poison(x, key))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, poison(x, k)]))
  if (typeof v !== 'string' || v === '' || ID_KEY.test(key) || KEEP.test(v)) return v
  if (/^https?:\/\//i.test(v) || URL_KEY.test(key)) { stats.urls++; return JS }
  stats.strings++
  return v + TAIL
}
const poisonBuf = buf => { try { return Buffer.from(JSON.stringify(poison(JSON.parse(buf.toString('utf8'))))) } catch { return buf } }

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', DIR], { stdio: 'ignore' })
const site = `http://127.0.0.1:${PORT}/index.html`
const out = { site: DIR === ROOT ? 'work-tree' : DIR, exec: 0, execKinds: {}, elems: 0, jsLinks: 0, opened: 0, pagesSeen: 1, views: [], errors: [] }
let browser
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(site)).ok) break } catch {} await new Promise(r => setTimeout(r, 300)) }
  browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.addInitScript(() => { window.__zfxHits = []; window.__zfx = k => window.__zfxHits.push(k) })
  page.on('dialog', d => d.dismiss().catch(() => {}))
  page.on('pageerror', e => out.errors.length < 5 && out.errors.push(String(e).slice(0, 160)))
  // 곁 표(REST GET — 세대·자격·정책·첨부·사진 등): 운영 anon 응답을 받아 오염. 목록 RPC 는 아래 stub 가(나중에 건 route 가 먼저 받는다).
  await page.route(/\/rest\/v1\/(?!rpc\/)[a-z_]+\?/, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    const res = await route.fetch({ timeout: 30000 }).catch(() => null)
    if (!res) return route.abort()
    const body = await res.body(); stats.side++
    await route.fulfill({ status: res.status(), headers: res.headers(), body: res.status() === 200 ? poisonBuf(body) : body })
  })
  const info = await stubListRpc(page, { mutate: buf => { stats.list++; return poisonBuf(buf) } })
  await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(4000)
  const step = async (name, fn) => { try { await fn(); out.views.push(name) } catch (e) { out.errors.push(`${name}: ${String(e).slice(0, 120)}`) } await page.waitForTimeout(800) }
  await step('추천', () => page.evaluate(() => goMain(1)))
  await step('공고 목록', async () => {
    await page.evaluate(() => { goMain(2); if (typeof zf3SetView === 'function') zf3SetView('list') })
    await page.waitForSelector('#notice-list .hcard', { timeout: 30000 })
  })
  const openCards = async n => {
    const ids = await page.evaluate(() => [...document.querySelectorAll('#notice-list .hcard')].filter(c => c.offsetParent !== null).map(c => c.dataset.announcementId).filter(Boolean))
    for (const aid of ids.slice(0, n)) {
      await page.evaluate(aid => { const c = document.querySelector(`#notice-list .hcard[data-announcement-id="${CSS.escape(aid)}"]`); c && c.click() }, aid)
      await page.waitForTimeout(700); out.opened++
      // 펼친 카드 안의 단추(사진 보기 등)도 한 번씩 — 창을 열고 닫는다
      await page.evaluate(aid => { const c = document.querySelector(`#notice-list .hcard[data-announcement-id="${CSS.escape(aid)}"]`); c && c.querySelector('[data-photo-key], .zf-photo-chip')?.click() }, aid).catch(() => {})
      await page.waitForTimeout(300); await page.keyboard.press('Escape').catch(() => {})
    }
  }
  await step('카드 펼침', () => openCards(OPEN))
  for (let pg = 2; pg <= PAGES; pg++) {
    await step(`${pg}쪽`, async () => {
      const ok = await page.evaluate(pg => { const b = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.innerText.trim() === String(pg)); if (!b) return false; b.click(); return true }, pg)
      if (!ok) throw new Error('쪽 단추 없음')
      await page.waitForTimeout(1500); out.pagesSeen = pg
      await openCards(Math.ceil(OPEN / 3))
    })
  }
  await step('지도 보기', () => page.evaluate(() => { if (typeof zf3SetView === 'function') zf3SetView('map') }))
  await step('설정', () => page.evaluate(() => goMain(3)))
  // --simulate: 알림 경로 시험 — 일부러 구멍 하나(오염된 글자를 innerHTML 로 · URL 을 href 로)를 만들어 장치가 잡는지 본다(health-screen simulate=fuzz)
  if (process.argv.includes('--simulate')) {
    await page.evaluate(([t, u]) => { const d = document.createElement('div'); d.innerHTML = '(시험)' + t + `<a href="${u}">x</a>`; document.body.appendChild(d) }, [TAIL, JS])
    out.simulate = true
  }
  await page.waitForTimeout(1500)
  const r = await page.evaluate(() => ({ hits: window.__zfxHits || [], elems: document.querySelectorAll('[data-zfx]').length, js: [...document.querySelectorAll('a[href]')].filter(a => /^\s*javascript:/i.test(a.getAttribute('href'))).length }))
  out.exec = r.hits.length
  for (const k of r.hits) out.execKinds[k] = (out.execKinds[k] || 0) + 1
  out.elems = r.elems; out.jsLinks = r.js
  out.poisoned = { ...stats, listUpstream: info.upstream, listCacheHits: info.hits }
} catch (e) {
  out.errors.push('실행: ' + String(e).slice(0, 200)); out.blind = true
} finally {
  await browser?.close().catch(() => {}); srv.kill()
}
out.ok = !out.blind && out.exec === 0 && out.elems === 0 && out.jsLinks === 0 && out.poisoned?.list > 0
console.log(`퍼즈 — 실행 ${out.exec} · 요소 ${out.elems} · javascript 링크 ${out.jsLinks} · 펼친 카드 ${out.opened} · 쪽 ${out.pagesSeen} · 오염 글자 ${stats.strings} · URL ${stats.urls} · 목록 응답 ${stats.list} · 곁 표 ${stats.side}`)
console.log('FUZZ_JSON=' + JSON.stringify(out))
process.exit(out.ok ? 0 : 1)
