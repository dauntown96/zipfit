// 접근성 검사(axe-core) — 화면 점검(A)의 한 항목 · 혼자 돌려 D-3 단계 PR 을 재는 도구(2026-10-12 · 우편함 「코드 — Claude Code 장비 정비」 1).
// 🔴 읽기만 한다. 다섯 상태(390 추천 첫 화면 · 390 공고 탭 · 390 카드 하나 펼침 · 1280 공고 탭 · 390 공고 탭 어둡게)를 열어
//    axe-core 규칙(WCAG 2.0·2.1 A·AA)으로 위반을 세고, 기준선(a11y-baseline.json)과 견준다.
// 🔴 처음엔 경고(⚠️)만 — 기준선보다 늘면 warn · 실패(fail) 승격은 D-3 끝난 뒤 claude.ai 판정(원칙 33 판정표).
//    「늘었다」 = 그 상태에 기준선에 없던 규칙 id 가 생겼거나 · 같은 규칙의 위반 요소 수가 기준선 + max(3, 기준선의 20%)를 넘음
//    (요소 수는 그날 카드 수에 따라 흔들리므로 여유를 둔다).
// 쓰는 법(컨테이너 · D-3 단계 PR 을 잴 때):
//   mkdir -p /tmp/ax && cd /tmp/ax && npm i playwright@1.56.1 @axe-core/playwright@4.13.0 axe-core@4.13.0
//   ln -sfn /tmp/ax/node_modules /home/user/zipfit/.github/health/node_modules     # ESM 은 NODE_PATH 를 안 본다 — 잰 뒤 지운다
//   node /home/user/zipfit/.github/health/a11y.mjs                    # 배포본(kkokzip.com)
//   node /home/user/zipfit/.github/health/a11y.mjs --local            # 저장소 index.html(127.0.0.1 임시 서버 · ?ui=d3 같은 쿼리는 --query)
//   node /home/user/zipfit/.github/health/a11y.mjs --write-baseline   # 기준선을 새로 쓴다(🔴 claude.ai 판정 뒤에만)
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const BASELINE_PATH = path.join(HERE, 'a11y-baseline.json')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const waitList = async page => {
  await page.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
}
const toTab = (page, n) => page.evaluate(n => goMain(n), n)

// 상태 이름 → [화면 너비, 어둡게, 준비 함수]
export const STATES = [
  ['home-390', 390, false, async page => { await toTab(page, 1); await page.waitForTimeout(2500) }],
  ['notices-390', 390, false, async page => { await toTab(page, 2); await page.waitForTimeout(3500) }],
  ['detail-390', 390, false, async page => {
    await toTab(page, 2); await page.waitForTimeout(3500)
    const ok = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.hcard')].find(e => e.offsetParent !== null)
      if (!c) return false
      const id = c.getAttribute('data-card-id') || (c.querySelector('[id^="ncard-"]') || {}).id || c.id
      if (typeof toggleDetail === 'function' && id && typeof cardElFor === 'function') { toggleDetail(id, cardElFor(id), 'test'); return true }
      c.click(); return true
    })
    if (!ok) throw new Error('펼칠 카드가 없다')
    await page.waitForTimeout(5000)
  }],
  ['notices-1280', 1280, false, async page => { await toTab(page, 2); await page.waitForTimeout(3500) }],
  ['notices-390-dark', 390, true, async page => { await page.evaluate(() => setTheme('dark', true)); await toTab(page, 2); await page.waitForTimeout(3500) }],
]

// browser 하나로 다섯 상태를 잰다 → { state: { rules: { id: { impact, nodes, sample } }, err? } }
export async function measure (browser, url, { AxeBuilder }) {
  const out = {}
  for (const [name, width, dark, prep] of STATES) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: dark ? 'dark' : 'light' })
    // 점검은 운영 이용 기록에 쓰지 않는다(screen-check 와 같은 이유 · 고지 회차 1 · 6)
    await ctx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
    const page = await ctx.newPage()
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
      await waitList(page)
      await prep(page)
      const res = await new AxeBuilder({ page }).withTags(TAGS).analyze()
      const rules = {}
      for (const v of res.violations) {
        rules[v.id] = { impact: v.impact, nodes: v.nodes.length, sample: (v.nodes[0]?.target || []).join(' ').slice(0, 90) }
      }
      out[name] = { rules }
    } catch (e) {
      out[name] = { err: String(e).slice(0, 200) }
    } finally {
      await ctx.close()
    }
  }
  return out
}

// 기준선과 견준다 → { status: 'pass'|'warn', value, increased: [...] }
export function compare (got, baseline) {
  if (!baseline) return { status: 'warn', value: '기준선 파일 없음', increased: [] }
  const inc = [], errs = []
  let total = 0
  for (const [st, r] of Object.entries(got)) {
    if (r.err) { errs.push(`${st}: ${r.err.slice(0, 80)}`); continue }
    const base = (baseline.states || {})[st]?.rules || {}
    for (const [id, v] of Object.entries(r.rules)) {
      total += v.nodes
      const b = base[id]
      if (!b) inc.push(`${st} 새 규칙 ${id}(${v.impact} · ${v.nodes} · ${v.sample})`)
      else if (v.nodes > b.nodes + Math.max(3, Math.ceil(b.nodes * 0.2))) inc.push(`${st} ${id} ${b.nodes}→${v.nodes}`)
    }
  }
  const rulesNow = new Set(Object.values(got).flatMap(r => Object.keys(r.rules || {})))
  const head = `위반 규칙 ${rulesNow.size}종 · 요소 ${total}`
  if (errs.length) return { status: 'warn', value: `${head} · 못 잰 상태 ${errs.length}: ${errs.join(' / ')}`, increased: inc }
  if (inc.length) return { status: 'warn', value: `${head} · 기준선보다 늚 ${inc.length}: ${inc.slice(0, 4).join(' / ')}`, increased: inc }
  return { status: 'pass', value: `${head} · 기준선 이내`, increased: [] }
}

export function loadBaseline () {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) } catch (_) { return null }
}

// ── 혼자 돌릴 때 ──
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const local = argv.includes('--local')
  const qi = argv.indexOf('--query')
  const query = qi >= 0 ? argv[qi + 1] : ''
  const { chromium } = await import('playwright')
  const AxeBuilder = (await import('@axe-core/playwright')).default
  let server = null, url = 'https://kkokzip.com/'
  if (local) {
    const root = path.resolve(HERE, '..', '..')
    server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
      const f = path.join(root, p)
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
      const ext = path.extname(f)
      res.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' }[ext] || 'application/octet-stream' })
      fs.createReadStream(f).pipe(res)
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${server.address().port}/`
  }
  url += (query ? (query.startsWith('?') ? query : '?' + query) : '?a11y=' + Date.now())
  const browser = await chromium.launch()
  const got = await measure(browser, url, { AxeBuilder })
  await browser.close()
  if (server) server.close()
  if (argv.includes('--write-baseline')) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify({ _at: new Date().toISOString(), _url: url.replace(/\?.*$/, ''), _axe: '4.13.0', _tags: TAGS, states: got }, null, 1) + '\n')
    console.log('기준선을 썼다 →', BASELINE_PATH)
  }
  const c = compare(got, loadBaseline())
  console.log(JSON.stringify({ url, ...c, states: got }, null, 1))
}
