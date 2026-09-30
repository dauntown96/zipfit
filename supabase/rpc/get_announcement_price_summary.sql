CREATE OR REPLACE FUNCTION public.get_announcement_price_summary(p_ids text[])
 RETURNS TABLE(announcement_id text, deposit_min bigint, deposit_max bigint, rent_min bigint, rent_max bigint, area_min numeric, area_max numeric, round_state text, source_round date, analysis_done boolean, has_attachments boolean, unit_places jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 🔴 2026-09-29 코드 회차 2 — SECURITY DEFINER 로 바꿨다. analysis_done 이 announcement_analysis 를 읽는데
  --   그 표는 anon·authenticated 에 SELECT 가 없다(RLS 켜짐 · 정책 0 · 권한 service_role 만). INVOKER 그대로 두면
  --   anon 호출이 permission denied 로 죽는다(2026-09-29 적용 직후 실측 → 즉시 되돌렸다).
  --   그 표를 anon 에 열지 않는다(pending_fields 등 내부 기록). 이 함수가 내보내는 것은 공고마다 참/거짓 하나뿐이고,
  --   나머지 재료(announcements · housing_units)는 SELECT 정책이 이미 `to anon, authenticated : true`라 새로 드러나는 것이 없다
  --   (get_announcement_group_ids 와 같은 판단). search_path 는 정의자 함수라 고정한다.
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
  -- 🔴 2026-09-30(코드 — 같은 게시물은 LH 카드 한 장) — 그룹 키 = 링크 표에 있는 MYHOME 행이면 LH 행의 제목 키
  --   (get_announcement_group_ids 와 같은 규칙). LH 카드 요약에 붙은 공고문의 세대 행이 함께 든다.
  with ids as (
    select distinct x as aid from unnest(p_ids) x where x is not null
  ),
  link_map as materialized (
    select distinct on (l.linked_announcement_id)
      l.linked_announcement_id as aid, public.announcement_dedup_key(lh.title) as lh_key
    from public.announcement_post_links l
    join public.announcements lh on lh.announcement_id = l.lh_announcement_id
    where lh.title is not null and lh.hidden_from_listing is not true
    order by l.linked_announcement_id, l.lh_announcement_id
  ),
  -- 목록에 실릴 수 있는 전 공고의 dedup_key를 한 번만 만든다
  keyed as materialized (
    select a.announcement_id as gid,
           coalesce(lm.lh_key, public.announcement_dedup_key(a.title)) as dedup_key,
           (lm.aid is not null) as linked_in,
           case when coalesce(a.is_revised, false) and a.first_announcement_date is not null
                then a.first_announcement_date
                else a.announcement_date
           end as round_date,
           coalesce(a.is_revised, false) as is_revised,
           -- 🔵 2026-09-29 코드 회차 2 — 아래 flags 의 재료. 값 계산(보증금·월세·면적·회차)은 이 칸들을 읽지 않는다.
           a.apply_end,
           (jsonb_typeof(a.attachment_urls) = 'array' and jsonb_array_length(a.attachment_urls) > 0) as has_att,
           exists (select 1 from public.announcement_analysis aa
                   where aa.announcement_id = a.announcement_id
                     and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')) as done
    from public.announcements a
    left join link_map lm on lm.aid = a.announcement_id
    where a.title is not null
      and a.hidden_from_listing is not true
  ),
  -- 🔴 대상 행에는 hidden 필터를 걸지 않는다 — get_announcement_group_ids의 target CTE와 같다
  target as (
    select distinct i.aid, coalesce(lm.lh_key, public.announcement_dedup_key(a.title)) as dedup_key, a.apply_end
    from ids i
    join public.announcements a on a.announcement_id = i.aid
    left join link_map lm on lm.aid = a.announcement_id
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
  ),
  -- 🔵 2026-09-29 코드 회차 2 — 카드 상태 두 칸. 그룹은 위 meta 와 같은 축(dedup_key · title not null · hidden 아님).
  --   analysis_done   = 카드(대표)와 **같은 apply_end** 구성원에 완료 계열 분석이 있는가 — get_reanalysis_queue 의
  --                     「같은 회차 완료분 제외」·⑨ 5장 분석률 분자와 같은 축. 카드 apply_end 가 NULL 이면 거짓.
  --   has_attachments = 그룹 구성원 누구든 attachment_urls 에 파일이 하나라도 있는가.
  flags as (
    select t.aid,
           -- 🔵 2026-09-30 — 같은 게시물로 붙은 공고문(linked_in)은 마감일이 달라도 이 카드의 회차다.
           coalesce(bool_or(k.done and (k.apply_end = t.apply_end or k.linked_in)), false) as analysis_done,
           coalesce(bool_or(k.has_att), false)                            as has_attachments
    from target t
    join keyed k on k.dedup_key = t.dedup_key
    group by t.aid
  ),
  -- 🔵 2026-09-30 코드 회차(카드 첫 줄) — 카드 표지 지역의 재료. **이번 회차에 세대정보가 있는 카드만**
  --   (cur_has) 그 세대 행의 (시도, 시군구)를 세대 수와 함께 돌려준다 — [[「시도 시군구」, 세대 수], …] 세대 수 내림차순.
  --   지난 회차로 되돌아간 카드(round_state past·unknown)는 NULL 이다 — 표지는 이번 공고가 어디인지를 말한다.
  --   값 계산(보증금·월세·면적·회차·flags)은 이 CTE 를 읽지 않는다. 시도 옛 이름(광주광역시 등)은 화면이 맞춘다.
  --   🔴 시군구는 수집(announcements.sigungu_nm)에 실재하는 이름만 받는다(같거나 「이름 + 공백」으로 시작) — 옛 분석분
  --      세대 행에 「경기수원시」·「매입다가구(대구수성구)」 같은 값이 있다(2026-09-30 실측 23쌍 중 시도 옛 이름 아닌 것 전부).
  known_sg as materialized (
    select distinct btrim(sigungu_nm) as sg
    from public.announcements
    where nullif(btrim(sigungu_nm), '') is not null and btrim(sigungu_nm) <> '외'
  ),
  places as (
    select p.aid, btrim(h.sido_nm) as sd, btrim(h.sigungu_nm) as sg, count(*) as n
    from pick p
    join cur_has ch on ch.aid = p.aid
    join public.housing_units h on h.announcement_id = p.gid
    where nullif(btrim(h.sido_nm), '') is not null
      and nullif(btrim(h.sigungu_nm), '') is not null
    group by 1, 2, 3
  ),
  places_agg as (
    select pl.aid, jsonb_agg(jsonb_build_array(pl.sd || ' ' || pl.sg, pl.n) order by pl.n desc, pl.sd || ' ' || pl.sg) as unit_places
    from places pl
    where exists (select 1 from known_sg k where k.sg = pl.sg or k.sg like pl.sg || ' %')
    group by pl.aid
  ),
  agg as (
  select p.aid,
         -- 🔵 2026-09-29 코드 회차 — 세대 하나에 임대조건 두 벌(deposit/monthly_rent + deposit_priority1/rent_priority1)이면
         --    둘째 벌도 min~max에 넣는다. least/greatest는 NULL을 건너뛰므로 한 벌만 있는 행(supply_target 두 행 포함)은 값이 그대로다.
         min(least(h.deposit, h.deposit_priority1))::bigint as deposit_min, max(greatest(h.deposit, h.deposit_priority1))::bigint as deposit_max,
         min(least(h.monthly_rent, h.rent_priority1))::bigint as rent_min, max(greatest(h.monthly_rent, h.rent_priority1))::bigint as rent_max,
         min(h.area_sqm) as area_min, max(h.area_sqm) as area_max,
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
  group by p.aid, o.own_date, ch.aid
  )
  -- 🔴 2026-09-29 코드 회차 2 — 세대정보가 없는 카드도 한 행을 돌려준다(값 칸은 전부 NULL · round_state NULL).
  --   그래야 analysis_done·has_attachments 가 그 카드에 닿는다. 세대정보가 있는 카드의 값 칸은 종전과 한 글자도 같다.
  --   화면은 값 칸이 전부 NULL 인 행을 종전의 「응답에 없음」과 같게 읽는다(zfSummaryLine 이 빈 문자열).
  select t.aid,
         g.deposit_min, g.deposit_max, g.rent_min, g.rent_max, g.area_min, g.area_max,
         g.round_state, g.source_round,
         coalesce(f.analysis_done, false), coalesce(f.has_attachments, false),
         pa.unit_places
  from (select distinct aid from target) t
  left join agg g   on g.aid = t.aid
  left join flags f on f.aid = t.aid
  left join places_agg pa on pa.aid = t.aid;
$function$
