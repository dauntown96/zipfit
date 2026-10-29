CREATE OR REPLACE FUNCTION public.get_announcement_round_chain_ids(p_announcement_id text)
 RETURNS TABLE(announcement_id text, hop integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 회차 사슬 ID(2026-10-29 · 우편함 「코드·운영 — 회차 링크 표 B′」 2) — 카드 id 의 묶음(get_announcement_group_ids) ∪ 회차 링크(announcement_round_links)로
-- 이어진 회차들의 묶음. hop = 처음 닿은 단계(0 = 카드 자신의 묶음 · 1 = 링크 한 번 · …).
--   링크는 방향 없이 따른다(앞↔뒤) · 양끝 id 는 그 id 의 묶음으로 편다 · 사슬은 6단계까지(LH 재공고 연 2~3회 · 2~3년 치) ·
--   순환은 hop 최솟값으로 접힌다(같은 id 가 다시 나와도 결과는 한 줄 — 재귀는 6단계 상한으로 멈춘다).
--   표가 비면 결과 = get_announcement_group_ids(hop 0) 그대로.
with recursive walk(aid, hop) as (
  select g.announcement_id, 0 from public.get_announcement_group_ids(p_announcement_id) g
  union
  select n.announcement_id, w.hop + 1
  from walk w
  join public.announcement_round_links l on w.aid in (l.earlier_announcement_id, l.later_announcement_id)
  cross join lateral public.get_announcement_group_ids(
    case when l.earlier_announcement_id = w.aid then l.later_announcement_id else l.earlier_announcement_id end) n
  where w.hop < 6
)
select aid, min(hop)::integer from walk group by aid;
$function$
