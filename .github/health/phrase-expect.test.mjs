// 카드 문구 갈래 식 시험(2026-11-25 · 스물두째 1 · #1283) — 가짜 가격 요약 행(VALUES)에 옛 식 · 새 식을 돌려 화면 zfAnaPending 차례와 견준다.
// DB 는 읽기만(VALUES 만 · 표를 읽지 않는 링크 식) — SUPABASE_ACCESS_TOKEN 이 있어야 한다(컨테이너는 프록시가 주입 · 아무 값).
//   node .github/health/phrase-expect.test.mjs
import { sqlRead } from './lib.mjs'
import { phraseCaseSql } from './phrase-expect.mjs'

// 종전(2026-11-25 앞) 식 — 가격이 「분석중」보다 앞. 재현 기록으로 남긴다.
const OLD = (p, link) => `case when ${p}.announcement_id is null then '빈칸'
  when ${p}.deposit_min is not null or ${p}.rent_min is not null or ${p}.area_min is not null then '요약'
  when ${link} then '④링크' when ${p}.analysis_done then '목록없음'
  when ${p}.has_attachments = false then '링크만' when ${p}.analysis_done is false then '분석중' else '미정리' end`

// [이름, announcement_id, analysis_done, has_attachments, deposit_min, 링크 있음, 화면 기대]
const CASES = [
  ['…21054 꼴 — 대표 분석 전 · 첨부 있음 · 묶음 형제 세대 값 있음', 'F1', false, true, 2808000, false, '분석중'],
  ['분석 끝 · 값 있음', 'F2', true, true, 2808000, false, '요약'],
  ['분석 전 · 첨부 있음 · 값 없음', 'F3', false, true, null, false, '분석중'],
  ['분석 전 · 첨부 0 · 값 없음', 'F4', false, false, null, false, '링크만'],
  ['분석 전 · 첨부 있음 · 같은 게시물 링크 있음 · 값 없음', 'F5', false, true, null, true, '④링크'],
  ['분석 전 · 링크 있음 · 값 있음(LH 카드에 정리됨)', 'F6', false, true, 2808000, true, '요약'],
  ['분석 끝 · 값 없음', 'F7', true, true, null, false, '목록없음'],
  ['응답에 없음', null, null, null, null, false, '빈칸'],
]
const lit = v => v === null ? 'null' : typeof v === 'string' ? `'${v}'` : String(v)
const rows = CASES.map((c, i) => `(${i}, ${lit(c[1])}::text, ${lit(c[2])}::boolean, ${lit(c[3])}::boolean, ${lit(c[4])}::bigint, null::bigint, null::numeric, ${c[5]})`).join(',\n  ')
const q = `with p(i, announcement_id, analysis_done, has_attachments, deposit_min, rent_min, area_min, link) as (values
  ${rows})
select json_agg(json_build_array(i, ${OLD('p', 'p.link')}, ${phraseCaseSql('p', 'p.link')}) order by i) j from p`
const [{ j }] = await sqlRead(q)
let bad = 0, oldBad = 0
for (const [i, oldGot, newGot] of j) {
  const [name, , , , , , want] = CASES[i]
  if (oldGot !== want) oldBad++
  if (newGot !== want) { bad++; console.log(`✗ ${name}: 새 식 ${newGot} ≠ 화면 ${want}`) }
  else console.log(`✓ ${name}: ${newGot}${oldGot !== want ? ` (옛 식 ${oldGot} — 재현)` : ''}`)
}
console.log(`문구 갈래 시험 ${CASES.length - bad}/${CASES.length} · 옛 식 어긋남 ${oldBad}`)
process.exit(bad || oldBad === 0 ? 1 : 0)
