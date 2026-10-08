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

// 고정 글자 속 지난 날짜(⑤) — page.evaluate 로 넘긴다(브라우저 안에서 돈다 · 바깥 변수를 쓰지 않는다).
const STALE_DATE_FN = () => {
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  const today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())
  const zones = [...document.querySelectorAll('.hero, .maintabs, .zf-footer')].filter(e => e.offsetParent !== null || e.getClientRects().length)
  const out = []
  for (const z of zones) {
    for (const line of (z.innerText || '').split('\n')) {
      const ym = /(20\d{2})\s*년/.exec(line)
      const year = ym ? +ym[1] : kst.getUTCFullYear()
      const ds = []
      const full = /(20\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/g
      let m, rest = line
      while ((m = full.exec(line))) ds.push(Date.UTC(+m[1], +m[2] - 1, +m[3]))
      rest = line.replace(full, ' ')
      const md = /(?<![\d.])(\d{1,2})\s*(?:월\s*(\d{1,2})\s*일|[.\/](\d{1,2}))(?![\d])/g
      while ((m = md.exec(rest))) {
        const mo = +m[1], d = +(m[2] || m[3])
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ds.push(Date.UTC(year, mo - 1, d))
      }
      if (ds.length && Math.max(...ds) < today) out.push(line.trim().slice(0, 60))
    }
  }
  return out
}

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
        return s ? [s.getAttribute('data-sum-for'), (s.innerText || '').replace(/\s+/g, ' ')] : null   // 전문 — 자르기는 아래 결과 표 보이기용만(#360)
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
    // 🔴 갈래는 자르기 전 전문으로 정한다(이슈 #360 · 2026-10-07) — 60자로 자른 뒤 판정하면 긴 ④ 링크 문구
    //    (「…[정정공고] … 공고에 함께 정리돼 있어요 →」 65자)의 「있어요」가 잘려 「알수없음」으로 떨어졌다. 60자는 결과 표에 보일 때만.
    for (const [aid, t] of got.cardRows) cards.push([aid, phraseOf(t), t.slice(0, 60)])
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
  // ④ 보이는 글자에 옛 서비스명 0(2026-10-06 · 우편함 「코드 — Z-1 …」 PR-A A4 · 이름 규칙 — 사용자에게 보이는 곳 = 「꼭집」).
  //    body.innerText(화면에 그려진 글자만 · 숨은 요소·주석·콘솔 제외) 안의 「ZipFit」(대소문자 그대로)을 센다 — 지금 열린 쪽 기준.
  //    SIMULATE=zipfit 이면 보이는 글자 하나를 넣고 센다(알림 경로 시험 — 실패해야 맞다).
  if (process.env.SIMULATE === 'zipfit') await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'ZipFit(시험)'; document.body.prepend(p) })
  const oldName = await page.evaluate(() => (document.body.innerText.match(/ZipFit/g) || []).length)
  add('old_name', '보이는 글자에 「ZipFit」', oldName === 0 ? 'pass' : 'fail', oldName, '0(body.innerText · 대소문자 그대로 — 이름 규칙: 보이는 곳은 「꼭집」)')
  // ⑨-2 깨진 객체 글자(2026-10-08 · 우편함 「표시층 긴급 2」 1) — 부산문현2 …20806 상세 자격 절에 「공급대상 | 갈래 | [object Object]」가 나갔다.
  //    ⓐ 지금 보이는 글자(body.innerText) ⓑ 자격 행 verification_requirements 전부(anon REST)를 화면과 같은 함수(zfEligVrEntries ·
  //    prettifyEligKey · renderEligValue)로 그린 글자 — 카드 상세를 펼치지 않아도 상세 자격 절의 글자를 잰다. 둘 다 0이어야 통과.
  //    SIMULATE=objobj 이면 보이는 자리에 그 글자를 넣고 잰다(실패해야 맞다).
  if (process.env.SIMULATE === 'objobj') await page.evaluate(() => { const p = document.createElement('p'); p.textContent = '[object Object]'; document.body.prepend(p) })
  const objVisible = await page.evaluate(() => (document.body.innerText.match(/\[object Object\]/g) || []).length)
  const objRender = await page.evaluate(async () => {
    if (typeof zfEligVrEntries !== 'function' || typeof renderEligValue !== 'function') return { err: '화면 함수 없음' }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/eligibility_criteria?select=id,announcement_id,verification_requirements&verification_requirements=not.is.null&limit=10000`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } })
    if (!r.ok) return { err: `REST ${r.status}` }
    const rows = await r.json(), bad = []
    for (const x of rows) {
      const d = document.createElement('div')
      d.innerHTML = zfEligVrEntries(x.verification_requirements).map(([k, v]) => `<span>${prettifyEligKey(k)}</span>${renderEligValue(v)}`).join('')
      if (/\[object Object\]/.test(d.textContent)) bad.push(x.announcement_id || x.id)
    }
    return { n: rows.length, bad }
  })
  {
    const bad = objRender.bad || []
    const ok = objVisible === 0 && !objRender.err && bad.length === 0
    add('obj_text', '보이는 글자·자격 행 렌더 속 「[object Object]」', ok ? 'pass' : 'fail',
      objRender.err ? `보이는 ${objVisible} · 자격 행 렌더 못 잼(${objRender.err})` : `보이는 ${objVisible} · 자격 행 ${objRender.n}개 중 ${bad.length}${bad.length ? ': ' + [...new Set(bad)].slice(0, 5).join(', ') : ''}`,
      '0 — body.innerText · 자격 행 verification_requirements 전부를 화면 함수로 그린 글자')
  }
  // ⑤ 고정 글자 속 지난 날짜(2026-10-07 · 우편함 「코드 — Z-2 …」 ③ 6 · 첫 화면 히어로에 석 달 지난 「경기북부 2차 공고 · 신청기간 6.30~7.2」가 하드코딩된 채 보였다).
  //    히어로·메인 탭·푸터(데이터가 아니라 손으로 적는 글자)의 줄마다 날짜를 찾아 가장 늦은 날짜가 오늘(KST)보다 과거면 실패.
  //    날짜 꼴: 2026-07-02 · 2026.7.2 · 7월 2일 · 6.30 · 7/2(연도가 없으면 그 줄의 「YYYY년」 · 없으면 올해). 카드 안 날짜는 보지 않는다(마감 공고는 과거가 정상).
  //    SIMULATE=stale_date 이면 옛 배지 글자를 히어로에 넣고 잰다(실패해야 맞다).
  if (process.env.SIMULATE === 'stale_date') await page.evaluate(() => { const h = document.querySelector('.hero') || document.body; const b = document.createElement('span'); b.className = 'badge'; b.textContent = '📢 2026년 경기북부 2차 공고 · 신청기간 6.30~7.2'; h.appendChild(b) })
  const staleDates = await page.evaluate(STALE_DATE_FN)
  extra.stale_dates = staleDates
  add('stale_date', '고정 글자(히어로·메인 탭·푸터) 속 지난 날짜', staleDates.length === 0 ? 'pass' : 'fail', staleDates.length ? `${staleDates.length}: ${staleDates.slice(0, 3).join(' / ')}` : 0, '0 — 줄마다 가장 늦은 날짜 ≥ 오늘(KST)')
  await page.screenshot({ path: 'health-screen.png' })
  // ⑥ 매칭 2단계 — 공급 대상이 달라 뺀 공고(2026-10-08 · 우편함 「표시층 — 추천 매칭 2단계」 · 원칙 33).
  //    시험 사용자 (가)(미혼 · 자녀 0 · 1인 · 1996년생 · 소득 250 · 자산 9,000 · 무주택 · 청약통장)로 진단 → 매칭을 돌리고
  //    ⓐ 뺀 공고마다 DB 에서 **따로** 같은 판정을 SQL 로 계산한다 — 카드 자신의 자격 행이 모두 공급대상 키(객체)를 갖고
  //       모든 행의 모든 갈래가 이 입력으로 「아님」이어야 한다(확인필요 갈래 · 모르는 대상은 아님이 아니다). 하나라도 어긋나면 실패 = 근거 없이 뺐다.
  //    ⓑ 매칭 표시 문구는 네 갈래(맞음 · 확인필요 · 유형 기준 없음 · 👥 상자 제목) 중 하나여야 하고, 상자 수 = 뺀 공고 수.
  //    SIMULATE=target_out 이면 키 없는 남은 카드 하나를 뺀 목록에 끼워 넣는다(실패해야 맞다).
  const tgt = await page.evaluate(async sim => {
    if (typeof diagnose !== 'function' || typeof matchHouses !== 'function') return { err: '화면 함수 없음' }
    goMain(1)
    const u = { marital: 'single', children: '0', members: '1', income: '250', assets: '9000', owned: 'no', hasSavings: 'yes', birthYear: '1996' }
    for (const [k, v] of Object.entries(u)) { const el = document.getElementById(k); if (el) el.value = v }
    await diagnose(); await matchHouses()
    if (typeof lastTargetOut === 'undefined') return { err: 'lastTargetOut 없음' }
    if (sim) { const r = lastFiltered.find(x => !x._zfTarget); if (r) { lastTargetOut.push({ id: r.announcement_id, title: r.title, v: { names: ['시험'] } }); renderMatchResults(lastFiltered) } }
    const root = document.getElementById('match-result')
    const lines = [...root.querySelectorAll('.zf-target-ok, .zf-check-note')].map(e => e.textContent.replace(/\s+/g, ' ').trim())
    const box = root.querySelector('details.zf-target-out > summary')
    return { out: lastTargetOut.map(x => String(x.id)), lines, box: box ? box.textContent.replace(/\s+/g, ' ').trim() : null, year: new Date().getFullYear() }
  }, process.env.SIMULATE === 'target_out')
  {
    const PH = [
      /^👥 .+ 대상 모집 — 입력하신 정보로는 대상 조건에 맞아요$/,
      /^📄 이 공고는 .+ 대상 모집이에요( \(.+\))? — 신청할 수 있는지 공고문에서 확인해 주세요$/,
      /^📄 자격 진단에 이 유형\(.+\) 기준이 없어요 — 신청할 수 있는지 공고문에서 확인해 주세요$/,
    ]
    let ok = !tgt.err, value = '', bad = []
    if (!tgt.err) {
      const unknown = tgt.lines.filter(l => !PH.some(re => re.test(l)))
      const boxOk = tgt.out.length === 0 ? tgt.box === null : tgt.box === `👥 공급 대상이 달라 뺀 공고 ${tgt.out.length}`
      if (tgt.out.length) {
        const ids = tgt.out.map(i => `'${i.replace(/'/g, "''")}'`).join(',')
        const by = 1996, y = tgt.year
        const rows = await sqlRead(`
          with ids(aid) as (select unnest(array[${ids}]::text[])),
          r as (select i.aid, e.id, e.verification_requirements->'공급대상' g
                  from ids i left join public.eligibility_criteria e on e.announcement_id = i.aid),
          b as (select r.aid, r.id, x.b from r left join lateral jsonb_array_elements(
                  case when jsonb_typeof(r.g) = 'object' and jsonb_typeof(r.g->'갈래') = 'array' then r.g->'갈래' else '[]'::jsonb end) x(b) on true),
          bs as (select aid, id, b,
                  (b is not null and not (b ? '확인필요') and (
                    (b->>'대상' = '다자녀' and coalesce((b->'조건'->>'미성년자녀_최소')::int, 0) > 0)
                    or b->>'대상' in ('신혼·신생아', '한부모')
                    or (b->>'대상' in ('고령자', '청년') and ((b->'조건') ? '나이_최소' or (b->'조건') ? '나이_최대')
                        and (${y} - ${by} < coalesce((b->'조건'->>'나이_최소')::int, -999) or ${y} - ${by} - 1 > coalesce((b->'조건'->>'나이_최대')::int, 999)))
                  )) as no
                from b),
          rs as (select aid, id, count(b) nb, bool_and(no) all_no from bs group by aid, id)
          select i.aid,
                 (select count(*) from r where r.aid = i.aid and r.id is not null) n_rows,
                 (select count(*) from r where r.aid = i.aid and jsonb_typeof(r.g) = 'object') n_key,
                 (select count(*) from rs where rs.aid = i.aid and rs.id is not null and rs.nb > 0 and rs.all_no) n_no
          from ids i`)
        bad = rows.filter(x => !(Number(x.n_rows) > 0 && Number(x.n_rows) === Number(x.n_key) && Number(x.n_key) === Number(x.n_no))).map(x => x.aid)
      }
      ok = bad.length === 0 && unknown.length === 0 && boxOk
      value = `뺀 ${tgt.out.length} · 근거 없음 ${bad.length}${bad.length ? ': ' + bad.slice(0, 5).join(', ') : ''} · 문구 ${tgt.lines.length}줄 중 모르는 갈래 ${unknown.length}${unknown.length ? ': ' + unknown.slice(0, 2).join(' / ') : ''} · 상자 ${boxOk ? '맞음' : '어긋남(' + (tgt.box || '없음') + ')'}`
      extra.target_out = { out: tgt.out, bad, unknown }
    } else value = `못 잼(${tgt.err})`
    add('target_out', '매칭 2단계 — 공급 대상이 달라 뺀 공고 근거 · 표시 문구 갈래', ok ? 'pass' : 'fail', value,
      '시험 사용자 (가) — 뺀 공고 전부 DB 로 따로 계산한 「모든 행 키 · 모든 갈래 아님」 · 문구 네 갈래 · 상자 수 = 뺀 수')
  }
} catch (e) {
  add('runner', '점검 실행', 'fail', String(e).slice(0, 300), '점검 스크립트가 끝까지 돈다')
} finally {
  await browser.close()
}
// ③ 콘솔 오류
extra.console_errors = consoleErrors
add('console', '콘솔 오류(카카오맵 제외)', consoleErrors.length === 0 ? 'pass' : 'fail', consoleErrors.length ? `${consoleErrors.length}: ${consoleErrors.slice(0, 2).join(' / ')}` : 0, '0')

report('screen', 'A. 화면 점검', checks, extra)
