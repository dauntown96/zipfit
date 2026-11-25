// node .github/health/group-member-gap.test.mjs — 판정(가짜 값) · DB 지금 값은 SUPABASE_ACCESS_TOKEN 이 있을 때만(읽기만)
import { judgeGroupMemberGap, GROUP_MEMBER_GAP_SQL } from './group-member-gap.mjs'
let ok = 0, bad = 0
const t = (n, c) => { if (c) ok++; else { bad++; console.log('✗', n) } }
t('0 → 통과', judgeGroupMemberGap({ hit: [], members_diff_title: 124, named: 4, ok: 4 }).status === 'pass')
const w = judgeGroupMemberGap({ hit: [['2015122300021044', '21561_3_전남광주통합특별시_영암군', '영암용앙1', '영암용앙1 국민임대주택 …']], members_diff_title: 124, named: 4, ok: 3 })
t('하나 → ⚠️', w.status === 'warn' && /…21044 ← 21561_3_전남광주통합특별시_영암군 「영암용앙1」/.test(w.value))
const many = Array.from({ length: 11 }, (_, i) => [`R${i}`, `M${i}`, '이름', ''])
t('카드 11장 → ℹ️', judgeGroupMemberGap({ hit: many, members_diff_title: 1, named: 1, ok: 0 }).status === 'info')
t('SQL 에 지역 끝 거름', /\(지역\|시\|군\|구\|도\)\$/.test(GROUP_MEMBER_GAP_SQL))
if (process.env.SUPABASE_ACCESS_TOKEN) {
  const { sqlRead } = await import('./lib.mjs')
  const [x] = await sqlRead(GROUP_MEMBER_GAP_SQL)
  const j = judgeGroupMemberGap(x.j)
  t(`DB 지금 0(실측 ${j.value})`, j.hit.length === 0)
}
console.log(`묶음 빠진 구성원 시험 ${ok}/${ok + bad}`)
process.exit(bad ? 1 : 0)
