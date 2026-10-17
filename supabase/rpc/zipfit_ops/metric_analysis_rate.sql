CREATE OR REPLACE FUNCTION zipfit_ops.metric_analysis_rate()
 RETURNS TABLE(phase text, denominator bigint, numerator bigint, not_done text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 가볍게 …」 1) — announcements 행의 묶음 키는 title_dedup_key(저장 생성 칸 = announcement_dedup_key(title))를 읽는다(행마다 함수 호출 없음 · 결과 같음).
-- 🔵 2026-10-17(우편함 「코드·운영 — … 상태판 칸 …」 6) — 분석률 정본(⑨ 6장 · 루틴 분모) 한 정의.
--   supabase/metrics/analysis_rate.sql 첫 문장을 여기로 옮겼다 — 그 파일과 관리자 상태판(ops_status_board)이 이 함수 하나를 부른다(산식 사본 없음).
--   분모 = 대표 ∧ 묶음 첨부 > 0 ∧ apply_end ≥ 오늘+3 · 국면(접수 전 apply_start > 오늘 · 접수 중 그 밖) · 분자 = 같은 묶음 키·같은 회차(같은 마감 · 링크) 완료 계열 분석.
--   🔴 분석 발송기 analysis_dispatch_tick 의 후보가 이 분모 ∧ 미분석과 같은 규칙이다 — 한쪽을 바꾸면 함께 바꾼다(예외 둘은 analysis_rate.sql 머리).
--   옮기며 묶음별 첨부 합(att)·완료 회차(fin)를 대표 키에 한해 한 번씩 모으는 꼴로 바꿨다 — 결과는 종전 문장과 같고(2026-10-17 대조 같음) 1.95초 → 0.35초.
with link_map as (
  select distinct on (l.linked_announcement_id)
    l.linked_announcement_id as aid, lh.title_dedup_key as lh_key
  from public.announcement_post_links l
  join public.announcements lh on lh.announcement_id = l.lh_announcement_id
  where lh.title is not null and lh.hidden_from_listing is not true
  order by l.linked_announcement_id, l.lh_announcement_id
),
keyed as materialized (
  select a.announcement_id, a.apply_end, a.attachment_urls,
         coalesce(lm.lh_key, a.title_dedup_key) as k,
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
att as materialized (
  select g.k, sum(jsonb_array_length(g.attachment_urls)) as attachments
  from keyed g where jsonb_typeof(g.attachment_urls) = 'array' and g.k in (select r.k from reps r) group by g.k
),
fin as materialized (
  select distinct g.k, g.apply_end, g.linked
  from keyed g join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
  where aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)') and g.k in (select r.k from reps r)
),
judged as (
  select r.*, coalesce(a.attachments, 0) as attachments,
    exists (select 1 from fin f where f.k = r.k and (f.apply_end = r.apply_end or f.linked)) as done
  from reps r left join att a on a.k = r.k
)
select phase, count(*) as denominator, count(*) filter (where done) as numerator,
       string_agg(announcement_id, ',' order by announcement_id) filter (where not done) as not_done
from judged
where attachments > 0
group by phase
order by phase desc
$function$
