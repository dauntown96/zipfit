// 겉 일정 줄(.zf12-when) 세 꼴 점검 — 시계를 접수 끝 시각 앞·뒤 두 벌로 둔 화면에서 잰다(2026-11-26 · 우편함 「코드·운영 — 스물여덟째」 1 · 원칙 33).
//   ① 같은 날짜 역 두 번 0 — 날짜 글자가 보이는 역(.zf12-w[data-zf12-d] 중 .zf12-dt 가 숨지 않은 것)끼리 같은 날짜가 둘 이상이면 걸림
//      (판 K #1305 「접수·마감」 한 역 · #1311 「끝 시각 뒤 차수 역 걷기」가 막으려던 꼴 — 장성 …21071 16:00 뒤).
//   ② 「오늘 …까지」는 ◉ 역 옆 한 곳 — 줄 안 「오늘 …까지」 글자가 둘 이상이거나, 그 글자를 든 남은 날 조각(.zf12-dd)의 바로 앞이 ◉ 역(.zf12-w.next)이 아니면 걸림.
//   ③ 「YYYY-MM-DD ~ YYYY-MM-DD」 시작 > 끝 0 — 열린 카드(펼침 자리 포함) 글자에서 그 꼴의 기간이 거꾸로면 걸림(판 K 덧 1 …21044 「12-01 ~ 11-30」).
//   시계는 KST 기준 — 화면 zf3Today·zfNowLocal 이 Date.now()+9h 로 날을 정하므로 page.clock.setFixedTime 하나로 두 벌이 갈린다(브라우저 시간대 무관).
//   열린 카드 = 목록에 보이는 .hcard 중 회색(zf3-closed) 아닌 것.

// 브라우저 안에서 돈다(바깥 변수를 쓰지 않는다) — 보이는 쪽의 열린 카드마다 한 줄.
export const WHEN_LINE_FN = () => {
  const vis = e => !!e && e.offsetParent !== null
  const out = []
  for (const c of [...document.querySelectorAll('#notice-list .hcard')].filter(vis)) {
    if (c.classList.contains('zf3-closed')) continue
    const aid = c.getAttribute('data-announcement-id') || '?'
    const w = c.querySelector('.zf12-when')
    const on = vis(w)
    const st = on ? [...w.querySelectorAll('.zf12-w')].map(s => {
      const dt = s.querySelector('.zf12-dt')
      return [s.dataset.zf12K || '', s.dataset.zf12D || '', s.classList.contains('next') ? 'next' : s.classList.contains('past') ? 'past' : 'fut', !!dt && (dt.hidden || !vis(dt))]
    }) : []
    const dd = on ? [...w.querySelectorAll('.zf12-dd')].map(d => {
      const p = d.previousElementSibling
      return [(d.textContent || '').trim(), !!p && p.classList.contains('zf12-w') && p.classList.contains('next')]
    }) : []
    const todayN = on ? ((w.textContent || '').match(/오늘[^›]*?까지/g) || []).length : 0
    const sib = c.nextElementSibling && !c.nextElementSibling.classList.contains('hcard') ? c.nextElementSibling.textContent : ''
    const txt = (c.textContent || '') + ' ' + (sib || '')
    const spans = []
    const re = /(20\d{2}-\d{2}-\d{2})\s*~\s*(20\d{2}-\d{2}-\d{2})/g
    let m
    while ((m = re.exec(txt))) spans.push([m[1], m[2]])
    out.push({ aid, on, st, dd, todayN, spans })
  }
  return out
}

// SIMULATE=when_line(시험) — 보이는 첫 겉 줄의 첫 날짜 역을 하나 더 붙이고(①) · 「오늘 …까지」 조각을 줄 끝에 하나 더(②) · 카드 글자에 거꾸로 기간(③).
export const WHEN_LINE_BREAK_FN = () => {
  const w = [...document.querySelectorAll('#notice-list .hcard:not(.zf3-closed) .zf12-when')].find(e => e.offsetParent !== null && e.querySelector('.zf12-w[data-zf12-d]'))
  if (!w) return false
  const s = w.querySelector('.zf12-w[data-zf12-d]')
  w.appendChild(s.cloneNode(true))
  const sep = document.createElement('span'); sep.className = 'zf12-sep'; sep.textContent = '›'; w.appendChild(sep)   // 조각 앞이 역이 아니게
  const d = document.createElement('span'); d.className = 'zf12-dd'; d.textContent = '오늘 16:00까지(시험)'; w.appendChild(d)
  const p = document.createElement('span'); p.textContent = ' 2026-12-01 ~ 2026-11-30(시험)'; w.closest('.hcard').appendChild(p)
  return true
}

// 판정 — rows = WHEN_LINE_FN 결과를 모은 것. 돌려주는 bad 셋은 「…끝5 · 까닭」 글자 목록.
export function judgeWhenLines(rows) {
  const dup = [], today = [], span = []
  let lines = 0, spans = 0
  const tag = a => '…' + String(a).slice(-5)
  for (const r of rows || []) {
    if (r.on) lines++
    const shown = (r.st || []).filter(s => s[1] && !s[3]).map(s => s[1])
    const seen = new Set(), twice = new Set()
    for (const d of shown) { if (seen.has(d)) twice.add(d); seen.add(d) }
    if (twice.size) dup.push(`${tag(r.aid)} ${[...twice].join(',')} 두 번`)
    const tdd = (r.dd || []).filter(x => /오늘[^›]*?까지/.test(x[0]))
    if ((r.todayN || 0) > 1) today.push(`${tag(r.aid)} 「오늘 …까지」 ${r.todayN}곳`)
    else if (tdd.some(x => !x[1])) today.push(`${tag(r.aid)} 「${tdd.find(x => !x[1])[0].slice(0, 24)}」 ◉ 옆 아님`)
    for (const [a, b] of r.spans || []) { spans++; if (a > b) span.push(`${tag(r.aid)} ${a} ~ ${b}`) }
  }
  return { lines, spans, dup, today, span, bad: dup.length + today.length + span.length }
}

// 두 벌 판정 글자 — passes = [{ label, at, j }]
export function whenLineSummary(passes) {
  const bad = passes.reduce((a, p) => a + p.j.bad, 0)
  const value = passes.map(p => `${p.label}(${p.at}) 줄 ${p.j.lines} · 두 번 ${p.j.dup.length} · 오늘 자리 ${p.j.today.length} · 거꾸로 기간 ${p.j.span.length}/${p.j.spans}`
    + (p.j.bad ? ': ' + [...p.j.dup, ...p.j.today, ...p.j.span].slice(0, 4).join(' / ') : '')).join(' ‖ ')
  return { status: bad ? 'warn' : 'pass', value }
}
