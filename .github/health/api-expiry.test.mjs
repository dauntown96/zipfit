// API 활용신청 만료 판정 단위 시험 — node .github/health/api-expiry.test.mjs (실패하면 종료 코드 1)
// 실제 docs/api-expiry.json 을 읽고 「오늘」만 바꿔 본다(만료일을 당긴 것과 같은 시험 · 파일·DB 쓰기 0).
import { readFileSync } from 'node:fs'
import { judgeApiExpiry } from './api-expiry.mjs'
const doc = JSON.parse(readFileSync(new URL('../../docs/api-expiry.json', import.meta.url), 'utf8'))
const at = d => new Date(d + 'T03:00:00Z') // KST 12:00
const cases = [
  ['오늘(2026-11-12) — 통과', judgeApiExpiry(doc, at('2026-11-12')), j => j.status === 'pass' && /가장 이른 khug\.or\.kr/.test(j.value)],
  ['HUG 61일 전(2027-09-12) — 통과', judgeApiExpiry(doc, at('2027-09-12')), j => j.status === 'pass'],
  ['HUG 60일 전(2027-09-13) — ⚠️', judgeApiExpiry(doc, at('2027-09-13')), j => j.status === 'warn' && j.soon.length === 1 && /60일\)/.test(j.value)],
  ['HUG 지남(2027-11-13) — ⚠️ 지남', judgeApiExpiry(doc, at('2027-11-13')), j => j.status === 'warn' && /1일 지남/.test(j.value)],
  ['data.go.kr 첫 만료 60일 전(2028-04-20) — ⚠️ 둘(HUG 지남 포함)', judgeApiExpiry(doc, at('2028-04-20')), j => j.status === 'warn' && j.soon.length === 2],
  ['표시 없음 셈', judgeApiExpiry(doc, at('2026-11-12')), j => j.none.length === doc.entries.filter(e => !e.expires).length && /표시 없음 4/.test(j.value)],
  ['가짜로 당긴 만료(되돌리기 시험 — 사본만)', judgeApiExpiry({ ...doc, entries: doc.entries.map((e, i) => i === 0 ? { ...e, expires: '2026-12-01' } : e) }, at('2026-11-12')), j => j.status === 'warn' && /19일\)/.test(j.value)],
]
let bad = 0
for (const [name, j, ok] of cases) { const p = ok(j); if (!p) bad++; console.log(`${p ? '✓' : '✗'} ${name} — ${j.status} · ${j.value}`) }
process.exit(bad ? 1 : 0)
