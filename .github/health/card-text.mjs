// 카드 하나 그려 본문 글자 뽑기 — 데이터 이전·표시층 회차의 「전후 대조」를 같은 방법으로 하려는 도구(2026-10-07 · 우편함 「코드 — Z-1 ③ …」 9).
// 🔴 읽기만 한다. 저장소의 index.html(= 병합 전이면 이 가지 · 병합 뒤면 main 바이트)을 390px Chromium 으로 열고, 화면이 실제로 부르는
//    공개 REST(anon)를 그대로 쓴다(대역 0 — 원칙 26 「매핑을 거친 행」). 카드 id 마다: 공고 탭에서 그 카드를 찾아 펼치고 →
//    블록(「이 공고에 포함된 블록」)을 모두 펼치고 → 「모두 펼치기」 버튼을 누른 뒤 → 카드 머리·상세 innerText·상세 textContent(접힌 자리 포함)를 JSON 으로 쓴다.
// 쓰는 법(컨테이너):
//   mkdir -p /tmp/ct && cd /tmp/ct && npm i playwright@1.56.0   # 브라우저는 PLAYWRIGHT_BROWSERS_PATH 의 것을 쓴다(설치 안 함)
//   cd /tmp/ct && node /home/user/zipfit/.github/health/card-text.mjs --out before.json 2015122300020090 2015122300020726
//   (index.html 을 바꾼 뒤) … --out after.json 같은 id → 두 파일의 head·detail·detailAll 을 비교한다.
//   --base https://kkokzip.com 을 주면 배포본을 그린다(서비스워커는 막는다). 주지 않으면 저장소 루트를 127.0.0.1 임시 서버로 연다.
// 같은 상태를 두 번 그려 글자가 같은지 먼저 본다 — 2026-10-07 12장 두 번 12/12 같음(결정적) · 81장 반영 전후 대조에서 지도·빈 절 문구 2장이 흔들려 SDK 판정·요약 캐시를 먼저 기다리게 했다(_kakao 칸). 블록이 많은 카드(12단지)는 펼침 대기가 모자랄 수 있다(--wait).
// 🔴 공고 탭 필터(마감 숨김·지역·유형·검색)를 걷고 찾는다 — 그 상태가 화면 사용자와 다를 수 있다(카드 상세 글자 대조용이지 목록 점검용이 아니다).
import fs from 'fs'
import http from 'http'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'

async function loadPlaywright () {
  try { return await import('playwright') } catch (_) {}
  const req = createRequire(path.join(process.cwd(), 'noop.js'))   // 현재 폴더의 node_modules 에서 찾는다
  return import(pathToFileURL(req.resolve('playwright')).href)
}

const argv = process.argv.slice(2)
const opt = { out: 'card-text.json', base: '', wait: 4000 }
const ids = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') opt.out = argv[++i]
  else if (argv[i] === '--base') opt.base = argv[++i].replace(/\/$/, '')
  else if (argv[i] === '--wait') opt.wait = Number(argv[++i])
  else ids.push(argv[i])
}
if (!ids.length) { console.error('카드 announcement_id 를 하나 이상 준다'); process.exit(2) }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
let server = null
if (!opt.base) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
  server = http.createServer((q, r) => {
    const p = path.join(ROOT, decodeURIComponent((q.url || '/').split('?')[0]))
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return }
    r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r)
  })
  await new Promise(ok => server.listen(0, '127.0.0.1', ok))
  opt.base = `http://127.0.0.1:${server.address().port}`
}

