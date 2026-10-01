// A. 화면 점검 — 배포본이 사실과 같은 말을 하는가. 읽기·알림만 한다.
// 출발점: claude.ai 가 쓰던 Playwright 두 벌(💡 「실사용 점검 회차 정례화」 · 2026-09-29) —
//   ① 카드 문구 점검(공고 탭 전 쪽의 카드 요약 문구) ② 390px 화면 품질(깨진 칩 · 경로 한 줄 첫 날짜).
// 🔴 기대값은 화면 코드가 아니라 DB 에서 **따로** 계산한다(같은 코드로 기대값을 만들면 같은 버그를 함께 통과한다):
//   요약 = get_announcement_price_summary 의 보증금·월세·면적 중 하나라도 있음
//   ④ 링크 = announcement_post_links 의 linked_group_key 제목 키 = 카드 제목 키(LH 행이 있을 때)
//   목록없음 = analysis_done · 링크만 = has_attachments = false · 그 밖 = 미정리
//   (우선순위는 화면 규칙과 같다 — 요약 > ④ > 목록없음 > 링크만 > 미정리)
//   공고문 자리(2026-10-01) = 같은 게시물 카드의 「📑 공고문 N개」 줄 — 공고문마다 접수 기간(M/D~M/D)·상태 배지를
//   DB 의 링크 표(announcement_post_links)·공고 행 날짜로 따로 계산해 맞춘다(붙은 카드만 · 오늘 = KST).
import { chromium } from 'playwright'
import { sqlRead, report, SITE } from './lib.mjs'

