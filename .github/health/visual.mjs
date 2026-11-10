// 시각 회귀 — 표본 카드 다섯을 고정 대역 응답으로 그려 기준 그림과 픽셀로 견준다(2026-11-10 · 우편함 「코드·운영 — 시각 회귀 장치 …」 1).
// 왜: health-screen 은 뜻(문구·DB 대조)과 axe 만 본다. 문구는 같고 모양만 바뀌는 변경(12월 재편)은 다 통과한다.
// 🔴 운영 데이터를 쓰지 않는다 · 렌더 때 운영을 부르지 않는다 — Supabase 요청은 전부 고정본(visual/fixture.json.gz)으로 돌려준다.
//    고정본 밖 요청이 하나라도 있으면 실패(그림이 그날 데이터에 기대게 된다는 뜻).
// 표본(고정): 행복 다계층 …20850 · 국민 예비입주자 …21017 · 매입 두 벌 …20972 · 빈 값 많은 전세임대 …19376 · 정정 카드 …20977(광주두암2 영구임대)
//    × 화면 폭 390 · 1280 × 밝음 · 어두움 × 접힘 · 펼침 = 40장.
// 시계는 고정본을 뜬 시각으로 멈춘다(page.clock.setFixedTime) — D-day · 「오늘」 · 접수 상태가 날짜로 바뀌지 않게.
// 움직임 끔(reducedMotion · transition/animation 0 · 깜빡이는 커서 0) · 카카오 지도·Drive 썸네일·GitHub API 는 막는다(매번 같은 빈 자리).
//
// 쓰는 법:
//   node .github/health/visual.mjs --record     # 고정본을 운영에서 새로 뜬다(🔴 컨테이너·사람 손 · 운영 anon 읽기만) → 기준 갱신도 함께 해야 한다
//   node .github/health/visual.mjs --update     # 기준 그림을 새로 쓴다 — 워크플로 visual.yml 「기준 갱신」(누가·언제가 baseline.json 과 커밋에 남는다)
//   node .github/health/visual.mjs              # 견준다 → visual-out/(차이 그림 · 결과 visual-result.json · 요약 visual-summary.md) · 실패면 종료 코드 1
//   --site <주소>  잴 페이지(기본: 저장소 뿌리를 이 스크립트가 127.0.0.1 임시 서버로 띄운다)
// 🔴 기준 그림은 GitHub 러너(ubuntu · 워크플로가 까는 Playwright 판)에서만 만든다 — 글꼴·렌더러가 다른 곳에서 만든 그림과는 늘 다르다.
import fs from 'fs'
import http from 'http'
import path from 'path'
import zlib from 'zlib'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DIR = path.join(HERE, 'visual')
const FIXTURE = path.join(DIR, 'fixture.json.gz')
const BASE_DIR = path.join(DIR, 'baseline')
const BASE_META = path.join(DIR, 'baseline.json')
const OUT = path.join(ROOT, 'visual-out')

export const SAMPLES = [
  ['2015122300020850', '행복 다계층'],
  ['2015122300021017', '국민 예비입주자'],
  ['2015122300020972', '매입 두 벌'],
  ['2015122300019376', '전세임대 빈 값'],
  ['2015122300020977', '정정 카드'],
]
const WIDTHS = [390, 1280]
const THEMES = ['light', 'dark']
// 차이 임계 — 픽셀 하나의 색 차(pixelmatch threshold 0.1 · 안티에일리어싱 무시)를 넘는 픽셀이
//    max(DIFF_MIN_PX, 면적 × DIFF_RATIO) 를 넘으면 실패. 크기가 다르면 실패. 같은 러너·같은 고정본이면 0 이 기대값이다.
const DIFF_MIN_PX = 100
const DIFF_RATIO = 0.001

const SUPA = /^https:\/\/khdpjjyspmlqtzperoqg\.supabase\.co\//
const BLOCK = /dapi\.kakao\.com|kakaocdn\.net|daumcdn\.net|drive\.google\.com|googleusercontent\.com|api\.github\.com|googletagmanager|google-analytics/
const LIST_RPC = '/rest/v1/rpc/get_announcements_deduped'

