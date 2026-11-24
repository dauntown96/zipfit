// ㊼ LH 「주택형 안내」 표 ↔ 세대 행(2026-11-24 · 우편함 「코드·운영 — 열일곱째 묶음 A장」 3 · 조사 「두 가지(읽기만)」 ⑦1·⑦2) — ⚠️ 「값 다름」만(안 멈춤 · gate.mjs HARD 밖).
//    페이지 값 = source_page_checks.page_units(check-source-pages 가 같은 GET 응답에서 읽음) · DB 값 = 카드 묶음(get_announcement_group_ids) 세대 행.
//    맞추기: 탭 이름 ↔ building_name(띄어쓰기·「국민임대」 등 꼬리 뺀 글자가 서로 들어감 · 탭 없는 페이지는 묶음 전부) → 같은 전용면적(±0.005) 행.
//    갈래(⚠️ 아님): 여러 값 중 하나(같은 형 · 세대 비고에 페이지 면적 글자 — …021036 39형 「39.91㎡ / 39.52㎡」) ·
//      모집 수 다름(셈만 — 당첨+예비 합 …021062 203 = 103+100 꼴 포함) · 탭 맞는 단지 없음(…021044 용앙1 · MYHOME 공고문 단지) ·
//      데이터 없음(…021109) · 짧은 행(머리와 칸 수 다름) · 형 못 맞춤(면적·형 둘 다 없음).
//    ⚠️ 값 다름: 같은 형인데 면적이 다르고 비고에도 그 값이 없음(면적만).
//    🔵 금회공급은 셈만(⚠️ 아님) — 묶음 세대 행은 원천(LH·MYHOME 형제)마다 겹치고 대상별로 갈려 합이 부푼다(2026-11-24 표본: …020963 48 ↔ 240 ·
//      …021049 70 ↔ 140 = 같은 행 두 원천). 같으면 「같음」, 다르면 「모집 수 다름」으로만 센다.
//    상태 칸은 대조하지 않는다(조사 ⑦2 — LH 「공고상태」는 접수 창 안에서도 「공고중」 · 페이지 낡음).
const norm = s => String(s ?? '').replace(/\s+/g, '').replace(/(국민임대주택|국민임대|영구임대|행복주택|공공임대|임대주택|통합공공임대|신혼희망타운|아파트)$/g, '')
const htyKey = s => (String(s ?? '').trim().match(/^\d+(?:\.\d+)?[A-Za-z]?/) ?? [''])[0].replace(/\.0+(?=[A-Za-z]?$)/, '')
const sameArea = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= 0.005

export function judgeCard(pageUnits, units) {
  const out = { same: 0, multi: 0, supply: 0, notab: 0, nodata: 0, short: 0, unmatched: 0, bad: [] }
  for (const tab of pageUnits || []) {
    if (tab.nodata) { out.nodata++; continue }
    let cands = units
    if (tab.tab) {
      const tn = norm(tab.tab)
      cands = units.filter(u => { const b = norm(u.b); return b && (tn.includes(b) || b.includes(tn)) })
      if (!cands.length) { out.notab++; continue }
    }
    for (const r of tab.rows || []) {
      if (r.short || r.area == null) { out.short++; continue }
      const hit = cands.filter(u => sameArea(u.a, r.area))
      if (hit.length) {
        if (r.supply == null || hit.some(u => Number(u.rc) === r.supply)) out.same++
        else out.supply++
        continue
      }
      const k = htyKey(r.hty)
      const byType = k ? cands.filter(u => htyKey(u.t) === k) : []
      if (!byType.length) { out.unmatched++; continue }
      const txt = String(r.area.toFixed(2))
      if (byType.some(u => String(u.note ?? '').includes(txt))) out.multi++
      else out.bad.push(`${tab.tab ?? ''} ${r.hty} 전용 페이지 ${r.area} · 세대 행 ${[...new Set(byType.map(u => u.a))].join('/')}`.trim())
    }
  }
  return out
}

export const PAGE_UNITS_SQL = `
with c as (select distinct on (card_id) card_id, page_units from public.source_page_checks
            where source = 'LH' and error is null and page_units is not null and checked_at > now() - interval '14 hours'
            order by card_id, checked_at desc)
select json_build_object('cards', (select coalesce(json_agg(json_build_object('id', c.card_id, 'pu', c.page_units,
  'units', (select coalesce(json_agg(json_build_object('b', h.building_name, 't', h.unit_type, 'a', h.area_sqm, 'rc', coalesce(h.recruit_count, h.group_recruit_count), 'note', h.extra_note)), '[]'::json)
              from public.housing_units h where h.announcement_id in (select g.announcement_id from public.get_announcement_group_ids(c.card_id) g)))), '[]'::json) from c)) j`

export function judgePageUnits(j) {
  const tot = { same: 0, multi: 0, supply: 0, notab: 0, nodata: 0, short: 0, unmatched: 0 }
  const hits = []
  let cards = 0, withRows = 0
  for (const c of j.cards || []) {
    cards++
    if (!(c.units || []).length) continue
    withRows++
    const r = judgeCard(c.pu, c.units)
    for (const k of Object.keys(tot)) tot[k] += r[k]
    if (r.bad.length) hits.push({ id: c.id, why: r.bad.slice(0, 2).join(' · ') })
  }
  const value = `값 다름 ${hits.length}장${hits.length ? ': ' + hits.slice(0, 4).map(h => `…${String(h.id).slice(-6)}(${h.why})`).join(' / ') : ''}` +
    ` · 대조 카드 ${withRows}/${cards} · 같음 ${tot.same} · 여러 값 중 하나 ${tot.multi} · 모집 수 다름(셈만) ${tot.supply} · 탭 단지 없음 ${tot.notab} · 데이터 없음 ${tot.nodata} · 짧은 행 ${tot.short} · 형 못 맞춤 ${tot.unmatched}`
  const rule = '0 — 넘으면 ⚠️(안 멈춤) · 페이지 「주택형 안내」(같은 GET) ↔ 카드 묶음 세대 행 · 값 다름 = 같은 형 면적 다름(비고에도 없음) · 금회공급은 셈만(묶음 세대 행이 원천마다 겹침) · 상태 칸은 대조하지 않음(페이지 낡음) · 첫 값 2026-11-24 표본 10쪽 0'
  return { status: hits.length ? 'warn' : 'pass', value, rule, hits, tot }
}
