// unit-sigungu.mjs 시험(2026-11-23 · 여덟째 묶음 3) — node .github/health/unit-sigungu.test.mjs
import { readFileSync } from 'node:fs'
import { judgeUnitSigungu, sidoAliasesOf } from './unit-sigungu.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const root = new URL('../../', import.meta.url)
const conf = JSON.parse(readFileSync(new URL('.github/health/unit-sigungu.json', root), 'utf8'))
const geo = JSON.parse(readFileSync(new URL(conf.geo, root), 'utf8'))
const aliases = sidoAliasesOf(readFileSync(new URL('index.html', root), 'utf8'))
t('별칭표 읽음(index.html)', Array.isArray(aliases['전남광주통합특별시']) && aliases['전남광주통합특별시'].includes('광주광역시'))
t('예외 10개 이하', (conf.except || []).length <= 10)
const R = (sd, sg, in_ann = false) => ({ sd, sg, rows: 3, anns: 1, in_ann })
t('경계에 있는 구 = 셈 밖', judgeUnitSigungu({ rows: [R('서울특별시', '종로구')], geo, conf, aliases }).miss.length === 0)
t('옛 시·도 이름(별칭)도 경계로 맞춤', judgeUnitSigungu({ rows: [R('광주광역시', '북구')], geo, conf, aliases }).miss.length === 0)
t('구 단위만 있는 시의 시 이름', judgeUnitSigungu({ rows: [R('경기도', '수원시')], geo, conf, aliases }).miss.length === 0)
const j = judgeUnitSigungu({ rows: [R('서울특별시', '가상구(시험)')], geo, conf, aliases })
t('어디에도 없는 이름 = ℹ️', j.status === 'info' && j.miss.length === 1)
t('공고 행에 있으면 셈 밖', judgeUnitSigungu({ rows: [R('서울특별시', '가상구(시험)', true)], geo, conf, aliases }).miss.length === 0)
t('예외 시·도', judgeUnitSigungu({ rows: [R('세종특별자치시', '조치원읍')], geo, conf, aliases }).excepted.length === 1)
t('warn_over 넘으면 ⚠️', judgeUnitSigungu({ rows: [R('서울특별시', '가상구(시험)')], geo, conf: { ...conf, warn_over: 0 }, aliases }).status === 'warn')
t('0 = 통과', judgeUnitSigungu({ rows: [], geo, conf, aliases }).status === 'pass')
console.log(`unit-sigungu 시험 ${ok}/${ok + bad}`)
if (bad) process.exit(1)
