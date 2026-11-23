// 세대 행 시군구가 공고 행·지도 경계 파일 어디에도 없는 이름 — health-ops `unit_sigungu_unknown`(⚠️ · 안 멈춤) 의 판정
//    2026-11-04 처음 생김(ops-check ㉓ ⓑ · 코드 상수 UNIT_SG_EXCEPT · 시·도 구분 없는 이름 대조).
//    🔵 2026-11-23(우편함 「코드·운영 — 열째 묶음」 1) — 같은 물음을 다시 만든 `unit_sigungu`(#1222 · #1226)를 걷고 하나로 합쳤다:
//       ① 예외 정본 = unit-sigungu.json(코드 상수에서 옮김 · 「공고 id|이름」 또는 「시·도 이름」 한 줄 + 까닭)
//       ② 경계 대조를 시·도별로 — 세대 행 시·도(옛 이름은 index.html ZF_SIDO_ALIASES 를 그대로 읽음 · 사본 0)의 cent 키 「코드|시군구」에 같은 이름,
//          또는 구 단위만 있는 시의 시 이름(screen-check geo_names 와 같은 규칙). 공고 행 대조는 종전 그대로(모든 공고 행 시군구 이름 · 공백 무시 — SQL 쪽).
//       단위 (공고, 이름) · 판정 ⚠️ 그대로. 합치기 전후 같은 DB 값으로 같은 결과(예외 양산 1 · 그 밖 0 — 2026-11-23 실측).

// index.html 의 `const ZF_SIDO_ALIASES = { '새 이름': ['옛 이름', …], … }` 를 읽는다(사본 0)
export function sidoAliasesOf(indexHtml) {
  const m = /const ZF_SIDO_ALIASES\s*=\s*\{([\s\S]*?)\};/.exec(String(indexHtml || ''))
  const out = {}
  if (!m) return out
  for (const e of m[1].matchAll(/'([^']+)'\s*:\s*\[([^\]]*)\]/g)) out[e[1]] = [...e[2].matchAll(/'([^']+)'/g)].map(x => x[1])
  return out
}

// rows = [[공고 id, 시·도, 시군구, 행 수], …] — 공고 행 시군구 이름에 없는 세대 행(SQL) · geo = 경계 파일 JSON · conf = unit-sigungu.json · aliases = sidoAliasesOf(index.html)
export function judgeUnitUnknown({ rows, geo, conf, aliases = {} }) {
  const sido = {}
  for (const p of geo.paths || []) { sido[p.name] = p.code; (aliases[p.name] || []).forEach(o => { sido[o] = p.code }) }
  const keys = Object.keys(geo.cent || {})
  const ex = new Set((conf.except || []).map(e => e.name))
  const miss = [], excepted = []
  for (const [aid, sd, sg, n] of rows || []) {
    const pc = sido[sd], s = String(sg).replace(/\s+/g, '')
    const inGeo = !!pc && (geo.cent[pc + '|' + s] || (/시$/.test(s) && keys.some(k => k.startsWith(pc + '|' + s))))
    if (inGeo) continue
    if (ex.has(`${aid}|${sg}`) || ex.has(sd)) { excepted.push(`${aid}|${sg}`); continue }
    miss.push({ aid, sd, sg, n })
  }
  const status = miss.length ? 'warn' : 'pass'
  const value = miss.length
    ? miss.slice(0, 5).map(m => `${m.aid} 「${m.sd} ${m.sg}」 ${m.n}행`).join(', ') + (miss.length > 5 ? ` 외 ${miss.length - 5}` : '') + ` · 예외 ${excepted.length}`
    : `0 · 예외 ${excepted.length}${excepted.length ? '(' + excepted.slice(0, 3).join(', ') + ')' : ''} · 후보(공고 행 이름에 없음) ${(rows || []).length}`
  return { status, value, miss, excepted }
}
