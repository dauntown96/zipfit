// ㎡당 사분위 스냅숏의 시·도 옛 이름 바꿈(SQL) = 화면 ZF_SIDO_ALIASES(index.html) 인가 — node scripts/rent-sqm-sido-sync.test.mjs
// 2026-11-25(우편함 「코드·운영 — 스무째」) · 사본 supabase/rpc/zipfit_ops/rent_sqm_quartiles_refresh.sql 의 `when t.a[1] … then array['…']` 줄을 읽는다.
//   화면 표를 바꾸면(새 통합 시·도 등) 같은 PR 에서 그 함수(마이그레이션 + 사본)도 바꾼다 — 이 시험이 갈림을 잡는다.
import { readFileSync } from 'node:fs'
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/rpc/zipfit_ops/rent_sqm_quartiles_refresh.sql', import.meta.url), 'utf8')
const m = html.match(/const ZF_SIDO_ALIASES = (\{[\s\S]*?\n\});/)
if (!m) { console.log('✗ index.html ZF_SIDO_ALIASES 못 찾음'); process.exit(1) }
const js = Function(`return ${m[1].replace(/\/\/.*$/gm, '')}`)()
const fromJs = new Map()
for (const [now, olds] of Object.entries(js)) for (const o of olds) fromJs.set(o, now)
const fromSql = new Map()
for (const r of sql.matchAll(/when t\.a\[1\] (?:in \(([^)]*)\)|= '([^']+)') then array\['([^']+)'\]/g)) {
  const olds = r[1] ? [...r[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [r[2]]
  for (const o of olds) fromSql.set(o, r[3])
}
let bad = 0
const keys = new Set([...fromJs.keys(), ...fromSql.keys()])
for (const k of [...keys].sort()) if (fromJs.get(k) !== fromSql.get(k)) { bad++; console.log(`✗ ${k}: 화면 ${fromJs.get(k)} · SQL ${fromSql.get(k)}`) }
console.log(`시·도 옛 이름 ${keys.size}개 · 갈림 ${bad}`)
process.exit(bad ? 1 : 0)
