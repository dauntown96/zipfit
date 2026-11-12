// ㊴ 임대조건 한 줄 산술 — 세대 비고(extra_note)를 줄마다 읽어 셈한다(ℹ️ · 판정하지 않는다 · gate.mjs HARD 밖).
// 2026-11-12 SQL 정규식 판(ops-check.mjs ㊴ 첫 판)을 JS 로 옮겼다(우편함 「코드·운영 — 0장 일곱 …」 2·3 · 역전파 14회차 ② 점검 식 한계 꼴 넷).
//   ⓐ 합 — 비고의 「계약금 N원 · 잔금 M원」 짝마다 N + M 이 deposit · deposit_priority1(두 벌 비고 — 가군·나군) · 짝 바로 앞
//      「임대보증금(계) X원」 가운데 하나와 같으면 맞음(…20822 거짓 양성 · 전세형 「임대보증금 X원(계약금 …)」 꼴).
//   ⓑ 5% — 같은 공고에 계약금 = 계 × 5% 꼴 줄이 있을 때만, 첫 짝 |N − 계 × 5%| ≥ 1,000원(천 원 미만은 LH 가 맞춰 적는다).
//   ⓒ 전환 — 증액 구간(「증액」·「(+)」부터 다음 감액 낱말 · 「;」 · 「/」 앞까지)과 감액 구간에서 한도 L 과 결과 보증금 B 를 따로 읽는다.
//      한도: 「한도(액) L」(「원」 없어도 · 「-」·「0」·「0원」 = 0) 또는 「(+)L원 →」 꼴 · 결과: 구간 첫 「보증금 B원」.
//      증액 맞음 = 계 + L = B · 감액 맞음 = 계 − L = B(계 = deposit 또는 deposit_priority1). 한도나 결과가 없는 구간은 판정 안 함
//      (「최대 증액 시 보증금 …」·「① 감액 임대보증금 …」처럼 한도 칸 없이 결과만 적힌 꼴 · 「증액 한도 -·감액 …」처럼 결과 없는 꼴).
//   결손 칸 후보(같은 자리 ③): 합 어긋남 ∧ 전환 맞음 → 「계약금·잔금 칸」 · 합 맞음 ∧ 전환 어긋남 → 「전환 결과 칸」.
const num = s => Number(String(s).replace(/,/g, ''))
const INC = /증액|\(\+\)/
const DEC = /감액|\(-\)|\(−\)/

// 구간 하나 — 시작 낱말 위치부터 끝 낱말(반대쪽 낱말 · 「;」 · 「/」) 앞까지
function segment(note, startRe, stopRe) {
  const m = startRe.exec(note)
  if (!m) return null
  const rest = note.slice(m.index + m[0].length)
  const stop = rest.search(new RegExp(`${stopRe.source}|;|/`))
  return stop < 0 ? rest : rest.slice(0, stop)
}

export function parseConv(seg) {
  if (seg == null) return null
  let L = null
  const arrow = /^\s*(?:\([+\-−]\))?\s*([0-9][0-9,]*)\s*원\s*→/.exec(seg)
  if (arrow) L = num(arrow[1])
  else {
    const lim = /한도(?:액)?\s*:?\s*(-|[0-9][0-9,]*)/.exec(seg)
    if (lim) L = lim[1] === '-' ? 0 : num(lim[1])
  }
  const res = /보증금\s*([0-9][0-9,]*)\s*원/.exec(seg)
  if (L == null || !res) return null
  return { L, B: num(res[1]) }
}

export function parsePairs(note) {
  const out = []
  const re = /계약금\s*([0-9][0-9,]*)\s*원[\s·,/]*잔금\s*([0-9][0-9,]*)\s*원/g
  let m
  while ((m = re.exec(note))) {
    const before = note.slice(Math.max(0, m.index - 40), m.index)
    const stated = [...before.matchAll(/보증금(?:\s*계)?\s*([0-9][0-9,]*)\s*원/g)].map(x => num(x[1]))
    out.push({ k: num(m[1]), j: num(m[2]), stated: stated.length ? stated[stated.length - 1] : null })
  }
  // 붙어 있지 않은 꼴(계약금 … 다른 글 … 잔금) — 종전 SQL 판처럼 첫 계약금 · 첫 잔금을 한 짝으로
  if (!out.length) {
    const k = /계약금\s*([0-9][0-9,]*)\s*원/.exec(note), j = /잔금\s*([0-9][0-9,]*)\s*원/.exec(note)
    if (k && j) out.push({ k: num(k[1]), j: num(j[1]), stated: null })
  }
  return out
}

