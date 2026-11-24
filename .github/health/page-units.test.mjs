// page-units.mjs 시험(2026-11-24 · 열일곱째 묶음 A장 3) — node .github/health/page-units.test.mjs
import { judgeCard, judgePageUnits } from './page-units.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
// …021036 꼴 — 39형 페이지 39.52 · 세대 행 머리 39.91 · 비고에 「39.91㎡ / 39.52㎡」
const pu36 = [
  { tab: '대전도안 10단지 국민임대', nodata: false, rows: [{ hty: '33', area: 33.82, households: 585, supply: 50 }, { hty: '39', area: 39.52, households: 588, supply: 30 }] },
  { tab: '대전도안 11단지 국민임대', nodata: false, rows: [{ hty: '26', area: 26.86, households: 324, supply: 50 }] },
]
const u36 = [
  { b: '대전도안 10단지', t: '33', a: 33.82, rc: 50, note: '계약금 …' },
  { b: '대전도안 10단지', t: '39', a: 39.91, rc: 30, note: '전용면적 39.91㎡(…) / 39.52㎡(…)' },
  { b: '대전도안 11단지', t: '26', a: 26.86, rc: 50, note: null },
]
const r36 = judgeCard(pu36, u36)
t('021036 값 다름 0', r36.bad.length === 0)
t('021036 여러 값 중 하나 1 · 같음 2', r36.multi === 1 && r36.same === 2)
// 비고에 값이 없으면 값 다름
const r36b = judgeCard(pu36, u36.map(u => ({ ...u, note: null })))
t('비고 없으면 39형 값 다름', r36b.bad.length === 1 && /39 전용 페이지 39.52/.test(r36b.bad[0]))
// 당첨+예비 합(…021062 꼴) — 셈만
const r62 = judgeCard([{ tab: null, nodata: false, rows: [{ hty: '55', area: 55.93, households: null, supply: 203 }] }], [{ b: '울산다운2 A-9', t: '55', a: 55.93, rc: 103, note: null }])
t('021062 모집 수 다름 셈만 · 값 다름 0', r62.supply === 1 && r62.bad.length === 0)
// 탭에 맞는 단지 없음 · 데이터 없음 · 짧은 행
const r44 = judgeCard([{ tab: '영암용앙1 국민임대주택', nodata: false, rows: [{ hty: '36', area: 36.52, supply: 50 }] }, { tab: '서울대방1', nodata: true, rows: [] },
  { tab: '해남해리2 국민임대', nodata: false, rows: [{ hty: '29A', area: null, short: true }] }], [{ b: '해남해리2', t: '29A', a: 29.71, rc: 30 }])
t('탭 단지 없음 1 · 데이터 없음 1 · 짧은 행 1', r44.notab === 1 && r44.nodata === 1 && r44.short === 1 && r44.bad.length === 0)
// 형도 면적도 못 맞춤
const ru = judgeCard([{ tab: null, nodata: false, rows: [{ hty: '84', area: 84.9, supply: 3 }] }], [{ b: 'x', t: '59', a: 59.9, rc: 3 }])
t('형 못 맞춤 1', ru.unmatched === 1 && ru.bad.length === 0)
// 판정 묶음
const j = judgePageUnits({ cards: [{ id: '2015122300021036', pu: pu36, units: u36 }, { id: '2015122300099999', pu: pu36, units: u36.map(u => ({ ...u, note: null })) }, { id: '2015122300088888', pu: [], units: [] }] })
t('묶음 ⚠️ 1장', j.status === 'warn' && j.hits.length === 1 && j.hits[0].id === '2015122300099999')
t('대조 카드 2/3', /대조 카드 2\/3/.test(j.value))
console.log(`page-units 시험 ${ok} 통과 · ${bad} 실패`)
if (bad) process.exit(1)
