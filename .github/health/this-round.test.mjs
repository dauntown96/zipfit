// node .github/health/this-round.test.mjs — 판정(가짜 값) · DB 로 소급 전 꼴 재현은 SUPABASE_ACCESS_TOKEN 이 있을 때만(읽기만)
import { judgeThisRound, thisRoundSql } from './this-round.mjs'
let ok = 0, bad = 0
const t = (n, c) => { if (c) ok++; else { bad++; console.log('✗', n) } }
t('빔 0 → 통과', judgeThisRound({ matched: 5, ranked: 2, empty: [] }).status === 'pass')
const w = judgeThisRound({ matched: 5, ranked: 2, empty: [['2015122300020625', 3], ['2015122300020874', 6]] })
t('빔 2 → ⚠️', w.status === 'warn' && /^빔 2: …20625\(순위 행 3\), …20874\(순위 행 6\)/.test(w.value))
if (process.env.SUPABASE_ACCESS_TOKEN) {
  const { sqlRead } = await import('./lib.mjs')
  const [now] = await sqlRead(thisRoundSql(false)), [pre] = await sqlRead(thisRoundSql(true))
  t(`DB 지금 빔 0(실측 ${now.j.empty.length})`, now.j.empty.length === 0)
  t(`DB 소급 전 꼴 2공고(실측 ${pre.j.empty.map(x => x[0].slice(-5)).join(',')})`, pre.j.empty.length === 2 && pre.j.empty.map(x => x[0]).join() === '2015122300020625,2015122300020874')
  t(`DB 식에 맞는 공고 5(실측 ${now.j.matched})`, now.j.matched === 5)
}
console.log(`금회 한정 빔 시험 ${ok}/${ok + bad}`)
process.exit(bad ? 1 : 0)
