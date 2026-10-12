// 1회용 조사 2차(2026-10-12) — 블록 카드는 단지를 펼쳐야 지도가 불린다 · 늦게 오는 세대 행(…20841)은 오래 기다린다. 읽기만.
import { chromium } from 'playwright'
const log = (o) => console.log('PROBE2 ' + JSON.stringify(o))
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block', locale:'ko-KR', timezoneId:'Asia/Seoul' })
await ctx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
const p = await ctx.newPage(); const cons = []
p.on('console', m => { const t = m.text(); if (t.includes('[ZipFit geocode]') || t.includes('[ZipFit map]')) cons.push({ at: Date.now(), t: t.slice(0, 300) }) })
await p.goto('https://kkokzip.com/?probe2='+Date.now(), { waitUntil:'networkidle', timeout:90000 })
await p.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
await p.evaluate(() => { window.__c=[]; const o=window.initMapForHouse; window.initMapForHouse=function(h,id){window.__c.push({id,addr:h&&h.addr,approx:!!(h&&h.approx)});return o.apply(this,arguments)}; goMain(2) })
await p.waitForTimeout(2500); await p.evaluate(() => { noticePageSize = 500; applyNoticeFiltersAndRender(1) }); await p.waitForTimeout(1500)
const state = (id) => p.evaluate(id => { const m=document.getElementById('map-'+id); const n=m&&m.nextElementSibling&&m.nextElementSibling.classList.contains('map-approx')?m.nextElementSibling:null; return { box: m? (m.querySelector('img,canvas,svg')?'(지도)':m.innerText.slice(0,80)) : '(없음)', approx: n? !n.hidden : false } }, id)
for (const a of ['2015122300020878','2015122300020726','2015122300020841']) {
  const id = await p.evaluate(a => { const c=document.querySelector(`.hcard[data-announcement-id="${a}"]`); toggleDetail(c.dataset.cardId,c,'test'); return c.dataset.cardId }, a)
  let t0 = Date.now(); await p.waitForTimeout(25000)
  log({ ann: a, step: 'open', calls: await p.evaluate(id => window.__c.filter(x=>x.id===id), id), geo: cons.filter(x=>x.at>=t0).map(x=>x.t), ...(await state(id)) })
  const nb = await p.evaluate(id => document.querySelectorAll(`[id^="blk-group-head-${id}-"]`).length, id)
  for (let i = 0; i < nb; i++) {
    t0 = Date.now(); const n0 = await p.evaluate(() => window.__c.length)
    await p.evaluate(([id,i]) => toggleBlockGroup(id, i), [id,i]); await p.waitForTimeout(12000)
    log({ ann: a, step: 'block'+i, head: await p.evaluate(([id,i]) => (document.getElementById(`blk-group-head-${id}-${i}`)||{}).innerText?.slice(0,60), [id,i]), calls: await p.evaluate(n0 => window.__c.slice(n0), n0), geo: cons.filter(x=>x.at>=t0).map(x=>x.t), ...(await state(id)) })
    await p.evaluate(([id,i]) => toggleBlockGroup(id, i), [id,i])
  }
}
await b.close()
