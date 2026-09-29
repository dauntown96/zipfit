-- B62 ⑤ — 국민임대 단지별 ㎡당 월임대료 순위(읽기 전용 뷰). 화면의 「동네 가격 칩」이 읽는다.
-- 값: 단지마다 세대 행의 monthly_rent / area_sqm 최저값 · 같은 단지가 여러 회차면 가장 최근 회차(announcement_date 최댓값).
-- 단지 식별: 세대정보 머리 키(building_name 우선, 없으면 address)에서 끝의 괄호 꼬리를 뗀 이름
--           (「구미옥계2」·「구미옥계2(6개동)」은 한 단지 — 떼지 않으면 같은 단지가 비교군에 두 번 들어간다).
-- 비교군: 단지 주소의 앞 두 낱말(시·도 · 시·군·구) × 표준 유형 국민임대(housing_type_map). 5곳 이상일 때만 is_low 가 참이 될 수 있다.
-- 판정: 순위(rank, 낮은 값이 1) × 3 ≤ 비교군 수 → 하위 3분의 1.
-- 출력: 그 단지 세대 행을 가진 공고 id 마다 한 행(회차 무관) — 화면은 카드 제목 키·세대 머리 키로 붙인다.
-- 권한: security_invoker(부르는 역할의 RLS) · anon·authenticated SELECT 만. 읽는 표 셋은 모두 anon 이 이미 읽는다.
-- 되돌리기: drop view public.kukmin_rent_per_sqm_rank;
begin;
DO $$ begin
  if exists (select 1 from pg_class where relname='kukmin_rent_per_sqm_rank' and relnamespace='public'::regnamespace) then raise exception 'GUARD exists'; end if;
end $$;
create view public.kukmin_rent_per_sqm_rank with (security_invoker = true) as
with u as (
  select hu.announcement_id, a.title, a.announcement_date,
         coalesce(nullif(btrim(hu.building_name), ''), nullif(hu.address, ''), '주소 정보 없음') as complex_key,
         case split_part(btrim(hu.address), ' ', 1)
           when '경북' then '경상북도' when '경남' then '경상남도'
           when '충북' then '충청북도' when '충남' then '충청남도'
           else split_part(btrim(hu.address), ' ', 1) end as sido,
         split_part(btrim(hu.address), ' ', 2) as sigungu,
         hu.monthly_rent::numeric / hu.area_sqm as rent_per_sqm
  from public.housing_units hu
  join public.announcements a on a.announcement_id = hu.announcement_id
  join public.housing_type_map m
    on m.source_table = 'announcements' and m.source = a.source and m.housing_type = a.housing_type
  where m.std_type = '국민임대'
    and hu.area_sqm > 0 and hu.monthly_rent is not null
    and coalesce(btrim(hu.address), '') <> ''
),
un as (
  select u.*, regexp_replace(u.complex_key, '\s*\([^()]*\)\s*$', '') as complex_name,
         max(u.announcement_date) over (partition by u.sido, u.sigungu,
           regexp_replace(u.complex_key, '\s*\([^()]*\)\s*$', '')) as latest_date
  from u
),
cx as (
  select sido, sigungu, complex_name, min(rent_per_sqm) as rent_per_sqm
  from un where announcement_date is not distinct from latest_date
  group by 1, 2, 3
),
ranked as (
  select cx.*,
         count(*) over (partition by sido, sigungu) as area_complexes,
         rank() over (partition by sido, sigungu order by rent_per_sqm) as area_rank
  from cx
)
select distinct un.announcement_id, un.title, un.complex_key, r.complex_name, r.sido, r.sigungu,
       case when r.sigungu ~ '구$'
            then regexp_replace(r.sido, '(특별자치시|특별자치도|통합특별시|광역시|특별시|도)$', '') || ' ' || r.sigungu
            else r.sigungu end as area_label,
       round(r.rent_per_sqm, 1) as rent_per_sqm,
       r.area_rank::int as area_rank, r.area_complexes::int as area_complexes,
       (r.area_complexes >= 5 and r.area_rank * 3 <= r.area_complexes) as is_low
from ranked r
join un on un.sido = r.sido and un.sigungu = r.sigungu and un.complex_name = r.complex_name
;
comment on view public.kukmin_rent_per_sqm_rank is 'B62 ⑤ 국민임대 단지별 ㎡당 월임대료 순위 — 같은 시·군 국민임대 5곳 이상 · 하위 3분의 1이면 is_low (화면 「동네 가격 칩」)';
revoke all on public.kukmin_rent_per_sqm_rank from public, anon, authenticated;
grant select on public.kukmin_rent_per_sqm_rank to anon, authenticated;
DO $$ begin
  if (select count(*) from public.kukmin_rent_per_sqm_rank) = 0 then raise exception 'POST empty'; end if;
  if (select count(distinct (sido, sigungu, complex_name)) from public.kukmin_rent_per_sqm_rank where is_low) = 0 then raise exception 'POST no low'; end if;
  if exists (select 1 from public.kukmin_rent_per_sqm_rank where is_low and area_complexes < 5) then raise exception 'POST low under 5'; end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid='public.kukmin_rent_per_sqm_rank'::regclass) <> 'security_invoker=true' then raise exception 'POST invoker'; end if;
end $$;
commit;
