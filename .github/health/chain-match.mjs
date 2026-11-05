// ㉜ 커트라인 사슬 규칙 두 곳 대조(2026-11-05 · 우편함 「코드·운영 — 대상주택 공지 감지 설계 · 접수 경로 이메일 · 커트라인 사슬 규칙 두 곳 대조 …」 3장 · #896 회신 ②).
//    회차 사슬은 두 곳에 있다 — ⓐ get_announcement_round_chain_ids(카드 상세 「다른 회차」 등 · 카드 한 장씩) ⓑ get_announcement_cutoff_rounds 안 사슬 CTE
//    (link_map · keyed · walk · chain — 카드마다 ⓐ를 부르면 anon 3초를 넘어 집합으로 한 번 편 것). 한쪽만 고치면 카드 「지난 회차」가 상세와 다른 회차를 잇는다.
//    🔴 ⓑ는 손으로 옮기지 않는다 — supabase/rpc/get_announcement_cutoff_rounds.sql(= DB 정의 · health-ops 「사본 = DB」가 매시 대조)에서
//       「link_map as materialized (」부터 「by_chain as (」 앞까지를 실행 때 떠낸다. 못 떠내면(표지 글이 바뀜) ⚠️ 점검 불능.
//    카드 = get_announcements_deduped() 대표 ∧ apply_end ≥ 오늘(KST) · 짝 = (카드, 다른 묶음 공고 id)
//      ⓐ = 그 카드로 ⓐ를 불러 hop ≥ 1 인 id · ⓑ = chain CTE 의 (aid, pid)
//    판정 — 카드 집합 · 짝 집합이 같으면 ℹ️(정보 · 값에 카드·짝 수) · 다르면 ⚠️(다른 카드 ID 앞 5) · gate.mjs HARD 밖(안 멈춤).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RPC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'rpc', 'get_announcement_cutoff_rounds.sql')

export function chainCtesFrom(def) {
  const a = def.indexOf('  link_map as materialized (')
  const b = def.indexOf('  by_chain as (')
  if (a < 0 || b < 0 || b < a) throw new Error('get_announcement_cutoff_rounds 사본에서 사슬 CTE 표지(link_map · by_chain)를 못 찾음')
  return def.slice(a, b).replace(/,\s*$/, '')
}

export function chainMatchSql(def = readFileSync(RPC, 'utf8')) {
  return `
with recursive oc as materialized (select distinct d.announcement_id aid from public.get_announcements_deduped() d
        where d.apply_end >= (now() at time zone 'Asia/Seoul')::date),
ann as materialized (select oc.aid from oc join public.announcements a on a.announcement_id = oc.aid),
${chainCtesFrom(def)},
fn as materialized (select oc.aid, c.announcement_id as pid from oc cross join lateral public.get_announcement_round_chain_ids(oc.aid) c where c.hop >= 1),
ca as (select distinct aid from chain), fa as (select distinct aid from fn),
dc as (select aid from ca except select aid from fa union select aid from fa except select aid from ca),
dp as (select aid from (select aid, pid from chain except select aid, pid from fn union all (select aid, pid from fn except select aid, pid from chain)) z)
select json_build_object(
  'open', (select count(*) from oc),
  'cards', (select count(*) from ca), 'cards_fn', (select count(*) from fa),
  'pairs', (select count(*) from chain), 'pairs_fn', (select count(*) from fn),
  'diff_cards', (select coalesce(json_agg(distinct aid), '[]'::json) from (select aid from dc union select aid from dp) z),
  'diff_pairs', (select count(*) from dp)) j`
}

export function judgeChainMatch(j) {
  const rule = '열린 카드(apply_end ≥ 오늘 KST)마다 get_announcement_round_chain_ids hop ≥ 1 짝 = get_announcement_cutoff_rounds 사슬 CTE 짝(카드 집합 · 짝 집합 모두) — 같으면 ℹ️ 정보 · 다르면 ⚠️(안 멈춤) · 사슬 CTE 는 supabase/rpc 사본에서 떠냄'
  if (j.diff_cards.length === 0 && j.cards === j.cards_fn && j.pairs === j.pairs_fn)
    return { status: 'info', value: `같음 — 열린 카드 ${j.open} 중 사슬 있음 ${j.cards} · 짝 ${j.pairs}`, rule }
  return { status: 'warn', value: `다름 ${j.diff_cards.length}카드(짝 차 ${j.diff_pairs}): ${j.diff_cards.slice(0, 5).join(', ')} · 커트라인 길 카드 ${j.cards}/짝 ${j.pairs} · 상세 길 카드 ${j.cards_fn}/짝 ${j.pairs_fn}`, rule }
}
