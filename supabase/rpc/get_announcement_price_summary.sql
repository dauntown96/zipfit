CREATE OR REPLACE FUNCTION public.get_announcement_price_summary(p_ids text[])
 RETURNS TABLE(announcement_id text, deposit_min bigint, deposit_max bigint, rent_min bigint, rent_max bigint, area_min numeric, area_max numeric)
 LANGUAGE sql
 STABLE
AS $function$
  -- 🔴 그룹을 get_announcement_group_ids()로 id마다 부르지 않는다(집합으로 한 번에 편다).
  -- 그 함수는 호출마다 announcements를 두 번 훑고 announcement_dedup_key()를 전 행에 건다.
  -- 목록 1회분(840건)을 그렇게 부르면 17.3초였다(2026-09-14 EXPLAIN ANALYZE 실측).
  -- 판정 규칙은 그 함수와 글자 그대로 같다 — dedup_key 일치 · title not null · hidden 아님.
  with ids as (
    select distinct x as aid from unnest(p_ids) x where x is not null
  ),
  -- 목록에 실릴 수 있는 전 공고의 dedup_key를 한 번만 만든다
  keyed as materialized (
    select a.announcement_id as gid,
           public.announcement_dedup_key(a.title) as dedup_key,
           a.announcement_date,
           coalesce(a.is_revised, false) as is_revised
    from public.announcements a
    where a.title is not null
      and a.hidden_from_listing is not true
  ),
  -- 🔴 대상 행에는 hidden 필터를 걸지 않는다 — get_announcement_group_ids의 target CTE와 같다
  target as (
    select distinct i.aid, public.announcement_dedup_key(a.title) as dedup_key
    from ids i
    join public.announcements a on a.announcement_id = i.aid
  ),
  meta as (
    select t.aid, k.gid, k.announcement_date, k.is_revised
    from target t
    join keyed k on k.dedup_key = t.dedup_key
  ),
  own as (
    select m.aid,
           max(m.announcement_date) filter (where m.gid = m.aid) as own_date,
           count(distinct m.announcement_date)                   as date_kinds,
           bool_or(m.is_revised)                                 as any_revised
    from meta m
    group by m.aid
  ),
  -- ① 이번 회차 후보 — roundInfoFor()의 판정과 같다
  cur as (
    select m.aid, m.gid
    from meta m
    join own o on o.aid = m.aid
    where o.any_revised
       or o.date_kinds < 2
       or m.announcement_date = o.own_date
  ),
  -- ② 이번 회차에 실제 세대정보가 있는 공고만 추린다
  cur_has as (
    select distinct c.aid
    from cur c
    join public.housing_units h on h.announcement_id = c.gid
  ),
  -- ③ 이번 회차가 비면 그룹 전체로 되돌린다(loadHousingUnits의 거동과 같다)
  pick as (
    select c.aid, c.gid from cur c where c.aid in (select aid from cur_has)
    union
    select m.aid, m.gid from meta m where m.aid not in (select aid from cur_has)
  )
  select p.aid,
         min(h.deposit)::bigint, max(h.deposit)::bigint,
         min(h.monthly_rent)::bigint, max(h.monthly_rent)::bigint,
         min(h.area_sqm), max(h.area_sqm)
  from pick p
  join public.housing_units h on h.announcement_id = p.gid
  group by p.aid;
$function$
