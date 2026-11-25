// 열린 카드 회차 고리 밖 같은 단지 닫힌 미분석(2026-11-25 · 우편함 「코드·운영 — 스물두째」 4 · 백로그 국면 C 4238aaa7e155811c948f) — health-ops ℹ️(판정 0 · 이슈 0).
//   셈 규칙 = 국면 C (라) 1판·2판 0장: 열린 대표(목록 RPC ∧ apply_end ≥ 오늘 KST) 묶음의 세대 행 building_name(3자 이상) → 같은 sido_nm 의 닫힌 대표 ·
//   그 묶음 어디에도 announcement_analysis 없음 · 제목(공백 무시)에 단지명 포함 = 쌍. 짝 열린 카드 마감(확정값 먼저) > 오늘+7 이면 「대상」(분석 묶음이 적재할 몫) ·
//   이하는 「마감 임박」 · 열린 카드 회차 고리(get_announcement_round_chain_ids) 안이면 「고리 안」. round-gap.json 예외(원문으로 다른 단지)는 셈 밖.
//   🔴 묶음은 제목 키(title_dedup_key)로 바로 묶는다 — 2판 0장이 get_announcement_group_ids 를 행마다 불러 시간 초과(같은 게시물 링크는 안 펼친 근사 · ℹ️ 라 둔다).
//   기준선: 1판 20 · 2판 15쌍(대상 1 → 적재 뒤 0 · 마감 임박 10 · 다른 단지 4 · 고리 안 0) · 2026-11-25 이 셈 14(대상 0 · 임박 10 · 예외 4).
export const ROUND_GAP_SQL = `
with d as (select (now() at time zone 'Asia/Seoul')::date as today),
l as materialized (select x.announcement_id aid, x.title, x.sido_nm, x.apply_end from public.get_announcements_deduped() x),
k as materialized (select a.announcement_id aid, a.title_dedup_key tk from public.announcements a),
o as (select l.aid, l.sido_nm, coalesce(a.apply_end_confirmed, l.apply_end) as endd, k.tk
        from l join k on k.aid = l.aid join public.announcements a on a.announcement_id = l.aid, d where l.apply_end >= d.today),
names as (select distinct o.aid oaid, o.sido_nm, o.endd, btrim(h.building_name) nm
            from o join k k2 on k2.tk = o.tk join public.housing_units h on h.announcement_id = k2.aid
           where char_length(btrim(coalesce(h.building_name, ''))) >= 3),
c as (select l.aid, l.title, l.sido_nm, k.tk from l join k on k.aid = l.aid, d where l.apply_end < d.today
        and not exists (select 1 from k k3 join public.announcement_analysis aa on aa.announcement_id = k3.aid where k3.tk = k.tk)),
pairs as (select distinct c.aid caid, n.oaid, n.endd from c join names n on n.sido_nm = c.sido_nm
           and position(replace(n.nm, ' ', '') in replace(c.title, ' ', '')) > 0),
ch as (select p.oaid, r.announcement_id rid from (select distinct oaid from pairs) p
         cross join lateral public.get_announcement_round_chain_ids(p.oaid) r where r.hop >= 1)
select coalesce(json_agg(json_build_object('c', p.caid, 'o', p.oaid, 'end', p.endd,
         'soon', p.endd <= (select today from d) + 7,
         'chain', exists (select 1 from ch where ch.oaid = p.oaid and ch.rid = p.caid)) order by p.caid), '[]'::json) j
from pairs p`

// rows = [{c, o, end, soon, chain}] · excluded = Set(닫힌 id) → {status:'info', value, extra}
export function judgeRoundGap(rows, excluded) {
  const ex = rows.filter(r => excluded.has(r.c))
  const live = rows.filter(r => !excluded.has(r.c))
  const target = live.filter(r => !r.soon && !r.chain)
  const soon = live.filter(r => r.soon && !r.chain)
  const chain = live.filter(r => r.chain)
  const short = id => (/^\d{16}$/.test(id) ? '…' + id.slice(-5) : id)
  const list = a => a.slice(0, 4).map(r => `${short(r.c)}→${short(r.o)}(${String(r.end).slice(5)})`).join(', ') + (a.length > 4 ? ` 외 ${a.length - 4}` : '')
  const value = `대상 ${target.length}${target.length ? `: ${list(target)}` : ''} · 마감 임박(짝 마감 ≤ 오늘+7) ${soon.length} · 고리 안 ${chain.length} · 예외(다른 단지) ${ex.length} · 쌍 ${rows.length}`
  return { status: 'info', value, target: target.map(r => r.c) }
}
