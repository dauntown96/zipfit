-- zipfit:anon select count(*) from public.complex_geo
-- 단지 도로명·좌표 표(2026-11-16 · 우편함 「코드·운영 — 단지 도로명·좌표 표((B)층 · juso 1차) + 소급 16주소 · …」 1 ·
--   우편함 「코드·운영 — juso 두 키로 …」 회신 ⑦ 꼴 + claude.ai 판정 · 표본 docs/jibun-to-road.md).
-- 이 파일은 구조만 깐다 — 데이터 채움 0(소급은 같은 회차 운영 데이터 쓰기).
-- 원문 정의 (B)층(L0 원칙 3): 공고 원문이 아니라 공식 공공 API(juso · 건축HUB · 마이홈 6a)에서 받은 값 — 출처 URL · 확인 시각 · 출처 종류(source)를 행마다 남긴다.
--   🔴 세대 행 housing_units.address(원문)는 건드리지 않는다 · 이 표는 원문 주소 문자열(matched_from) → 도로명·좌표의 대응이다.
-- 한 행 = 원 주소 문자열 하나(matched_from 유일). complex_id 는 그 주소의 단지가 있을 때만(단지 하나에 한 행 · 빈칸 허용) —
--   2026-11-16 실측: 지번 꼴 세대 행 336행은 모두 complex_id 가 비어 있고(도로명 키가 없어 단지 잇기가 묶지 못함), juso 도로명이 기존 단지 road_key 와
--   맞는 것은 16주소 중 3이라 「단지 하나 = 한 행」만으로는 담을 수 없다. 단지가 나중에 생기면 complex_id 를 채운다.
-- source: juso(도로명주소 검색 · 좌표제공) · bldhub(건축HUB 표제부 newPlatPlc) · myhome_6a(마이홈 단지정보 rnAdres) ·
--   pending(공식 API 모두 결과 0 — 짓는 중 단지 등 부여 예정 도로명 없음 · 도로명·좌표 칸 비움 · 사실 기록).
-- 좌표: ent_x/ent_y = juso 좌표제공 원값(GRS80 UTM-K · EPSG:5179) · lat/lng = 그 값을 WGS84 로 바꾼 값.
-- 권한: 공개 읽기(anon·authenticated SELECT + RLS 「read」 정책 — 화면이 나중에 읽는다) · 쓰기는 service_role 만(CLAUDE.md 원칙 15 · complexes 꼴).
-- 되돌리기: drop table public.complex_geo;
set local lock_timeout = '5s';

create table public.complex_geo (
  id            bigint generated always as identity primary key,
  matched_from  text not null,
  complex_id    bigint references public.complexes(id) on delete set null,
  source        text not null constraint complex_geo_source_check check (source in ('juso', 'bldhub', 'myhome_6a', 'pending')),
  road_address  text,
  adm_cd        text,
  rn_mgt_sn     text,
  bd_mgt_sn     text,
  bd_nm         text,
  udrt_yn       text,
  buld_mnnm     integer,
  buld_slno     integer,
  ent_x         double precision,
  ent_y         double precision,
  lat           double precision,
  lng           double precision,
  source_url    text,
  note          text,
  checked_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint complex_geo_pending_empty check (source <> 'pending' or (road_address is null and ent_x is null and lat is null)),
  constraint complex_geo_road_needed check (source = 'pending' or road_address is not null)
);
create unique index complex_geo_matched_from_uniq on public.complex_geo (matched_from);
create unique index complex_geo_complex_id_uniq on public.complex_geo (complex_id) where complex_id is not null;
comment on table public.complex_geo is
  '단지 도로명·좌표((B)층 — 공식 공공 API 값 · 2026-11-16) · 한 행 = 원 주소 문자열(matched_from = housing_units.address 그대로) · complex_id 는 단지가 있을 때만 · source = juso | bldhub | myhome_6a | pending(공식 API 결과 0 — 부여 예정 도로명 없음) · ent_x/ent_y = UTM-K(EPSG:5179) 원값 · lat/lng = WGS84 · 쓰기는 service_role 만';
comment on column public.complex_geo.matched_from is '원 주소 문자열(housing_units.address 그대로 — 원문 · 이 표는 원문을 고치지 않는다)';
comment on column public.complex_geo.source_url is '부른 공식 API 주소(호스트·경로 · 키 없음)';

alter table public.complex_geo enable row level security;
create policy "read complex_geo" on public.complex_geo for select to anon, authenticated using (true);
revoke all on table public.complex_geo from public, anon, authenticated;
grant select on table public.complex_geo to anon, authenticated;
grant select, insert, update, delete on table public.complex_geo to service_role;
