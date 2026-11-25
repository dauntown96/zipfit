// 원문 소득표 금액 ↔ 도시근로자 기준표 가장 큰 통계 연도(2026-11-25 · 우편함 「코드·운영 — 스물다섯째」 5) — health-ops ℹ️(셈만 · 판정 0 · HARD 밖).
//   재료: income-table.mjs INCOME_ROWS_SQL(정책 행 category ~ 소득 · ⚠️ 밖 · 「N인가구 : 금액」 줄) 중 본문에 「도시근로자」가 든 행.
//   기준: urban_worker_monthly_income 의 가장 큰 standard_year 의 가구원수별 income_100.
//   한 공고의 어느 줄 금액도 그 해 income_100 × p%(p = 10~300 정수 · ±1.5원 — 원 단위 반올림·절사)와 안 맞으면 「다름」으로 센다.
//   인용 연도(「2026년도 도시근로자」)는 값에만 — 「2026년도 적용」 표는 2025 통계 값이 맞다(SH_313610 선례). 기준표에 없는 가구원수 줄은 셈 밖.
//   기준선 2026-11-25: 도시근로자 표 공고 16(열린 5) · 다름 0.
import { parseTables } from './income-table.mjs'
export const URBAN_TOP_SQL = `select json_build_object('year', max(standard_year), 'm', (select json_object_agg(household_size, income_100) from public.urban_worker_monthly_income
  where standard_year = (select max(standard_year) from public.urban_worker_monthly_income))) j from public.urban_worker_monthly_income`
export function pctOf(base, n, a) {
  const b = base[n]
  if (!b) return null
  for (let p = 10; p <= 300; p++) if (Math.abs(a - b * p / 100) < 1.5) return p
  return false
}
export function judgeIncomeYear(rows, top) {
  const per = new Map()
  for (const r of rows || []) {
    if (!/도시근로자/.test(r.raw || '')) continue
    const lines = parseTables(r.raw).flat()
    if (!lines.length) continue
    const o = per.get(r.a) || { open: false, ok: 0, bad: 0, cite: null }
    o.open = o.open || !!r.open
    o.cite = o.cite || ((String(r.raw).match(/(20\d\d)\s*년\s*도?[^\n]{0,15}도시근로자/) || [])[1] || null)
    for (const l of lines) for (const a of l.amts) { const m = pctOf(top.m || {}, l.n, a); if (m) o.ok++; else if (m === false) o.bad++ }
    per.set(r.a, o)
  }
  const all = [...per.entries()]
  const diff = all.filter(([, o]) => o.ok === 0 && o.bad > 0)
  const short = id => (/^\d{16}$/.test(id) ? '…' + id.slice(-5) : id)
  return {
    status: 'info',
    n: diff.length,
    value: `다름 ${diff.length}${diff.length ? ': ' + diff.slice(0, 5).map(([a, o]) => `${short(a)}${o.open ? '(열림)' : ''}${o.cite ? ' 인용 ' + o.cite : ''}`).join(', ') : ''} · 도시근로자 표 공고 ${all.length}(열린 ${all.filter(([, o]) => o.open).length}) · 기준 ${top.year}년`,
    rule: `정보 — 정책 행(소득 · ⚠️ 밖 · 「도시근로자」 든) 「N인가구 : 금액」 줄의 금액이 하나도 기준표 가장 큰 통계 연도(urban_worker_monthly_income) income_100 × p%(10~300 · ±1.5원)와 안 맞는 공고 수 · 0 이 정상 · 인용 연도(「2026년도」)는 값에만(2026년도 적용 표 = 2025 통계) · 판정하지 않는다`,
  }
}