// rows = [[announcement_id, deposit, deposit_priority1, extra_note], …]
export function rentArith(rows) {
  const per = []
  for (const [a, d, d1, note] of rows) {
    const pairs = parsePairs(note || '')
    if (!pairs.length) continue
    const bases = [d, d1].filter(v => v != null).map(Number)
    const pairOk = p => [...bases, p.stated].includes(p.k + p.j)
    const sumBad = !pairs.every(pairOk)
    const p0 = pairs[0]
    const base0 = [...bases, p0.stated].find(v => v === p0.k + p0.j) ?? Number(d)
    const pctBad = Math.abs(p0.k - base0 * 0.05) >= 1000
    const inc = parseConv(segment(note, INC, DEC)), dec = parseConv(segment(note, DEC, INC))
    const incOk = inc ? bases.some(b => b + inc.L === inc.B) : null
    const decOk = dec ? bases.some(b => b - dec.L === dec.B) : null
    const convOk = incOk == null && decOk == null ? null : (incOk ?? true) && (decOk ?? true)
    per.push({ a, sumBad, pctBad, convOk })
  }
  const any5 = new Map()
  for (const r of per) if (!r.pctBad) any5.set(r.a, true)
  const ids = f => [...new Set(per.filter(f).map(r => r.a))].sort()
  const conv = per.filter(r => r.convOk != null)
  return {
    rows: per.length,
    sum_bad: per.filter(r => r.sumBad).length,
    pct_bad: per.filter(r => any5.get(r.a) && r.pctBad && !r.sumBad).length,
    sb_conv_ok: per.filter(r => r.sumBad && r.convOk === true).length,
    sb_no_conv: per.filter(r => r.sumBad && r.convOk == null).length,
    sb_neither: per.filter(r => r.sumBad && r.convOk === false).length,
    conv_n: conv.length,
    conv_bad: conv.filter(r => !r.convOk).length,
    conv_bad_ann: ids(r => r.convOk === false).length,
    // 결손 칸 후보(③) — 공고 목록
    cand_kj: ids(r => r.sumBad && r.convOk === true),            // 계·전환 맞음 → 계약금·잔금 칸
    cand_conv: ids(r => !r.sumBad && r.convOk === false),        // 계·계약금 맞음 → 전환 결과 칸
    cand_conv_rows: per.filter(r => !r.sumBad && r.convOk === false).length,
    ann: ids(r => r.sumBad || (any5.get(r.a) && r.pctBad)),
    conv_ids: ids(r => r.convOk === false),
  }
}

// 어긋남 공고(합·5%·전환) 중 ⚠️ 「임대조건 표기」 계열 정책 행이 없는 공고(2026-11-12 · 우편함 「코드·운영 — 서울 실행 EF 공용 길 …」 5 · claude.ai 판정).
//   ⚠️ 계열 = category 에 「⚠」 ∧ (category 또는 content_raw 앞 200자에 임대조건 · 임대보증금 · 최대전환 · 전환 · 계약금 · 잔금).
//   같은 공고 id 의 정책 행만 본다(묶음 펼침 없음 — 분석이 그 공고에 ⚠️ 를 단다). 결과 = ⚠️ 없는 공고 id 배열.
export const rentWarnMissingSql = ids => `select coalesce(json_agg(x order by x), '[]'::json) j from unnest(array[${ids.map(i => `'${String(i).replace(/'/g, "''")}'`).join(',') || "''"}]::text[]) x
  where x <> '' and not exists (select 1 from public.announcement_policies p where p.announcement_id = x and p.category ~ '⚠'
    and (p.category ~ '임대조건|임대보증금|최대전환|전환|계약금|잔금' or left(p.content_raw, 200) ~ '임대조건|임대보증금|최대전환|계약금|잔금'))`

export const RENT_ARITH_SQL = `select coalesce(json_agg(json_build_array(announcement_id, deposit, deposit_priority1, extra_note)), '[]'::json) j
  from public.housing_units where extra_note ~ '계약금\\s*[\\d,]+\\s*원' and extra_note ~ '잔금\\s*[\\d,]+\\s*원' and deposit is not null`

export function rentArithValue(c) {
  const tail = (a, k = 6) => a.slice(0, k).map(i => '…' + String(i).slice(-5)).join(' · ') + (a.length > k ? ` 외 ${a.length - k}` : '')
  return `${c.rows}행 중 합 어긋남 ${c.sum_bad}(계·전환 맞음 ${c.sb_conv_ok} · 전환 칸 없음 ${c.sb_no_conv} · 둘 다 ${c.sb_neither}) · 5% 어긋남 ${c.pct_bad}`
    + ` · 전환 칸 ${c.conv_n} 중 어긋남 ${c.conv_bad}(${c.conv_bad_ann}공고)`
    + ` · 결손 칸 후보 — 계약금·잔금 칸 ${c.cand_kj.length}공고${c.cand_kj.length ? '(' + tail(c.cand_kj) + ')' : ''}`
    + ` / 전환 결과 칸 ${c.cand_conv_rows}행 · ${c.cand_conv.length}공고${c.cand_conv.length ? '(' + tail(c.cand_conv) + ')' : ''}`
}
