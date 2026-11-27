// node .github/health/when-line.test.mjs — 겉 일정 줄 세 꼴 판정(when-line.mjs) 시험.
import assert from 'node:assert/strict'
import { judgeWhenLines, whenLineSummary } from './when-line.mjs'

let n = 0
const t = (name, f) => { f(); n++; console.log('ok', name) }
const row = (o = {}) => ({ aid: '2015122300021071', on: true, st: [['접수', '2026-11-24', 'past', false], ['마감', '2026-12-07', 'next', false], ['발표', '', 'unk', false]], dd: [['D-11', true]], todayN: 0, spans: [['2026-11-24', '2026-12-07']], ...o })

t('정상 — 걸림 0', () => { const j = judgeWhenLines([row()]); assert.equal(j.bad, 0); assert.equal(j.lines, 1); assert.equal(j.spans, 1) })
t('① 같은 날짜 역 두 번(#1311 끝 시각 뒤 차수 역 남음 꼴)', () => {
  const j = judgeWhenLines([row({ st: [['접수', '2026-11-25', 'past', false], ['차수', '2026-11-25', 'next', false], ['마감', '2026-12-07', 'fut', false]], dd: [] })])
  assert.equal(j.dup.length, 1); assert.match(j.dup[0], /2026-11-25 두 번/)
})
t('① 날짜를 감춘 차수 역(오늘 …까지)은 셈 밖', () => {
  const j = judgeWhenLines([row({ st: [['접수', '2026-11-25', 'past', false], ['차수', '2026-11-25', 'next', true], ['마감', '2026-12-07', 'fut', false]], dd: [['오늘 16:00까지 · 2시간 남음', true]], todayN: 1 })])
  assert.equal(j.bad, 0)
})
t('② 「오늘 …까지」 두 곳', () => { const j = judgeWhenLines([row({ dd: [['오늘 16:00까지', true]], todayN: 2 })]); assert.equal(j.today.length, 1) })
t('② 「오늘 …까지」가 ◉ 옆이 아님(줄 끝)', () => { const j = judgeWhenLines([row({ dd: [['이번 차수 오늘 16:00까지', false]], todayN: 1 })]); assert.equal(j.today.length, 1); assert.match(j.today[0], /◉ 옆 아님/) })
t('② D-n 조각은 셈 밖', () => { const j = judgeWhenLines([row({ dd: [['D-3', false]] })]); assert.equal(j.today.length, 0) })
t('③ 거꾸로 기간(…21044 12-01 ~ 11-30 꼴)', () => { const j = judgeWhenLines([row({ aid: '2015122300021044', spans: [['2026-12-01', '2026-11-30']] })]); assert.equal(j.span.length, 1); assert.match(j.span[0], /…21044/) })
t('줄 없는 카드(on false)는 줄 수 밖 · 기간은 센다', () => { const j = judgeWhenLines([row({ on: false, st: [], dd: [] })]); assert.equal(j.lines, 0); assert.equal(j.spans, 1) })
t('요약 — 두 벌 중 하나라도 걸리면 ⚠️', () => {
  const ok = judgeWhenLines([row()]), bad = judgeWhenLines([row({ spans: [['2026-12-01', '2026-11-30']] })])
  assert.equal(whenLineSummary([{ label: '앞', at: '10:00', j: ok }, { label: '뒤', at: '23:30', j: ok }]).status, 'pass')
  const s = whenLineSummary([{ label: '앞', at: '10:00', j: ok }, { label: '뒤', at: '23:30', j: bad }])
  assert.equal(s.status, 'warn'); assert.match(s.value, /뒤\(23:30\).*거꾸로 기간 1\/1/)
})
console.log(`when-line ${n}/${n}`)
