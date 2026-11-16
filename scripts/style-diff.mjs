// 계산 스타일 대조 — main ↔ PR 가지(2026-11-16 · 우편함 「코드·운영 — 단지 도로명·좌표 표 …」 0장 ③ · 표시층 「토큰 4차」 회신 ⑦ 2).
// 🔴 읽기만 한다. 두 git ref 를 각각 임시 worktree 로 떠서 로컬 서버로 열고, 보이는 요소마다 계산 스타일(아래 PROPS)을 모아
//    「같은 요소 키인데 값이 달라진 속성」을 센다 — 토큰 걷기(날값 → 변수)처럼 「보이는 값은 그대로여야 하는」 회차의 증명용.
//    요소 키 = 태그 + (id 가 있으면 #id · 없으면 첫 클래스) + 같은 키 안에서의 문서 순번(#n) — 순번은 요소 수가 같을 때만 뜻이 있어
//    키별 요소 수가 다르면 그 키는 값 대조 대신 「수 다름」으로 따로 적는다(구조가 바뀐 자리).
//    상태: 390 공고 탭 · 390 펼친 카드(첫 보이는 카드) · 1280 공고 탭 — 각각 밝음 · 어두움(setTheme('dark', true)) — contrast-compare.mjs 와 같은 꼴.
//    목록 RPC 는 scripts/render-list-stub.mjs 의 운영 anon 응답 캐시(원칙 26) · 서비스 워커 막음.
// 쓰는 법:
//   node scripts/style-diff.mjs --head origin/<가지>                     # 기준 origin/main
//   node scripts/style-diff.mjs --base <ref> --head <ref> [--json out.json] [--props color,background-color]
//   (컨테이너: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NO_PROXY=127.0.0.1,localhost)
// 출력: 상태 × 테마마다 요소 수(기준 · 가지) · 값 다른 요소 수 · 수 다른 키 수 · 다른 것 목록(키 · 속성 · 기준 → 가지) · 끝 줄 「값 다름 N · 수 다름 M」.
// 🔵 종료 코드 0 — 판정하지 않는다(표시층 회차가 회신에 붙인다 · PR 점검으로 붙일지는 따로 판정).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, writeFileSync, statSync, createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname, resolve } from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import { stubListRpc } from './render-list-stub.mjs'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const { chromium } = (() => {
  const req = createRequire(import.meta.url)
  for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { return req(p) } catch {} }
  throw new Error('playwright 를 찾지 못함 — PLAYWRIGHT_PATH 로 경로를 준다')
})()
const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const BASE = opt('--base', 'origin/main'), HEAD = opt('--head', null), OUT = opt('--json', null)
if (!HEAD) { console.error('쓰는 법: node scripts/style-diff.mjs --head <ref> [--base origin/main] [--json out.json] [--props a,b]'); process.exit(2) }

// 보이는 값을 정하는 속성 — 토큰이 건드리는 축(색 · 글자 · 간격 · 테두리 · 둥글기 · 그림자 · 흐림)
const PROPS = (opt('--props', '') || [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'row-gap', 'column-gap', 'box-shadow', 'opacity', 'outline-color', 'text-decoration-color', 'fill', 'stroke',
].join(',')).split(',').map(s => s.trim()).filter(Boolean)

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

// 페이지 안에서: 보이는 요소마다 { 키: { 속성: 값 } } · 키별 요소 수
const MEASURE = props => {
  const out = {}, cnt = {}
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue
    let hidden = false; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') { hidden = true; break } } if (hidden) continue
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0]
    const base = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : cls ? '.' + cls : ''}`
    const n = cnt[base] = (cnt[base] || 0) + 1
    const cs = getComputedStyle(el), v = {}
    for (const p of props) v[p] = cs.getPropertyValue(p)
    out[`${base}#${n}`] = v
  }
  return { out, cnt }
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

// 그리기 끝 기다림 — contrast-compare.mjs settle 과 같은 규칙(네트워크 한가 · 요소 수·글자 길이 3번 연달아 같음 · 최대 20초)
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
  const dir = mkdtempSync(join(tmpdir(), 'zf-style-'))
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', dir, ref], { stdio: 'ignore' })
  const srv = await serve(dir)
  const url = `http://127.0.0.1:${srv.address().port}/?stylediff=${Date.now()}`
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
        res[key] = await page.evaluate(MEASURE, PROPS)
        if (!settled) res[key].unsettled = true
      } catch (e) { res[key] = { err: String(e).slice(0, 160) } } finally { await ctx.close() }
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

const report = { base: BASE, head: HEAD, props: PROPS, states: {}, diffs: [], count_diffs: [] }
for (const st of Object.keys(head)) {
  const b = base[st] || {}, h = head[st] || {}
  if (b.err || h.err) { report.states[st] = { err: b.err || h.err }; continue }
  const cntKeys = new Set([...Object.keys(b.cnt), ...Object.keys(h.cnt)])
  const badCnt = new Set()
  for (const k of cntKeys) if ((b.cnt[k] || 0) !== (h.cnt[k] || 0)) { badCnt.add(k); report.count_diffs.push({ state: st, key: k, base: b.cnt[k] || 0, head: h.cnt[k] || 0 }) }
  let diffEls = 0
  for (const [k, hv] of Object.entries(h.out)) {
    const bk = k.replace(/#\d+$/, ''); if (badCnt.has(bk)) continue
    const bv = b.out[k]; if (!bv) continue
    const ch = PROPS.filter(p => bv[p] !== hv[p])
    if (!ch.length) continue
    diffEls++
    for (const p of ch) report.diffs.push({ state: st, key: k, prop: p, base: bv[p], head: hv[p] })
  }
  report.states[st] = { base: Object.keys(b.out).length, head: Object.keys(h.out).length, diff_elements: diffEls, count_diff_keys: badCnt.size,
    ...(b.unsettled || h.unsettled ? { unsettled: [b.unsettled && 'base', h.unsettled && 'head'].filter(Boolean) } : {}) }
}
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n')
for (const [st, v] of Object.entries(report.states)) {
  if (v.err) { console.log(`${st}: ⚠️ 재지 못함 — ${v.err}`); continue }
  console.log(`${st}: 요소 기준 ${v.base} · 가지 ${v.head} · 값 다름 ${v.diff_elements} · 수 다른 키 ${v.count_diff_keys}${v.unsettled ? ` · ⚠️ 그리기 안 멎음(${v.unsettled.join('·')})` : ''}`)
}
for (const d of report.diffs.slice(0, 60)) console.log(`  ${d.state} ${d.key} ${d.prop}: ${d.base} → ${d.head}`)
for (const d of report.count_diffs.slice(0, 20)) console.log(`  수 ${d.state} ${d.key}: ${d.base} → ${d.head}`)
console.log(`값 다름 ${report.diffs.length} · 수 다름 ${report.count_diffs.length}`)
