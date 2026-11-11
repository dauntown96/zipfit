-- zipfit:function complex_road_key(text,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 단지 키 DDL(2026-11-11 · 우편함 「코드·운영 — 단지 키 DDL: complexes · complex_aliases · announcement_complexes · housing_units.complex_id + 불변식」 ·
--   다운님 승인 2026-11-11 「단지 키는 네 권장대로」 · 조사 「단지 키 설계」 권장안 · claude.ai 검증 통과).
-- 이 파일은 구조만 깐다 — 데이터 채움 0(소급은 다음 회차 운영 데이터 쓰기 · 새 공고는 수집이 확정분 · 분석이 hu 행).
-- ① complexes — 대리키 id 하나. 원문 값(LH 단지 코드 · 주소 · 이름)은 키가 아니라 별칭이다(원문이 이름을 바꾸거나 행정구역이 재편돼도 별칭 한 줄을 더할 뿐).
--    단위: 건설형 = 단지(build) · 매입 = 건물(buy) · 그 밖 = other · 전세임대는 단지 개념이 없어 행을 만들지 않는다.
-- ② complex_aliases — 합치기 근거. 유형별 유일(alias_type, alias_value) — 🔴 name 은 유일을 걸지 않는다(후보 표시용 · 같은 시 동명 다른 단지 10쌍).
-- ③ announcement_complexes — 공고 ↔ 단지 다대다(세대 행이 없는 공고도 precise_address 로 붙는다). announcement_id 는 단독 유일이 아니라 FK 를 걸지 않는다(announcements 유일 = (source, announcement_id)).
-- ④ housing_units.complex_id — 빈칸 허용 FK(on delete set null). 🔴 lock_timeout 5초 — 분석 쓰기가 표를 잡고 있으면 기다리지 않고 실패한다(멈춤 조건).
-- ⑤ complex_road_key(주소, 시도) — 도로명 별칭의 정의 한 곳.
-- 권한: 세 표 모두 공개 읽기(anon·authenticated SELECT + RLS 「read」 정책 — 화면이 나중에 읽는다) · 쓰기는 service_role 만(CLAUDE.md 원칙 15 · announcement_schedule 꼴).
-- 되돌리기: alter table public.housing_units drop column complex_id; drop table public.announcement_complexes, public.complex_aliases, public.complexes; drop function public.complex_road_key(text, text);

set local lock_timeout = '5s';

create table public.complexes (
  id            bigint generated always as identity primary key,
  kind          text not null constraint complexes_kind_check check (kind in ('build', 'buy', 'other')),
  supplier      text,
  sido_nm       text,
  sigungu_nm    text,
  road_key      text,
  display_name  text,
  lh_sbd_lgo_no text,
  lat           double precision,
  lng           double precision,
  created_at    timestamptz not null default now()
);
create index complexes_road_key_idx on public.complexes (road_key) where road_key is not null;
create unique index complexes_lh_sbd_lgo_no_uniq on public.complexes (lh_sbd_lgo_no) where lh_sbd_lgo_no is not null;
comment on table public.complexes is '단지(건설형) · 건물(매입) 키 — 대리키 id 하나 · 원문 값은 complex_aliases(2026-11-11 · 단지 키 DDL)';
comment on column public.complexes.kind is 'build = 건설형 단지 · buy = 매입 건물 · other = 그 밖(SH·지방공사 등) — 전세임대는 행을 만들지 않는다';
comment on column public.complexes.sigungu_nm is '표시용 — 키에 넣지 않는다(시군구 표기 차이·행정 재편에 흔들리지 않게)';
comment on column public.complexes.road_key is 'complex_road_key(주소, 시도) 값 — 「<시도> <도로명> <건물번호>」 · 지번이면 NULL';
comment on column public.complexes.lh_sbd_lgo_no is 'LH 단지 코드(C/D + 5자리 — lh_cutoff_scores · announcement_complex_images 와 같은 꼴) · 별칭 lh_code 와 같은 값';
comment on column public.complexes.lat is '지도 2판 때 채운다(지금 NULL)';

create table public.complex_aliases (
  id          bigint generated always as identity primary key,
  complex_id  bigint not null references public.complexes(id) on delete cascade,
  alias_type  text not null constraint complex_aliases_type_check check (alias_type in ('lh_code', 'lh_bldg', 'road', 'name', 'rhs')),
  alias_value text not null,
  source      text,
  evidence    text,
  added_by    text,
  confirmed   text not null default 'auto' constraint complex_aliases_confirmed_check check (confirmed in ('auto', 'human')),
  created_at  timestamptz not null default now()
);
create unique index complex_aliases_type_value_uniq on public.complex_aliases (alias_type, alias_value) where alias_type <> 'name';
create index complex_aliases_complex_idx on public.complex_aliases (complex_id);
comment on table public.complex_aliases is '단지 별칭 — 합치기 근거(lh_code LH 단지 코드 · lh_bldg 매입 건물코드 · road complex_road_key · rhs 임대주택 통계 · name 후보 표시용) · 유형별 유일(name 제외)';
comment on column public.complex_aliases.confirmed is 'auto = 자동 확정(코드 · 도로명) · human = 사람 판정';

create table public.announcement_complexes (
  announcement_id text not null,
  complex_id      bigint not null references public.complexes(id) on delete cascade,
  source          text,
  created_at      timestamptz not null default now(),
  primary key (announcement_id, complex_id)
);
create index announcement_complexes_complex_idx on public.announcement_complexes (complex_id);
comment on table public.announcement_complexes is '공고 ↔ 단지 다대다(같은 단지 다른 회차 · 세대 행 없는 공고도) — announcement_id 는 FK 없음(announcements 유일 = (source, announcement_id))';

alter table public.housing_units add column complex_id bigint references public.complexes(id) on delete set null;
create index housing_units_complex_idx on public.housing_units (complex_id) where complex_id is not null;
comment on column public.housing_units.complex_id is '단지·건물 키(complexes.id) — 소급·분석이 채운다 · 전세임대·못 정한 행은 NULL';

alter table public.complexes enable row level security;
alter table public.complex_aliases enable row level security;
alter table public.announcement_complexes enable row level security;
create policy "read complexes" on public.complexes for select to anon, authenticated using (true);
create policy "read complex_aliases" on public.complex_aliases for select to anon, authenticated using (true);
create policy "read announcement_complexes" on public.announcement_complexes for select to anon, authenticated using (true);
revoke all on table public.complexes, public.complex_aliases, public.announcement_complexes from public, anon, authenticated;
grant select on table public.complexes, public.complex_aliases, public.announcement_complexes to anon, authenticated;
grant select, insert, update, delete on table public.complexes, public.complex_aliases, public.announcement_complexes to service_role;

create function public.complex_road_key(p_address text, p_sido text default null)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'public', 'pg_temp'
as $function$
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
  rd as (select regexp_match((select s from a), '([가-힣A-Za-z0-9]+(?:로|길))\s?((?:[0-9]+번?(?:길|로))?)\s([0-9]+(?:-[0-9]+)?)(?:[^0-9-]|$)') as m)
  select case when rd.m is null or sd.sido is null then null
              else sd.sido || ' ' || rd.m[1] || rd.m[2] || ' ' || rd.m[3] end
    from sd, rd
$function$;
revoke execute on function public.complex_road_key(text, text) from public, anon, authenticated;
grant execute on function public.complex_road_key(text, text) to service_role;
