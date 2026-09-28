-- B59 (2026-09-28) — 공사(supply_org) 단위 접수기간 신뢰 표
-- 🔴 이 파일은 기록이다(배포 경로가 아니다 — supabase/rpc/README.md). 관리 API로 한 트랜잭션에서 실행했다.
--
-- 왜: MYHOME 은 접수 시작·끝을 따로 주는 필드가 없다. 경북개발공사는 게시판 본문과 대조한 10공고가 전부 틀렸고
--     틀린 모양이 제각각이라 날짜 모양 규칙 하나로 못 잡는다(B56). 그래서 탐지 축을 「공사 단위 신뢰」로 둔다.
-- 읽는 쪽: get_announcements_deduped() 하나(SECURITY INVOKER) — anon 이 부른다.
--   🔴 그래서 anon·authenticated SELECT 정책이 있어야 한다. 없으면 RLS 가 0행을 돌려 판정이 조용히 전부 false 가 된다
--   (CLAUDE.md 원칙 15 「RLS 를 켜기 전 RPC 의 SECURITY 속성을 확인」). 내용은 공사 이름과 대조 수라 공개해도 된다.
-- 쓰기: service_role(관리 API)만. 정책 없음.
-- 「대조하지 않은 공사는 행 없음」 = 신호(apply_end = winner_announce_date)로만 판정한다.

create table public.supply_org_period_trust (
  supply_org       text        primary key,
  period_trust     text        not null check (period_trust in ('ok','check')),
  checked_posts    integer     not null check (checked_posts >= 1),
  wrong_posts      integer     not null check (wrong_posts >= 0 and wrong_posts <= checked_posts),
  last_checked_on  date        not null,
  note             text,
  recorded_by      text        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.supply_org_period_trust is
  'MYHOME 공급기관별 접수기간(apply_start·apply_end) 신뢰. 게시판 본문 대조 결과. check = 틀림이 관측됨 → RPC 「접수기간 확인 필요」 판정 재료. 행 없음 = 대조 안 함.';
alter table public.supply_org_period_trust enable row level security;
create policy "anon can read supply_org_period_trust" on public.supply_org_period_trust
  for select to anon, authenticated using (true);

-- 초기 값 — 경북은 B56 대조(영주 3 · 칠곡 2 · 고령 3 · 구미경산 1 · 포항 1 = 게시물 10, 전부 다름),
-- 나머지는 B59 항목 1(공사마다 최근 공고 1건 · 게시판 본문 pg_net) 중 「같음」 5곳. 「대조 불가」 9곳은 행을 만들지 않는다.
insert into public.supply_org_period_trust(supply_org, period_trust, checked_posts, wrong_posts, last_checked_on, note, recorded_by) values
 ('경상북도개발공사','check',10,10,'2026-09-28','B56 게시판 본문 대조 — 영주 3·칠곡 2·고령 3·구미경산 1·포항 1 전부 다름(시작=공고일 · 끝=발표일 · 짧은 기간을 긴 기간으로 등 제각각)','B59'),
 ('강원개발공사','ok',1,0,'2026-09-28','21003_1 춘천 산수빌 — 본문 「접수기간 : 2026. 8. 31. (월) ~ 2026.9.10.(목)」 = DB 08-31~09-10','B59'),
 ('군산시','ok',1,0,'2026-09-28','20713_1 군산나운4 — 본문 「신청기간 : 2026. 7. 21.( 화 ) 10:00 ~ 16:00」 = DB 07-21~07-21','B59'),
 ('부산도시공사','ok',1,0,'2026-09-28','21082 장기미임대 매입 — 본문 「신청기간 : 2026. 9. 7.(월) 10시 ~ 9. 9.(수) 17시」 = DB 09-07~09-09','B59'),
 ('세종특별자치시시설관리공단','ok',1,0,'2026-09-28','21075_1 도램마을7·8단지 — 본문 「신청접수 : 2026.9.7.(월) ~ 10.(목)」 = DB 09-07~09-10','B59'),
 ('제주특별자치도개발공사','ok',1,0,'2026-09-28','21134 다자녀 매입 — 본문 「신청 기간: 2026년 9월 10일(목) ~ 9월 11일(금)」 = DB 09-10~09-11','B59');

-- 되돌리기:
--   drop table public.supply_org_period_trust;   -- ⚠️ 먼저 RPC 에서 LEFT JOIN 을 걷어야 한다(아니면 RPC 가 깨진다)
--   ⚠️ 표 삭제는 zipfit-backup schema_guard 가 삭제로 읽는다 — 그날 백업을 allow_removed 로 승인.
