// neg-tail.mjs 시험(2026-11-23 · 열두째 묶음 B) — node .github/health/neg-tail.test.mjs
import { readFileSync } from 'node:fs'
import { judgeNegTail, isMarked, inSlot } from './neg-tail.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const conf = JSON.parse(readFileSync(new URL('./neg-tail.json', import.meta.url), 'utf8'))
t('표지 — 못+하 · 못+받 · 못+했', isMarked('못', '하') && isMarked('못', '받') && isMarked('못', '했'))
t('표지 — 안+되', isMarked('안', '되'))
t('표지 밖 — 안+된(지금 빈틈 · 기준선이 거름)', !isMarked('안', '된') && conf.baseline['안'].includes('된'))
t('표지 밖 — 못+등', !isMarked('못', '등'))
const base = [{ w: '못', c: '하', n: 734 }, { w: '못', c: '등', n: 14 }, { w: '안', c: '내', n: 4453 }, { w: '잘못', c: '작', n: 162 }]
const j0 = judgeNegTail({ rows: base, conf })
t('지금 분포 = 새 글자 0(통과)', j0.status === 'pass' && j0.fresh.length === 0)
const j1 = judgeNegTail({ rows: [...base, { w: '못', c: '미', n: 3 }], conf })
t('새 글자(못+미) = ℹ️ · 값 칸에 글자', j1.status === 'info' && /못\+미 3행/.test(j1.value))
t('잘못 뒤 새 글자는 거름', judgeNegTail({ rows: [{ w: '잘못', c: '쓰', n: 2 }], conf }).status === 'pass')
t('창 — KST 월 10:25(UTC 01:25 월)', inSlot(new Date('2026-11-30T01:25:00Z'), conf.slot))
t('창 밖 — KST 월 10:55', !inSlot(new Date('2026-11-30T01:55:00Z'), conf.slot))
t('창 밖 — KST 화 10:25', !inSlot(new Date('2026-12-01T01:25:00Z'), conf.slot))
console.log(`neg-tail 시험 ${ok}/${ok + bad}`)
if (bad) process.exit(1)
