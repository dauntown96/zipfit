// 1회용 검증 장치(2026-10-12 · 우편함 「코드 — 지도 위치 고침」) — 병합하지 않는다 · 읽기만.
// 같은 실행에서 ① 배포본 kkokzip.com(전) ② 이 가지의 index.html 을 kkokzip.com 주소로 바꿔 넣은 것(후)을 열고,
// 열린 공고 카드마다 상세를 펼쳐(블록 카드는 단지를 하나씩 펼쳐) 지도의 끝 상태를 잡는다 — 중심 좌표 · 표지/원 · 대략 문구 · 닫힘 문구 · 카카오 호출 수.
import fs from 'fs'
import { chromium } from 'playwright'
const log = (o) => console.log('FIX ' + JSON.stringify(o))
const NEW_HTML = fs.readFileSync('index.html', 'utf8')
const b = await chromium.launch()
async function run (mode, d3) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
  await ctx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
  if (mode === 'after') await ctx.route(/^https:\/\/kkokzip\.com\/(\?.*)?$/, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: NEW_HTML }))
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
  await p.goto('https://kkokzip.com/?' + (d3 ? 'ui=d3&' : '') + 'fix=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
  await p.evaluate(() => loadKakao())
  await p.evaluate(() => {
    window.__k = { calls: 0, pend: 0, last: Date.now() }
    const wrap = (proto, name) => { const o = proto[name]; proto[name] = function (q, cb, opt) { __k.calls++; __k.pend++; __k.last = Date.now(); return o.call(this, q, function () { __k.pend--; __k.last = Date.now(); return cb.apply(this, arguments) }, opt) } }
    wrap(kakao.maps.services.Geocoder.prototype, 'addressSearch')
    wrap(kakao.maps.services.Places.prototype, 'keywordSearch')
    const o = window.initMapForHouse; window.initMapForHouse = function () { __k.last = Date.now(); return o.apply(this, arguments) }
    goMain(2)
  })
  await p.waitForTimeout(2500)
  await p.evaluate(() => { noticePageSize = 500; applyNoticeFiltersAndRender(1) })
  await p.waitForTimeout(1500)
  const cards = await p.evaluate(() => [...document.querySelectorAll('#notice-list [data-card-id]')].filter(c => c.dataset.announcementId).map(c => ({ id: c.dataset.cardId, ann: c.dataset.announcementId })))
  const settle = async (t0) => {
    while (Date.now() - t0 < 30000) {
      await p.waitForTimeout(500)
      const k = await p.evaluate(() => ({ pend: __k.pend, idle: Date.now() - __k.last }))
      if (k.pend === 0 && k.idle > 3500 && Date.now() - t0 > 6000) return
    }
  }
  const state = (id) => p.evaluate(id => {
    const m = document.getElementById('map-' + id); const st = huMapState[id]
    const note = m && m.nextElementSibling && m.nextElementSibling.classList.contains('map-approx') ? m.nextElementSibling : null
    const drawn = !!(st && st.el === m)
    const c = drawn ? st.map.getCenter() : null
    const lbl = m ? m.querySelector('.zf3-maplbl') : null
    return { drawn, lat: c ? +c.getLat().toFixed(6) : null, lng: c ? +c.getLng().toFixed(6) : null,
      marker: drawn ? !!st.marker.getMap() : null, circle: drawn ? !!(st.circle && st.circle.getMap()) : null, level: drawn ? st.map.getLevel() : null,
      note: note && !note.hidden ? note.textContent.slice(0, 40) : '', closed: m && m.querySelector('.map-closed') ? m.querySelector('.map-closed').innerText.replace(/\s+/g, ' ').slice(0, 120) : '',
      label: lbl ? lbl.textContent : '', area: m ? [...m.querySelectorAll('area')].map(a => a.getAttribute('title') || a.getAttribute('alt')).join('|') : '' }
  }, id)
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null
  for (const c of cards) {
    if (only && !only.some(x => c.ann.endsWith(x))) continue
    const n0 = await p.evaluate(() => __k.calls)
    let t0 = Date.now()
    await p.evaluate(id => toggleDetail(id, cardElFor(id), 'test'), c.id)
    await settle(t0)
    const out = { mode, d3, ann: c.ann, open: await state(c.id) }
    const nb = await p.evaluate(id => document.querySelectorAll(`[id^="blk-group-head-${id}-"]`).length, c.id)
    out.blocks = []
    for (let i = 0; i < nb; i++) {
      t0 = Date.now()
      await p.evaluate(([id, i]) => toggleBlockGroup(id, i), [c.id, i])
      await settle(t0)
      out.blocks.push(await state(c.id))
      await p.evaluate(([id, i]) => toggleBlockGroup(id, i), [c.id, i])
    }
    out.kcalls = await p.evaluate(() => __k.calls) - n0
    log(out)
    await p.evaluate(id => { const d = document.getElementById(id); if (d && d.style.display === 'block') toggleDetail(id, cardElFor(id), 'test') }, c.id)
  }
  log({ mode, d3, kind: 'errors', n: errs.length, errs: [...new Set(errs)].slice(0, 8) })
  await ctx.close()
}
await run('before', false)
await run('after', false)
process.env.ONLY = '20727,20768,20770,사하구,20878,20895'
await run('before', true)
await run('after', true)
await b.close()
