// 분석 전 카드 날짜 꼴(ANA_DATE_RE) 단위 시험 — node .github/health/ana-date-re.test.mjs (실패하면 종료 코드 1)
// 2026-10-19(우편함 「표시층 — 화면 점검 오탐 막기」 2) — 오탐 꼴은 안 잡히고 진짜 날짜·상태는 잡혀야 한다.
import { ANA_DATE_RE } from './ana-date-re.mjs'
const hit = t => (t.match(new RegExp(ANA_DATE_RE.source, 'g')) || [])
const cases = [
  ['도로명 번지', '전북특별자치도 완주군 삼례읍 동학로 36-21', []],
  ['전화', '문의 031-123-4567 · 1600-1004', []],
  ['면적 소수', '전용 59.88㎡ · 26.4㎡', []],
  ['동·호', '101-1203 · 3-201호', []],
  ['금액 소수', '보증금 1.7만 · 월 2.5만원', []],
  ['월-일', '접수 10-21', ['10-21']],
  ['연.월.일', '2026.11.09 발표', ['2026.11.09']],
  ['D-n', '마감 D-3', ['마감', 'D-3']],
  ['월/일 · 상태', '10/12~10/14 접수 중', ['10/12', '10/14', '접수 중']],
]
let bad = 0
for (const [name, t, want] of cases) {
  const got = hit(t)
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${name}: 「${t}」 → ${JSON.stringify(got)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}
process.exit(bad ? 1 : 0)
