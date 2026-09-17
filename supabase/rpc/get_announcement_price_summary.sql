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
  -- 🔴 round_state·source_round 는 2026-09-16에 **더한** 것이다.
  -- 값(보증금·월세·면적) 계산은 한 글자도 바꾸지 않았다 — 어느 회차에서 온 값인지를
  -- 화면이 말할 수 있게 **이름표만** 붙인다.
  --
  -- 🔴 2026-09-17 개정 — 회차 축을 announcement_date 에서 **회차 날짜**로 옮겼다.
  --   한 행의 회차 날짜 = is_revised 이고 first_announcement_date 가 있으면 그것, 아니면 announcement_date.
  --   LH 목록의 PAN_DT(first_announcement_date)가 정정공고에서도 원공고일을 유지하므로,
  --   같은 회차의 정정끼리는 **하나로 모이고** 회차끼리는 갈린다(2026-09-17 tp=06 300행 실측).
  -- 🔴 그래서 `any_revised and date_kinds >= 2 -> 'unknown'` 선판정을 걷었다. 그것은 「정정이 섞이면
  --   날짜로 회차를 가릴 수 없다」는 사실 때문에 있던 것인데, 회차 날짜로는 가려진다.
  --   실측: 세대정보 있는 활성 그룹에서 'unknown' 15건이 전부 current/past 로 갈렸고
  --   기존 current·past 는 한 건도 뒤집히지 않았다.
  -- ⚠️ 'unknown' 은 **대표행의 회차 날짜 자체가 null 일 때만** 남는다(그때는 비교할 축이 없다).
  -- 🔴 이 규칙은 화면 zfNoticeDate() 와 같은 관문이다. 언어가 달라 코드를 공유할 수 없으므로
  --   **두 판정을 전 그룹으로 대조하는 것**이 이 사본의 검증 방법이다(회차마다 다시 돌린다).
  with ids as (
    select distinct x as aid from unnest(p_ids) x where x is not null
  ),
  -- 목록에 실릴 수 있는 전 공고의 dedup_key를 한 번만 만든다
  keyed as materialized (
    select a.announcement_id as gid,
           public.announcement_dedup_key(a.title) as dedup_key,
           case when coalesce(a.is_revised, false) and a.first_announcement_date is not null
                then a.first_announcement_date
                else a.announcement_date
           end as round_date,
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
    select t.aid, k.gid, k.round_date, k.is_revised
    from target t
    join keyed k on k.dedup_key = t.dedup_key
  ),
  own as (
    select m.aid,
           max(m.round_date) filter (where m.gid = m.aid) as own_date,
           count(distinct m.round_date)                   as date_kinds
    from meta m
    group by m.aid
  ),
  -- ① 이번 회차 후보 — roundInfoFor()의 판정과 같다
  -- 🔵 round_date 를 함께 들고 간다(source_round 재료). gid 가 날짜를 결정하므로
  --    UNION 의 행 집합은 달라지지 않는다.
  -- ⚠️ own_date 가 null 이면 `m.round_date = o.own_date` 가 전부 null(거짓)이라 이 CTE 가 비고,
  --    cur_has 도 비어 아래 ③ 이 그룹 전체를 되돌린다 — 그 상태를 'unknown' 이라 부른다.
  cur as (
    select m.aid, m.gid, m.round_date as gdate
    from meta m
    join own o on o.aid = m.aid
    where o.date_kinds < 2
       or m.round_date = o.own_date
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
    select m.aid, m.gid, m.round_date from meta m where m.aid not in (select aid from cur_has)
  )
  select p.aid,
         min(h.deposit)::bigint, max(h.deposit)::bigint,
         min(h.monthly_rent)::bigint, max(h.monthly_rent)::bigint,
         min(h.area_sqm), max(h.area_sqm),
         -- 🔴 'unknown' 은 이제 **대표행의 회차 날짜가 없을 때 하나뿐**이다(2026-09-17).
         --    종전의 `any_revised and date_kinds >= 2` 는 「정정이 섞이면 날짜로 못 가린다」였는데,
         --    회차 날짜로는 같은 회차의 정정끼리 하나로 모여 가려진다.
         case
           when o.own_date is null  then 'unknown'
           when ch.aid is not null  then 'current'
           else                          'past'
         end as round_state,
         -- 🔵 'past' 일 때만 값이 온 회차를 적는다. 여기 살아남은 p 행은 세대정보가 실제로 붙은
         --    gid 뿐이라(아래 join), 그 최댓값이 곧 「값을 가져온 회차」다.
         case
           when o.own_date is null or ch.aid is not null then null
           else max(p.gdate)
         end as source_round
  from pick p
  join public.housing_units h on h.announcement_id = p.gid
  join own o on o.aid = p.aid
  left join cur_has ch on ch.aid = p.aid
  group by p.aid, o.own_date, ch.aid;
$function$
