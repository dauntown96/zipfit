// node .github/health/income-year.test.mjs — 판정(가짜 값) · DB 실측은 SUPABASE_ACCESS_TOKEN 이 있을 때만(읽기만)
import { judgeIncomeYear, pctOf, URBAN_TOP_SQL } from './income-year.mjs'
import { INCOME_ROWS_SQL } from './income-table.mjs'
let ok = 0, bad = 0
const t = (n, c) => { if (c) ok++; else { bad++; console.log('✗', n) } }
const top = { year: 2025, m: { 1: 3813363, 2: 5866270, 3: 8168429 } }
t('1인 100% 맞음', pctOf(top.m, 1, 3813363) === 100)
t('2인 70% 반올림 맞음', pctOf(top.m, 2, 4106389) === 70)
t('9인 셈 밖', pctOf(top.m, 9, 1000000) === null)
const cur = { a: 'X1', open: true, raw: '2026년도 도시근로자 가구원수별 월평균소득\n1인가구 : 3,813,363원\n2인가구 : 5,866,270원' }
const old = { a: '2015122300019307', open: false, raw: '2024년도 도시근로자\n1인가구 : 3,482,964원\n2인가구 : 5,415,712원' }
t('2025 값 → 다름 0', judgeIncomeYear([cur], top).n === 0)
const j = judgeIncomeYear([cur, old, { a: 'X3', raw: '소득 표\n1인가구 : 1,000,000원' }], top)
t('2024 값 → 다름 1(도시근로자 없는 행 셈 밖)', j.n === 1 && /…19307 인용 2024/.test(j.value) && /도시근로자 표 공고 2/.test(j.value))
if (process.env.SUPABASE_ACCESS_TOKEN) {
  const { sqlRead } = await import('./lib.mjs')
  const [x] = await sqlRead(INCOME_ROWS_SQL), [u] = await sqlRead(URBAN_TOP_SQL)
  const d = judgeIncomeYear(x.j.rows, u.j)
  t(`DB 지금 다름 0(실측 ${d.value})`, d.n === 0)
}
console.log(`도시근로자 연도 대조 시험 ${ok}/${ok + bad}`)
process.exit(bad ? 1 : 0)
