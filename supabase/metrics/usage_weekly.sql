-- 꼭집 이용 기록 주간 기준선(2026-10-20 신설 — 우편함 「코드·운영 — 홍보 관문 ⓑ 표본 정확도 1차 실측 + 첫 주 지표 SQL 파일」 4 ·
--   런칭 실행서 6절 · 초안은 우편함 「코드·운영 — 런칭 당일 실행서 사실 확인」 회신 6).
-- 읽기 전용. 마이그레이션이 아니다 — 여기를 고쳐도 DB 는 안 바뀐다(analysis_rate.sql · supabase/invariants/ 와 같은 규약).
-- 🔴 개수만 돌려준다(CLAUDE.md 원칙 36) — 세션 id · 회원 id · 검색어 · 화면 props 값을 내보내지 않는다.
-- 운영·시험 세션은 **세션 단위로** 뺀다 — 그 세션 안에 다음 중 하나라도 있으면 그 세션의 모든 행을 뺀다:
--   ① props 에 ops 키가 있다(값 무관 — '1' = ?ops=1 로 연 운영 기기(index.html zfOpsOn) · 'auto' = 자동 브라우저 표지)
--   ② 운영자 계정(zipfit_ops.admins) 행이 있다.
-- 창 = [창 시작, 창 끝). 기본은 지금부터 7일 전 ~ 지금. 런칭 첫 주는 아래 win 의 두 시각을 바꿔 돌린다
--   (예: '2026-10-26 20:58+09'::timestamptz, '2026-11-02 20:58+09'::timestamptz).
with win as (
  select now() - interval '7 days' as t0,   -- 창 시작(포함)
         now()                     as t1    -- 창 끝(제외)
),
ev as (
  select u.session_id, u.user_id, u.event, u.occurred_at, u.props
    from public.usage_events u, win
   where u.occurred_at >= win.t0 and u.occurred_at < win.t1
),
ops_sessions as (
  select distinct e.session_id from ev e
   where e.props ? 'ops'
      or e.user_id in (select a.user_id from zipfit_ops.admins a)
),
r as (select * from ev where session_id not in (select session_id from ops_sessions))
select json_build_object(
  'from_kst', (select to_char(t0 at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') from win),
  'to_kst', (select to_char(t1 at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') from win),
  'sessions', (select count(distinct session_id) from r),
  'sessions_excluded_ops', (select count(*) from ops_sessions),
  'rows_excluded_ops', (select count(*) from ev) - (select count(*) from r),
  'page_view', (select count(*) from r where event = 'page_view'),
  'notice_open', (select count(*) from r where event = 'notice_open'),
  'search', (select count(*) from r where event = 'search'),
  'sessions_with_notice_open', (select count(distinct session_id) from r where event = 'notice_open'),
  'sessions_logged_in', (select count(distinct session_id) from r where user_id is not null),
  'sessions_by_day_kst', (select json_object_agg(d, n order by d) from (
      select to_char(occurred_at at time zone 'Asia/Seoul', 'MM-DD') d, count(distinct session_id) n from r group by 1) x)
);
