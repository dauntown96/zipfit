// A. 화면 점검 — 배포본이 사실과 같은 말을 하는가. 읽기·알림만 한다.
// 출발점: claude.ai 가 쓰던 Playwright 두 벌(💡 「실사용 점검 회차 정례화」 · 2026-09-29) —
//   ① 카드 문구 점검(공고 탭 전 쪽의 카드 요약 문구) ② 390px 화면 품질(깨진 칩 · 경로 한 줄 첫 날짜).
// 🔴 기대값은 화면 코드가 아니라 DB 에서 **따로** 계산한다(같은 코드로 기대값을 만들면 같은 버그를 함께 통과한다):
//   요약 = get_announcement_price_summary 의 보증금·월세·면적 중 하나라도 있음
//   ④ 링크 = announcement_post_links 의 linked_group_key 제목 키 = 카드 제목 키(LH 행이 있을 때)
//   목록없음 = analysis_done · 링크만 = has_attachments = false · 그 밖 = 미정리
//   (우선순위는 화면 규칙과 같다 — 요약 > ④ > 목록없음 > 링크만 > 미정리)
import { chromium } from 'playwright'
import { sqlRead, report, SITE } from './lib.mjs'

const VIEWPORT = { width: 390, height: 844 }
const MAX_PAGES = 30
// 콘솔 오류 제외 — 카카오맵 SDK(지도만 빠진다).
const CONSOLE_IGNORE = [/dapi\.kakao\.com/, /kakao/i]
const checks = []
const add = (id, name, status, value, rule) => checks.push({ id, name, status, value, rule })
const phraseOf = t =>
  /함께 정리돼 있어요/.test(t) ? '④링크'
  : /세대별 목록이 없어요/.test(t) ? '목록없음'
  : /링크만 제공/.test(t) ? '링크만'
  : /정리하지 못했어요/.test(t) ? '미정리'
  : /(보증금|월세|월 |전용)/.test(t) ? '요약'
  : t.trim() === '' ? '빈칸' : '알수없음'

