-- ZipFit 분석률 (⑨ 5-2 「분석률 산식」의 SQL · 2026-10-01 신설 — 우편함 「코드 — … 분석률 셈 …」 6)
-- 읽기 전용. 마이그레이션이 아니다 — 여기를 고쳐도 DB 는 안 바뀐다(supabase/invariants/ 와 같은 규약).
-- 🔴 묶음 = 제목 키 ∪ 같은 게시물 링크 표 — 링크 표에 있는 MYHOME 행은 LH 행의 제목 키를 쓴다
--   (get_announcements_deduped · get_announcement_group_ids · get_reanalysis_queue 의 link_map 과 같은 규칙 — 함께 바꾼다).
--   🔴 분석 발송기 analysis_dispatch_tick 의 후보(대기열)가 이 분모 ∧ 미분석과 같은 규칙이다(2026-10-01) — 여기를 바꾸면 그 함수도 바꾼다.
--   ⚠️ 예외 하나(2026-10-06 · Z-1 PR-A A1): 발송기의 정정본 후보(rcand — 원공고 분석이 있는 묶음의 정정본 · 키 꼬리 「 #정정 …」)는
--      여기 거울로 넣지 않는다. 그 묶음은 원공고 분석으로 이미 분자에 들어 있어, 넣으면 분석률이 정정 때마다 흔들린다(claude.ai 수긍 2026-10-06).
--   ⚠️ 예외 둘(2026-10-12 · 우편함 「부산 첨부·SH 대기열」 2): 발송기는 접수기간 없는 열린 SH 대표(apply_end NULL ∧ SH 목록 모집상태 「모집중」)도
--      가상 키(「 #접수기간 없음 공고일」 · 9999-12-31)로 후보에 올린다. 여기 분모는 apply_end ≥ 오늘+3 이라 그 공고는 들지 않는다(가상 날짜를 분모에 쓰지 않는다).
-- 분모 = get_announcements_deduped() 대표 ∧ 묶음 안 attachment_urls 합 > 0 ∧ apply_end ≥ 오늘+3 ∧ 국면(접수 전 apply_start > 오늘 · 접수 중 apply_start ≤ 오늘).
-- 분자 = 그 묶음 중 대표와 같은 회차 구성원에 완료 계열 announcement_analysis 가 있는 대표.
--   같은 회차 = apply_end 가 대표와 같다 **또는** 링크 표로 붙은 행이다(같은 게시물 = 같은 날짜 ∧ panId — 공고문마다 마감이 달라도 한 회차다).
--   대표 ID 자신만 세지 않는다(규약 29 · 정정 전 ID). 한 게시물은 대표 한 줄이라 붙은 공고문이 여럿 완료여도 한 번만 센다.
-- 오늘 = current_date(DB 시간대 UTC) — 종전 측정과 같은 축이다.
with link_map as (
  select distinct on (l.linked_announcement_id)
    l.linked_announcement_id as aid, announcement_dedup_key(lh.title) as lh_key
  from public.announcement_post_links l
  join public.announcements lh on lh.announcement_id = l.lh_announcement_id
  where lh.title is not null and lh.hidden_from_listing is not true
  order by l.linked_announcement_id, l.lh_announcement_id
),
keyed as materialized (
  select a.announcement_id, a.apply_end, a.attachment_urls,
         coalesce(lm.lh_key, announcement_dedup_key(a.title)) as k,
         (lm.aid is not null) as linked
  from public.announcements a
  left join link_map lm on lm.aid = a.announcement_id
  where a.title is not null and a.hidden_from_listing is not true
),
reps as (
  select d.announcement_id, d.apply_start, d.apply_end, k.k,
         case when d.apply_start > current_date then '접수 전' else '접수 중' end as phase
  from get_announcements_deduped(null, null, null) d
  join keyed k on k.announcement_id = d.announcement_id
  where d.apply_end >= current_date + 3
),
judged as (
  select r.*,
    (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0)
       from keyed g where g.k = r.k and jsonb_typeof(g.attachment_urls) = 'array') as attachments,
    exists (select 1 from keyed g
              join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
             where g.k = r.k
               and (g.apply_end = r.apply_end or g.linked)
               and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')) as done
  from reps r
)
select phase, count(*) as denominator, count(*) filter (where done) as numerator,
       string_agg(announcement_id, ',' order by announcement_id) filter (where not done) as not_done
from judged
where attachments > 0
group by phase
order by phase desc;


-- ── 14일 갈래 — 「향후 14일 접수분 커버율」(2026-10-11 · 우편함 「코드 — 3-B ①」 · 💡 「런칭 판단용 안정 지표」 정의안)
-- 위 정본과 다른 점 둘: ① 분모 = 대표 ∧ apply_end ≥ 오늘 ∧ apply_start ≤ 오늘+14(지금 접수 중이거나 14일 안에 열리는 공고)
--   ② 첨부 유무로 거르지 않는다 — 정본은 「분석할 수 있는 것」 중 비율, 이것은 「사용자가 곧 신청할 것」 중 비율이다.
--   분자·묶음 규칙(link_map · 같은 회차 구성원 완료 계열)은 위와 같다. with_attachments = 분모 중 묶음에 첨부가 있는 수(빈칸이 분석 쪽인지 첨부 경로 쪽인지 가른다).
--   apply_start 가 NULL 인 대표는 분모에 들지 않는다(접수 시작을 모르면 「14일 안」을 말할 수 없다).
--   🔵 2026-10-16(우편함 「코드 — 관리자 페이지 (가) 첫 판 …」 2 ⓐ) — 이 문장은 DB 함수 zipfit_ops.metric_coverage_14d() 한 곳으로 옮겼다
--   (관리자 상태판 ops_status_board 가 같은 함수를 부른다 — 산식 사본을 두지 않는다 · 정의 사본 supabase/rpc/zipfit_ops/metric_coverage_14d.sql).
select * from zipfit_ops.metric_coverage_14d();
