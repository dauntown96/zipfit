// ㊴b 소득기준 표 가구원수 줄 대조(2026-11-19 · 우편함 「코드·운영 — 17장」 · 순위표 12위 · 💡 「공고 소득기준 표 금액을 연도별 기준표와 맞대 …」).
//    근거: 광주도시공사 21482_1 p.4 「6인가구」 두 번 — 일곱째 줄 금액 = 7인 금액 · ⚠️ 행은 run 230 · run 254 선례.
//    정책 행(category ~ 소득 · ⚠️ 밖) 본문의 「N인가구 : 금액 · 금액 …」 · 「N인 금액 금액 …」(칸 띄움) 줄을 읽어 한 행 안에서 둘을 본다:
//      ⓐ 줄 번호 — N 이 1부터 하나씩 늘지 않는다(겹침 · 건너뜀 · 거꾸로)
//      ⓑ 칸 금액 — 같은 칸(k번째 금액)이 가구원수 따라 늘지 않는다(앞 줄보다 작거나 같다 — 칸 수가 같은 이웃 줄끼리만)
//    🔴 연도별 기준표(urban_worker_monthly_income · median_income_monthly)와 맞대는 판은 뺐다(2026-11-19 첫 실측):
//       표에는 최근 판만 있어 옛 해 표로 셈한 공고가 거짓 걸림(…19307 = 2024 도시근로자 · 2인 80% 4,381,602원) — 한 행 안 자기 대조로 바꿨다.
//    셈 밖: 「N인 M명」(가구원수 × 출생자녀 조합 표 — 제천 21477_1) · 10만 원 미만 금액(만원 단위 표).
//    걸린 공고에 「⚠️ … 가구원수 …」 또는 「⚠️ … 소득 …」 정책 행이 이미 있으면 「알고 있음」(ℹ️) · 없고 열린 묶음이면 ⚠️ 후보 · 닫힌 공고는 값만.
export const LINE = /^\s*(\d)\s*인\s*(?:가구)?\s*(이상)?\s*(?:[:：]\s*|\s+(?=[0-9]))(.+)$/   // 「N인가구 : 금액」 · 「N인 금액 금액 …」(칸 띄움)
const AMT = /([0-9]{1,3}(?:,[0-9]{3}){1,3})(?![0-9,])/g   // 쉼표 든 금액만(「원」 있어도 없어도 · 면적·연도 숫자는 안 셈)
const COMBO = /^\s*\d+\s*명/                                // 「1인 0명 : …」 조합 표

export function parseLines(text) {
  const out = []
  for (const raw of String(text || '').split('\n')) {
    const m = LINE.exec(raw)
    if (!m || COMBO.test(m[3])) continue
    const amts = [...m[3].matchAll(AMT)].map(x => Number(x[1].replace(/,/g, ''))).filter(a => a >= 100000)
    if (!amts.length) continue
    out.push({ n: Number(m[1]), open: !!m[2], amts, line: raw.trim().slice(0, 80) })
  }
  return out
}

export function checkRow(text) {
  const lines = parseLines(text)
  if (lines.length < 2) return { lines: lines.length, seq: [], amt: [] }
  const seq = []
  lines.forEach((l, i) => { if (l.n !== i + 1) seq.push(`${i + 1}째 줄 ${l.n}인`) })
  const amt = []
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i]
    if (a.amts.length !== b.amts.length) continue
    const k = b.amts.findIndex((x, j) => x <= a.amts[j])
    if (k >= 0) amt.push(`${b.n}인 ${k + 1}째 칸 ${b.amts[k].toLocaleString('en-US')} ≤ 앞 줄 ${a.amts[k].toLocaleString('en-US')}`)
  }
  return { lines: lines.length, seq, amt }
}

export const INCOME_ROWS_SQL = `
select json_build_object(
  'rows', (select coalesce(json_agg(json_build_object('a', p.announcement_id, 'id', left(p.id::text, 8), 'raw', p.content_raw,
        'open', exists (select 1 from public.announcements x join public.announcements y on y.title_dedup_key = x.title_dedup_key
                        where x.announcement_id = p.announcement_id and y.apply_end >= (now() at time zone 'Asia/Seoul')::date),
        'warned', exists (select 1 from public.announcement_policies w where w.announcement_id = p.announcement_id
                        and w.category ~ '^⚠' and w.category ~ '가구원수|소득'))), '[]'::json)
     from public.announcement_policies p
     where p.category ~ '소득' and p.category !~ '^⚠' and p.content_raw ~ '(^|\\n)\\s*[0-9]\\s*인\\s*(가구)?\\s*(이상)?\\s*([:：]|\\s)\\s*[^\\n]*[0-9]{1,3},[0-9]{3}')) j`

export function judgeIncome(j) {
  const hits = []
  let seen = 0
  for (const r of j.rows || []) {
    const c = checkRow(r.raw)
    if (c.lines < 2) continue
    seen++
    if (c.seq.length || c.amt.length) hits.push({ a: r.a, id: r.id, open: r.open, warned: r.warned, why: [...c.seq, ...c.amt].slice(0, 3).join(' · ') })
  }
  const cand = hits.filter(h => h.open && !h.warned)
  const known = hits.filter(h => h.warned)
  const rule = '0 — 정책 행(category ~ 소득 · ⚠️ 밖) 「N인가구 : 금액」·「N인 금액 …」 줄에서 ⓐ N 이 1부터 하나씩 안 늚 ⓑ 같은 칸 금액이 가구원수 따라 안 늚 — 열린 묶음 ∧ 그 공고에 ⚠️(가구원수·소득) 행 없음이면 ⚠️(안 멈춤) · ⚠️ 행 있음 = 알고 있음 ℹ️ · 닫힌 공고는 값만 · 「N인 M명」 조합 표 · 만원 단위 표는 셈 밖'
  const fmt = xs => xs.slice(0, 4).map(h => `${h.a}(${h.why})`).join(' / ')
  const value = `${cand.length ? '후보 ' + cand.length + ': ' + fmt(cand) + ' · ' : ''}알고 있음 ${known.length}${known.length ? '(' + fmt(known) + ')' : ''} · 닫힌·⚠️ 없음 ${hits.length - cand.length - known.length} · 본 행 ${seen}`
  return { status: cand.length ? 'warn' : 'info', value, rule, hits }
}
