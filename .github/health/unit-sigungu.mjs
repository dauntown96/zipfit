// 세대 시군구 이름 ℹ️(2026-11-23 · 우편함 「코드·운영 — 여덟째 묶음」 3 · 💡 「health-ops ⚠️ 세대 sigungu_nm이 공고 행·경계 파일 어디에도 없는 이름」)
//    열린 공고(announcements.status 공고중·접수중·정정공고중)의 세대 행(housing_units) sigungu_nm 중
//      ⓐ 같은 공고 행의 지역 글자(announcements.region · sigungu_nm)에 없고 ⓑ 지도 경계 파일(geo/<판>.json 의 cent 키 「시·도 코드|시군구」)에도 없는 이름을 센다.
//    경계 대조는 screen-check.mjs geo_names 와 같은 규칙(같은 이름 · 또는 구 단위만 있는 시의 시 이름 · 시·도 별칭은 index.html ZF_SIDO_ALIASES 를 그대로 읽는다).
//    기대값 · 예외 목록 정본 = unit-sigungu.json(한 파일). 처음은 ℹ️(판정 0) — warn_over 가 숫자면 그보다 많을 때 ⚠️(안 멈춤 · health-ops-soft).
export const UNIT_SIGUNGU_SQL = `with o as (select announcement_id, coalesce(region, '') rg, coalesce(btrim(sigungu_nm), '') sg
    from public.announcements where status in ('공고중', '접수중', '정정공고중')),
u as (select h.announcement_id, btrim(coalesce(h.sido_nm, '')) sd, btrim(h.sigungu_nm) sg
    from public.housing_units h join o using (announcement_id) where coalesce(btrim(h.sigungu_nm), '') <> '')
select coalesce(json_agg(json_build_object('sd', sd, 'sg', sg, 'rows', n, 'anns', a, 'in_ann', in_ann) order by sd, sg), '[]'::json) as j
  from (select u.sd, u.sg, count(*)::int n, count(distinct u.announcement_id)::int a,
               bool_or(strpos(o.rg, u.sg) > 0 or o.sg = u.sg) in_ann
          from u join o using (announcement_id) group by u.sd, u.sg) x`

// index.html 의 `const ZF_SIDO_ALIASES = { '새 이름': ['옛 이름', …], … }` 를 읽는다(사본 0)
export function sidoAliasesOf(indexHtml) {
  const m = /const ZF_SIDO_ALIASES\s*=\s*\{([\s\S]*?)\};/.exec(String(indexHtml || ''))
  const out = {}
  if (!m) return out
  for (const e of m[1].matchAll(/'([^']+)'\s*:\s*\[([^\]]*)\]/g)) out[e[1]] = [...e[2].matchAll(/'([^']+)'/g)].map(x => x[1])
  return out
}

// rows = SQL j · geo = 경계 파일 JSON · conf = unit-sigungu.json · aliases = sidoAliasesOf(index.html)
export function judgeUnitSigungu({ rows, geo, conf, aliases = {} }) {
  const sido = {}
  for (const p of geo.paths || []) { sido[p.name] = p.code; (aliases[p.name] || []).forEach(o => { sido[o] = p.code }) }
  const keys = Object.keys(geo.cent || {})
  const ex = new Set((conf.except || []).map(e => e.name))
  const miss = [], excepted = []
  let names = 0
  for (const r of rows || []) {
    names++
    const nm = `${r.sd} ${r.sg}`
    if (r.in_ann) continue
    const pc = sido[r.sd], sg = String(r.sg).replace(/\s+/g, '')
    const inGeo = !!pc && (geo.cent[pc + '|' + sg] || (/시$/.test(sg) && keys.some(k => k.startsWith(pc + '|' + sg))))
    if (inGeo) continue
    if (ex.has(r.sd) || ex.has(nm)) { excepted.push(nm); continue }
    miss.push({ nm, rows: r.rows, anns: r.anns })
  }
  const warnOver = typeof conf.warn_over === 'number' ? conf.warn_over : null
  const status = warnOver != null && miss.length > warnOver ? 'warn' : miss.length ? 'info' : 'pass'
  const value = `${miss.length}(기대 ${conf.expected ?? 0}${warnOver == null ? ' · ℹ️만' : ` · ⚠️ ${warnOver} 넘으면`})`
    + (miss.length ? ' — ' + miss.slice(0, 8).map(m => `${m.nm}(세대 ${m.rows} · 공고 ${m.anns})`).join(' · ') : '')
    + ` · 열린 공고 세대 시군구 이름 ${names}${excepted.length ? ` · 예외 ${excepted.length}` : ''}`
  return { status, value, miss, excepted, names }
}
