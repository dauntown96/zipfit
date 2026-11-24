// income-pct.mjs 시험(2026-11-24 · 열여섯째 묶음 3(나)) — node .github/health/income-pct.test.mjs
import { parsePctLines, checkPctRow, judgeIncomePct } from './income-pct.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
// 경북개발공사 20750_경상북도_구미시 꼴(5인 100% 금액이 70% 줄과 바탕이 다름)
const gb = `구분 : 70% · 1인 가구 : 3,432,027 · 2인가구 : 4,693,016 · 3인가구 : 5,717,900 · 4인가구 : 6,161,541 · 5인가구 : 6,528,890
구분 : 100% · 1인 가구 : 4,576,036 · 2인가구 : 6,452,897 · 3인가구 : 8,168,429 · 4인가구 : 8,802,202 · 5인가구 : 9,362,985
- 1인 가구는 20%p, 2인 가구는 10%p 가산 적용한 금액임`
const L = parsePctLines(gb)
t('비율 줄 둘', L.length === 2 && L[0].pct === 70 && L[1].pct === 100)
t('칸 다섯', L[0].cells.size === 5 && L[1].cells.get(5) === 9362985)
const c = checkPctRow(gb)
t('5인만 어긋남', c.bad.length === 1 && /^5인 70%/.test(c.bad[0]))
t('바로잡은 꼴은 0', checkPctRow(gb.replace('9,362,985', '9,326,985')).bad.length === 0)
// LH 20750 꼴(「70% : 1인가구 …원 / 2인가구 …원」 · 70%와 90%)
const lh = `70% : 1인가구 3,432,027원 / 2인가구 4,693,016원 / 3인가구 5,717,900원 / 4인가구 6,161,541원 / 5인가구 6,528,890원 / 6인가구 6,934,384원
90% : 1인가구 4,194,699원 / 2인가구 5,866,270원 / 3인가구 7,351,586원 / 4인가구 7,921,982원 / 5인가구 8,394,287원 / 6인가구 8,915,637원`
t('LH 꼴 줄 둘 · 어긋남 0', parsePctLines(lh).length === 2 && checkPctRow(lh).bad.length === 0)
// 가산 없는 표(1·2인도 그대로 비율)
const plain = `50% : 1인 1,906,682 · 2인 2,933,135 · 3인 4,084,214
100% : 1인 3,813,363 · 2인 5,866,270 · 3인 8,168,429`
t('가산 없는 표 어긋남 0', checkPctRow(plain).bad.length === 0)
// 비율 줄 하나뿐 · 자산 표(만 원 단위) 셈 밖
t('줄 하나는 셈 밖', checkPctRow('70% : 1인가구 3,432,027원 / 2인가구 4,693,016원').lines === 1)
t('「없음(기준)」 자산 줄은 비율 줄 아님', parsePctLines('총자산가액 : 없음(기준) 345,000,000원 이하 / 1인(+10%p) 379,000,000원 이하 / 2인 이상(+20%p) 413,000,000원 이하').length === 0)
const j = judgeIncomePct({ rows: [{ a: 'X', id: 'aa', raw: gb, warned: true }, { a: 'Y', id: 'bb', raw: lh, warned: false }] })
t('판정 ℹ️ · 공고 1 · 알고 있음 1', j.status === 'info' && /^어긋난 공고 1\(⚠️ 소득 행 있음 1\)/.test(j.value))
console.log(`income-pct: ${ok} 통과 · ${bad} 실패`)
if (bad) process.exit(1)
