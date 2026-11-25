// node .github/health/round-gap.test.mjs — 고리 밖 같은 단지 셈 판정(가짜 쌍)
import { readFileSync } from 'node:fs'
import { judgeRoundGap } from './round-gap.mjs'
let ok = 0, bad = 0
const t = (n, c) => { if (c) ok++; else { bad++; console.log('✗', n) } }
const ex = new Set(JSON.parse(readFileSync(new URL('./round-gap.json', import.meta.url), 'utf8')).excluded.map(x => x.id))
const rows = [
  { c: '2015122300020099', o: '2015122300021090', end: '2026-12-02', soon: true, chain: false },   // 예외
  { c: '2015122300019509', o: '2015122300021007', end: '2026-11-27', soon: true, chain: false },   // 임박
  { c: '2015122300019793', o: '2015122300021128', end: '2026-12-31', soon: false, chain: false },  // 대상(2판 적재 전 꼴)
  { c: '2015122300019000', o: '2015122300021000', end: '2026-12-31', soon: false, chain: true },   // 고리 안
]
const j = judgeRoundGap(rows, ex)
t('ℹ️ 만(판정 0)', j.status === 'info')
t('대상 1 — 2판 적재 전 꼴', j.target.length === 1 && j.target[0] === '2015122300019793')
t('값 글 — 대상 · 임박 · 고리 안 · 예외 · 쌍', /^대상 1: …19793→…21128\(12-31\) · 마감 임박\(짝 마감 ≤ 오늘\+7\) 1 · 고리 안 1 · 예외\(다른 단지\) 1 · 쌍 4$/.test(j.value))
t('예외 파일 4', ex.size === 4)
t('빈 쌍 → 대상 0', judgeRoundGap([], ex).value.startsWith('대상 0 '))
console.log(`고리 밖 같은 단지 시험 ${ok}/${ok + bad}`)
process.exit(bad ? 1 : 0)
