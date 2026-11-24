// ㊸ 소득표 줄 사이 검산(2026-11-24 · 우편함 「코드·운영 — 열여섯째 묶음」 3(나) · 근거 국면 C 계속 회신 5 ⑦1) — ℹ️ 셈만(판정 0 · 안 멈춤 · gate.mjs HARD 밖).
//    한 정책 행(category ~ 소득 · ⚠️ 밖) 안에 「비율 줄」이 둘 이상이면(예 「구분 : 70% · 1인 가구 : 3,432,027 · 2인가구 : …」 · 「90% : 1인가구 4,194,699원 / …」)
//    같은 가구원수 칸이 같은 바탕값(도시근로자 월평균소득 100%)에서 나왔는지 본다: 바탕 = 금액 ÷ (비율 + 가산)
//      가산 = 1인 +20%p · 2인 +10%p(원문 「1인 가구는 20%p, 2인 가구는 10%p 가산」 꼴) — 1·2인은 가산 있음·없음 둘 다 받는다(가산 없는 표도 있다) · 3인 이상은 가산 없음.
//    두 줄의 바탕이 상대 0.1% 넘게 다르면 어긋남(원 단위 반올림은 1e-6 수준 · 천 원 반올림도 0.03% 안).
//    기준선 2026-11-24: 20750_경상북도_구미시 5인(70% 6,528,890 ↔ 100% 9,362,985 — 70% 줄로 셈하면 9,326,986 · ⚠️ 행 「⚠️ 소득 기준 5인가구 100% 금액」 있음).
//    걸린 공고에 「⚠️ … 소득 …」 행이 있으면 「알고 있음」으로 따로 센다.
export const PCT_HEAD = /(?:^|[\s:：|·])([1-9][0-9]{1,2})\s*%\s*(?:이하)?\s*(?=[:：·|]|\s*\(?\s*[1-9]\s*인)/
const PAIR = /([1-9])\s*인\s*(?:가구)?\s*(?:이상)?\s*[:：]?\s*([0-9]{1,3}(?:,[0-9]{3}){1,3})(?![0-9,])/g
const TOL = 0.001

export function parsePctLines(text) {
  const out = []
  for (const raw of String(text || '').split('\n')) {
    const h = PCT_HEAD.exec(raw)
    if (!h) continue
    const rest = raw.slice(h.index + h[0].length)
    const cells = new Map()
    for (const m of rest.matchAll(PAIR)) {
      const n = Number(m[1]), a = Number(m[2].replace(/,/g, ''))
      if (a >= 100000 && !cells.has(n)) cells.set(n, a)
    }
    if (cells.size >= 2) out.push({ pct: Number(h[1]), cells })
  }
  return out
}

const bonus = n => (n === 1 ? [20, 0] : n === 2 ? [10, 0] : [0])

export function checkPctRow(text) {
  const lines = parsePctLines(text)
  const bad = []
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j]
    if (A.pct === B.pct) continue
    for (const [n, a] of A.cells) {
      const b = B.cells.get(n)
      if (b == null) continue
      const ok = bonus(n).some(g => Math.abs((a / (A.pct + g)) / (b / (B.pct + g)) - 1) <= TOL)
      if (!ok) bad.push(`${n}인 ${A.pct}% ${a.toLocaleString('en-US')} ↔ ${B.pct}% ${b.toLocaleString('en-US')}`)
    }
  }
  return { lines: lines.length, bad }
}

export const INCOME_PCT_SQL = `
select json_build_object('rows', (select coalesce(json_agg(json_build_object('a', p.announcement_id, 'id', left(p.id::text, 8), 'raw', p.content_raw,
        'warned', exists (select 1 from public.announcement_policies w where w.announcement_id = p.announcement_id
                          and w.category ~ '^⚠' and w.category ~ '소득'))), '[]'::json)
     from public.announcement_policies p
     where p.category ~ '소득' and p.category !~ '^⚠'
       and p.content_raw ~ '[0-9]{2,3}\\s*%[^\\n]*[1-9]\\s*인[^\\n]*[0-9]{1,3},[0-9]{3}[^\\n]*[1-9]\\s*인[^\\n]*[0-9]{1,3},[0-9]{3}')) j`

export function judgeIncomePct(j) {
  const hits = []
  let seen = 0
  for (const r of j.rows || []) {
    const c = checkPctRow(r.raw)
    if (c.lines < 2) continue
    seen++
    if (c.bad.length) hits.push({ a: r.a, id: r.id, warned: r.warned, why: c.bad.slice(0, 2).join(' · ') })
  }
  const anns = [...new Set(hits.map(h => h.a))]
  const known = [...new Set(hits.filter(h => h.warned).map(h => h.a))]
  const value = `어긋난 공고 ${anns.length}(⚠️ 소득 행 있음 ${known.length})${hits.length ? ': ' + hits.slice(0, 4).map(h => `${h.a}(${h.why})`).join(' / ') : ''} · 비율 줄 둘 이상인 행 ${seen}`
  const rule = 'ℹ️ 숫자만(판정 0 · 안 멈춤) — 한 정책 행(소득 · ⚠️ 밖)의 비율 줄끼리 같은 가구원수 칸 바탕값(금액 ÷ (비율 + 1인 20%p · 2인 10%p 가산 · 가산 없음도 받음))이 0.1% 넘게 다름 · 기준선 2026-11-24 1(20750 경북 5인)'
  return { status: 'info', value, rule, hits }
}