const pw = await loadPlaywright()
const chromium = pw.chromium || (pw.default && pw.default.chromium)   // 경로로 불러온 CJS 는 default 아래에 있다
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)))
await page.goto(opt.base + '/index.html', { waitUntil: 'load', timeout: 90000 })
await page.evaluate(() => goMain(2))
await page.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0 && noticeLoaded, null, { timeout: 90000 })
// 🔵 2026-10-07(Z-2 ③ 8) — 결정적으로 그린다. 같은 카드를 두 번 그려 글자가 달랐던 두 꼴을 막는다.
//    ① 지도: 카카오 SDK 가 되는지(컨테이너는 10초 뒤 실패)를 카드를 열기 **전에** 정해 둔다 — SDK 판정이 카드 도중에 끝나면
//       「지도를 불러올 수 없어요」와 「위치 정보가 없어요」 중 무엇이 마지막에 남는지가 시각에 따라 갈렸다(19585_2).
//    ② 빈 절 문구: 정책·자격 절은 그려질 때 가격 요약 캐시(zfPriceCache)를 읽고 그 문구로 굳는다 — 캐시가 오기 전에 그려지면
//       「아직 정리하지 못했어요」, 온 뒤면 「원문 링크만 제공해요」였다(SH_310041). 그래서 카드마다 요약을 먼저 받아 둔다.
const kakao = await page.evaluate(() => (typeof loadKakao === 'function' ? loadKakao().then(() => 'ok', e => 'fail: ' + e) : 'none'))
const out = { _base: opt.base, _at: new Date().toISOString(), _kakao: kakao }
const priceSettled = () => page.waitForFunction(() => typeof zfPriceCache === 'undefined' || ![...zfPriceCache.values()].includes(undefined), null, { timeout: 30000 })
for (const aid of ids) {
  await page.evaluate(aid => (typeof zfEnsurePriceSummaries === 'function' ? zfEnsurePriceSummaries([aid]) : null), aid)
  await priceSettled()
  const r = await page.evaluate(aid => {
    const row = noticeData.find(n => String(n.announcement_id) === aid)
    if (!row) return { err: '목록(noticeData)에 없다 — 대표 카드 id 인지 본다' }
    activeNoticeStatus = null; activeNoticeTarget = null
    const q = document.getElementById('noticeSearchInput'); if (q) q.value = ''
    const chk = document.getElementById('hideClosedChk'); if (chk) chk.checked = false
    applyNoticeFiltersAndRender()
    const idx = noticeFiltered.indexOf(row)
    if (idx === -1) return { err: '필터를 걷어도 목록에 없다' }
    noticePage = Math.floor(idx / noticePageSize) + 1
    renderNoticeList(noticeFiltered, noticeData.length)
    const cardId = 'ncard-' + zfCardKey(row.announcement_id || idx)
    const el = cardElFor(cardId)
    if (!el) return { err: '카드 요소가 없다' }
    toggleDetail(cardId, el, 'test')
    return { cardId }
  }, aid)
  if (r.err) { out[aid] = r; continue }
  await page.waitForTimeout(opt.wait + 2000)
  for (let k = 0; k < 3; k++) {   // 블록 펼침 — 펼치면 새 요청이 나가므로 몇 번 되풀이
    await page.evaluate(cid => {
      const d = document.getElementById(cid); if (!d) return
      d.querySelectorAll('[onclick*="toggleBlockGroup"]').forEach(b => {
        const m = /toggleBlockGroup\('([^']+)',\s*(\d+)\)/.exec(b.getAttribute('onclick')); if (!m) return
        const body = document.getElementById('blk-group-body-' + m[1] + '-' + m[2])
        if (body && body.style.display === 'block') return
        b.click()
      })
    }, r.cardId)
    await page.waitForTimeout(opt.wait)
  }
  await page.evaluate(cid => {
    const d = document.getElementById(cid); if (!d) return
    d.querySelectorAll('button').forEach(b => { if (/모두 펼치기/.test(b.innerText)) b.click() })
  }, r.cardId)
  await page.waitForTimeout(2500)
  await priceSettled()
  out[aid] = await page.evaluate(cid => {
    const card = document.querySelector(`[data-card-id="${cid}"]`)
    const d = document.getElementById(cid)
    const norm = s => (s || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
    return {
      head: norm(card ? card.innerText : ''),
      detail: norm(d ? d.innerText : ''),
      detailAll: norm(d ? d.textContent : ''),
      blocks: d ? d.querySelectorAll('[onclick*="toggleBlockGroup"]').length : -1,
      imgs: d ? d.querySelectorAll('img').length : -1,
      // 가로 넘침(px) — 카드 상자 · 문서 전체 · 자격 줄(.elig-row) 중 넘친 줄 수. 0 이 정상이다(2026-10-07 Z-2 ③ 5).
      ovf: (h => h ? h.scrollWidth - h.clientWidth : -1)((d && d.closest('.hcard')) || card),
      docOvf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      eligOvf: d ? [...d.querySelectorAll('.elig-row')].filter(e => e.scrollWidth > e.clientWidth).length : -1,
    }
  }, r.cardId)
  await page.evaluate(cid => { toggleDetail(cid, cardElFor(cid), 'test') }, r.cardId)
}
out._errors = errs
fs.writeFileSync(opt.out, JSON.stringify(out, null, 1))
await browser.close()
if (server) server.close()
console.log(`카드 ${ids.length}장 → ${opt.out} · pageerror ${errs.length}`)
