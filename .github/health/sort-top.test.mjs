// node .github/health/sort-top.test.mjs — 정렬 위 10장 판정 시험(가짜 값)
import { judgeSortTop } from './sort-top.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const rows = new Map([
  ['a', { deposit_min: 100, rent_min: 5, area_max: 30, rent_per_sqm_med: 3000, round_state: 'current' }],
  ['b', { deposit_min: 50, rent_min: 9, area_max: 59, rent_per_sqm_med: 2000, round_state: 'past' }],
  ['c', { deposit_min: null, rent_min: 0, area_max: 46, rent_per_sqm_med: 1000, round_state: 'current' }],
  ['d', { deposit_min: 50, rent_min: null, area_max: null, rent_per_sqm_med: null, round_state: 'current' }],
])
const set = ['a', 'b', 'c', 'd']
const right = {
  'deposit-asc': { set, top: ['d', 'b', 'a', 'c'] },   // 50 50 100 빈 — 동률(d·b)은 차례 무관
  'rent-asc': { set, top: ['c', 'a', 'b', 'd'] },      // 0 5 9 빈 — 0 은 값
  'area-desc': { set, top: ['b', 'c', 'a', 'd'] },
  'sqm-asc': { set, top: ['c', 'a', 'b', 'd'] },       // b 는 past → 빈 값(뒤)
}
t('맞는 차례 → 어긋남 0', judgeSortTop(right, rows).bad.length === 0)
t('동률 차례가 달라도 통과', judgeSortTop({ ...right, 'deposit-asc': { set, top: ['b', 'd', 'a', 'c'] } }, rows).bad.length === 0)
t('빈 값이 앞이면 실패', judgeSortTop({ ...right, 'deposit-asc': { set, top: ['c', 'b', 'd', 'a'] } }, rows).bad.length === 1)
t('0 을 빈 값으로 보면 실패', judgeSortTop({ ...right, 'rent-asc': { set, top: ['a', 'b', 'c', 'd'] } }, rows).bad.length === 1)
t('past ㎡당을 앞에 세우면 실패', judgeSortTop({ ...right, 'sqm-asc': { set, top: ['b', 'c', 'a', 'd'] } }, rows).bad.length === 1)
t('화면 값 없음 → 실패', judgeSortTop({ 'deposit-asc': right['deposit-asc'] }, rows).bad.length === 3)
console.log(`정렬 위 10장 시험 ${ok}/${ok + bad}`)
process.exit(bad ? 1 : 0)
