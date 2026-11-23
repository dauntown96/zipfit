// unit-sigungu.mjs 시험(2026-11-23 · 열째 묶음 1 — unit_sigungu_unknown 하나로) — node .github/health/unit-sigungu.test.mjs
import { readFileSync } from 'node:fs'
import { judgeUnitUnknown, sidoAliasesOf } from './unit-sigungu.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const root = new URL('../../', import.meta.url)
const conf = JSON.parse(readFileSync(new URL('.github/health/unit-sigungu.json', root), 'utf8'))
const geo = JSON.parse(readFileSync(new URL(conf.geo, root), 'utf8'))
const aliases = sidoAliasesOf(readFileSync(new URL('index.html', root), 'utf8'))
const J = rows => judgeUnitUnknown({ rows, geo, conf, aliases })
t('별칭표 읽음(index.html)', Array.isArray(aliases['전남광주통합특별시']) && aliases['전남광주통합특별시'].includes('광주광역시'))
t('예외 10개 이하', (conf.except || []).length <= 10)
t('옛 코드 상수 예외(양산)가 파일에', conf.except.some(e => e.name === '2015122300019919|양산'))
t('경계에 있는 구 = 통과', J([['X', '서울특별시', '종로구', 3]]).status === 'pass')
t('옛 시·도 이름(별칭)도 경계로 맞춤', J([['X', '광주광역시', '북구', 3]]).status === 'pass')
t('구 단위만 있는 시의 시 이름', J([['X', '경기도', '수원시', 3]]).status === 'pass')
t('어디에도 없는 이름 = ⚠️', J([['X', '서울특별시', '가상구(시험)', 3]]).status === 'warn')
t('다른 시·도의 같은 이름은 통과 못 함(시·도별 대조)', J([['X', '제주특별자치도', '종로구', 3]]).status === 'warn')
t('예외 (공고|이름)', (() => { const j = J([['2015122300019919', '경남', '양산', 1]]); return j.status === 'pass' && j.excepted.length === 1 })())
t('예외 시·도(세종)', J([['X', '세종특별자치시', '조치원읍', 2]]).status === 'pass')
// 🔴 이번 겹침을 되살린 시험 — 합치기 전 두 항목(#1222 unit_sigungu · 옛 unit_sigungu_unknown)이 같은 가짜 행에 둘 다 ⚠️ 를 냈다. 지금은 한 판정만 있다.
t('0 = 통과', J([]).status === 'pass')
console.log(`unit-sigungu 시험 ${ok}/${ok + bad}`)
if (bad) process.exit(1)
