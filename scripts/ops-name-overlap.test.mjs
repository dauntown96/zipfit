// scripts/ops-name-overlap.mjs 시험(2026-11-23 · 열째 묶음 2) — node scripts/ops-name-overlap.test.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { itemsOf, findOverlaps, isSameQuestion, wordsOf } from './ops-name-overlap.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const A = '세대 시군구 이름 — 공고 행·지도 경계 파일 어디에도 없는 이름(정보)'
const B = '세대 행 시군구가 공고 행·경계 파일 어디에도 없는 이름'
t('이번 겹침 = 같은 물음', isSameQuestion(A, B))
t('LH/MYHOME 짝은 아님', !isSameQuestion('최근 런부터 이어진 LH 목록 0건 런', '최근 런부터 이어진 MYHOME 목록 0건 런'))
t('simulate 짝은 아님', !isSameQuestion('실패 흉내(수동 입력 simulate=fail) — 안 멈추는 실패', '실패 흉내(수동 입력 simulate=fail_hard) — 멈추는 실패'))
t('조사 떼기', wordsOf('시군구가 어디에도').has('시군구') && wordsOf('시군구가 어디에도').has('어디'))
t('add·addBlind 둘 다 · 같은 id 첫 이름', (() => { const m = itemsOf("add('a', '첫')\naddBlind('a', '둘')\naddBlind('b', '셋')"); return m.get('a') === '첫' && m.get('b') === '셋' })())
// 이번 겹침을 되살린 사본 — #1222 병합 커밋(961c67c)을 head, 그 앞을 base 로
let head, base
try {
  head = itemsOf(execFileSync('git', ['show', '961c67c:.github/health/ops-check.mjs'], { encoding: 'utf8', maxBuffer: 64 << 20 }))
  base = itemsOf(execFileSync('git', ['show', '961c67c^:.github/health/ops-check.mjs'], { encoding: 'utf8', maxBuffer: 64 << 20 }))
} catch { head = null }
if (head) {
  const h = findOverlaps(base, head)
  t('#1222 재현 — unit_sigungu ↔ unit_sigungu_unknown 잡힘', h.length === 1 && h[0].id === 'unit_sigungu' && h[0].other === 'unit_sigungu_unknown')
} else console.log('(얕은 클론에 961c67c 없음 — 재현 시험 건너뜀)')
const now = itemsOf(readFileSync(new URL('../.github/health/ops-check.mjs', import.meta.url), 'utf8'))
t('지금 파일 모든 쌍 거짓 경보 0', findOverlaps(new Map(), now, { all: true }).length === 0)
t('지금 파일에 unit_sigungu 없음(하나로 합침)', !now.has('unit_sigungu') && now.has('unit_sigungu_unknown'))
console.log(`ops-name-overlap 시험 ${ok}/${ok + bad}`)
if (bad) process.exit(1)
