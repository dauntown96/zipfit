// 부정 표지 밖 글자 주간 ℹ️(2026-11-23 · 우편함 「코드·운영 — 열두째 묶음」 B · 열한째 묶음 회신 ⑦1)
//    announcement_policies.content_raw 에서 「못」·「안」(앞에 「잘」이 붙은 「잘못」은 따로) 뒤 첫 한글 글자 분포를 센다.
//    요점 검사기(scripts/plain-check.mjs NEG_MARKERS — 사본 0)의 부정 표지에 걸리지 않는 글자 중 기준선(neg-tail.json)에 없는 것 = 「새 글자」 →
//    값 칸에 글자와 행 수(판정 0 · ℹ️). 원문에 새 부정 활용(「못 미치」 같은)이 들어와 요점의 부정 빠짐을 검사기가 놓치기 전에 보이게 한다.
//    주 1회 — neg-tail.json slot(KST 월요일 10시대 · 그 시간 앞 회차 :25) 에만 센다 · 그 밖 회차는 skip(원문 전체 정규식이라 30분마다 돌리지 않는다).
import { NEG_MARKERS } from '../../scripts/plain-check.mjs'

export const NEG_TAIL_SQL = `with m as (select (regexp_matches(content_raw, '(잘?)(못|안)\\s?([가-힣])', 'g')) a from public.announcement_policies)
select coalesce(json_agg(json_build_object('w', w, 'c', c, 'n', n) order by w, n desc), '[]'::json) as j from (
  select (case when a[1] = '잘' then '잘' else '' end) || a[2] w, a[3] c, count(*)::int n from m group by 1, 2) z`

export function isMarked(word, ch) {
  const s = `${word}${ch}`
  return NEG_MARKERS.some(re => re.test(s)) || NEG_MARKERS.some(re => re.test(`${word} ${ch}`))
}

// now = Date · slot = neg-tail.json slot
export function inSlot(now, slot) {
  const k = new Date(now.getTime() + 9 * 3600e3)
  return k.getUTCDay() === slot.kst_weekday && k.getUTCHours() === slot.kst_hour && now.getUTCMinutes() < slot.utc_minute_before
}

// rows = [{w: '못'|'안'|'잘못', c, n}] · conf = neg-tail.json
export function judgeNegTail({ rows, conf }) {
  const fresh = [], marked = { 못: 0, 안: 0 }
  let jal = 0
  for (const r of rows || []) {
    if (r.w === '잘못') { jal += r.n; continue }
    if (isMarked(r.w, r.c)) { marked[r.w] = (marked[r.w] || 0) + r.n; continue }
    if ((conf.baseline[r.w] || []).includes(r.c)) continue
    fresh.push(r)
  }
  const status = fresh.length ? 'info' : 'pass'
  const value = (fresh.length ? `기준선 밖 새 글자 ${fresh.length} — ${fresh.slice(0, 10).map(r => `${r.w}+${r.c} ${r.n}행`).join(' · ')}` : '기준선 밖 새 글자 0')
    + ` · 표지에 걸림 못 ${marked.못} · 안 ${marked.안} · 「잘못」 거름 ${jal}`
  return { status, value, fresh }
}