const VIEWPORT = { width: 390, height: 844 }
const MAX_PAGES = 30
// 콘솔 오류 제외 — 카카오맵 SDK(지도만 빠진다).
const CONSOLE_IGNORE = [/dapi\.kakao\.com/, /kakao/i]
const checks = []
const add = (id, name, status, value, rule) => checks.push({ id, name, status, value, rule })
// 🔴 ④ 링크 문구는 두 갈래다(화면 zfPostLinkHtml) — LH 카드에 요약이 있으면 「함께 정리돼 있어요」, 없으면 「같은 게시물에 올라왔어요」.
//    둘째 갈래를 판정표에 안 둬서 「알수없음」으로 떨어졌다(이슈 #283 · 2026-09-30 대구연호 두 카드). 화면 문구 갈래를 바꾸는 회차는 여기를 같은 PR 에서 고친다.
const phraseOf = t =>
  /함께 정리돼 있어요|같은 게시물에 올라왔어요/.test(t) ? '④링크'
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
  const notices = []         // [aid, 공고문 제목 전문, 화면 접수 기간, 화면 상태]
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
    // 공고문 자리는 같은 게시물 공고문 로드(zfPostNotices) 뒤에 채워진다
    await page.waitForFunction(() => typeof zfPostNotices === 'undefined' || zfPostNotices.loaded, null, { timeout: 20000 }).catch(() => {})
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
      // 공고문 자리 — 이름 칸(title 속성 = 공고문 제목 전문)마다 같은 줄(.zf-nt-line)의 기간·상태 배지. 한 줄 모양이면 상자 하나가 줄이다.
      const nts = []
      for (const slot of [...document.querySelectorAll('.hcard .zf-notices-slot')].filter(vis)) {
        if (!slot.innerHTML.trim()) continue
        for (const nm of slot.querySelectorAll('span[title]')) {
          const line = nm.closest('.zf-nt-line') || slot
          const sp = line.querySelector('.zf-nt-span'), st = line.querySelector('.zf-nt-state')
          nts.push([slot.getAttribute('data-notices-for'), nm.getAttribute('title'),
            sp ? sp.innerText.replace(/^접수\s*/, '').trim() : '(없음)', st ? st.innerText.trim() : '(없음)'])
        }
      }
      return { cardRows, chips, dates, nts, overflow: sw > window.innerWidth + 1 ? sw : 0 }
    })
    for (const [aid, t] of got.cardRows) cards.push([aid, phraseOf(t), t])
    notices.push(...got.nts)
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
  // ①-2 공고문 자리 ↔ DB (2026-10-01) — 화면 코드를 쓰지 않고 SQL 로 따로 계산한다.
  //   공고문 = 링크 표로 이 LH 카드에 붙은 MYHOME 행을 제목 키로 묶은 것(한 MYHOME 행이 LH 둘에 걸리면 id 가 작은 LH) —
  //   기간 = 묶음의 가장 이른 시작 ~ 가장 늦은 마감 · 상태 = LH 가 게시물을 「…마감」이라 했으면 마감, 아니면 당첨발표일·날짜.
  //   LH 자기 공고문(제목 키 = 카드 제목 키) = 카드 행(목록 RPC)의 날짜·상태.
  extra.notices_seen = notices.length
  if (!notices.length) {
    add('notices', '공고문 자리 ↔ DB 날짜', 'skip', '공고문 자리가 선 카드 0', '붙은 카드만 대조')
  } else {
    const lit = v => `'${String(v).replace(/'/g, "''")}'`
    // 날짜를 옮긴 대조(SIMULATE=notice) — 기대값의 마감일을 하루 미룬다(운영 DB 는 그대로 · 읽기 전용 SQL 안에서만)
    const shift = process.env.SIMULATE === 'notice' ? 1 : 0
    const [row] = await sqlRead(`
      with t(aid, title) as (select * from unnest(array[${notices.map(n => lit(n[0])).join(',')}]::text[], array[${notices.map(n => lit(n[1])).join(',')}]::text[])),
      today as (select (now() at time zone 'Asia/Seoul')::date d),
      lnk as (select distinct on (l.linked_announcement_id) l.linked_announcement_id mid, l.lh_announcement_id lh
                from announcement_post_links l join announcements lh on lh.announcement_id = l.lh_announcement_id
               where lh.title is not null and lh.hidden_from_listing is not true
               order by l.linked_announcement_id, l.lh_announcement_id),
      card as (select d.* from get_announcements_deduped() d where d.announcement_id in (select aid from t)),
      grp as (
        select t.aid, t.title,
          min(m.apply_start) s, max(m.apply_end) e, max(m.winner_announce_date) w, count(m.*) n
        from t join lnk on lnk.lh = t.aid
        join announcements m on m.announcement_id = lnk.mid and m.title is not null and m.hidden_from_listing is not true
         and announcement_dedup_key(m.title) = announcement_dedup_key(t.title)
        group by t.aid, t.title),
      exp as (
        select t.aid, t.title, c.source, c.status,
          case when coalesce(g.n, 0) > 0 then g.s when announcement_dedup_key(c.title) = announcement_dedup_key(t.title) then c.apply_start end s,
          case when coalesce(g.n, 0) > 0 then g.e + ${shift} when announcement_dedup_key(c.title) = announcement_dedup_key(t.title) then c.apply_end + ${shift} end e,
          case when coalesce(g.n, 0) > 0 then g.w when announcement_dedup_key(c.title) = announcement_dedup_key(t.title) then c.winner_announce_date end w,
          (coalesce(g.n, 0) > 0) linked, (c.announcement_id is not null and (coalesce(g.n, 0) > 0 or announcement_dedup_key(c.title) = announcement_dedup_key(t.title))) known
        from t left join card c on c.announcement_id = t.aid left join grp g on g.aid = t.aid and g.title = t.title),
      st as (
        select e.*, (select d from today) td,
          case when not e.known then '?'
               when e.linked and e.source = 'LH' and btrim(coalesce(e.status, '')) ~ '마감$' then 'closed'
               when e.w is not null and e.w < (select d from today) then 'closed'
               when not e.linked and e.source = 'LH' and btrim(coalesce(e.status, '')) ~ '마감$' then 'closed'
               when e.s is null or e.e is null then 'unknown'
               when e.s > (select d from today) then 'before'
               when e.e < (select d from today) then 'closed'
               else 'open' end k
        from exp e)
      select json_agg(json_build_object('aid', aid, 'title', title, 'known', known,
        'span', case when s is null and e is null then ''
                     when s is null or e is null or s = e then to_char(coalesce(s, e), 'FMMM/FMDD')
                     else to_char(s, 'FMMM/FMDD') || '~' || to_char(e, 'FMMM/FMDD') end,
        'state', case k when 'open' then case when e = td then '오늘 마감' else '접수 중' end
                        when 'before' then '접수 예정' when 'closed' then '마감' when 'unknown' then '기간 미상' else '?' end)) j
      from st`)
    const expN = new Map((row.j || []).map(x => [x.aid + '\u0000' + x.title, x]))
    const nm = []
    for (const [aid, title, span, state] of notices) {
      const x = expN.get(aid + '\u0000' + title)
      if (!x || !x.known) { nm.push(`${aid}: 「${String(title).slice(0, 30)}」 DB 에서 공고문을 못 찾음`); continue }
      if (x.span !== span || x.state !== state) nm.push(`${aid}: 「${String(title).slice(0, 30)}」 화면 ${span} ${state} ↔ DB ${x.span} ${x.state}`)
    }
    extra.notices_mismatch = nm
    add('notices', '공고문 자리 ↔ DB 날짜', nm.length === 0 ? 'pass' : 'fail',
      `${new Set(notices.map(n => n[0])).size}장 · 공고문 ${notices.length}${nm.length ? ` · 어긋남 ${nm.length}: ${nm.slice(0, 3).join(' / ')}` : ''}`,
      '공고문마다 화면 기간·상태 = 링크 표·공고 행 날짜로 따로 계산한 값')
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
