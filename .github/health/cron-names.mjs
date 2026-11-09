// cron 이름 집합 대조(2026-11-09 · 우편함 「코드·운영 — 모드 정의 하나 … · cron 이름 집합 경고 …」 2장 · #918 회신 ⑦3 채택).
// DB cron.job 이름 집합 = EXPECTED_JOBS(ops-check.mjs) = docs/cron-jobs.sql 사본(블록 이름 · 명령 md5)인가. 다르면 ⚠️(안 멈춤 · gate.mjs HARD 밖).
//   계기: 잡을 더한 회차마다 사본·기대 목록을 손으로 따라가다 두 번 빠졌다(11-03 zipfit-gh-observe · 11-05 collect-lh-cutoff·notices).
//   cron_active(❌)는 「기대 목록이 다 살아 있나」만 본다 — 기대 목록에 없는 새 잡·사본 어긋남은 이 항목이 본다.
// 시험: node .github/health/cron-names.test.mjs
import { createHash } from 'node:crypto'

// 사본 블록 — select cron.schedule('이름', '식', $cmd$명령$cmd$); 의 이름 → 명령 md5(DB md5(command) 와 같은 축)
export function parseSheet(text) {
  const out = new Map()
  const re = /^select cron\.schedule\('([^']+)', '[^']+', \$cmd\$([\s\S]*?)\$cmd\$\);/gm
  let m
  while ((m = re.exec(text))) out.set(m[1], createHash('md5').update(m[2], 'utf8').digest('hex'))
  return out
}

// db = [{name, md5}] · expected = [이름] · sheetText = 사본 글(못 읽었으면 null) → {status, value, rule}
export function judgeCronNames(db, expected, sheetText) {
  const dbN = new Map(db.map(j => [j.name, j.md5]))
  const exp = new Set(expected)
  const onlyDb = [...dbN.keys()].filter(n => !exp.has(n)).sort()
  const onlyExp = [...exp].filter(n => !dbN.has(n)).sort()
  const parts = []
  if (onlyDb.length) parts.push(`DB에만(기대 목록 밖) ${onlyDb.join(', ')}`)
  if (onlyExp.length) parts.push(`기대 목록에만 ${onlyExp.join(', ')}`)
  if (sheetText == null) parts.push('사본 docs/cron-jobs.sql 못 읽음')
  else {
    const sh = parseSheet(sheetText)
    const sOnlyDb = [...dbN.keys()].filter(n => !sh.has(n)).sort()
    const sOnlySh = [...sh.keys()].filter(n => !dbN.has(n)).sort()
    const sMd5 = [...dbN.keys()].filter(n => sh.has(n) && dbN.get(n) && sh.get(n) !== dbN.get(n)).sort()
    if (sOnlyDb.length) parts.push(`사본에 없음 ${sOnlyDb.join(', ')}`)
    if (sOnlySh.length) parts.push(`사본에만 ${sOnlySh.join(', ')}`)
    if (sMd5.length) parts.push(`사본 명령 다름 ${sMd5.join(', ')}`)
  }
  return {
    status: parts.length ? 'warn' : 'pass',
    value: parts.length ? parts.join(' · ') : `같음 ${dbN.size}(DB = 기대 목록 = 사본 · 명령 md5 일치)`,
    rule: 'DB cron.job 이름 집합 = EXPECTED_JOBS = docs/cron-jobs.sql 블록(명령 md5 포함) — 다르면 ⚠️(안 멈춤 · 잡을 더하거나 뺀 PR 에서 기대 목록·사본을 함께 고친다)',
  }
}
