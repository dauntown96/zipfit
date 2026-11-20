// dict-gap.mjs 단위 시험 — node scripts/dict-gap.test.mjs · 사전에 있는 낱말은 안 나옴 · 없는 낱말 나옴 · 빈 입력 안전 · 실제 사본을 읽음(2026-11-20).
import { readFileSync } from 'node:fs'
import { loadDict, tokenize, inDict, gap, toMarkdown, normalizePrs, DEFAULT_DICT } from './dict-gap.mjs'

let bad = 0
const ok = (c, msg) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${msg}`) }

const dict = loadDict(`# 머리 줄은 무시
분석 묶음 · 정정 몫 · health-ops · 문지기
쉽게 쓴 말 · content_plain`)

// ① 사전에 있는 낱말은 안 나온다(낱말 그대로 · 조각 · 조사 붙은 꼴 · 백틱 식별자)
const prs1 = [
  { number: 1, title: '분석 묶음 — 정정 몫을 문지기로 (#1)' },
  { number: 2, title: '`content_plain` 쉽게 쓴 말 · health-ops' },
]
ok(gap(prs1, dict).length === 0, '사전에 있는 낱말만 든 제목 → 없는 낱말 0')
ok(inDict('정정', dict), '「정정」은 「정정 몫」 안에 있어 사전에 있음')
ok(inDict('문지기', dict) && inDict('content_plain', dict), '낱말 그대로 · 식별자 그대로 있음')

// ② 없는 낱말은 나온다 — PR 수 순 · 예 번호
const prs2 = [
  { number: 10, title: '첨부 이력 재분석 갈래 — 발송기' },
  { number: 11, title: '첨부 이력 health-ops ⚠️' },
  { number: 12, title: '`zfRouteTargetTail` 대상 꼬리' },
]
const g = gap(prs2, dict, 10)
const words = g.map((r) => r.word)
ok(words[0] === '이력' || words[0] === '첨부', `가장 많이 나온 낱말이 맨 앞(${words.slice(0, 2).join(', ')})`)
ok(g.find((r) => r.word === '첨부')?.prs === 2 && g.find((r) => r.word === '첨부').sample.join() === '10,11', '「첨부」 PR 2 · 예 #10 #11')
ok(words.includes('zfroutetargettail'), '백틱 식별자는 통째로 한 낱말')
ok(!words.includes('health-ops'), '사전에 있는 낱말은 같은 제목 안에서도 빠짐')

// ③ 버리는 것 — 숫자 · 날짜 · 공고 번호 · PR 번호 · 틀 낱말
const t = tokenize('분석 묶음 — run 497 …21007 GH_843 2026-11-20 3회차 고침 (#1175)')
ok(!t.some((w) => /\d/.test(w)) && !t.includes('고침') && !t.includes('run'), `숫자·번호·틀 낱말 0(${t.join(', ')})`)
ok(tokenize('분석률을').includes('분석률'), '조사 꼬리를 뗌(분석률을 → 분석률)')

// ④ 빈 입력 안전
ok(gap([], dict).length === 0 && gap(null, dict).length === 0 && gap([{ number: 1 }], dict).length === 0, '빈 배열 · null · 제목 없는 행 → 0')
ok(loadDict('').terms.size === 0 && gap(prs2, loadDict('')).length > 0, '빈 사전 → 모든 낱말이 없는 낱말')
ok(toMarkdown([], { count: 0, since: '2026-10-21' }).includes('없음'), '빈 결과 표는 「없음」')
ok(normalizePrs({ items: [{ number: 5, title: 'x y' }] }).length === 1 && normalizePrs(undefined).length === 0, 'gh search 꼴 · undefined 둘 다 받음')

// ⑤ 실제 사본이 읽힌다 — 행이 있고 ⑨에 있는 낱말이 사전에 있다
const real = loadDict(readFileSync(DEFAULT_DICT, 'utf8'))
ok(real.terms.size > 200 && inDict('정정본', real) && inDict('문지기', real) && inDict('swap', real), `실제 사본 낱말 ${real.terms.size} · 정정본·문지기·swap 있음`)

console.log(bad ? `\n실패 ${bad}` : '\n통과')
process.exit(bad ? 1 : 0)
