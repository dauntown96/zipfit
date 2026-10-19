// A. 화면 점검 — 배포본이 사실과 같은 말을 하는가. 읽기·알림만 한다.
//   예외 하나(2026-10-18): 끝에 실행 요약을 public.ops_health_record(jsonb · kind=screen)로 DB 한 줄 남긴다(⑫ · 운영 점검과 같은 함수).
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
import { sqlRead, report, recordFindings, SITE } from './lib.mjs'
import { readFileSync } from 'node:fs'

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
  : /공고 원문을 정리하고 있어요/.test(t) ? '분석중'   // 2026-10-16 — 분석 전 카드(zfAnaPending)
  : /정리하지 못했어요/.test(t) ? '미정리'
  : /(보증금|월세|월 |전용)/.test(t) ? '요약'
  : t.trim() === '' ? '빈칸' : '알수없음'

// 고정 글자 속 지난 날짜(⑤) — page.evaluate 로 넘긴다(브라우저 안에서 돈다 · 바깥 변수를 쓰지 않는다).
const STALE_DATE_FN = () => {
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  const today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())
  const zones = [...document.querySelectorAll('.zf3-top, .maintabs, .zf-footer')].filter(e => e.offsetParent !== null || e.getClientRects().length)
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
  // 🔴 2026-10-09(고지 회차 1 · 6) — 점검은 운영 이용 기록(usage_events)에 쓰지 않는다. 화면의 송신(page_view · notice_open · search …)을
  //    여기서 받아 201 로 끝낸다 — 화면 동작은 그대로(송신은 fire-and-forget) · 처리방침 「이용 기록」 목적 밖의 행이 집계를 부풀리지 않게.
  await ctx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
  const page = await ctx.newPage()
  page.on('console', m => {
    if (m.type() !== 'error') return
    const where = (m.location() && m.location().url) || ''
    const text = m.text()
    if (CONSOLE_IGNORE.some(re => re.test(where) || re.test(text))) return
    consoleErrors.push(`${text.slice(0, 160)}${where ? ' @ ' + where.slice(0, 80) : ''}`)
  })
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 160)))
  // ⑩ 첫 로드 요청 장부(2026-10-18 · 우편함 「표시층 — 첫 로드 가볍게」 4 · 조사 「페이지 첫 로드 요청 묶음 실측」 ⑦) — 비로그인 첫 로드의
  //    요청 수 · 바이트 합(응답 머리+본문) · 같은 50 ms 안에 시작한 요청 최대를 **기록만** 한다(ℹ️ · 판정 없음 · 이슈 없음).
  //    병합 때 곁 요청이 늘면 결과 표에서 보이게. 창 = goto 부터 목록이 처음 찬 때(noticeData > 0)까지.
  const t0 = Date.now()
  const flReq = []
  let flOpen = true
  page.on('request', r => { if (flOpen) flReq.push({ r, t: Date.now() - t0, url: r.url() }) })

  await page.goto(SITE + '?health=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
  flOpen = false
  try {
    const sizes = await Promise.all(flReq.map(x => x.r.sizes().then(s => s.responseHeadersSize + s.responseBodySize).catch(() => 0)))
    const ts = flReq.map(x => x.t).sort((a, b) => a - b)
    let max50 = 0
    for (let i = 0, j = 0; i < ts.length; i++) { while (ts[i] - ts[j] > 50) j++; max50 = Math.max(max50, i - j + 1) }
    const bytes = sizes.reduce((a, b) => a + b, 0)
    extra.first_load = { n: flReq.length, bytes, max50, ms: Date.now() - t0,
      list: flReq.map((x, i) => ({ t: x.t, b: sizes[i], u: x.url.replace(/\?.*$/, '').slice(0, 120) })) }
    add('first_load', '첫 로드 요청 장부(비로그인 · 기록만)', 'info',
      `요청 ${flReq.length} · ${Math.round(bytes / 1024).toLocaleString()} KB · 같은 50 ms 안 최대 ${max50}`, '기록만 — 판정 없음 · 이슈 없음(병합 때 곁 요청이 늘면 보이게)')
  } catch (e) {
    add('first_load', '첫 로드 요청 장부(비로그인 · 기록만)', 'info', '못 잼: ' + String(e).slice(0, 160), '기록만')
  }
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
      // 🔵 새 화면 전환(원칙 33) — 공고문마다 접수일이 다른 카드는 d3 가 이 자리를 숨기고 같은 목록으로 「갈래 노선」(.zf3-branch)을 그린다
      //    (data-zf3-branch="1"). 그 카드는 숨은 자리의 글자(기간·상태)를 DB 와 대조하고, 보이는 갈래의 공고문·상태가 그 자리와 같은지 함께 본다.
      const branchOf = slot => { const c = slot.closest('.hcard'); return c && c.dataset.zf3Branch === '1' ? c : null }
      for (const slot of [...document.querySelectorAll('.hcard .zf-notices-slot')].filter(s => vis(s) || branchOf(s))) {
        if (!slot.innerHTML.trim()) continue
        const card = branchOf(slot)
        const br = card ? [...card.querySelectorAll('.zf3-branch')].map(b => [(b.querySelector('span[title]') || {}).title || '', ((b.querySelector('.zf-nt-state') || {}).textContent || '').trim()]) : null
        for (const nm of slot.querySelectorAll('span[title]')) {
          const line = nm.closest('.zf-nt-line') || slot
          const sp = line.querySelector('.zf-nt-span'), st = line.querySelector('.zf-nt-state')
          let state = st ? (st.innerText || st.textContent).trim() : '(없음)'
          if (br) { const b = br.find(x => x[0] === nm.getAttribute('title')); if (!b) state = '(갈래 없음)'; else if (b[1] !== state) state = `(갈래 상태 ${b[1]} ≠ ${state})` }
          nts.push([slot.getAttribute('data-notices-for'), nm.getAttribute('title'),
            sp ? (sp.innerText || sp.textContent).replace(/^접수\s*/, '').trim() : '(없음)', state])
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
             when p.analysis_done is false then '분석중'
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
      // 2026-10-16 — 분석 없는 갈래(첨부 0 · 분석 전)의 요약 상자는 「AI 정리」라고 말하지 않는다(보이는 글자 · 「원문 보기」만)
      else if ((got === '링크만' || got === '분석중') && /AI 정리/.test(t)) mism.push(`${aid}: ${got} 상자에 「AI 정리」 「${t}」`)
    }
    extra.phrase_counts = counts
    extra.phrase_mismatch = mism
    add('phrase', '카드 문구 ↔ DB 상태', mism.length === 0 ? 'pass' : 'fail',
      `${cards.length}장 · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}${mism.length ? ` · 어긋남 ${mism.length}: ${mism.slice(0, 3).join(' / ')}` : ''}`,
      '카드마다 화면 문구 갈래 = DB 로 따로 계산한 갈래 · 링크만·분석중 상자에 보이는 「AI 정리」 0')
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
  if (process.env.SIMULATE === 'stale_date') await page.evaluate(() => { const h = document.querySelector('.zf3-top') || document.body; const b = document.createElement('span'); b.className = 'badge'; b.textContent = '📢 2026년 경기북부 2차 공고 · 신청기간 6.30~7.2'; h.appendChild(b) })
  const staleDates = await page.evaluate(STALE_DATE_FN)
  extra.stale_dates = staleDates
  add('stale_date', '고정 글자(앱 머리·메인 탭·푸터) 속 지난 날짜', staleDates.length === 0 ? 'pass' : 'fail', staleDates.length ? `${staleDates.length}: ${staleDates.slice(0, 3).join(' / ')}` : 0, '0 — 줄마다 가장 늦은 날짜 ≥ 오늘(KST)')
  await page.screenshot({ path: 'health-screen.png' })
  // ⑥ 매칭 2단계 — 공급 대상이 달라 뺀 공고(2026-10-08 · 우편함 「표시층 — 추천 매칭 2단계」 · 원칙 33).
  //    시험 사용자 (가)(미혼 · 자녀 0 · 1인 · 1996년생 · 소득 250 · 자산 9,000 · 무주택 · 청약통장)로 진단 → 매칭을 돌리고
  //    ⓐ 뺀 공고마다 DB 에서 **따로** 같은 판정을 SQL 로 계산한다 — 카드 자신의 자격 행이 모두 공급대상 키(객체)를 갖고
  //       모든 행의 모든 갈래가 이 입력으로 「아님」이어야 한다(확인필요 갈래 · 모르는 대상은 아님이 아니다). 하나라도 어긋나면 실패 = 근거 없이 뺐다.
  //       🔵 2026-10-13(PR #491 뒤 · 이슈 #493) — 카드 ID에 키 행이 없으면 화면처럼 같은 그룹 키(announcement_dedup_key = 화면 zfDedupKey) 형제 중
  //       키 행을 가진 ID 가장 큰 공고 하나의 행으로 잰다(정정 카드 …20876 ← …20840).
  //    ⓑ 매칭 표시 문구는 여덟 갈래(맞음 · 이름 없는 맞음 · 확인필요 · 이름 없는 확인필요 · 확인필요-only 원문 대상 · 유형 기준 없음 · 소득 관문 · 👥 상자 제목) 중 하나여야 하고, 상자 수 = 뺀 공고 수(2026-10-15 이름 없는 두 갈래 더함 · 2026-10-16 소득 관문 「대상 조건은 맞지만 …」 더함).
  //    SIMULATE=target_out 이면 키 없는 남은 카드 하나를 뺀 목록에 끼워 넣는다(실패해야 맞다).
  const tgt = await page.evaluate(async sim => {
    if (typeof diagnose !== 'function' || typeof matchHouses !== 'function') return { err: '화면 함수 없음' }
    goMain(1)
    const u = { marital: 'single', children: '0', members: '1', income: '250', assets: '9000', owned: 'no', hasSavings: 'yes', birthYear: '1996' }
    for (const [k, v] of Object.entries(u)) { const el = document.getElementById(k); if (el) el.value = v }
    await diagnose(); await matchHouses()
    if (typeof lastTargetOut === 'undefined') return { err: 'lastTargetOut 없음' }
    if (sim) { const r = lastFiltered.find(x => !x._zfTarget); if (r) lastTargetOut.push({ id: r.announcement_id, title: r.title, v: { names: ['시험'] } }) }
    visibleCount = lastFiltered.length; renderMatchResults(lastFiltered)   // 문구는 결과 전부를 펼쳐 잰다(처음 5장만 그리면 줄이 비기도 한다)
    const root = document.getElementById('match-result')
    const lines = [...root.querySelectorAll('.zf-target-ok, .zf-check-note')].map(e => e.textContent.replace(/\s+/g, ' ').trim())
    const box = root.querySelector('details.zf-target-out > summary')
    return { out: lastTargetOut.map(x => String(x.id)), lines, box: box ? box.textContent.replace(/\s+/g, ' ').trim() : null, year: new Date().getFullYear() }
  }, process.env.SIMULATE === 'target_out')
  {
    const PH = [
      /^👥 .+ 대상 모집 — 입력하신 정보로는 대상 조건에 맞아요$/,
      /^👥 입력하신 정보로는 대상 조건에 맞아요$/,   // 대상 이름 없는 갈래만으로 맞음(2026-10-15 · 이름을 짓지 않는다)
      /^📄 대상 조건이 있는 공고예요( \(.+\))? — 신청할 수 있는지 공고문에서 확인해 주세요$/,
      /^📄 이 공고는 .+ 대상 모집이에요( \(.+\))? — 신청할 수 있는지 공고문에서 확인해 주세요$/,
      /^📄 이 공고의 모집 대상은 「.+」이에요( \(.+\))? — 신청할 수 있는지 공고문에서 확인해 주세요$/,
      /^📄 자격 진단에 이 유형\(.+\) 기준이 없어요 — 신청할 수 있는지 공고문에서 확인해 주세요$/,
      /^📄 (.+ )?대상 조건은 맞지만 .+ — 신청할 수 있는지 공고문에서 확인해 주세요$/,   // 대상은 맞는데 소득을 못 봤거나 넘음(2026-10-16 · N12 ✓ 소득 관문)
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
          kid as (select distinct e.announcement_id aid, public.announcement_dedup_key(a.title) k
                    from public.eligibility_criteria e join public.announcements a on a.announcement_id = e.announcement_id
                   where jsonb_typeof(e.verification_requirements->'공급대상') = 'object'),
          src as (select i.aid, coalesce(
                    (select k.aid from kid k where k.aid = i.aid limit 1),
                    (select max(k.aid) from kid k where k.k in (select public.announcement_dedup_key(c.title) from public.announcements c where c.announcement_id = i.aid))) sid
                  from ids i),
          r as (select s.aid, e.id, e.verification_requirements->'공급대상' g
                  from src s left join public.eligibility_criteria e on e.announcement_id = s.sid),
          b as (select r.aid, r.id, x.b from r left join lateral jsonb_array_elements(
                  case when jsonb_typeof(r.g) = 'object' and jsonb_typeof(r.g->'갈래') = 'array' then r.g->'갈래' else '[]'::jsonb end) x(b) on true),
          -- 🔵 2026-10-15(우편함 「코드 — 공급대상 갈래 「no 먼저」 …」 · 이슈 #527) — 화면 규칙을 따로 옮긴다:
          --    ① 나이·자녀 수 축(다자녀 · 고령자 · 청년 대상)이 no면 확인필요가 있어도 no(no 먼저 · ZF_TARGET_NO_FIRST)
          --    ② 신혼·신생아 대상은 확인필요 없는 갈래, 또는 새 키(혼인 · 계층_중_하나 · 가구원수_최대) 갈래에서만 no(새 키 갈래는 대상 축을 확인필요와 따로 본다)
          --    ②' 한부모 대상은 확인필요가 있어도 no — 시험 사용자는 「결혼한 적 없음」 · 특수 계층 안 고름(화면 ZF_TARGET_SP_NO_FIRST · 2026-10-19)
          --    ③ 새 키 혼인 「혼인 중」은 시험 사용자(미혼)에게 no · 계층·가구원수는 시험 사용자가 고르지·만지지 않아 모름(no 아님)
          --    ④ 모르는 조건 키가 있으면 그 갈래는 check(no 아님).
          bk as (select aid, id, b,
                  (b is not null and jsonb_typeof(b->'조건') = 'object' and (b->'조건') ?| array['혼인','계층_중_하나','가구원수_최대']) as has_new,
                  (b is not null and jsonb_typeof(b->'조건') = 'object' and exists (select 1 from jsonb_object_keys(b->'조건') k
                     where k not in ('나이_최소','나이_최대','미성년자녀_최소','혼인','계층_중_하나','가구원수_최대'))) as unk
                from b),
          bs as (select aid, id, b,
                  (b is not null and not unk and (
                    (b->>'대상' = '다자녀' and coalesce((b->'조건'->>'미성년자녀_최소')::int, 0) > 0
                      and not (coalesce(b->>'확인필요', '') like '%태아%' and (b->'조건'->>'미성년자녀_최소')::int = 1))   -- 시험 사용자 자녀 0 = 최소−1 이고 확인필요에 태아면 check(화면 2026-10-19)
                    or (b->>'대상' = '신혼·신생아' and (has_new or not (b ? '확인필요')))
                    or (b->>'대상' = '한부모')
                    or (b->>'대상' in ('고령자', '청년') and ((b->'조건') ? '나이_최소' or (b->'조건') ? '나이_최대')
                        and (${y} - ${by} < coalesce((b->'조건'->>'나이_최소')::int, -999) or ${y} - ${by} - 1 > coalesce((b->'조건'->>'나이_최대')::int, 999)))
                    or (has_new and b->'조건'->>'혼인' = '혼인 중')
                  )) as no
                from bk),
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
      '시험 사용자 (가) — 뺀 공고 전부 DB 로 따로 계산한 「모든 행 키 · 모든 갈래 아님」(카드 ID에 키 행이 없으면 같은 그룹 키 형제) · 문구 여덟 갈래 · 상자 수 = 뺀 수')
  }
  // ⑥-2 공급대상 갈래 판정 표본(2026-10-15 · 우편함 「코드 — 공급대상 갈래 판정(D-2 …)」 · 원칙 33).
  //    키 객체 × 진단 입력 → 기대 ok/no/check 를 코드 밖 표(target-samples.json)에 두고 배포본 zfTargetRowState 로 잰다.
  //    표본: SH_311349 홀몸어르신 꼴 · …19376 청년 전세임대 꼴 · 혼인 · 대상 없는 갈래 · 모르는 조건 키(종전 ok → check) · 옛 키 회귀 ·
  //    카드 표본 verdict_samples(state + 안내 괄호 안 낱말 — 같은 낱말 두 번 0 · 안전망 낱말 · 2026-10-15).
  //    SIMULATE=target_samples 이면 첫 표본의 기대값을 뒤집어 잰다(실패해야 맞다).
  {
    const tsj = JSON.parse(readFileSync(new URL('./target-samples.json', import.meta.url), 'utf8'))
    const samples = tsj.samples, vsamples = tsj.verdict_samples || []
    if (process.env.SIMULATE === 'target_samples' && samples.length) samples[0].expect = samples[0].expect === 'ok' ? 'no' : 'ok'
    const got = await page.evaluate(([ss, vs]) => {
      if (typeof zfTargetRowState !== 'function') return { err: 'zfTargetRowState 없음' }
      const y = new Date().getFullYear()
      // members "diag_untouched" — 진단 칸에 이벤트 없이 2를 넣고(사용자가 안 건드린 기본값과 같은 꼴) 화면 zfTargetDiagFacts 가 내는 값을 쓴다(2026-10-15).
      const diagMembers = () => { const el = document.getElementById('members'); if (el) el.value = '2'; return typeof zfTargetDiagFacts === 'function' ? zfTargetDiagFacts().members : NaN }
      const fx = s => ({ marital: s.facts.marital, children: s.facts.children ?? null, birthYear: y - s.facts.age, classes: new Set(s.facts.classes),
        members: s.facts.members === 'diag_untouched' ? diagMembers() : s.facts.members })
      // 카드 표본(2026-10-15 · 우편함 「코드 — 공급대상 갈래 「no 먼저」 …」) — zfTargetVerdict 의 state 와 checks(안내 괄호 안 낱말 · 순서까지).
      const v = vs.map(s => { const r = zfTargetVerdict(s.rows, fx(s)) || {}
        let note = null
        if (s.note != null && typeof zfTargetNoteHtml === 'function') { const box = document.createElement('div'); box.innerHTML = zfTargetNoteHtml(r.state ? r : null); note = box.textContent.replace(/\s+/g, ' ').trim() }
        return { state: r.state || null, checks: r.checks || [], note } })
      return { list: ss.map(s => zfTargetRowState(s.key, fx(s))), v }
    }, [samples, vsamples])
    const bad = got.err ? [] : samples.map((s, i) => got.list[i] === s.expect ? null : `${s.id}: ${got.list[i]}≠${s.expect}`).filter(Boolean)
      .concat(vsamples.map((s, i) => { const g = got.v[i]; return g.state === s.expect && JSON.stringify(g.checks) === JSON.stringify(s.checks) && (s.note == null || g.note === s.note) ? null : `${s.id}: ${g.state}(${g.checks.join(' · ')})${s.note != null ? `「${g.note}」` : ''}≠${s.expect}(${s.checks.join(' · ')})${s.note != null ? `「${s.note}」` : ''}` }).filter(Boolean))
    const total = samples.length + vsamples.length
    add('target_samples', '매칭 공급대상 갈래 판정 — 표본 키 기대값', !got.err && bad.length === 0 ? 'pass' : 'fail',
      got.err ? `못 잼(${got.err})` : `${total - bad.length}/${total}${bad.length ? ' · ' + bad.slice(0, 3).join(' / ') : ''}`,
      '전부 기대값 — .github/health/target-samples.json(코드 밖 표 · 행 표본 + 카드 표본) · 배포본 zfTargetRowState · zfTargetVerdict')
  }
  // ⑦ 숫자가 말하는 「지금」(2026-10-08 · 우편함 「표시층 — 숫자가 말하는 「지금」」 · 원칙 33).
  //    공고 탭 머리(기본 거름 — 신청할 수 없는 공고 숨기기)와 인사이트 머리의 「지금 열린 공고 M건」이 화면 정의(zfOpenNotices) 한 값과 같은가 ·
  //    「마감 포함 누적 T건(YYYY년 M월부터)」의 T·기간이 DB(get_announcements_deduped 전량 · 가장 이른 공고일)와 같은가.
  //    ⚠️ 「열린 공고」 M 자체는 DB SQL 로 따로 세지 않는다 — 화면 정의가 붙은 공고문 상태·LH 조기 마감·당첨발표일을 함께 보아 SQL 한 벌로 옮기면 사본이 생긴다.
  //    SIMULATE=open_count 이면 공고 탭 머리의 수에 1을 더해 잰다(실패해야 맞다).
  const oc = await page.evaluate(async sim => {
    if (typeof zfOpenNotices !== 'function') return { err: 'zfOpenNotices 없음' }
    goMain(2)
    activeNoticeRegion = null; activeNoticeType = null; activeNoticeStatus = null; activeNoticeTarget = null
    const q = document.getElementById('noticeSearchInput'); if (q) q.value = ''
    const chk = document.getElementById('hideClosedChk'); if (chk) chk.checked = true
    applyNoticeFiltersAndRender()
    const M = zfOpenNotices(noticeData).length, T = noticeData.length, since = zfCumulativeSince(noticeData)
    // 🔵 2026-10-09(고지 회차 1 · 5) — 머리의 접수 중 · 예정 · 미상을 화면 술어(applyWindowState)로 따로 센다(zfOpenBreakdown 을 부르지 않는다 — 같은 함수로 재면 대조가 아니다).
    let A = 0, B = 0, K = 0
    zfOpenNotices(noticeData).forEach(r => { const s = applyWindowState(r); if (s === 'open') A++; else if (s === 'before') B++; else K++ })
    // 🔵 새 화면 전환(우편함 「표시층 — 런칭 전 남은 화면 일」 1 · 원칙 33) — 공고 탭 머리는 d3 머리 두 줄이다:
    //    「열린 공고 M건」(.zf3-lh) + 「접수 중 a · 예정 b[ · 미상 k]」(.zf3-lsub). 종전 「✅ 지금 열린 공고 M건(…)」 상자는 걷혔다.
    //    🔵 2026-10-13(우편함 「표시층 — 공고 탭 다듬기」 2) — 둘째 줄 끝의 정렬 글자는 걷고 정렬은 「필터」 옆 선택 칸(.zf3-ctl)으로 나갔다.
    //    판정은 startsWith 라 그대로 맞는다(정렬 글자는 판정에 쓰지 않았다).
    const lh = ((document.querySelector('#zf3NoticeHead .zf3-lh') || {}).innerText || '').trim()
    const lsub = ((document.querySelector('#zf3NoticeHead .zf3-lsub') || {}).innerText || '').replace(/\s+/g, ' ').trim()
    let tab = lh + ' | ' + lsub
    if (sim) tab = tab.replace(/(\d[\d,]*)건/, (m, d) => (Number(d.replace(/,/g, '')) + 1).toLocaleString() + '건')
    goMain(3)
    insightLoaded = false
    await loadInsightData()
    const insLines = ((document.querySelector('#insightContent') || {}).innerText || '').split('\n').map(l => l.trim())
    const ins = insLines.find(l => l.includes('지금 열린 공고')) || ''
    // 인사이트 「접수 중」 LED 숫자(d3 · .zf3-kpi 첫 칸)
    const kEl = document.querySelector('#insightContent .zf3-kpi .zf3-kc b')
    const kpi = kEl ? Number(kEl.textContent.replace(/[^\d]/g, '')) : NaN
    goMain(2)
    return { M, T, since, A, B, K, kpi, tab: tab.trim(), ins: ins.trim() }
  }, process.env.SIMULATE === 'open_count')
  {
    let ok = false, value
    if (!oc.err) {
      const [db] = await sqlRead(`select count(*)::int as t, to_char(min(announcement_date), 'YYYY"년 "FMMM"월부터"') as since from get_announcements_deduped()`)
      const want = `지금 열린 공고 ${oc.M.toLocaleString('ko-KR')}건`
      const fmt = n => n.toLocaleString('ko-KR')
      const wantTab = `열린 공고 ${fmt(oc.M)}건 | 접수 중 ${fmt(oc.A)} · 예정 ${fmt(oc.B)}${oc.K ? ` · 미상 ${fmt(oc.K)}` : ''}`
      const tabOk = oc.tab.startsWith(wantTab)
      const insOk = oc.ins.startsWith(want + ' · 마감 포함 누적 ' + oc.T.toLocaleString('ko-KR') + '건(' + oc.since + ')')
      const kpiOk = oc.kpi === oc.A   // 공고 탭 「접수 중 a」 = 인사이트 「🟢 접수중」 KPI
      const sumOk = oc.A + oc.B + oc.K === oc.M
      const dbOk = db.t === oc.T && db.since === oc.since
      ok = tabOk && insOk && kpiOk && sumOk && dbOk && oc.M > 0 && oc.M <= oc.T
      value = `열린 ${oc.M}(접수 중 ${oc.A} · 예정 ${oc.B} · 미상 ${oc.K})${sumOk ? '' : ' ✗합'} · 인사이트 「접수 중」 KPI ${oc.kpi}${kpiOk ? '' : ' ✗'} · 누적 ${oc.T}(${oc.since}) · 공고 탭 「${oc.tab}」${tabOk ? '' : ' ✗'} · 인사이트 「${oc.ins.slice(0, 60)}」${insOk ? '' : ' ✗'} · DB 누적 ${db.t}(${db.since})${dbOk ? '' : ' ✗'}`
      extra.open_count = { ...oc, db }
    } else value = `못 잼(${oc.err})`
    add('open_count', '숫자가 말하는 「지금」 — 열린 공고 수 한 정의 · 누적 표기', ok ? 'pass' : 'fail', value,
      '공고 탭 기본 머리 = 「열린 공고 M건」 + 「접수 중 a · 예정 b[ · 미상 k]」 · a+b+k = M · a = 인사이트 「접수 중」 KPI · 인사이트 머리 「지금 열린 공고 M건」 · M = zfOpenNotices(noticeData) · 누적 T·기간 = DB')
  }
  // ⑦-0 경계 판 갈이(2026-10-16 · 우편함 「표시층 — 지도 2026-07-01 개편 반영」 6) — 열린 카드가 말하는 시·군·구 이름 중 지도 경계 파일(배포본 ZF3_GEO)에 없는 것.
  //    행정구역이 바뀌면(통합·분할·새 구) 수집 이름이 먼저 바뀌고 지도만 옛 판에 남는다 — 2026-07-01 개편을 다운님이 먼저 찾았다(전남광주 · 인천 4구 · 화성 4구).
  //    0 이 아니면 경고만(멈춤 아님 · 이슈를 열지 않는다) — 새 판(vuski/admdongkor)을 받아 scripts/geo-build.py 를 돌릴 때다.
  //    셈은 화면 함수(zf3PlaceOf — 부모 시·고리로 대신해 버린다)를 쓰지 않는다: 카드 지역 칸(region_names · sido_nm·sigungu_nm) ∪ 세대 행 지역을 경계 파일 이름과 바로 맞춘다
  //    (같은 이름 · 또는 구 단위만 있는 시의 시 이름). 시·군·구 「외」(수집 자리표시) · 경계 파일에 없는 시·도(「전국」)는 셈 밖. 2026-07 판 기대값 0.
  //    SIMULATE=geo_names 면 없는 구 이름 하나를 열린 카드에 붙여 잰다(경고가 떠야 맞다).
  {
    const gn = await page.evaluate(async sim => {
      if (typeof ZF3_GEO === 'undefined' || typeof zfOpenNotices !== 'function') return { err: 'ZF3_GEO 없음' }
      const G = await fetch(ZF3_GEO + '.json', { cache: 'no-store' }).then(r => r.json())
      const sido = {}
      G.paths.forEach(p => { sido[p.name] = p.code; (ZF_SIDO_ALIASES[p.name] || []).forEach(o => { sido[o] = p.code }) })
      const keys = Object.keys(G.cent)
      const open = zfOpenNotices(noticeData)
      await zfEnsurePriceSummaries(open.map(n => n['announcement_id']))
      const miss = new Map()
      let names = 0
      open.forEach((n, i) => {
        const all = [...(Array.isArray(n['region_names']) ? n['region_names'] : []), ...zfUnitPlacesFor(n['announcement_id'])]
        if (n['sigungu_nm']) all.push(n['sido_nm'] + ' ' + n['sigungu_nm'])
        if (sim && i === 0) all.push(n['sido_nm'] + ' 가상구(시험)')
        new Set(all.map(x => String(x || '').trim()).filter(Boolean)).forEach(x => {
          const j = x.indexOf(' ')
          const sd = j < 0 ? x : x.slice(0, j), sg = j < 0 ? '' : x.slice(j + 1).replace(/\s+/g, '')
          const pc = sido[sd]
          if (!pc || !sg || sg === '외') return
          names++
          const k = pc + '|' + sg
          if (G.cent[k] || (/시$/.test(sg) && keys.some(y => y.startsWith(k)))) return
          if (!miss.has(x)) miss.set(x, [])
          miss.get(x).push(n['announcement_id'])
        })
      })
      return { ed: G.ed, open: open.length, names, miss: [...miss].map(([x, ids]) => `${x}(${ids.length})`) }
    }, process.env.SIMULATE === 'geo_names')
    extra.geo_names = gn
    add('geo_names', '경계 판 갈이 — 열린 카드 시·군·구 중 지도 경계 파일에 없는 이름', gn.err ? 'warn' : gn.miss.length ? 'warn' : 'pass',
      gn.err ? `못 잼(${gn.err})` : `${gn.miss.length}${gn.miss.length ? ' · ' + gn.miss.slice(0, 5).join(' · ') : ''} · 경계 ${gn.ed} · 열린 카드 ${gn.open} · 맞춘 이름 ${gn.names}`,
      '0(2026-07 판 기대값) — 넘으면 경고만(새 판으로 scripts/geo-build.py · 멈춤 아님)')
  }
  // ⑦-1 차수 사이 카드(2026-10-15 · 우편함 「표시층 — 차수 사이 카드 상태」 · 원칙 33) — 경로 표 창이 둘 이상 끊긴 카드에서 오늘이 창 사이면
  //    「접수 중」도 닫힘도 아니고 다음 창 시작일을 말해야 한다(…0769 · …19241 「접수 중」 · …0706 · …0713 · …0737 닫혀 목록에서 빠짐 — 같은 꼴 네 번째).
  //    기대값은 DB 에서 **따로** 계산한다 — 목록 RPC 카드 기간 안 · 같은 제목 키(announcement_dedup_key)의 경로 행 창(하루 차로 붙거나 겹치면 한 창)이
  //    둘 이상 · 오늘이 어느 창에도 없음 · 기간 확인 대상·조기 마감 알림·당첨발표 지남·날짜 없는 경로 행이면 뺀다. 다음 창이 있으면 화면은
  //    ⓐ 열린 목록(zfOpenNotices)에 있고 ⓑ 상태가 「접수 중」이 아니고 ⓒ 알약이 「다음 접수 MM-DD」로 시작해야 한다 · 다음 창이 없으면(마지막 창 뒤) 닫힘.
  //    SIMULATE=route_gap 이면 경로 행을 안 본 종전 판정으로 잰다(차수 사이 카드가 있는 날 실패해야 맞다).
  {
    const [gq] = await sqlRead(`
      with today as (select (now() at time zone 'Asia/Seoul')::date d),
      c as (select d.announcement_id aid, d.title, d.apply_start s, d.apply_end e
              from get_announcements_deduped() d, today t
             where d.apply_period_check is not true and d.apply_start <= t.d and t.d <= d.apply_end
               and (d.winner_announce_date is null or d.winner_announce_date >= t.d)
               and not (d.title ~ '^\\s*(\\[[^]]*\\]\\s*)*\\[\\s*조기\\s*(접수)?\\s*마감\\s*\\]' or coalesce(d.revision_note, '') ~ '조기\\s*(접수\\s*)?마감')),
      rt as (select c.aid, c.s, c.e, r.start_date x, r.end_date y
               from c join announcements a on announcement_dedup_key(a.title) = announcement_dedup_key(c.title)
               join announcement_apply_routes r on r.announcement_id = a.announcement_id),
      w as (select aid, x, y from rt where aid not in (select aid from rt where x is null or y is null) and y >= s and x <= e),
      o as (select aid, x, y, max(y) over (partition by aid order by x, y rows between unbounded preceding and 1 preceding) py from w),
      g as (select aid, x, y, sum(case when py is null or x > py + 1 then 1 else 0 end) over (partition by aid order by x, y) gid from o),
      isl as (select aid, gid, min(x) x, max(y) y from g group by aid, gid),
      agg as (select aid, count(*) n, bool_or(x <= t.d and t.d <= y) inwin, min(x) filter (where x > t.d) nxt from isl, today t group by aid)
      select coalesce(json_agg(json_build_object('aid', aid, 'next', nxt) order by aid), '[]'::json) j from agg where n >= 2 and not inwin`)
    const want = gq.j || []
    const got = await page.evaluate(([want, sim]) => {
      if (typeof zfRouteGap !== 'function') return { err: 'zfRouteGap 없음' }
      if (sim) zfSide.routesReady = false
      const open = new Set(zfOpenNotices(noticeData).map(r => String(r.announcement_id)))
      const out = want.map(x => {
        const r = noticeData.find(n => String(n.announcement_id) === x.aid)
        return r ? [x.aid, open.has(x.aid), applyWindowState(r), zf3Pill(r).t] : [x.aid, null, null, null]
      })
      if (sim) zfSide.routesReady = true
      return { out }
    }, [want, process.env.SIMULATE === 'route_gap'])
    let ok = false, value
    if (!got.err) {
      const md = d => String(d).slice(5, 10)
      const bad = got.out.filter(([aid, open, st, pill], i) => {
        const nx = want[i].next
        if (open === null) return true
        return nx ? !(open && st !== 'open' && pill.startsWith('다음 접수 ' + md(nx))) : open
      }).map(([aid, open, st, pill]) => `${aid}: ${open === null ? '목록 행 없음' : `${open ? '열림' : '닫힘'} · ${st} · 「${pill}」`}`)
      ok = bad.length === 0
      value = `차수 사이 카드 ${want.length}${want.length ? ` (${want.map(x => x.aid.slice(-5) + (x.next ? '→' + md(x.next) : '·끝')).join(' ')})` : ''} · 어긋남 ${bad.length}${bad.length ? ': ' + bad.slice(0, 3).join(' / ') : ''}`
      extra.route_gap = { want, out: got.out, bad }
    } else value = `못 잼(${got.err})`
    add('route_gap', '차수 사이 카드 — 접수 중이 아니고 열린 목록에 있고 다음 창 시작일을 말한다', ok ? 'pass' : 'fail', value,
      'DB 로 따로 계산한 창 사이 카드(경로 표 창 둘 이상 · 오늘이 창 밖 · 카드 기간 안) — 다음 창이 있으면 열린 목록 · 상태 ≠ 접수 중 · 알약 「다음 접수 MM-DD」 / 없으면 닫힘')
  }
  // ⑦-1a 차수 카드 마감 표시(2026-10-16 · 우편함 「표시층 — 차수 카드 마감 표시 …」 1·2·4 · 원칙 33) — 기대값은 DB 에서 **따로**(route_gap 과 같은 창 계산).
  //    ⓐ 차수 사이 카드: 매칭 결과 경로(renderMatchResults 가 넘기는 꼴 — 목록 RPC 행 그대로)로 잰 마감임박이 거짓이어야 한다
  //       (종전에는 마감일만 떼어 넘겨 zfRouteGap 이 못 보고 「⏰ 마감임박」이 섰다).
  //    ⓑ 창 안 차수 카드(창 둘 이상 · 오늘이 마지막이 아닌 창 안): 알약 = 「이번 차수 마감 D-n」(n = 그 창 끝 − 오늘 · 0이면 「이번 차수 오늘 마감」) ·
  //       마감임박 = (0 ≤ n ≤ 3). 마지막 창 안은 종전 그대로(알약에 「이번 차수」 없음).
  //    SIMULATE=route_cur 이면 매칭 경로를 종전 꼴(마감일만)로 잰다(차수 사이 카드가 있는 날 마감 3일 안이면 실패해야 맞다).
  {
    const [cq] = await sqlRead(`
      with today as (select (now() at time zone 'Asia/Seoul')::date d),
      c as (select d.announcement_id aid, d.title, d.apply_start s, d.apply_end e
              from get_announcements_deduped() d, today t
             where d.apply_period_check is not true and d.apply_start <= t.d and t.d <= d.apply_end
               and (d.winner_announce_date is null or d.winner_announce_date >= t.d)
               and not (d.title ~ '^\\s*(\\[[^]]*\\]\\s*)*\\[\\s*조기\\s*(접수)?\\s*마감\\s*\\]' or coalesce(d.revision_note, '') ~ '조기\\s*(접수\\s*)?마감')),
      rt as (select c.aid, c.s, c.e, r.start_date x, r.end_date y
               from c join announcements a on announcement_dedup_key(a.title) = announcement_dedup_key(c.title)
               join announcement_apply_routes r on r.announcement_id = a.announcement_id),
      w as (select aid, x, y from rt where aid not in (select aid from rt where x is null or y is null) and y >= s and x <= e),
      o as (select aid, x, y, max(y) over (partition by aid order by x, y rows between unbounded preceding and 1 preceding) py from w),
      g as (select aid, x, y, sum(case when py is null or x > py + 1 then 1 else 0 end) over (partition by aid order by x, y) gid from o),
      isl as (select aid, gid, min(x) x, max(y) y from g group by aid, gid),
      agg as (select aid, count(*) n, bool_or(x <= t.d and t.d <= y) inwin, max(y) filter (where x <= t.d and t.d <= y) cur, max(y) lst, (select d from today) td from isl, today t group by aid)
      select coalesce(json_agg(json_build_object('aid', aid, 'kind', case when inwin then 'in' else 'gap' end, 'cur', cur, 'days', cur - td) order by aid), '[]'::json) j
        from agg where n >= 2 and (not inwin or cur < lst)`)
    const want = cq.j || []
    const got = await page.evaluate(([want, sim]) => {
      if (typeof zfRouteCurEnd !== 'function') return { err: 'zfRouteCurEnd 없음' }
      return { out: want.map(x => {
        const r = noticeData.find(n => String(n.announcement_id) === x.aid)
        if (!r) return [x.aid, null, null, null]
        // 매칭 결과 행 = 목록 RPC 행 꼴(영문 칸) — renderMatchResults 와 같은 식으로 잰다
        const m = { announcement_id: r.announcement_id, title: r['공고명'] ?? r.title, apply_start: r['신청시작일'] || r.apply_start, apply_end: r['신청마감일'] || r.apply_end,
          apply_period_check: r.apply_period_check, winner_announce_date: r.winner_announce_date, revision_note: r.revision_note, source: r.source, status: r['처리상태'] ?? r.status }
        const soonM = sim ? isClosingSoon({ apply_end: zfSoonestOpenEnd(m), apply_period_check: m.apply_period_check }) : isClosingSoon(zfWithSoonestEnd(m))
        return [x.aid, soonM, isClosingSoon(zfWithSoonestEnd(r)), zf3Pill(r).t, typeof zfDeadline === 'function' ? zfDeadline(r) : null]
      }) }
    }, [want, process.env.SIMULATE === 'route_cur'])
    let ok = false, value
    if (!got.err) {
      const bad = got.out.map(([aid, soonM, soonN, pill, dl], i) => {
        const w = want[i]
        if (soonM === null) return `${aid}: 목록 행 없음`
        if (w.kind === 'gap') return soonM ? `${aid}: 차수 사이인데 매칭 경로 마감임박` : null
        const wantPill = w.days === 0 ? '이번 차수 오늘 마감' : '이번 차수 마감 D-' + w.days, wantSoon = w.days >= 0 && w.days <= 3
        // 2026-10-16 — 「마감 임박순」 정렬 축(zfDeadline)도 이번 차수 끝
        return pill === wantPill && soonM === wantSoon && soonN === wantSoon && String(dl || '').slice(0, 10) === w.cur ? null
          : `${aid}: 「${pill}」(기대 「${wantPill}」) · 마감임박 매칭 ${soonM}/공고 ${soonN}(기대 ${wantSoon}) · 정렬 축 ${dl}(기대 ${w.cur})`
      }).filter(Boolean)
      ok = bad.length === 0
      value = `차수 사이 ${want.filter(x => x.kind === 'gap').length} · 창 안(마지막 아닌 창) ${want.filter(x => x.kind === 'in').length} · 어긋남 ${bad.length}${bad.length ? ': ' + bad.slice(0, 3).join(' / ') : ''}`
      extra.route_cur = { want, out: got.out, bad }
    } else value = `못 잼(${got.err})`
    add('route_cur', '차수 카드 마감 — 차수 사이 매칭 마감임박 없음 · 창 안은 이번 창 끝까지', ok ? 'pass' : 'fail', value,
      'DB 로 따로 계산한 창(route_gap 과 같은 식) — 차수 사이: 매칭 경로 마감임박 거짓 / 마지막 아닌 창 안: 알약 「이번 차수 마감 D-n」 · 마감임박 = 0≤n≤3(매칭·공고 둘 다)')
  }
  // ⑦-1a1 정정일(2026-10-16 · 우편함 「코드 — 관측 정정일 …(…0877)」 4 · 원칙 33) — 열린 정정 대표 전부를 꼴로 잰다(특정 공고 기대값을 박지 않는다).
  //    기대 정정일은 DB 에서 **따로**: ① user_verified revised_at(KST 날짜) ② LH 게시일(announcement_date > first_announcement_date)
  //    ③ 관측 — LH ∧ 두 날짜 같음 ∧ 같은 제목 키·같은 원공고일의 다른 LH 행을 5분 넘게 먼저 봄 → 정정 행 첫 수집(KST 날짜) · 셋 다 회차 날짜보다 뒤인 날만.
  //    화면: zfAnnDateLabel = 「회차 날짜 · 정정 MM-DD」(정정일 있을 때) / 회차 날짜(없을 때) · zfSortDate = 정정일 ∨ 회차 날짜.
  //    SIMULATE=rev_date 이면 행에서 revision_seen_date 를 지우고 잰다(종전 화면 — 관측 정정 카드가 열린 날 실패해야 맞다).
  {
    const [rq] = await sqlRead(`
      with r as (select d.announcement_id aid, d.source src, d.title, d.announcement_date ad, d.first_announcement_date fd, d.created_at ca,
                        d.revised_at ra, d.revised_at_source rs,
                        case when d.first_announcement_date is not null then d.first_announcement_date else d.announcement_date end rd
                   from get_announcements_deduped() d
                  where d.is_revised and d.status is distinct from '접수마감' and (d.apply_end is null or d.apply_end >= (now() at time zone 'Asia/Seoul')::date)),
      x as (select r.*,
              case when rs = 'user_verified' and ra is not null and (ra at time zone 'Asia/Seoul')::date > rd then (ra at time zone 'Asia/Seoul')::date end uv,
              case when fd is not null and ad > fd then ad end lh,
              case when src = 'LH' and fd is not null and ad = fd and (ca at time zone 'Asia/Seoul')::date > fd
                        and exists (select 1 from announcements o where o.source = 'LH' and o.announcement_id <> r.aid and o.hidden_from_listing is not true
                                     and announcement_dedup_key(o.title) = announcement_dedup_key(r.title) and o.first_announcement_date = r.fd
                                     and o.created_at < r.ca - interval '5 minutes')
                   then (ca at time zone 'Asia/Seoul')::date end obs
            from r)
      select coalesce(json_agg(json_build_object('aid', aid, 'rd', rd, 'rev', coalesce(uv, lh, obs), 'obs', obs is not null and uv is null and lh is null) order by aid), '[]'::json) j from x`)
    const want = rq.j || []
    const got = await page.evaluate(([want, sim]) => {
      if (typeof zfRevisedDate !== 'function' || typeof zfAnnDateLabel !== 'function') return { err: 'zfRevisedDate·zfAnnDateLabel 없음' }
      return { out: want.map(x => {
        const r0 = noticeData.find(n => String(n.announcement_id) === x.aid)
        if (!r0) return [x.aid, null, null]
        const r = sim ? Object.assign({}, r0, { revision_seen_date: null }) : r0
        return [x.aid, zfAnnDateLabel(r), zfSortDate(r)]
      }) }
    }, [want, process.env.SIMULATE === 'rev_date'])
    let ok = false, value
    if (!got.err) {
      const bad = got.out.filter(([aid, label, sort], i) => {
        const w = want[i], rd = String(w.rd || ''), rv = w.rev ? String(w.rev) : ''
        if (label === null) return false   // 목록 행 없음(취소공고 짝 등 목록에서 뺀 대표) — 이 점검이 답할 물음이 아니다
        return label !== (rv ? `${rd} · 정정 ${rv.slice(5)}` : rd) || sort !== (rv || rd)
      }).map(([aid, label, sort]) => `${aid}: 「${label}」 · 정렬 ${sort}`)
      ok = bad.length === 0
      const obs = want.filter(x => x.obs)
      value = `열린 정정 대표 ${want.length} · 정정일 ${want.filter(x => x.rev).length}(관측 ${obs.length}${obs.length ? ': ' + obs.map(x => x.aid.slice(-5) + '→' + String(x.rev).slice(5)).join(' ') : ''}) · 어긋남 ${bad.length}${bad.length ? ': ' + bad.slice(0, 3).join(' / ') : ''}`
      extra.rev_date = { want, out: got.out, bad }
    } else value = `못 잼(${got.err})`
    add('rev_date', '정정일 — 카드 표지 「· 정정 MM-DD」와 최신순 자리가 DB 로 따로 셈한 정정일과 같다', ok ? 'pass' : 'fail', value,
      '열린 정정 대표 전부 — 정정일 = user_verified ∨ LH 게시일(공고일 > 원공고일) ∨ 관측(원공고 LH 행을 5분 넘게 먼저 본 정정의 첫 수집일) · 회차 날짜보다 뒤만 · 표지·정렬이 그 값')
  }
  // ⑦-1a2 분석 전 카드(2026-10-16 · 같은 우편함 3·4) — 열린 대표 중 카드 회차 분석이 없고(analysis_done=false) 첨부가 있고 같은 게시물 링크가 없는 카드는
  //    「분석 중」 상자만 말하고 수집값 날짜·접수 상태·D-day·마감을 보이지 않는다(제목 글자는 빼고 잰다 — 제목에 날짜가 든 공고가 있다).
  //    기대 목록은 DB 에서 따로 — phrase 의 「분석중」 갈래와 같은 식. 0장이면 해당 없음(통과).
  {
    const [aq] = await sqlRead(`
      with c as (select d.announcement_id aid, d.title from get_announcements_deduped() d where d.apply_end >= (now() at time zone 'Asia/Seoul')::date),
      p as (select * from get_announcement_price_summary((select array_agg(aid) from c)))
      select coalesce(json_agg(c.aid order by c.aid), '[]'::json) j from c join p on p.announcement_id = c.aid
       where p.analysis_done is false and p.has_attachments is not false
         and p.deposit_min is null and p.rent_min is null and p.area_min is null
         and not exists (select 1 from announcement_post_links l where l.linked_group_key is not null
                          and announcement_dedup_key(l.linked_group_key) = announcement_dedup_key(c.title))`)
    const want = aq.j || []
    const got = []
    let err = null
    try {
      await page.evaluate(() => { goMain(2); if (typeof zf3SetView === 'function') zf3SetView('list'); document.getElementById('noticeFilterPanel')?.classList.add('hidden') })
      for (const aid of want) {
        const ok1 = await page.evaluate(aid => { const rows = noticeData.filter(n => String(n.announcement_id) === aid); if (!rows.length) return false; renderNoticeList(rows, rows.length, 0); return true }, aid)
        if (!ok1) { got.push({ aid, none: true }); continue }
        await page.waitForFunction(aid => { const c = document.querySelector(`#notice-list .hcard[data-announcement-id="${CSS.escape(aid)}"]`); const s = c && c.querySelector('[data-sum-for]'); return !!(s && s.innerHTML.trim()) }, aid, { timeout: 15000 }).catch(() => {})
        got.push(await page.evaluate(aid => {
          const c = document.querySelector(`#notice-list .hcard[data-announcement-id="${CSS.escape(aid)}"]`)
          const clone = c.cloneNode(true); clone.querySelectorAll('.hname, [id^="ncard-"]').forEach(e => e.remove())
          document.body.appendChild(clone); clone.style.position = 'absolute'; clone.style.left = '-9999px'
          const txt = clone.innerText; clone.remove()
          // 2026-10-16 — 분석 전 카드는 「AI 정리」라고 말하지 않는다(요약 상자 링크 · 상세 원문 링크 · 지도 안내의 「AI 정리 · 」 접힘)
          const ai = /AI 정리/.test((c.querySelector('[data-sum-for]') || {}).textContent || '') || [...c.querySelectorAll('.zf-ai-lbl')].some(e => getComputedStyle(e).display !== 'none')
          return { aid, ai, pending: c.classList.contains('zf-ana-pending'), box: /분석 중/.test(c.innerText),
            dates: (txt.match(/\d{1,4}\s*[-./]\s*\d{1,2}|D-\d+|접수 ?중|마감|접수 예정/g) || []).slice(0, 4) }
        }, aid))
      }
      await page.evaluate(() => { try { applyNoticeFiltersAndRender() } catch (e) {} })
    } catch (e) { err = String(e.message || e).slice(0, 120) }
    let ok = false, value
    if (!err) {
      const bad = got.map(g => g.none ? `${g.aid}: 목록 행 없음` : (g.pending && g.box && !g.dates.length && !g.ai) ? null : `${g.aid}: ${g.pending ? '' : '분석 중 아님 · '}${g.ai ? '「AI 정리」 글자 · ' : ''}${g.dates.length ? '날짜·상태 글자 ' + g.dates.join(',') : ''}`).filter(Boolean)
      ok = bad.length === 0
      value = `분석 전 열린 카드 ${want.length}${want.length ? ` (${want.map(a => a.slice(-5)).join(' ')})` : ''} · 어긋남 ${bad.length}${bad.length ? ': ' + bad.slice(0, 3).join(' / ') : ''}`
      extra.ana_pending = { want, got, bad }
    } else value = `못 잼(${err})`
    add('ana_pending', '분석 전 카드 — 「분석 중」만 · 수집값 날짜·상태 글자 0 · 「AI 정리」 0', ok ? 'pass' : 'fail', value,
      'DB 로 따로 고른 분석 전 열린 카드(분석 없음 · 첨부 있음 · 같은 게시물 링크 없음) — 카드 「분석 중」 · 제목 밖 날짜·D-day·접수 상태 글자 0 · 보이는 「AI 정리」 0')
  }
  // ⑦-1a3 1280 상세 패널(2026-10-16 · 같은 우편함 4 ① — v219 패널 가림을 점검이 못 잡았다: .zf3-in 애니메이션 fill 이 남긴 transform 이
  //    position:fixed 패널을 카드 안에 가뒀다). 새 문맥 1280×900 · 움직임 켬(줄이기 아님) · 실제 마우스로 첫 카드 꺾쇠를 눌러
  //    펼친 상세가 화면 안에 있고(너비·높이 > 200 · 화면 밖으로 넘치지 않음) 그 가운데 점을 누르면 그 상세 안 요소가 잡히는가.
  {
    let value = '', ok = false
    const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference', serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
    try {
      await dctx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
      const dp = await dctx.newPage()
      await dp.goto(SITE + '?wide=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
      await dp.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0 && noticeLoaded, null, { timeout: 60000 })
      await dp.evaluate(() => { goMain(2); if (typeof zf3SetView === 'function') zf3SetView('list') })
      await dp.waitForTimeout(1500)
      const go = dp.locator('#notice-list .hcard .zf3-go').first()
      await go.scrollIntoViewIfNeeded()
      await go.click()
      await dp.waitForTimeout(1500)
      const r = await dp.evaluate(() => {
        const card = document.querySelector('#notice-list .hcard.zf3-open')
        const det = card && card.querySelector('[data-ann-id]')
        if (!det) return { err: '펼친 상세 없음' }
        const b = det.getBoundingClientRect(), W = innerWidth, H = innerHeight
        const cx = Math.min(b.left + b.width / 2, W - 2), cy = Math.min(b.top + Math.min(b.height, H) / 2, H - 2)
        const hit = document.elementFromPoint(cx, cy)
        return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), W, H, inside: !!(hit && det.contains(hit)) }
      })
      if (r.err) value = r.err
      else {
        ok = r.w > 200 && r.h > 200 && r.x >= 0 && r.x + r.w <= r.W + 1 && r.y >= 0 && r.y < r.H - 100 && r.inside
        value = `상세 ${r.x},${r.y} ${r.w}×${r.h} · 화면 ${r.W}×${r.H} · 가운데 점 ${r.inside ? '상세 안' : '상세 밖'}`
      }
    } catch (e) { value = '못 잼: ' + String(e.message || e).slice(0, 120) }
    await dctx.close()
    add('detail_1280', '1280 · 움직임 켬 — 펼친 상세 패널이 화면 안에 보인다', ok ? 'pass' : 'fail', value,
      '첫 카드 꺾쇠 클릭 → 상세 너비·높이 > 200 · 화면 안 · 가운데 점 = 상세 안 요소')
  }
  // ⑦-1b 완화 배지 글자(2026-10-15 · 우편함 「표시층 — 완화 배지 글자 …」 1 · 원칙 33) — 완화 공고 배지가 원문에 없는 모집 꼴을 말하지 않는가.
  //    종전에는 완화 카드 전부가 「🔓 자격완화 추가모집」이었다(열린 완화 12 중 제목에 「추가모집」 1). 기대 갈래는 DB 에서 **따로** — 목록 RPC 완화 행의
  //    제목·relaxation_detail 로 「추가모집」(제목에 추가 모집) / 「거주지 제한 완화」(모집권역·거주지역 완화이면서 소득·자산·무주택 말 없음) / 「자격완화」.
  //    화면 쪽은 지금 보이는 완화 칩(data-zf-relax)과 완화 행 전부를 화면 배지 함수로 그린 글자 둘 다 잰다.
  //    SIMULATE=relax_badge 이면 기대 갈래 하나를 「자격완화 추가모집」으로 바꿔 잰다(실패해야 맞다).
  {
    const rq = await sqlRead(`
      select coalesce(json_agg(json_build_object('aid', d.announcement_id,
        'label', case when (d.title || ' ' || coalesce(d.relaxation_detail, '')) ~ '(모집권역|거주지역|거주지)[^.。]*완화|완화[^.。]*(모집권역|거주지역)'
                       and (d.title || ' ' || coalesce(d.relaxation_detail, '')) !~ '소득|자산|무주택' then '거주지 제한 완화'
                      when d.title ~ '추가\\s*모집' then '자격완화 추가모집' else '자격완화' end) order by d.announcement_id), '[]'::json) j
      from get_announcements_deduped() d where d.is_relaxed_recruitment is true`)
    const want = rq[0].j || []
    if (process.env.SIMULATE === 'relax_badge' && want.length) want[0].label = want[0].label === '자격완화 추가모집' ? '자격완화' : '자격완화 추가모집'
    const got = await page.evaluate(() => {
      if (typeof buildConvBadges !== 'function') return { err: 'buildConvBadges 없음' }
      const all = {}
      noticeData.filter(n => n.is_relaxed_recruitment === true).forEach(n => {
        const m = buildConvBadges(n.mymy_applicable, n.supply_form, n.application_method, n.recruit_multiplier, true, n.selection_method, n['공고명'], n.relaxation_detail).match(/🔓\s*([^<]*)/)
        all[String(n.announcement_id)] = m ? m[1].trim() : '(없음)'
      })
      const vis = [...document.querySelectorAll('.hcard [data-zf-relax]')].filter(e => e.offsetParent !== null)
        .map(e => [e.closest('.hcard').getAttribute('data-announcement-id'), e.textContent.replace(/^🔓\s*/, '').trim()])
      return { all, vis }
    })
    let ok = false, value
    if (!got.err) {
      const exp = new Map(want.map(x => [x.aid, x.label]))
      const bad = []
      for (const [aid, l] of Object.entries(got.all)) if (exp.get(aid) !== l) bad.push(`${aid}: 화면 「${l}」 ↔ DB 「${exp.get(aid)}」`)
      for (const [aid, l] of got.vis) if (exp.get(aid) !== l) bad.push(`보이는 ${aid}: 「${l}」 ↔ DB 「${exp.get(aid)}」`)
      const cnt = {}; want.forEach(x => { cnt[x.label] = (cnt[x.label] || 0) + 1 })
      ok = bad.length === 0 && Object.keys(got.all).length === want.length
      value = `완화 행 ${want.length}(${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(' · ')}) · 화면 ${Object.keys(got.all).length} · 보이는 칩 ${got.vis.length} · 어긋남 ${bad.length}${bad.length ? ': ' + bad.slice(0, 3).join(' / ') : ''}`
      extra.relax_badge = { want, bad }
    } else value = `못 잼(${got.err})`
    add('relax_badge', '완화 배지 — 원문(제목·완화 내용)에 없는 모집 꼴을 말하지 않는다', ok ? 'pass' : 'fail', value,
      'DB 로 따로 가른 갈래(제목 「추가 모집」 · 모집권역·거주지역만 완화 · 그 밖 자격완화) = 화면 배지 글자(완화 행 전부 · 보이는 칩)')
  }
  // ⑦-1c 상세 세로 노선(2026-10-15 · 우편함 「표시층 — 상세 세로 노선(일정 표 …)」 · 원칙 33) — 펼친 상세 「🗓️ 공급일정」이
  //    공고문 일정 표(announcement_schedule)의 이 카드 회차 행을 빠짐없이 · 다른 회차 없이 그리는가.
  //    기대값은 DB 에서 **따로** — 목록 RPC 카드마다 같은 제목 키(announcement_dedup_key)의 공고 중 apply_end = 카드 apply_end 인 공고의 일정 행 id
  //    (그룹에 공고가 하나뿐이면 그 공고 행 전부). 화면은 역마다 data-sch-id 를 단다 — 범위 단추로 나뉜 노선(순위별 두 벌)은 모든 노선의 id 를 모은다.
  //    열린 카드 중 범위가 갈리는 공고를 먼저 넣어 최대 8장을 실제로 펼쳐 잰다. SIMULATE=sched_line 이면 기대 id 하나를 더해 잰다(실패해야 맞다).
  {
    const [sq] = await sqlRead(`
      with today as (select (now() at time zone 'Asia/Seoul')::date d),
      c as (select d.announcement_id aid, d.title, d.apply_end e from get_announcements_deduped() d, today t where d.apply_end >= t.d),
      g as (select c.aid, c.e, a.announcement_id gid, a.apply_end ge from c join announcements a on announcement_dedup_key(a.title) = announcement_dedup_key(c.title)),
      n as (select aid, count(*) ng from g group by aid),
      s as (select g.aid, sc.id, sc.scope_text, sc.period_text from g join n using (aid) join announcement_schedule sc on sc.announcement_id = g.gid
             where n.ng = 1 or g.ge is not distinct from g.e),
      a as (select aid, json_agg(id order by id) ids, json_object_agg(id, coalesce(period_text, '')) txt, count(distinct scope_text) nsc from s group by aid)
      select coalesce(json_agg(json_build_object('aid', aid, 'ids', ids, 'txt', txt) order by nsc desc, aid), '[]'::json) j, count(*) n from a`)
    const want = (sq.j || []).slice(0, 8)
    if (process.env.SIMULATE === 'sched_line' && want.length) want[0].ids = want[0].ids.concat([-1])
    const got = []
    let err = null
    try {
      // 앞 점검이 다른 탭·지도 보기·시트에 화면을 둔 채일 수 있다 — 공고 탭 목록 보기로 돌리고, 펼치기는 DOM 클릭으로(보이는지에 기대지 않는다 · 이슈 #535).
      await page.evaluate(() => { goMain(2); if (typeof zf3SetView === 'function') zf3SetView('list'); document.getElementById('noticeFilterPanel')?.classList.add('hidden') })
      for (const w of want) {
        // 🔴 슬롯은 펼친 그 카드의 것(schedule-slot-<카드 id>)만 읽는다 — 앞 점검(매칭 결과)이 펼쳐 둔 다른 카드 슬롯이 문서에 먼저 있다(run 108).
        const cid = await page.evaluate(aid => {
          const rows = noticeData.filter(n => String(n.announcement_id) === aid); renderNoticeList(rows, rows.length, 0)
          const c = document.querySelector(`#notice-list .hcard[data-announcement-id="${CSS.escape(aid)}"]`); if (c) c.click(); return c ? c.dataset.cardId : null
        }, w.aid)
        if (!cid) { got.push({ aid: w.aid, ids: null }); continue }
        await page.waitForFunction(cid => !!document.querySelector(`#schedule-slot-${CSS.escape(cid)} .zf-sch`), cid, { timeout: 15000 }).catch(() => {})
        // 🔵 2026-10-15(우편함 「표시층 — 공급일정 아코디언 기본 접음 …」) — 노선은 기본 접힘(closed)이어야 한다. 잰 뒤 노선과 역을 모두 펼쳐
        //    깨진 글자를 보이는 글(innerText)로 재고, 역마다 원문 글(「원문」 줄 · 날짜 없는 역은 첫 줄) = DB period_text 글자 그대로인지 본다(깎인 글자 0).
        got.push(await page.evaluate(([aid, cid]) => {
          const slot = document.getElementById('schedule-slot-' + cid)
          const wrap = slot && slot.querySelector('.zf-sch')
          const items = slot ? [...slot.querySelectorAll('.zf-sch .policy-item')] : []
          const closed = !!wrap && !wrap.open
          if (wrap) { wrap.open = true; wrap.querySelectorAll('details.zf-sch-stop').forEach(d => { d.open = true }) }
          const raw = {}
          items.forEach(i => { if (i.dataset.schId) { const el = i.querySelector('.zf-sch-raw') || i.querySelector('.zf-sch-nd'); raw[i.dataset.schId] = el ? el.textContent : null } })
          return { aid, closed, raw, ids: wrap ? [...new Set(items.map(i => Number(i.dataset.schId)).filter(n => !isNaN(n)))].sort((a, b) => a - b) : null,
            bad: ((slot ? slot.innerText : '').match(/�|\[object|undefined/g) || []).length }
        }, [w.aid, cid]))
      }
      await page.evaluate(() => { try { applyNoticeFiltersAndRender() } catch (e) {} })
    } catch (e) { err = String(e.message || e).slice(0, 120) }
    let ok = false, value
    if (!err) {
      const bad = want.map((w, i) => {
        const g = got[i] || {}
        if (!g.ids) return `${w.aid}: 노선 없음`
        const ws = [...w.ids].sort((a, b) => a - b)
        const rawBad = Object.keys(g.raw || {}).filter(k => (w.txt || {})[k] !== undefined && g.raw[k] !== w.txt[k]).length
        const sameIds = JSON.stringify(ws) === JSON.stringify(g.ids)
        return sameIds && !g.bad && g.closed && !rawBad ? null
          : `${w.aid}: ${sameIds ? '' : `화면 ${g.ids.length}역 ≠ DB ${ws.length}행 · `}${g.closed ? '' : '기본 펼침 · '}${rawBad ? `원문 다름 ${rawBad}역 · ` : ''}${g.bad ? '깨진 글자' : ''}`.replace(/ · $/, '')
      }).filter(Boolean)
      ok = bad.length === 0
      value = `일정 행 있는 열린 카드 ${sq.n} 중 ${want.length}장 펼침 · 역 ${got.reduce((s, g) => s + ((g && g.ids) || []).length, 0)} · 어긋남 ${bad.length}${bad.length ? ': ' + bad.slice(0, 3).join(' / ') : ''}`
      extra.sched_line = { want, got, bad }
    } else value = `못 잼(${err})`
    add('sched_line', '상세 세로 노선 — 공고문 일정 표의 이 카드 회차 행을 빠짐없이 · 다른 회차 없이', ok ? 'pass' : 'fail', value,
      'DB 로 따로 계산한 일정 행 id(같은 제목 키 · apply_end = 카드 apply_end) = 펼친 상세 노선 역의 id(범위 노선 모두) · 노선 기본 접힘 · 역 원문 글 = DB period_text · 깨진 글자 0')
  }
  // ⑦-2 한글 조합 입력(2026-10-13 · 우편함 「코드 — 한글 중복 입력 …」 1 · 원칙 33) — 공고 검색 칸에 실제 조합 이벤트(CDP Input.imeSetComposition →
  //    insertText)로 「부산」을 친다. 두 꼴을 본다:
  //    ⓐ 단어 조합(모바일 입력기처럼 ㅂ → 부 → 붓 → 부사 → 부산을 한 조합으로 · 확정 전) — 확정하기 전에 공고 탭 머리 「조건에 맞는 N건」과 시트 머리줄 수가
  //       칸 value 를 코드로 넣고 그린 기준 수와 같아야 한다(치는 대로 결과가 따라온다 · 빈 칸 수와 달라야 한다).
  //    ⓑ 음절 확정(데스크톱처럼 ㅂ → 부 → 붓 → 「부」 확정 → 사 → 산 → 「산」 확정) — 칸 글자 「부산」(겹침 0).
  //    계기: ① 0건 화면 「빼면 N건」 계산이 칸 value 를 비웠다 되돌려 「ㅂ부붓부사산」(#491) ② 그 고침이 둔 isComposing 건너뜀 + 불리지 않는
  //    oncompositionend 속성 때문에 조합 중 결과가 멈췄다(v206 · 다운님 실사용 「검색어를 쳐도 결과가 안 바뀐다」). 새 문맥 · 이용 기록 송신 막음.
  {
    let value = '', ok = false
    const ictx = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
    try {
      await ictx.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
      const ip = await ictx.newPage()
      await ip.goto(SITE + '?ime=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
      await ip.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0 && noticeLoaded, null, { timeout: 60000 })
      await ip.evaluate(() => { goMain(2); if (typeof zf3ToggleSheet === 'function') zf3ToggleSheet(true) })
      await ip.waitForTimeout(1200)
      const num = () => ip.evaluate(() => {
        const t = (document.querySelector('#zf3NoticeHead .zf3-lh') || {}).textContent || ''
        const m = t.match(/([\d,]+)건/)
        const sc = (document.querySelector('[data-zf3-sheetcount]') || {}).textContent || ''
        const ms = sc.match(/([\d,]+)건/)
        return { v: document.getElementById('noticeSearchInput').value, n: m ? Number(m[1].replace(/,/g, '')) : null, s: ms ? Number(ms[1].replace(/,/g, '')) : null }
      })
      const n0 = (await num()).n
      await ip.focus('#noticeSearchInput')
      const cdp = await ictx.newCDPSession(ip)
      // ⓐ 단어 조합 — 확정하지 않은 채 잰다
      const wtrace = []
      for (const t of ['ㅂ', '부', '붓', '부사', '부산']) {
        await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length })
        await ip.waitForTimeout(250)
        wtrace.push(await num())
      }
      const wlast = wtrace[wtrace.length - 1]
      await cdp.send('Input.insertText', { text: '부산' })
      await ip.waitForTimeout(250)
      // 기준 수 — 조합 없이 칸에 「부산」을 넣고 그린 수
      const ref = await ip.evaluate(() => { const i = document.getElementById('noticeSearchInput'); i.value = '부산'; applyNoticeFiltersAndRender(); return null }).then(() => num())
      await ip.evaluate(() => { const i = document.getElementById('noticeSearchInput'); i.value = ''; applyNoticeFiltersAndRender() })
      await ip.waitForTimeout(300)
      await ip.focus('#noticeSearchInput')
      // ⓑ 음절 확정
      const strace = []
      for (const [k, t] of [['c', 'ㅂ'], ['c', '부'], ['c', '붓'], ['i', '부'], ['c', '사'], ['c', '산'], ['i', '산']]) {
        if (k === 'c') await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length })
        else await cdp.send('Input.insertText', { text: t })
        await ip.waitForTimeout(200)
        strace.push(await ip.evaluate(() => document.getElementById('noticeSearchInput').value))
      }
      const sv = strace[strace.length - 1]
      const live = wlast.v === '부산' && wlast.n != null && wlast.n === ref.n && wlast.n !== n0 && wlast.s === wlast.n
      ok = live && sv === '부산'
      value = `단어 조합(확정 전) 칸 「${wlast.v}」 · 결과 ${wtrace.map(x => x.n).join(' → ')}건(시트 ${wlast.s ?? '없음'}) · 기준 ${ref.n} · 빈 칸 ${n0} / 음절 확정 칸 「${sv}」(단계 ${strace.join(' → ')})`
    } catch (e) {
      value = '못 잼: ' + String(e).slice(0, 160)
    } finally {
      await ictx.close()
    }
    add('ime_ko', '한글 조합 입력 — 공고 검색 칸에 「부산」 · 치는 대로 결과', ok ? 'pass' : (value.startsWith('못 잼') ? 'warn' : 'fail'), value,
      '단어 조합(확정 전)에서 머리·시트 결과 수 = 「부산」 기준 수 ≠ 빈 칸 수 · 음절 확정 칸 글자 「부산」(겹침 0) · 재다 죽으면 경고')
  }
  // ⑧ 접근성(axe-core · 2026-10-12 · 우편함 「코드 — Claude Code 장비 정비」 1) — 여섯 상태(2026-10-13 매칭 결과 더함)를 따로 열어 재고 기준선(a11y-baseline.json)과 견준다.
  //    🔴 critical ≥ 1 은 실패(fail — 이슈가 열린다 · 2026-10-13 claude.ai 판정으로 승격 · 기준선은 같은 날 배포 v201 다섯 상태 0 으로 다시 씀).
  //    기준선보다 늘어난 serious 이하는 여전히 경고다. 패키지가 없거나 재다 죽어도 warn 이다 — 나머지 점검을 실패로 만들지 않는다.
  //    기준선을 새로 쓰는 것은 claude.ai 판정 뒤에만(a11y.mjs --write-baseline).
  try {
    const { measure, compare, loadBaseline } = await import('./a11y.mjs')
    const AxeBuilder = (await import('@axe-core/playwright')).default
    const got = await measure(browser, SITE + '?a11y=' + Date.now(), { AxeBuilder })
    const c = compare(got, loadBaseline())
    extra.a11y = { states: got, increased: c.increased }
    add('a11y', '접근성(axe-core · WCAG 2.1 A·AA) — 기준선보다 늘었나', c.status, c.value,
      '여섯 상태(390 추천 · 390 공고 탭 · 390 카드 펼침 · 1280 공고 탭 · 390 어둡게 · 390 매칭 결과) critical 0(넘으면 실패) · 규칙별 위반 요소 수 ≤ 기준선 + max(3, 20%) · 새 규칙 0(넘으면 경고)')
  } catch (e) {
    add('a11y', '접근성(axe-core · WCAG 2.1 A·AA) — 기준선보다 늘었나', 'warn', '못 잼: ' + String(e).slice(0, 200), '처음엔 경고만')
  }
  // ⑨ 첨부 미리보기(Drive 썸네일 · 2026-10-12 · D-3 단계 c 「썸네일 저장소」 판단) — 화면 갤러리는 공개 끝점
  //    drive.google.com/thumbnail 을 <img> 로 부른다. 공식 API 가 아니라 Google 이 바꾸거나 막으면 갤러리가 자리표시자로만
  //    남고(extrasThumbFailed) 아무도 모른다 — 그 신호. 무작위 10장 중 image/* 200 이 8장 미만이면 경고(이슈를 열지 않는다).
  //    404 가 나는 파일이 원래 있다(2026-09-13 전수 1,126 중 2 — 60MB 넘는 팸플릿 PDF). 이 경고가 서면 Supabase Storage 썸네일로 옮길 때다.
  try {
    const rows = await sqlRead(`select substring(file_url from '/file/d/([^/?]+)') fid from announcement_extras
      where file_url like '%drive.google.com/file/d/%' order by random() limit 10`)
    let ok = 0
    const bad = []
    for (const { fid } of rows) {
      try {
        const r = await fetch(`https://drive.google.com/thumbnail?id=${fid}&sz=w300`, { signal: AbortSignal.timeout(15000) })
        if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) ok++
        else bad.push(`${fid.slice(0, 8)}…:${r.status}`)
      } catch (e) { bad.push(`${fid.slice(0, 8)}…:${String(e.name || e).slice(0, 20)}`) }
    }
    extra.drive_thumb = { n: rows.length, ok, bad }
    add('drive_thumb', '첨부 미리보기(Drive 썸네일 끝점)가 그림을 주나', rows.length && ok >= Math.ceil(rows.length * 0.8) ? 'pass' : 'warn',
      `${ok}/${rows.length}${bad.length ? ' · ' + bad.slice(0, 3).join(' ') : ''}`, '무작위 10장 중 image/* 200 이 8장 이상 — 미만이면 경고만')
  } catch (e) {
    add('drive_thumb', '첨부 미리보기(Drive 썸네일 끝점)가 그림을 주나', 'warn', '못 잼: ' + String(e).slice(0, 200), '경고만')
  }
  // ⑪ 빈 탭(2026-10-18 · 우편함 「코드·운영 — 게이트 재는 장치」 ② · 런칭 게이트 G5 「다섯 탭 중 빈 탭 0」) — 비로그인으로 새 쪽을 열고
  //    다섯 탭을 goMain(i)로 하나씩 연다. 3초 뒤 #main{i}의 보이는 글자가 없으면 빈 탭이다. 「없어요·없습니다」 꼴(빈 상태)이면
  //    그 탭 안에 누를 것(단추·링크)이 있어야 한다 — 무엇이 없고 다음에 무엇을 하라는 안내 없이 「없어요」만이면 빈 탭으로 친다.
  //    받는 중 표시(「불러오는 중」 등)는 빈 탭이 아니다(목록이 찬 뒤 연다 — 받는 중을 「없어요」로 말하면 위 규칙에 걸린다).
  //    로그인·저장 0 상태는 여기서 재지 않는다(점검은 비로그인 — 실사용 회차 몫). 실패는 안 멈춤(gate.mjs 밖 · health-screen 이슈).
  try {
    const tp = await ctx.newPage()
    await tp.goto(SITE + '?health=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 })
    await tp.waitForFunction(() => typeof noticeData !== 'undefined' && noticeData.length > 0, null, { timeout: 60000 })
    const tabs = []
    for (const i of [1, 2, 3, 4, 5]) {
      await tp.evaluate(n => goMain(n), i)
      await tp.waitForTimeout(3000)
      tabs.push(await tp.evaluate(n => {
        const el = document.getElementById('main' + n)
        const name = ((document.getElementById('m' + n) || {}).innerText || String(n)).replace(/\s+/g, ' ').trim()
        if (!el || el.classList.contains('hidden')) return { n, name, chars: 0, why: '탭이 안 열림' }
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
        const empty = /없어요|없습니다/.test(text)
        const act = [...el.querySelectorAll('button, a[href], [onclick], [role=button]')].filter(b => b.offsetParent !== null).length
        const why = !text ? '보이는 글자 0' : (empty && act === 0 ? '「없어요」인데 누를 것 0' : '')
        return { n, name, chars: text.length, empty, act, why }
      }, i))
    }
    await tp.close()
    extra.empty_tabs = tabs
    const bad = tabs.filter(t => t.why)
    add('empty_tabs', '빈 탭(비로그인 다섯 탭 · 런칭 게이트 G5)', bad.length === 0 ? 'pass' : 'fail',
      bad.length ? bad.map(t => `${t.name}: ${t.why}`).join(' / ')
        : tabs.map(t => `${t.name} ${t.chars}자${t.empty ? '(빈 상태 · 누를 것 ' + t.act + ')' : ''}`).join(' · '),
      '다섯 탭 모두 3초 뒤 보이는 글자 > 0 · 「없어요」 꼴이면 탭 안에 누를 것 ≥ 1 — 로그인·저장 0 상태는 재지 않는다')
  } catch (e) {
    add('empty_tabs', '빈 탭(비로그인 다섯 탭 · 런칭 게이트 G5)', 'warn', '못 잼: ' + String(e).slice(0, 200), '다섯 탭을 열어 잰다(못 재면 경고만)')
  }
} catch (e) {
  add('runner', '점검 실행', 'fail', String(e).slice(0, 300), '점검 스크립트가 끝까지 돈다')
} finally {
  await browser.close()
}
// ③ 콘솔 오류
extra.console_errors = consoleErrors
add('console', '콘솔 오류(카카오맵 제외)', consoleErrors.length === 0 ? 'pass' : 'fail', consoleErrors.length ? `${consoleErrors.length}: ${consoleErrors.slice(0, 2).join(' / ')}` : 0, '0')

