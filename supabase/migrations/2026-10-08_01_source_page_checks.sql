-- zipfit:function source_check_targets() acl={postgres=X/postgres,service_role=X/postgres} secdef=true
-- 3-B ③ 1단계 — 열린 원문 키 정기 대조(공급기관 공고 페이지 ↔ 카드 접수기간·상태) 기록 표 둘 + 대상 함수(2026-10-08 · 우편함 「코드 — 3-B ③ …」 2).
-- 🔴 기록만 한다 — announcements · apply_*_confirmed · status 를 쓰지 않는다. 사용자에게 보이는 값을 바꾸는 2단계는 별도 페이지.
-- 쓰는 쪽: Edge Function check-source-pages(service_role) 하나 · 읽는 쪽: health-ops(관리 API) · claude.ai 재검증.
-- 권한: RLS 켜고 정책 0 · anon·authenticated 권한 0(원칙 15). 화면은 이 표를 읽지 않는다.
-- 대상 함수 source_check_targets(): 열린 대표 카드(get_announcements_deduped · 접수마감 아님)마다 원문 키를 정한다 —
--   LH = zipfit_ops.original_lh_id(<대표 ID>)(Z-2 PR-A 한 정의 — 손으로 고르지 않는다 · NULL 이면 원문 행 없음 → 대상 아님) · SH = 대표 ID(SH_<seq>).
--   같은 게시물 링크(announcement_post_links)로 그 LH 행에 접힌 MYHOME 행은 따로 대조하지 않고, 공고문별 apply_end 를 notice_ends 로 함께 낸다.
--   SECURITY DEFINER — zipfit_ops 함수를 부르므로(service_role 은 zipfit_ops 권한이 없다). 실행은 service_role 만.
-- 되돌리기: cron 잡 zipfit-check-source-pages 가 있으면 먼저 unschedule → drop function public.source_check_targets();
--   drop table public.source_page_checks; drop table public.source_page_check_runs;
DO $$ begin
  if to_regclass('public.source_page_checks') is not null then raise exception 'GUARD checks exists'; end if;
  if to_regclass('public.source_page_check_runs') is not null then raise exception 'GUARD runs exists'; end if;
end $$;

create table public.source_page_check_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  mode         text not null default 'collect',
  targets      integer,
  checked      integer,
  failed       integer,
  closed_mismatch integer,
  end_diff     integer,
  stopped_by   text,
  error        text
);
comment on table public.source_page_check_runs is
  '원문 키 정기 대조 실행 기록(check-source-pages · 2026-10-08) — 함수가 시작할 때 한 행을 넣고 끝날 때 채운다. 지우지 않는다(net._http_response 는 몇 시간 안에 비워진다 — #372 교훈)';
comment on column public.source_page_check_runs.targets is '열린 원문 키 중 최근 6시간 안에 대조하지 않은 수(이번 실행의 일감)';
comment on column public.source_page_check_runs.stopped_by is 'budget(시간 예산) · page_errors(연속 페이지 오류) · NULL(끝까지)';
alter table public.source_page_check_runs enable row level security;
revoke all on table public.source_page_check_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.source_page_check_runs to service_role;

create table public.source_page_checks (
  id                bigint generated always as identity primary key,
  run_id            bigint not null references public.source_page_check_runs(id),
  checked_at        timestamptz not null default now(),
  source            text not null check (source in ('LH', 'SH')),
  source_key        text not null,
  card_id           text not null,
  page_url          text,
  http_status       integer,
  page_form         text,
  page_status       text,
  page_apply_start  date,
  page_apply_end    date,
  page_schedules    jsonb,
  card_status       text,
  card_apply_start  date,
  card_apply_end    date,
  card_apply_end_confirmed date,
  card_notice_ends  jsonb,
  card_soonest_open_end date,
  closed_mismatch   boolean,
  end_diff          boolean,
  start_diff        boolean,
  followups         jsonb,
  error             text
);
create index source_page_checks_key_at on public.source_page_checks (source_key, checked_at desc);
comment on table public.source_page_checks is
  '원문 키 정기 대조 표(check-source-pages · 2026-10-08) — 공급기관 공고 페이지의 공고상태·접수기간(구조화된 값만) ↔ 열린 카드 값. 기록만 — 카드 값은 바꾸지 않는다';
