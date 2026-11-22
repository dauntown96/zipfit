// 지도 렌더용 같은 출처 대역 — https://kkokzip.com 을 열되 같은 출처 파일은 이 가지(로컬 저장소) 파일로 돌려준다
//   (2026-11-22 · 우편함 「코드·운영 — 다섯째 묶음」 3 · #1200 회신 ② 방법).
//
// 왜: 카카오 지도 SDK 키는 등록 도메인(kkokzip.com)에서만 열린다 — 127.0.0.1 로컬 렌더에서는 상세 지도가 뜨지 않아
//   지도·지도 출처 줄 같은 변경을 로컬에서 볼 수 없었다. 주소창은 kkokzip.com 그대로 두고, 그 출처의 파일(index.html · sw.js · geo/** …)만
//   Playwright route 로 가지 파일을 돌려주면 SDK 는 등록 도메인으로 보고 지도를 그린다.
// 🔴 운영에 쓰지 않는다: 같은 출처 요청은 배포본으로 나가지 않는다(로컬에 없는 파일은 404 — 배포본과 가지가 섞이지 않게) ·
//   이용 기록(usage_events) 송신은 201 로 받아 끝내고 · 의견 보내기(submit-feedback)·프로필 저장(save-user-profile)·계정 삭제(delete-account)는 막는다.
//   Supabase 읽기(anon)는 그대로 운영으로 간다 — 목록 RPC 는 함께 stubListRpc(scripts/render-list-stub.mjs)를 걸어 렌더마다 부르지 않는다(원칙 26).
// 🔴 운영 화면을 재는 측정(health-screen · 배포본 점검)에는 쓰지 않는다 — 이건 가지 화면을 그려 보는 도구다.
//
// 쓰는 법(Playwright):
//   import { routeKkokzip } from '/home/user/zipfit/scripts/render-kkokzip-route.mjs'
//   import { stubListRpc } from '/home/user/zipfit/scripts/render-list-stub.mjs'
//   const info = await routeKkokzip(page)            // page.goto 전에 — { origin, root, served, missing, blocked }(렌더가 진행되며 채워진다)
//   await stubListRpc(page)
//   await page.goto('https://kkokzip.com/?n=2015122300020357')   // ?n= 은 그 공고 상세를 연다
// 바로 재 보기(명령 줄):
//   node scripts/render-kkokzip-route.mjs --id 2015122300020357 [--width 390] [--dark] [--shot /tmp/…/map.png]
//   → { id, map_tiles, juso_src_note, served, missing, blocked, console_errors } 한 줄(JSON)
//   (ESM 이라 playwright 를 찾을 자리가 필요하면 NODE_PATH 대신 scripts/node_modules 링크를 임시로: ln -sfn /opt/node-tools/node_modules scripts/node_modules)

import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.gz': 'application/gzip' }
const WRITE_FN = /\/functions\/v1\/(submit-feedback|save-user-profile|delete-account)(\?|$)/

export async function routeKkokzip(target, { origin = 'https://kkokzip.com', root = REPO } = {}) {
  const info = { origin, root, served: 0, missing: [], blocked: 0 }
  const esc = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await target.route(new RegExp('^' + esc + '(/|$)'), route => {
    const u = new URL(route.request().url())
    let p = decodeURIComponent(u.pathname)
    if (p === '/' || p === '') p = '/index.html'
    const f = join(root, p)
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) {
      info.missing.push(p)
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not in branch' })
    }
    info.served++
    return route.fulfill({ status: 200, contentType: TYPES[extname(f)] || 'application/octet-stream', body: readFileSync(f) })
  })
  await target.route(/\/rest\/v1\/usage_events(\?|$)/, r => { info.blocked++; return r.fulfill({ status: 201, body: '' }) })
  await target.route(WRITE_FN, r => { info.blocked++; return r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"render_route_blocked"}' }) })
  return info
}

// ── 명령 줄: 상세 지도 하나를 그려 지도 조각 수를 센다 ──
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const val = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
  const id = val('--id')
  if (!id) { console.error('--id <공고 id> 가 필요하다'); process.exit(2) }
  const width = Number(val('--width') || 390)
  const { chromium } = await import('playwright')
  const { stubListRpc } = await import('./render-list-stub.mjs')
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul',
    colorScheme: argv.includes('--dark') ? 'dark' : 'light' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  const info = await routeKkokzip(page)
  await stubListRpc(page)
  await page.goto(`${info.origin}/?n=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(i => !!document.getElementById('map-' + i) || !!document.querySelector(`[id^="map-"][id*="${i}"]`), id, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(6000)
  const r = await page.evaluate(i => {
    const box = document.getElementById('map-' + i) || document.querySelector(`[id^="map-"][id*="${i}"]`)
    const tiles = box ? [...box.querySelectorAll('img')].filter(im => /daumcdn|kakaocdn|kakao/.test(im.src) && im.complete && im.naturalWidth > 0).length : 0
    const scope = box ? (box.closest('[data-ann-id]') || box.parentElement) : document
    const note = /주소 좌표: 주소정보 관리기관/.test(scope ? scope.textContent : '')
    return { box: !!box, tiles, note }
  }, id)
  const shot = val('--shot')
  if (shot) await page.screenshot({ path: shot, fullPage: false })
  console.log(JSON.stringify({ id, width, map_box: r.box, map_tiles: r.tiles, juso_src_note: r.note, served: info.served, missing: info.missing.slice(0, 10),
    blocked: info.blocked, console_errors: errors.length, errors: errors.slice(0, 3) }))
  await browser.close()
}
