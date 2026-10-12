// 1회용 검증 장치(3차 · 2026-10-12 · 우편함 「코드 — 지도 위치 고침」) — 병합하지 않는다 · 읽기만.
// 이 가지의 index.html 을 kkokzip.com 주소로 바꿔 넣고 ① 열린 카드마다 「후보(」 지오코딩 줄과 카카오 호출 수 ② 대략 핀 그리기 시험(정밀 카드에 강제로).
import fs from 'fs'
import { chromium } from 'playwright'
const log = (o) => console.log('FIX3 ' + JSON.stringify(o))
const NEW_HTML = fs.readFileSync('index.html', 'utf8')
const b = await chromium.launch()
async function open (d3) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
  await ctx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
  await ctx.route(/^https:\/\/kkokzip\.com\/(\?.*)?$/, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: NEW_HTML }))
  const p = await ctx.newPage()
  const lines = []; const errs = []
  p.on('console', m => { const t = m.text(); if (t.includes('[ZipFit geocode]')) lines.push({ at: Date.now(), t: t.slice(0, 200) }); if (m.type() === 'error') errs.push(t.slice(0, 160)) })
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  await p.goto('https://kkokzip.com/?' + (d3 ? 'ui=d3&' : '') + 'fix3=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
  await p.evaluate(() => loadKakao())
  await p.evaluate(() => {
    window.__k = { calls: 0, pend: 0, last: Date.now() }
    const S = kakao.maps.services
    const wrapCtor = (name, meth) => { const C = S[name]; S[name] = function () { const o = new C(...arguments); const f = o[meth].bind(o); o[meth] = (q, cb, opt) => { __k.calls++; __k.pend++; __k.last = Date.now(); return f(q, function () { __k.pend--; __k.last = Date.now(); return cb.apply(this, arguments) }, opt) }; return o }; S[name].prototype = C.prototype }
    wrapCtor('Geocoder', 'addressSearch'); wrapCtor('Places', 'keywordSearch')
    const o = window.initMapForHouse; window.initMapForHouse = function () { __k.last = Date.now(); return o.apply(this, arguments) }
    goMain(2)
  })
  await p.waitForTimeout(2500)
  await p.evaluate(() => { noticePageSize = 500; applyNoticeFiltersAndRender(1) })
  await p.waitForTimeout(1500)
  return { ctx, p, lines, errs }
}
const settle = async (p, t0) => { while (Date.now() - t0 < 30000) { await p.waitForTimeout(500); const k = await p.evaluate(() => ({ pend: __k.pend, idle: Date.now() - __k.last })); if (k.pend === 0 && k.idle > 3500 && Date.now() - t0 > 6000) return } }
const state = (p, id) => p.evaluate(id => {
  const m = document.getElementById('map-' + id); const st = huMapState[id]
  const note = m && m.nextElementSibling && m.nextElementSibling.classList.contains('map-approx') ? m.nextElementSibling : null
  const drawn = !!(st && st.el === m); const c = drawn ? st.map.getCenter() : null
  const lbl = m ? m.querySelector('.zf3-maplbl') : null
  return { drawn, lat: c ? +c.getLat().toFixed(6) : null, lng: c ? +c.getLng().toFixed(6) : null, marker: drawn ? !!st.marker.getMap() : null, circle: drawn ? !!(st.circle && st.circle.getMap()) : null, level: drawn ? st.map.getLevel() : null,
    note: note && !note.hidden ? note.textContent : '', label: lbl ? lbl.textContent : '' }
}, id)
// ① 호출 수 · 후보 줄(기본 화면)
{
  const { ctx, p, lines, errs } = await open(false)
  const cards = await p.evaluate(() => [...document.querySelectorAll('#notice-list [data-card-id]')].filter(c => c.dataset.announcementId).map(c => ({ id: c.dataset.cardId, ann: c.dataset.announcementId })))
  for (const c of cards) {
    const n0 = await p.evaluate(() => __k.calls); const t0 = Date.now(); const l0 = lines.length
    await p.evaluate(id => toggleDetail(id, cardElFor(id), 'test'), c.id)
    await settle(p, t0)
    const cand = lines.slice(l0).filter(x => x.t.includes('후보(')).map(x => x.t.replace('[ZipFit geocode] ', ''))
    log({ kind: 'calls', ann: c.ann, kcalls: await p.evaluate(() => __k.calls) - n0, cand })
    await p.evaluate(id => { const d = document.getElementById(id); if (d && d.style.display === 'block') toggleDetail(id, cardElFor(id), 'test') }, c.id)
  }
  log({ kind: 'errors', n: errs.length, errs: [...new Set(errs)].slice(0, 8) })
  await ctx.close()
}
// ② 대략 핀 그리기 시험 — 정밀 카드(익산부송3 …20895)에 강제로
for (const d3 of [false, true]) {
  const { ctx, p, errs } = await open(d3)
  const id = await p.evaluate(() => { const c = document.querySelector('#notice-list [data-announcement-id="2015122300020895"]'); return c.dataset.cardId })
  let t0 = Date.now(); await p.evaluate(id => toggleDetail(id, cardElFor(id), 'test'), id); await settle(p, t0)
  log({ kind: 'shape', d3, step: '처음(정밀)', ...(await state(p, id)) })
  await p.evaluate(() => { window.zfMapAltCandidates = () => ({ addrs: [], names: [], sigungu: '' }) })
  t0 = Date.now(); await p.evaluate(id => initMapForHouse({ addr: '전북특별자치도 익산시 없는길 99999', name: '시험단지' }, id), id); await settle(p, t0)
  log({ kind: 'shape', d3, step: '못 찾음(Lv3)', ...(await state(p, id)) })
  t0 = Date.now(); await p.evaluate(id => initMapForHouse({ addr: '전북특별자치도 익산시 무왕로22길 28', name: '익산부송3' }, id), id); await settle(p, t0)
  log({ kind: 'shape', d3, step: '정밀로 되돌림', ...(await state(p, id)) })
  t0 = Date.now(); await p.evaluate(id => initMapForHouse({ addr: '전북특별자치도 익산시', name: '시험단지', approx: true, level: 'sigungu' }, id), id); await settle(p, t0)
  log({ kind: 'shape', d3, step: '폴백(시·구뿐)', ...(await state(p, id)) })
  log({ kind: 'errors', d3, n: errs.length, errs: [...new Set(errs)].slice(0, 8) })
  await ctx.close()
}
await b.close()