const argv = process.argv.slice(2)
const MODE = argv.includes('--record') ? 'record' : argv.includes('--update') ? 'update' : 'compare'
const si = argv.indexOf('--site')

// 요청 열쇠 — 방법 · 주소(쿼리 포함) · 본문. 머리(키)는 넣지 않는다.
const keyOf = (method, url, body) => crypto.createHash('sha1').update(method + ' ' + url + '\n' + (body || '')).digest('hex').slice(0, 16)

function serveRoot () {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
    const f = path.join(ROOT, p)
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    fs.createReadStream(f).pipe(res)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}

async function main () {
  const { chromium } = await import('playwright')
  let server = null, site = si >= 0 ? argv[si + 1] : ''
  if (!site) { server = await serveRoot(); site = `http://127.0.0.1:${server.address().port}/index.html` }

  let fixture = null
  if (MODE !== 'record') {
    if (!fs.existsSync(FIXTURE)) throw new Error('고정본 없음 — --record 로 먼저 뜬다')
    fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString('utf8'))
  } else {
    fixture = { _at: new Date().toISOString(), _samples: SAMPLES.map(s => s[0]), entries: {} }
  }
  const clock = new Date(fixture._at)
  const ids = new Set(SAMPLES.map(s => s[0]))
  const misses = [], pageErrors = []

  const browser = await chromium.launch()
  const shots = []   // { name, buf }
  try {
    for (const width of WIDTHS) for (const theme of THEMES) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'ko-KR',
        timezoneId: 'Asia/Seoul', colorScheme: theme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce' })
      await ctx.route(BLOCK, r => r.abort())
      await ctx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
      await ctx.route(/\/functions\/v1\/submit-feedback/, r => r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"not_yet"}' }))
      await ctx.route(SUPA, async route => {
        const req = route.request(), u = req.url()
        if (/\/rest\/v1\/usage_events/.test(u)) return route.fulfill({ status: 201, body: '' })
        const k = keyOf(req.method(), u, req.postData())
        if (MODE === 'record') {
          let e = fixture.entries[k]
          if (!e) {
            const res = await route.fetch({ timeout: 60000 })
            let body = await res.text()
            // 목록 함수는 표본 다섯 행만 남긴다 — 고정본이 작고, 화면에 다섯 장만 선다.
            if (u.includes(LIST_RPC) && res.status() >= 200 && res.status() < 300) {
              try { body = JSON.stringify(JSON.parse(body).filter(r => ids.has(String(r.announcement_id)))) } catch (_) {}
            }
            const h = res.headers()
            e = fixture.entries[k] = { m: req.method(), u: u.replace(/^https:\/\/[^/]+/, ''), s: res.status() === 206 ? 200 : res.status(), t: h['content-type'] || 'application/json', b: body }
          }
          return route.fulfill({ status: e.s, contentType: e.t, body: e.b })
        }
        const e = fixture.entries[k]
        if (!e) { misses.push(req.method() + ' ' + u.replace(/^https:\/\/[^/]+/, '').slice(0, 140)); return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }) }
        return route.fulfill({ status: e.s, contentType: e.t, body: e.b })
      })
      const page = await ctx.newPage()
      page.on('pageerror', e => pageErrors.push(`${width}/${theme}: ${String(e).slice(0, 140)}`))
      await page.clock.setFixedTime(clock)
      await page.addInitScript(() => { try { localStorage.setItem('zf_theme_seen', '1') } catch (_) {} })
      await page.goto(site + (site.includes('?') ? '&' : '?') + 'visual=1', { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;scroll-behavior:auto!important}' })
      await page.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
      if (theme === 'dark') await page.evaluate(() => setTheme('dark', true))
      await page.evaluate(() => { goMain(2); if (typeof zf3SetView === 'function') zf3SetView('list'); const c = document.getElementById('hideClosedChk'); if (c && c.checked) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })) } })
      await page.waitForTimeout(2500)
      for (const [aid, label] of SAMPLES) {
        const sel = `#notice-list [data-card-id][data-announcement-id="${aid}"]`
        const card = await page.$(sel)
        const base = `${aid}-${width}-${theme}`
        if (!card) { shots.push({ name: base + '-fold', missing: `${label} 카드 없음` }); shots.push({ name: base + '-open', missing: `${label} 카드 없음` }); continue }
        await card.scrollIntoViewIfNeeded()
        shots.push({ name: base + '-fold', buf: await stableShot(page, sel) })
        await page.evaluate(s => { const c = document.querySelector(s); toggleDetail(c.getAttribute('data-card-id'), c, 'visual') }, sel)
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(2500)
        // 넓은 화면(1280)은 상세가 카드 밖 옆 패널로 열린다 — 그때는 상세 요소를 찍는다(카드 안이면 카드째).
        const openSel = await page.evaluate(s => { const c = document.querySelector(s); const d = document.getElementById(c.getAttribute('data-card-id'))
          return d && !c.contains(d) && d.offsetParent !== null ? '#' + CSS.escape(d.id) : s }, sel)
        shots.push({ name: base + '-open', buf: await stableShot(page, openSel) })
        await page.evaluate(s => { const c = document.querySelector(s); toggleDetail(c.getAttribute('data-card-id'), c, 'visual') }, sel)
        await page.waitForTimeout(600)
      }
      await ctx.close()
    }
  } finally {
    await browser.close()
    if (server) server.close()
  }

  if (MODE === 'record') {
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(FIXTURE, zlib.gzipSync(JSON.stringify(fixture), { level: 9 }))
    console.log(JSON.stringify({ mode: 'record', at: fixture._at, entries: Object.keys(fixture.entries).length, bytes: fs.statSync(FIXTURE).size, shots: shots.length, missing: shots.filter(s => s.missing).map(s => s.name) }))
    return 0
  }

  if (MODE === 'update') {
    fs.rmSync(BASE_DIR, { recursive: true, force: true }); fs.mkdirSync(BASE_DIR, { recursive: true })
    const images = {}
    for (const s of shots) {
      if (!s.buf) continue
      fs.writeFileSync(path.join(BASE_DIR, s.name + '.png'), s.buf)
      images[s.name] = crypto.createHash('sha256').update(s.buf).digest('hex').slice(0, 16)
    }
    const meta = { _at: new Date().toISOString(), _by: process.env.GITHUB_ACTOR || process.env.USER || '?', _run: process.env.RUN_URL || null,
      _sha: process.env.GITHUB_SHA || null, _fixture_at: fixture._at, _playwright: (await import('playwright/package.json', { with: { type: 'json' } })).default.version,
      missing: shots.filter(s => s.missing).map(s => s.name + ' — ' + s.missing), fixture_misses: misses, page_errors: pageErrors.length, images }
    fs.writeFileSync(BASE_META, JSON.stringify(meta, null, 1) + '\n')
    console.log(JSON.stringify({ mode: 'update', images: Object.keys(images).length, missing: meta.missing, fixture_misses: misses.length }))
    return (meta.missing.length || misses.length) ? 1 : 0
  }

  // 견주기
  const { PNG } = (await import('pngjs')).default
  const pixelmatch = (await import('pixelmatch')).default
  let meta = null
  try { meta = JSON.parse(fs.readFileSync(BASE_META, 'utf8')) } catch (_) {}
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
  const rows = []
  for (const s of shots) {
    const bp = path.join(BASE_DIR, s.name + '.png')
    if (s.missing) { rows.push({ name: s.name, status: 'fail', why: s.missing }); continue }
    if (!fs.existsSync(bp)) { rows.push({ name: s.name, status: 'fail', why: '기준 그림 없음' }); fs.writeFileSync(path.join(OUT, s.name + '.now.png'), s.buf); continue }
    const a = PNG.sync.read(fs.readFileSync(bp)), b = PNG.sync.read(s.buf)
    if (a.width !== b.width || a.height !== b.height) {
      rows.push({ name: s.name, status: 'fail', why: `크기 ${a.width}×${a.height} → ${b.width}×${b.height}` })
      fs.writeFileSync(path.join(OUT, s.name + '.now.png'), s.buf); continue
    }
    const diff = new PNG({ width: a.width, height: a.height })
    const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 })
    const lim = Math.max(DIFF_MIN_PX, Math.round(a.width * a.height * DIFF_RATIO))
    const bad = n > lim
    if (n > 0) { fs.writeFileSync(path.join(OUT, s.name + '.diff.png'), PNG.sync.write(diff)); fs.writeFileSync(path.join(OUT, s.name + '.now.png'), s.buf) }
    rows.push({ name: s.name, status: bad ? 'fail' : 'pass', why: `다른 픽셀 ${n} / 임계 ${lim}` })
  }
  const failed = rows.filter(r => r.status === 'fail')
  const ok = failed.length === 0 && misses.length === 0
  const res = { kind: 'visual', ok, at: new Date().toISOString(), baseline: meta ? { at: meta._at, by: meta._by, run: meta._run } : null,
    fixture_at: fixture._at, images: rows.length, failed: failed.map(r => r.name), fixture_misses: misses, page_errors: pageErrors.slice(0, 10), rows }
  fs.writeFileSync(path.join(ROOT, 'visual-result.json'), JSON.stringify(res, null, 1))
  const md = [`## 시각 회귀 — ${ok ? '통과' : '실패'} (${rows.length - failed.length}/${rows.length})`, '',
    `기준: ${meta ? `${meta._at} · ${meta._by}${meta._run ? ` · ${meta._run}` : ''}` : '없음'} · 고정본 ${fixture._at}`, '',
    misses.length ? `❌ 고정본 밖 요청 ${misses.length}: ${misses.slice(0, 5).join(' / ')}\n` : '',
    '| 그림 | 판정 | 값 |', '|---|---|---|', ...rows.map(r => `| ${r.name} | ${r.status === 'pass' ? '✅' : '❌'} | ${r.why} |`), '',
    failed.length ? '차이 그림·지금 그림은 이 실행의 아티팩트 `visual-out` 에 있다. 의도한 변경이면 워크플로 「Visual」을 이 가지에서 `update=true` 로 돌려 기준을 갱신한다.' : ''].join('\n')
  fs.writeFileSync(path.join(ROOT, 'visual-summary.md'), md + '\n')
  console.log(md)
  return ok ? 0 : 1
}