// ⑫ 실행 요약 DB 한 줄(2026-10-18 · 우편함 「코드·운영 — 게이트 재는 장치」 ① · 런칭 게이트 G1 화면) — 운영 점검과 같은 길
//    public.ops_health_record(jsonb)에 kind='screen' 으로 넘긴다: 실행 요약 1행은 ops_health_runs, 경고·실패 항목은 ops_health_findings(30일).
//    claude.ai 가 SQL 로 G1 화면 쪽을 잰다(docs/launch-gates.sql). 기록이 실패하면 ⚠️ 하나를 더한다(판정은 결과 파일·이슈가 그대로 낸다).
{
  const run_url = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null
  const all = checks.map(c => ({ id: c.id, name: c.name, status: c.status, value: String(c.value ?? '') }))
  try {
    const n = await recordFindings({ kind: 'screen', at: new Date().toISOString(), run_url, ref: process.env.GITHUB_REF_NAME || null, checks: all })
    console.log(`경고·실패 기록 ${n}행(kind=screen)`)
  } catch (e) {
    add('findings_log', '실행 요약·경고·실패 DB 기록(ops_health_runs kind=screen)', 'warn', String(e).slice(0, 200), '기록 실패는 ⚠️ 경고만 — 판정은 결과 파일·이슈가 낸다')
  }
}

report('screen', 'A. 화면 점검', checks, extra)
