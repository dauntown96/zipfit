CREATE OR REPLACE FUNCTION public.get_announcement_price_summary(p_ids text[])
 RETURNS TABLE(announcement_id text, deposit_min bigint, deposit_max bigint, rent_min bigint, rent_max bigint, area_min numeric, area_max numeric, round_state text, source_round date)
 LANGUAGE sql
 STABLE
AS $function$
  -- 🔴 그룹을 get_announcement_group_ids()로 id마다 부르지 않는다(집합으로 한 번에 편다).
  -- 그 함수는 호출마다 announcements를 두 번 훑고 announcement_dedup_key()를 전 행에 건다.
  -- 목록 1회분(840건)을 그렇게 부르면 17.3초였다(2026-09-14 EXPLAIN ANALYZE 실측).
  -- 판정 규칙은 그 함수와 글자 그대로 같다 — dedup_key 일치 · title not null · hidden 아님.
  --
  -- 🔴 round_state·source_round 는 2026-09-16에 **더한** 것이다(PR 예정).
  -- 값(보증금·월세·면적) 계산은 한 글자도 바꾸지 않았다 — 어느 회차에서 온 값인지를
  -- 화면이 말할 수 있게 **이름표만** 붙인다. 판정식은 여기 한 벌뿐이고 화면은 읽기만 한다.
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
  -- 🔵 announcement_date 를 함께 들고 간다(source_round 재료). gid 가 날짜를 결정하므로
  --    UNION 의 행 집합은 달라지지 않는다.
  cur as (
    select m.aid, m.gid, m.announcement_date as gdate
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
    select c.aid, c.gid, c.gdate from cur c where c.aid in (select aid from cur_has)
    union
    select m.aid, m.gid, m.announcement_date from meta m where m.aid not in (select aid from cur_has)
  )
  select p.aid,
         min(h.deposit)::bigint, max(h.deposit)::bigint,
         min(h.monthly_rent)::bigint, max(h.monthly_rent)::bigint,
         min(h.area_sqm), max(h.area_sqm),
         -- 🔴 'unknown' 을 **가장 먼저** 본다. 정정 그룹은 `any_revised` 때문에 ① 이 그룹 전체가 되어
         --    ③ 이 영영 발화하지 않는다 — 그래서 cur_has 로는 'past' 를 잡을 수 없다.
         --    LH 정정공고는 새 PAN_ID 로 오고 형제와 날짜 차이가 1~149일이라(⑩ 실측)
         --    「같은 회차의 정정」과 「지난 회차」가 날짜로 갈리지 않는다. 그래서 가리지 못했다고 말한다.
         --    ⚠️ date_kinds < 2 면 그룹 날짜가 하나뿐이라 갈릴 것이 없다 → 종전 규칙을 그대로 탄다.
         case
           when o.any_revised and o.date_kinds >= 2 then 'unknown'
           when ch.aid is not null                  then 'current'
           else                                          'past'
         end as round_state,
         -- 🔵 'past' 일 때만 값이 온 회차를 적는다. 여기 살아남은 p 행은 세대정보가 실제로 붙은
         --    gid 뿐이라(아래 join), 그 최댓값이 곧 「값을 가져온 회차」다.
         case
           when (o.any_revised and o.date_kinds >= 2) or ch.aid is not null then null
           else max(p.gdate)
         end as source_round
  from pick p
  join public.housing_units h on h.announcement_id = p.gid
  join own o on o.aid = p.aid
  left join cur_has ch on ch.aid = p.aid
  group by p.aid, o.any_revised, o.date_kinds, ch.aid;
$function$
