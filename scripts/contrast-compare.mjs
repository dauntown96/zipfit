// 글자 대비 전수 비교 — main ↔ PR 가지(2026-11-11 · 우편함 「코드·운영 — 0장 여섯 …」 3 · #974 회신 ⑦ 2).
// 🔴 읽기만 한다. 두 git ref 를 각각 임시 worktree 로 떠서 로컬 서버로 열고, 보이는 글자 요소마다 실제 대비(글자색 ↔ 겹친 배경색 합성)를 계산해
//    「가지에서 새로 생긴 미달(4.5:1 · 큰 글자 3:1)」만 센다. axe 가 「미완」으로 남기는 꼴(pseudo · 겹침)도 계산된 색으로 직접 잰다.
//    배경은 요소 · 그 요소의 ::before/::after(절대 위치 · 배경 있음) · 조상 순으로 겹쳐 셈한다(배경 그림·그림자는 보지 않는다).
//    상태: 390 공고 탭 · 390 펼친 카드(첫 보이는 카드) · 1280 공고 탭 — 각각 밝음 · 어두움(setTheme('dark', true) — a11y.mjs 와 같은 꼴).
//    목록 RPC 는 scripts/render-list-stub.mjs 의 운영 anon 응답 캐시(원칙 26) · 이용 기록 송신은 받아 끝낸다 · 서비스 워커 막음.
// 쓰는 법:
//   node scripts/contrast-compare.mjs --head origin/<가지>            # 기준 origin/main
//   node scripts/contrast-compare.mjs --base <ref> --head <ref> --json out.json
//   (컨테이너: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NO_PROXY=127.0.0.1,localhost)
// 출력: 상태 × 테마마다 미달 갈래 수(기준 · 가지) · 새 미달 목록(갈래 = 태그.첫 클래스 | 글자색 | 배경색 · 대비 · 표본 글자) · 끝 줄 「새 미달 N」.
// 🔵 표시층 PR 점검에 붙일지는 회신 ⑦ 제안(이 회차는 스크립트만 · 종료 코드 0 — 판정하지 않는다).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, statSync, createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname, resolve } from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import { stubListRpc } from './render-list-stub.mjs'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
// playwright 는 전역 설치(컨테이너 /opt/node-tools) — ESM 은 NODE_PATH 를 안 보므로 require 로 찾는다(target-persona-check.mjs 와 같은 꼴)
const { chromium } = (() => {
  const req = createRequire(import.meta.url)
  for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { return req(p) } catch {} }
  throw new Error('playwright 를 찾지 못함 — PLAYWRIGHT_PATH 로 경로를 준다')
})()
const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const BASE = opt('--base', 'origin/main'), HEAD = opt('--head', null), OUT = opt('--json', null)
if (!HEAD) { console.error('쓰는 법: node scripts/contrast-compare.mjs --head <ref> [--base origin/main] [--json out.json]'); process.exit(2) }

const STATES = [
  ['notices-390', 390, async p => { await p.evaluate(() => goMain(2)); await p.waitForTimeout(3500) }],
  ['detail-390', 390, async p => {
    await p.evaluate(() => goMain(2)); await p.waitForTimeout(3500)
    await p.evaluate(() => {
      const c = [...document.querySelectorAll('.hcard')].find(e => e.offsetParent !== null); if (!c) return
      const id = c.getAttribute('data-card-id') || (c.querySelector('[id^="ncard-"]') || {}).id || c.id
      if (typeof toggleDetail === 'function' && typeof cardElFor === 'function' && id) toggleDetail(id, cardElFor(id), 'test'); else c.click()
    })
    await p.waitForTimeout(5000)
  }],
  ['notices-1280', 1280, async p => { await p.evaluate(() => goMain(2)); await p.waitForTimeout(3500) }],
]

// 페이지 안에서: 보이는 글자 요소(직접 글자 마디가 있는 요소)마다 대비
const MEASURE = () => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const over = (t, b) => { const a = t[3] ?? 1; return [0, 1, 2].map(i => t[i] * a + b[i] * (1 - a)) }
  // 배경 층 — 요소 자신 · 그 요소의 ::before/::after 가 칠한 배경(d3 칩처럼 배경을 의사 요소로 칠하는 꼴 · 2026-11-11 #974 「전체 N」 칩 오탐) · 조상 순.
  const pseudoBg = e => { for (const ps of ['::before', '::after']) { const s = getComputedStyle(e, ps)
      if (!s.content || s.content === 'none' || s.content === 'normal' || s.position !== 'absolute') continue
      const c = rgb(s.backgroundColor); if (c.length === 4 && c[3] === 0) continue; return c } return null }
  const bgOf = el => { const ls = []; for (let e = el; e; e = e.parentElement) {
      const own = rgb(getComputedStyle(e).backgroundColor), pb = pseudoBg(e)
      const c = !(own.length === 4 && own[3] === 0) ? own : pb
      if (!c) continue; ls.push(c); if ((c[3] ?? 1) === 1) break }
    let acc = [255, 255, 255]; for (const l of ls.reverse()) acc = over(l, acc); return acc }
  const hex = c => '#' + c.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('')
  const out = {}
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'svg', 'path'].includes(el.tagName)) continue
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()
    if (!txt) continue
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue
    let hidden = false; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || +s.opacity === 0) { hidden = true; break } } if (hidden) continue
    const bg = bgOf(el), fg = over(rgb(cs.color), bg)
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const px = parseFloat(cs.fontSize), w = +cs.fontWeight, need = (px >= 24 || (px >= 18.66 && w >= 700)) ? 3 : 4.5
    if (ratio >= need) continue
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0]
    const k = `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}|${hex(fg)}|${hex(bg)}`
    const e = out[k] || (out[k] = { n: 0, ratio: +ratio.toFixed(2), need, sample: txt.slice(0, 30) }); e.n++
  }
  return out
}

