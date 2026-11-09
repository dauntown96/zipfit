// cron 이름 집합 대조 단위 시험 — node .github/health/cron-names.test.mjs (실패하면 종료 코드 1)
import { createHash } from 'node:crypto'
import { judgeCronNames, parseSheet } from './cron-names.mjs'
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex')
const sheet = "-- 머리\nselect cron.schedule('a', '0 1 * * *', $cmd$select 1$cmd$);\n\nselect cron.schedule('b', '*/5 * * * *', $cmd$\n  select 2;\n$cmd$);\n"
const db = [{ name: 'a', md5: md5('select 1') }, { name: 'b', md5: md5('\n  select 2;\n') }]
const cases = [
  ['같음', db, ['a', 'b'], sheet, 'pass', /같음 2/],
  ['DB에만', [...db, { name: 'c', md5: md5('x') }], ['a', 'b'], sheet, 'warn', /DB에만\(기대 목록 밖\) c.*사본에 없음 c/],
  ['기대에만', db, ['a', 'b', 'z'], sheet, 'warn', /기대 목록에만 z/],
  ['사본 명령 다름', [db[0], { name: 'b', md5: md5('select 3') }], ['a', 'b'], sheet, 'warn', /사본 명령 다름 b/],
  ['사본 못 읽음', db, ['a', 'b'], null, 'warn', /못 읽음/],
]
let bad = 0
if (parseSheet(sheet).size !== 2) { bad++; console.log('✗ parseSheet') }
for (const [name, d, e, s, st, re] of cases) {
  const j = judgeCronNames(d, e, s)
  const ok = j.status === st && re.test(j.value)
  if (!ok) bad++
  console.log(`${ok ? '✓' : '✗'} ${name} — ${j.status} · ${j.value}`)
}
process.exit(bad ? 1 : 0)
