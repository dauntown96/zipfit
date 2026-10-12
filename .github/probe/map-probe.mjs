// 1회용 조사 장치(2026-10-12 · 우편함 「지도·일정·이전 회차 조사」 1) — 병합하지 않는다. 읽기만.
// 배포본(kkokzip.com)을 열어 열린 공고 카드마다 상세를 펼치고, 지도 경로가 실제로 받은 주소·지오코딩 단계·「대략」 문구를 잰다.
// 그리고 같은 공고의 주소 후보(region · precise_address · 세대 주소 · 건물명 · 제목 단지명)를 카카오에 따로 물어 무엇이 정밀하게 맞는지 본다.
import { chromium } from 'playwright'
const log = (o) => console.log('PROBE ' + JSON.stringify(o))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
await ctx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
const page = await ctx.newPage()
const cons = []
page.on('console', m => { const t = m.text(); if (t.includes('[ZipFit geocode]') || t.includes('[ZipFit map]')) cons.push({ at: Date.now(), t: t.slice(0, 300) }) })
await page.goto('https://kkokzip.com/?probe=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
await page.evaluate(() => {
  window.__mapCalls = []
  const orig = window.initMapForHouse
  window.initMapForHouse = function (h, id) { window.__mapCalls.push({ at: Date.now(), id, addr: h && h.addr, approx: !!(h && h.approx), level: (h && h.level) || '' }); return orig.apply(this, arguments) }
  goMain(2)
})
await page.waitForTimeout(3000)
await page.evaluate(() => { noticePageSize = 500; applyNoticeFiltersAndRender(1) })
await page.waitForTimeout(2000)
const cards0 = await page.evaluate(() => [...document.querySelectorAll('#notice-list .hcard[data-card-id]')].map(c => ({ id: c.dataset.cardId, ann: c.dataset.announcementId, title: c.dataset.title, pa: c.dataset.preciseAddress, region: c.dataset.region, sido: c.dataset.sido, sigungu: c.dataset.sigungu, ht: c.dataset.housingType })))
const cards = cards0.slice(0, +process.env.LIMIT || 1e9)
log({ kind: 'cards', n: cards0.length, open: await page.evaluate(() => zfOpenNotices(noticeData).length) })
await page.evaluate(() => loadKakao().then(() => true, e => String(e))).then(r => log({ kind: 'kakao', r }))
for (const c of cards) {
  const t0 = Date.now()
  await page.evaluate(id => { const el = cardElFor(id); toggleDetail(id, el, 'test') }, c.id)
  // 조용해질 때까지(새 지오코딩 줄·지도 호출이 3초 없을 때 · 최대 20초)
  let last = Date.now()
  let seen = 0
  while (Date.now() - t0 < 20000) {
    await page.waitForTimeout(500)
    const n = cons.length + await page.evaluate(() => window.__mapCalls.length)
    if (n !== seen) { seen = n; last = Date.now() }
    if (Date.now() - last > 3000 && Date.now() - t0 > 4000) break
  }
  const st = await page.evaluate(id => {
    const m = document.getElementById('map-' + id)
    const note = m && m.nextElementSibling && m.nextElementSibling.classList.contains('map-approx') ? m.nextElementSibling : null
    const r = note ? note.getBoundingClientRect() : null
    return {
      calls: window.__mapCalls.filter(x => x.id === id).map(x => ({ addr: x.addr, approx: x.approx, level: x.level })),
      drawn: !!(m && m.querySelector('img, canvas, svg')),
      closed: m && m.querySelector('.map-closed') ? m.querySelector('.map-closed').innerText.slice(0, 80) : '',
      approxNote: note ? { hidden: note.hidden, h: r ? Math.round(r.height) : 0, display: getComputedStyle(note).display } : null,
    }
  }, c.id)
  const geo = cons.filter(x => x.at >= t0).map(x => x.t)
  log({ kind: 'card', ...c, ...st, geo })
  await page.evaluate(id => { const el = cardElFor(id); const d = document.getElementById(id); if (d && d.style.display === 'block') toggleDetail(id, el, 'test') }, c.id)
}
// 후보 주소 직접 질의
const anns = [...new Set(cards.map(c => c.ann))]
const cand = await page.evaluate(async (anns) => {
  const q = encodeURIComponent('(' + anns.map(a => '"' + a + '"').join(',') + ')')
  const r = await fetch(`${SUPABASE_URL}/rest/v1/housing_units?select=announcement_id,address,building_name&announcement_id=in.${q}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } })
  const rows = r.ok ? await r.json() : []
  const by = {}
  for (const u of rows) { (by[u.announcement_id] ||= { addr: new Set(), bn: new Set() }); if (u.address) by[u.announcement_id].addr.add(u.address); if (u.building_name) by[u.announcement_id].bn.add(u.building_name) }
  const out = {}
  for (const a of anns) out[a] = { addr: [...(by[a]?.addr || [])].slice(0, 3), bn: [...(by[a]?.bn || [])].slice(0, 2) }
  return { status: r.status, out }
}, anns)
log({ kind: 'hu', status: cand.status })
const geocode = (q) => page.evaluate(q => new Promise(res => {
  const g = new kakao.maps.services.Geocoder()
  g.addressSearch(q, (r, s) => res({ s, n: r ? r.length : 0, type: r && r[0] ? r[0].address_type : '', name: r && r[0] ? r[0].address_name : '', x: r && r[0] ? (+r[0].x).toFixed(5) : '', y: r && r[0] ? (+r[0].y).toFixed(5) : '' }))
}), q)
const keyword = (q) => page.evaluate(q => new Promise(res => {
  const p = new kakao.maps.services.Places()
  p.keywordSearch(q, (r, s) => res({ s, n: r ? r.length : 0, name: r && r[0] ? r[0].place_name : '', addr: r && r[0] ? (r[0].road_address_name || r[0].address_name) : '', cat: r && r[0] ? r[0].category_name : '' }))
}), q)
for (const c of cards) {
  const h = cand.out[c.ann] || { addr: [], bn: [] }
  const qs = []
  if (c.region) qs.push(['region', c.region])
  if (c.pa) qs.push(['precise', c.pa])
  h.addr.forEach((a, i) => qs.push(['unit' + i, a]))
  const res = []
  for (const [k, q] of qs) {
    const a = await geocode(q)
    const g2 = await page.evaluate(q => toGeocodeAddress(stripCommaLotNumbers(q)), q)
    const b = g2 && g2 !== q ? await geocode(g2) : null
    res.push({ k, q, lv1: a, lv2: b ? { q: g2, ...b } : null })
  }
  const kw = []
  for (const b of h.bn) kw.push({ q: b, r: await keyword(b) })
  log({ kind: 'cand', id: c.id, ann: c.ann, res, kw })
}
await browser.close()