comment on column public.source_page_checks.source_key is 'LH = 원문 행 panId(zipfit_ops.original_lh_id) · SH = SH_<i-sh 게시글 seq>';
comment on column public.source_page_checks.card_id is '열린 대표 카드 announcement_id(get_announcements_deduped)';
comment on column public.source_page_checks.page_form is 'LH: scd(임대 단지 탭 splScdlist) · buy(매입 if(true) 공급일정) · table(분양계통 공급일정 표) · NULL(일정 없음) / SH: list(공고 목록 모집상태 — 접수기간은 상세 본문 글자뿐이라 읽지 않는다)';
comment on column public.source_page_checks.page_status is 'LH 게시글 정보 「공고상태」(공고중 · 접수중 · 접수마감 …) · SH 공고 목록 「모집상태」(모집중 · 마감 …) — 화면 글자 그대로';
comment on column public.source_page_checks.page_apply_start is '페이지 일정 중 가장 이른 접수 시작(단지 여럿이면 단지 중 가장 이른)';
comment on column public.source_page_checks.page_apply_end is '페이지 일정 중 가장 늦은 접수 끝(단지 여럿이면 단지 중 가장 늦은) — 카드 apply_end 와 같은 뜻(공고 전체의 마지막 접수일)';
comment on column public.source_page_checks.page_schedules is '[{unit, start, end}] — 단지(ltrUntNo)·구분별 원값(날짜만)';
comment on column public.source_page_checks.card_notice_ends is '같은 게시물 링크로 이 LH 행에 접힌 MYHOME 행의 공고문별 apply_end [{id, apply_end}]';
comment on column public.source_page_checks.card_soonest_open_end is '대표 행과 링크된 공고문 중 아직 안 닫힌(≥ 오늘 KST) 가장 이른 apply_end — 화면 zfSoonestOpenEnd 와 같은 규칙';
comment on column public.source_page_checks.closed_mismatch is '열린 카드인데 페이지가 접수마감(LH 공고상태 「접수마감」 · SH 모집상태에 「마감」·「종료」)';
comment on column public.source_page_checks.end_diff is 'page_apply_end 가 있고 card_apply_end 와 다름';
comment on column public.source_page_checks.start_diff is 'page_apply_start 가 있고 card_apply_start 와 다름';
comment on column public.source_page_checks.followups is 'SH 후속 공지 후보 [{seq, title, date, score}] — 같은 공고를 제목으로 가리키는 게시판 글(접수결과·접수마감·2순위·후순위 …) · 기록만';
alter table public.source_page_checks enable row level security;
revoke all on table public.source_page_checks from public, anon, authenticated;
grant select, insert, update, delete on table public.source_page_checks to service_role;

CREATE OR REPLACE FUNCTION public.source_check_targets()
 RETURNS TABLE(source text, source_key text, card_id text, page_url text, title text, announcement_date date, card_status text, card_apply_start date, card_apply_end date, card_apply_end_confirmed date, card_notice_ends jsonb, card_soonest_open_end date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 🔴 2026-10-08(3-B ③ 1단계) — 열린 원문 키 정기 대조(check-source-pages)의 대상. 기록만 하는 함수가 부른다 — 화면은 부르지 않는다.
  --   열린 대표 카드 = get_announcements_deduped 중 접수마감 아님. 원문 키: LH = zipfit_ops.original_lh_id(대표 ID)(Z-2 한 정의 — NULL 이면 대상 아님)
  --   · SH = 대표 ID. 같은 원문 키에 대표 카드가 둘이면 ID 가 작은 것 하나.
  WITH d AS (
    SELECT g.* FROM public.get_announcements_deduped(NULL, NULL, NULL) g WHERE g.status <> '접수마감'
  ),
  k AS (
    SELECT CASE WHEN d.source = 'SH' THEN 'SH' ELSE 'LH' END AS src,
           CASE WHEN d.source = 'SH' THEN d.announcement_id ELSE zipfit_ops.original_lh_id(d.announcement_id) END AS skey,
           d.announcement_id AS cid, d.status AS cst, d.apply_start AS cas, d.apply_end AS cae, d.apply_end_confirmed AS caec
    FROM d
    WHERE d.source = 'SH' OR d.source IN ('LH', 'MYHOME')
  ),
  u AS (
    SELECT DISTINCT ON (k.skey) k.* FROM k WHERE k.skey IS NOT NULL ORDER BY k.skey, k.cid
  )
  SELECT u.src, u.skey, u.cid, a.url, a.title, a.announcement_date, u.cst, u.cas, u.cae, u.caec,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.announcement_id, 'apply_end', m.apply_end) ORDER BY m.apply_end, m.announcement_id), '[]'::jsonb)
       FROM public.announcement_post_links l JOIN public.announcements m ON m.announcement_id = l.linked_announcement_id
      WHERE l.lh_announcement_id = u.skey),
    (SELECT min(e.d) FROM (
        SELECT u.cae AS d
        UNION ALL
        SELECT m.apply_end FROM public.announcement_post_links l JOIN public.announcements m ON m.announcement_id = l.linked_announcement_id
         WHERE l.lh_announcement_id = u.skey) e
      WHERE e.d >= (now() AT TIME ZONE 'Asia/Seoul')::date)
  FROM u JOIN public.announcements a ON a.announcement_id = u.skey
$function$
;
revoke all on function public.source_check_targets() from public, anon, authenticated;
grant execute on function public.source_check_targets() to service_role;

DO $$ declare n int; begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema='public' and table_name in ('source_page_checks','source_page_check_runs')
     and grantee in ('anon','authenticated','PUBLIC');
  if n <> 0 then raise exception 'GUARD grants to anon/authenticated %', n; end if;
end $$;