// 두 번 연달아 같은 그림이 나올 때까지 찍는다(최대 4번) — 늦게 붙는 곁 요청·글꼴로 흔들린 그림을 기준에 넣지 않게.
async function stableShot (page, sel) {
  // 화면에 붙은 요소(아래 탭 막대 · 「↑」 단추 · 머리 띠 등)는 찍는 동안 숨긴다 — 스크롤 자리에 따라 카드 위에 겹쳐 그림이 흔들린다.
  //    찍을 요소 안의 것은 숨기지 않는다. 그 막대 자체의 모양은 이 장치가 재는 것이 아니다(카드 · 상세만).
  await page.evaluate(sel => {
    const t = document.querySelector(sel)
    document.querySelectorAll('[data-vhide]').forEach(e => { e.style.visibility = e.dataset.vhide === '-' ? '' : e.dataset.vhide; delete e.dataset.vhide })
    for (const e of document.body.querySelectorAll('*')) {
      const p = getComputedStyle(e).position
      if ((p === 'fixed' || p === 'sticky') && !(t && (t.contains(e) || e.contains(t)))) { e.dataset.vhide = e.style.visibility || '-'; e.style.visibility = 'hidden' }
    }
  }, sel)
  let prev = null
  for (let i = 0; i < 4; i++) {
    const buf = await page.locator(sel).screenshot({ animations: 'disabled', caret: 'hide' })
    if (prev && Buffer.compare(prev, buf) === 0) return buf
    prev = buf
    await page.waitForTimeout(700)
  }
  return prev
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(2) })
