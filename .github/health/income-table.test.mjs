// income-table.mjs 시험(2026-11-19 · 17장) — node .github/health/income-table.test.mjs
import { parseLines, checkRow, judgeIncome } from './income-table.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
// 광주 21482_1 p.4 꼴(6인 두 번 — 일곱째 줄 = 7인 금액)
const gwangju = `1인가구 : 2,669,354원 이하 · 3,432,027원 이하 · 4,576,036원 이하
2인가구 : 3,519,762원 이하 · 4,693,016원 이하 · 6,452,897원 이하
3인가구 : 4,084,215원 이하 · 5,717,900원 이하 · 8,168,429원 이하
4인가구 : 4,401,101원 이하 · 6,161,541원 이하 · 8,802,202원 이하
5인가구 : 4,663,493원 이하 · 6,528,890원 이하 · 9,326,985원 이하
6인가구 : 4,953,132원 이하 · 6,934,384원 이하 · 9,906,263원 이하
6인가구 : 5,242,771원 이하 · 7,339,879원 이하 · 10,485,541원 이하`
const L = parseLines(gwangju)
t('줄 일곱', L.length === 7)
t('첫 줄 금액 셋', L[0].amts.length === 3 && L[0].amts[0] === 2669354)
const c = checkRow(gwangju)
t('ⓐ 일곱째 줄 6인', c.seq.length === 1 && /7째 줄 6인/.test(c.seq[0]))
t('ⓑ 금액은 늘어남 — 걸림 0', c.amt.length === 0)
const fixed = gwangju.replace(/\n6인가구 : 5,242,771/, '\n7인가구 : 5,242,771')
t('바로잡은 꼴은 0', checkRow(fixed).seq.length === 0 && checkRow(fixed).amt.length === 0)
// 옛 해 표(…19307 꼴 · 괄호 금액 · 「원」 칸 밖)는 걸리지 않는다
const old = `1인 : 90% (3,238,348)원 · 150% ( 5,397,246 )원 이하
2인 : 80% (4,381,602)원 · 150% ( 8,215,505 )원 이하
3인 : 70% (5,338,881)원 · 150% ( 11,440,460 )원 이하`
t('옛 해 표 0', checkRow(old).seq.length === 0 && checkRow(old).amt.length === 0)
// 칸이 바뀐(3인 금액이 2인보다 작음) 꼴은 ⓑ
const swap = old.replace('5,338,881', '4,000,000')
t('ⓑ 3인 첫 칸 걸림', checkRow(swap).amt.length === 1 && /^3인 1째 칸 4,000,000/.test(checkRow(swap).amt[0]))
// 제천 21477_1 꼴(가구원수 × 출생자녀 조합 · 만원 단위)은 셈 밖
const combo = `1인 0명 : 120% / 10,800 / 25,100 / 34,500
2인 0명 : 110% / 10,800 / 25,100 / 34,500
2인 1명 : 120% / 11,900 / 27,600 / 37,900`
t('조합 표 줄 0', parseLines(combo).length === 0)
t('만원 단위 줄 0', parseLines('1인 10,800 25,100\n2인 11,900 27,600').length === 0)
t('「3인 이상」 끝 줄은 줄 번호로만', checkRow('1인 : 3,813,363원\n2인 : 5,866,640원\n3인 이상 : 8,168,429원').seq.length === 0)
t('줄 하나면 안 봄', checkRow('1인가구 : 3,813,363원').lines === 1)
const j = judgeIncome({ rows: [{ a: 'A', id: 'x', raw: gwangju, open: true, warned: true }, { a: 'B', id: 'y', raw: gwangju, open: true, warned: false }, { a: 'C', id: 'z', raw: fixed, open: true, warned: false }, { a: 'D', raw: gwangju, open: false, warned: false }] })
t('후보 1 · 알고 있음 1 · 닫힌 1 → ⚠️', j.status === 'warn' && j.hits.length === 3 && /후보 1/.test(j.value) && /알고 있음 1/.test(j.value) && /닫힌·⚠️ 없음 1/.test(j.value))
t('후보 0 → ℹ️', judgeIncome({ rows: [{ a: 'A', raw: gwangju, open: true, warned: true }] }).status === 'info')
// SH_313610 꼴(2026-11-22 · 넷째 묶음 B 1) — 전체 표(1~8인) + 「가구원수 :」 머리 줄 + 요약 표(1~7인) → 표 둘로 끊어 걸림 0
const two = gwangju.replace(/^/, `1인 : 50% 1,906,682 · 60% 2,288,018
2인 : 50% 2,933,135 · 60% 3,519,762
3인 : 50% 4,084,215 · 60% 4,901,057
가구원수 : 월평균 소득 50%(1인 가구 70%, 2인 가구 60%) · 월평균 소득 70%
`).replace(/\n6인가구 : 5,242,771/, '\n7인가구 : 5,242,771')
const c2 = checkRow(two)
t('SH_313610 꼴 표 둘 · 걸림 0', c2.tables === 2 && c2.seq.length === 0 && c2.amt.length === 0)
// 머리 줄 없이 두 표가 이어지면 종전대로 걸린다(끊는 것은 머리 줄에서만)
const noHead = two.replace(/^가구원수 :.*\n/m, '')
t('머리 줄 없으면 걸림', checkRow(noHead).seq.length > 0)
// 둘째 표 안의 겹침은 「표2」 표지로 걸린다
const bad2 = two.replace(/\n7인가구 : 5,242,771/, '\n6인가구 : 5,242,771')
t('둘째 표 겹침 걸림', checkRow(bad2).seq.some(x => /^표2 7째 줄 6인/.test(x)))
console.log(`income-table 시험 ${ok}/${ok + bad}`)
process.exit(bad ? 1 : 0)