const consoleErrors = []
const browser = await chromium.launch()
const extra = {}
try {
  const ctx = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
  const page = await ctx.newPage()
  page.on('console', m => {
    if (m.type() !== 'error') return
    const where = (m.location() && m.location().url) || ''
    const text = m.text()
    if (CONSOLE_IGNORE.some(re => re.test(where) || re.test(text))) return
    consoleErrors.push(`${text.slice(0, 160)}${where ? ' @ ' + where.slice(0, 80) : ''}`)
  })
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 160)))

  await page.goto(SITE + '?health=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
  // 공고 탭으로
  await page.evaluate(() => { const b = [...document.querySelectorAll('nav button, [role=tab]')].find(b => b.offsetParent !== null && b.innerText.includes('공고')); b && b.click() })
  await page.waitForTimeout(3000)

  const cards = []           // [aid, 문구 갈래, 문구 앞 60자]
  const brokenChips = []
  const hiddenDates = []
  const overflow = []
  for (let pg = 1; pg <= MAX_PAGES; pg++) {
    if (pg > 1) {
      const ok = await page.evaluate(pg => { const b = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.innerText.trim() === String(pg)); if (!b) return false; b.click(); return true }, pg)
      if (!ok) break
      await page.waitForTimeout(1500)
    }
    // 요약 자리가 채워질 때까지(가격 요약은 늦게 온다) 최대 20초
    await page.waitForFunction(() => [...document.querySelectorAll('.hcard [data-sum-for]')].filter(e => e.offsetParent !== null).every(e => e.innerHTML.trim() !== ''), null, { timeout: 20000 }).catch(() => {})
    const got = await page.evaluate(() => {
      const vis = e => e.offsetParent !== null
      const cardRows = [...document.querySelectorAll('.hcard')].filter(vis).map(c => {
        const s = c.querySelector('[data-sum-for]')
        return s ? [s.getAttribute('data-sum-for'), (s.innerText || '').replace(/\s+/g, ' ').slice(0, 60)] : null
      }).filter(Boolean)
      const chips = [...document.querySelectorAll('.hcard .chip')].filter(vis)
        .filter(e => e.getBoundingClientRect().height > 30 || e.getClientRects().length > 1)
        .map(e => (e.closest('.hcard')?.getAttribute('data-announcement-id') || '?') + ' · ' + e.innerText.replace(/\s+/g, ' ').slice(0, 30))
      const dates = []
      for (const box of [...document.querySelectorAll('.zf-route-line')].filter(vis)) {
        if (box.classList.contains('open')) continue
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
        let node, found = false
        while (!found && (node = walker.nextNode())) {
          const m = /\d{1,2}\/\d{1,2}/.exec(node.textContent)
          if (!m) continue
          found = true
          const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length)
          const a = r.getBoundingClientRect(), b = box.getBoundingClientRect()
          if (a.height === 0 || a.bottom > b.bottom + 1 || a.top < b.top - 1 || a.right > b.right + 1) {
            dates.push((box.closest('.hcard')?.getAttribute('data-announcement-id') || '?') + ' · ' + m[0])
          }
        }
      }
      const sw = document.documentElement.scrollWidth
      return { cardRows, chips, dates, overflow: sw > window.innerWidth + 1 ? sw : 0 }
    })
    for (const [aid, t] of got.cardRows) cards.push([aid, phraseOf(t), t])
    brokenChips.push(...got.chips)
    hiddenDates.push(...got.dates)
    if (got.overflow) overflow.push(`쪽 ${pg}: scrollWidth ${got.overflow}`)
  }
  extra.cards_seen = cards.length

  // ① 카드 문구 ↔ DB
  const ids = [...new Set(cards.map(c => c[0]))]
  if (!ids.length) {
    add('phrase', '카드 문구 ↔ DB 상태', 'fail', '카드 0장', '공고 탭 카드 > 0')
  } else {
    const arr = 'array[' + ids.map(i => `'${String(i).replace(/'/g, "''")}'`).join(',') + ']::text[]'
    const [row] = await sqlRead(`
      with t as (select unnest(${arr}) aid),
      p as (select * from get_announcement_price_summary(${arr}))
      select json_agg(json_build_object('aid', t.aid, 'expected',
        case when p.announcement_id is null then '빈칸'
             when p.deposit_min is not null or p.rent_min is not null or p.area_min is not null then '요약'
             when exists (select 1 from announcement_post_links l
                            join announcements lh on lh.announcement_id = l.lh_announcement_id
                            join announcements a on a.announcement_id = t.aid
                           where l.linked_group_key is not null
                             and announcement_dedup_key(l.linked_group_key) = announcement_dedup_key(a.title)) then '④링크'
             when p.analysis_done then '목록없음'
             when p.has_attachments = false then '링크만'
             else '미정리' end)) j
      from t left join p on p.announcement_id = t.aid`)
    const expected = new Map((row.j || []).map(x => [x.aid, x.expected]))
    if (process.env.SIMULATE === 'fail') expected.set(ids[0], '없는문구(시험)')
    const mism = []
    const counts = {}
    for (const [aid, got, t] of cards) {
      counts[got] = (counts[got] || 0) + 1
      const exp = expected.get(aid)
      if (exp !== got) mism.push(`${aid}: 화면 ${got} ↔ DB ${exp} 「${t}」`)
    }
    extra.phrase_counts = counts
    extra.phrase_mismatch = mism
    add('phrase', '카드 문구 ↔ DB 상태', mism.length === 0 ? 'pass' : 'fail',
      `${cards.length}장 · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}${mism.length ? ` · 어긋남 ${mism.length}: ${mism.slice(0, 3).join(' / ')}` : ''}`,
      '카드마다 화면 문구 갈래 = DB 로 따로 계산한 갈래')
  }
  // ② 390px
  extra.broken_chips = brokenChips; extra.hidden_route_dates = hiddenDates; extra.overflow = overflow
  add('chips', '깨진 칩(높이 > 30px 또는 줄바꿈 조각 2개 이상)', brokenChips.length === 0 ? 'pass' : 'fail', brokenChips.length ? `${brokenChips.length}: ${brokenChips.slice(0, 3).join(' / ')}` : 0, '0(표시층 B 뒤 0)')
  add('route_date', '접힌 경로 줄 첫 날짜가 보이는가', hiddenDates.length === 0 ? 'pass' : 'fail', hiddenDates.length ? `${hiddenDates.length}: ${hiddenDates.slice(0, 3).join(' / ')}` : 0, '가려진 첫 날짜 0')
  add('overflow', '가로 넘침(390px)', overflow.length === 0 ? 'pass' : 'fail', overflow.length ? overflow.join(' / ') : 0, 'scrollWidth ≤ 390')
  await page.screenshot({ path: 'health-screen.png' })
} catch (e) {
  add('runner', '점검 실행', 'fail', String(e).slice(0, 300), '점검 스크립트가 끝까지 돈다')
} finally {
  await browser.close()
}
// ③ 콘솔 오류
extra.console_errors = consoleErrors
add('console', '콘솔 오류(카카오맵 제외)', consoleErrors.length === 0 ? 'pass' : 'fail', consoleErrors.length ? `${consoleErrors.length}: ${consoleErrors.slice(0, 2).join(' / ')}` : 0, '0')

report('screen', 'A. 화면 점검', checks, extra)
