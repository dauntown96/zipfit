CREATE OR REPLACE FUNCTION zipfit_ops.metric_coverage_14d()
 RETURNS TABLE(denominator bigint, numerator bigint, with_attachments bigint, not_done text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 가볍게 …」 1) — dedup 키는 announcements.dedup_key(저장 칸 = announcement_dedup_key(title)) 를 읽는다(행마다 함수 호출 없음 · 결과 같음).
-- 🔵 2026-10-16(우편함 「코드 — 관리자 페이지 (가) 첫 판 …」 2 ⓐ) — 14일 접수분 커버율 한 정의.
--   supabase/metrics/analysis_rate.sql 둘째 문장을 여기로 옮겼다 — 그 파일과 상태판(ops_status_board)이 이 함수 하나를 부른다(산식 사본 없음).
--   열린 대표(get_announcements_deduped · apply_end ≥ 오늘 ∧ apply_start ≤ 오늘+14) 중 같은 묶음 키·같은 회차(같은 마감 · 링크)에 완료 계열 분석이 있는 것.
--   묶음 키(link_map)는 get_announcements_deduped · get_announcement_group_ids · analysis_dispatch_tick 과 같다 — 한쪽을 바꾸면 함께 바꾼다.
with link_map as (
  select distinct on (l.linked_announcement_id)
    l.linked_announcement_id as aid, lh.dedup_key as lh_key
  from public.announcement_post_links l
  join public.announcements lh on lh.announcement_id = l.lh_announcement_id
  where lh.title is not null and lh.hidden_from_listing is not true
  order by l.linked_announcement_id, l.lh_announcement_id
),
keyed as materialized (
  select a.announcement_id, a.apply_end, a.attachment_urls,
         coalesce(lm.lh_key, a.dedup_key) as k,
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
  where d.apply_end >= current_date and d.apply_start <= current_date + 14
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
select count(*) as denominator, count(*) filter (where done) as numerator,
       count(*) filter (where attachments > 0) as with_attachments,
       string_agg(announcement_id, ',' order by announcement_id) filter (where not done) as not_done
from judged;
$function$
