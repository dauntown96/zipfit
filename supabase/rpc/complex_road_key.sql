CREATE OR REPLACE FUNCTION public.complex_road_key(p_address text, p_sido text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 단지 키의 도로명 별칭(2026-11-11 · 우편함 「코드·운영 — 단지 키 DDL …」 5 · 조사 「단지 키 설계」 권장안).
  -- 「<시도> <도로명><번길> <건물번호>」 — 시도만 짧은 이름으로 맞추고 시군구 글자는 넣지 않는다(시도 없음 · 행정 재편 표기 차이에 흔들리지 않게).
  --   시도 = 주소 첫 토큰이 시도면 그것, 아니면 p_sido(housing_units.sido_nm · announcements.sido_nm). 둘 다 못 정하면 NULL.
  --   광주·전남은 「전남광주」 하나로 둔다(전남광주통합특별시 — 옛 표기 행과 새 표기 행이 같은 키가 되게).
  --   「광주시」 첫 토큰은 경기 광주시와 겹쳐 시도로 읽지 않는다(p_sido 로 정한다).
  -- 도로명 = 「…로」·「…길」(+ 「N번길」) 다음 칸의 건물번호(N 또는 N-N). 지번 주소(「…동 295-1」)는 도로명이 없어 NULL.
  -- 소급 채움 · 수집 · 불변식이 같은 함수를 쓴다. 2026-11-11 hu 9,812행 중 9,448행 키 · 서로 다른 키 2,893 · 같은 키 다른 시군구 0.
  with a as (select regexp_replace(btrim(coalesce(p_address, '')), '\s+', ' ', 'g') as s),
  n as (select a.s,
               case when x.t in ('서울특별시', '서울시', '서울') then '서울'
                    when x.t in ('부산광역시', '부산시', '부산') then '부산'
                    when x.t in ('대구광역시', '대구시', '대구') then '대구'
                    when x.t in ('인천광역시', '인천시', '인천') then '인천'
                    when x.t in ('광주광역시', '광주', '전라남도', '전남', '전남광주통합특별시', '전남광주') then '전남광주'
                    when x.t in ('대전광역시', '대전시', '대전') then '대전'
                    when x.t in ('울산광역시', '울산시', '울산') then '울산'
                    when x.t in ('세종특별자치시', '세종시', '세종') then '세종'
                    when x.t in ('경기도', '경기') then '경기'
                    when x.t in ('강원특별자치도', '강원도', '강원') then '강원'
                    when x.t in ('충청북도', '충북') then '충북'
                    when x.t in ('충청남도', '충남') then '충남'
                    when x.t in ('전북특별자치도', '전라북도', '전북') then '전북'
                    when x.t in ('경상북도', '경북') then '경북'
                    when x.t in ('경상남도', '경남') then '경남'
                    when x.t in ('제주특별자치도', '제주도', '제주') then '제주'
               end as sido, x.k
          from a cross join lateral (values (split_part(a.s, ' ', 1), 1), (btrim(coalesce(p_sido, '')), 2)) x(t, k)),
  sd as (select (select n.sido from n where n.sido is not null order by n.k limit 1) as sido),
  -- 🔵 2026-11-11(단지 키 2차 1) — 띄어 쓴 꼴(종전 규칙 · 그대로 먼저)이 안 맞을 때만 붙여 쓴 꼴(「주공길24」·「올림픽로79길36」)을 본다.
  --    붙여 쓴 꼴은 번호 뒤에 한글이 오면 받지 않는다(「을지로3가」 같은 동 이름을 번호로 읽지 않게). 종전 키는 한 행도 바뀌지 않는다(hu·공고·홍보물 주소 11,890 대조).
  rd as (select coalesce(regexp_match((select s from a), '([가-힣A-Za-z0-9]+(?:로|길))\s?((?:[0-9]+번?(?:길|로))?)\s([0-9]+(?:-[0-9]+)?)(?:[^0-9-]|$)'),
                        regexp_match((select s from a), '([가-힣A-Za-z0-9]+(?:로|길))((?:[0-9]+번?(?:길|로))?)([0-9]+(?:-[0-9]+)?)(?:[^0-9가-힣-]|$)')) as m)
  select case when rd.m is null or sd.sido is null then null
              else sd.sido || ' ' || rd.m[1] || rd.m[2] || ' ' || rd.m[3] end
    from sd, rd
$function$