function serve(dir) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
    const f = join(dir, p)
    if (!f.startsWith(dir) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' })
    createReadStream(f).pipe(res)
  })
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)))
}

// 🔵 2026-11-12(우편함 「코드·운영 — …21026 마감 원인·고침 + 커트라인 공급 이력 …」 6 · #985 ②) — 그리기 끝 기다림.
//    prep 의 고정 대기(3.5·5초)만으로는 펼친 카드의 곁 데이터(커트라인·가격 요약·노선 등 RPC)가 늦게 오는 날 기준 쪽이 덜 그려진 채 재여
//    가지 쪽에만 보이는 요소가 거짓 「새 미달」로 잡혔다. 재기 전에 ① 네트워크 한가(최대 15초) ② 보이는 요소 수·글자 길이가
//    SETTLE_STABLE 번 연달아(SETTLE_STEP_MS 간격) 같을 때까지(최대 SETTLE_MAX_MS) 기다린다. 못 맞추면 그대로 잰다(값에 표지 _unsettled).
const SETTLE_STEP_MS = 700, SETTLE_STABLE = 3, SETTLE_MAX_MS = 20000
async function settle(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }) } catch {}
  const sig = () => page.evaluate(() => { const b = document.body; return b.getElementsByTagName('*').length + ':' + (b.innerText || '').length })
  let last = await sig(), same = 0
  const t0 = Date.now()
  while (Date.now() - t0 < SETTLE_MAX_MS) {
    await page.waitForTimeout(SETTLE_STEP_MS)
    const now = await sig()
    if (now === last) { if (++same >= SETTLE_STABLE) return true } else { same = 0; last = now }
  }
  return false
}

async function measureRef(browser, ref) {
  const dir = mkdtempSync(join(tmpdir(), 'zf-contrast-'))
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', dir, ref], { stdio: 'ignore' })
  const srv = await serve(dir)
  const url = `http://127.0.0.1:${srv.address().port}/?contrast=${Date.now()}`
  const res = {}
  try {
    for (const [name, width, prep] of STATES) for (const dark of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: dark ? 'dark' : 'light' })
      const page = await ctx.newPage()
      const key = `${name}${dark ? '-dark' : ''}`
      try {
        await stubListRpc(page)
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
        await page.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
        if (dark) await page.evaluate(() => typeof setTheme === 'function' && setTheme('dark', true))
        await prep(page)
        const settled = await settle(page)
        res[key] = await page.evaluate(MEASURE)
        if (!settled) res[key]._unsettled = true
      } catch (e) { res[key] = { _err: String(e).slice(0, 160) } } finally { await ctx.close() }
    }
  } finally {
    srv.close()
    try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', dir], { stdio: 'ignore' }) } catch { rmSync(dir, { recursive: true, force: true }) }
  }
  return res
}

const browser = await chromium.launch()
const base = await measureRef(browser, BASE)
const head = await measureRef(browser, HEAD)
await browser.close()

const report = { base: BASE, head: HEAD, states: {}, new: [] }
for (const st of Object.keys(head)) {
  const b = base[st] || {}, h = head[st] || {}
  const nk = o => Object.keys(o).filter(k => k !== '_unsettled').length
  report.states[st] = { base: b._err ? b._err : nk(b), head: h._err ? h._err : nk(h) }
  if (h._err || b._err) continue
  for (const [k, v] of Object.entries(h)) if (k !== '_unsettled' && !b[k]) report.new.push({ state: st, kind: k, ...v })
  if (b._unsettled || h._unsettled) report.states[st].unsettled = [b._unsettled && 'base', h._unsettled && 'head'].filter(Boolean)
}
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n')
for (const [st, v] of Object.entries(report.states)) console.log(`${st}: 미달 갈래 기준 ${v.base} · 가지 ${v.head}${v.unsettled ? ` · ⚠️ 그리기 안 멎음(${v.unsettled.join('·')})` : ''}`)
for (const n of report.new.slice(0, 40)) console.log(`  새 ${n.state} ${n.kind} 대비 ${n.ratio}(<${n.need}) ×${n.n} 「${n.sample}」`)
console.log(`새 미달 ${report.new.length}`)
