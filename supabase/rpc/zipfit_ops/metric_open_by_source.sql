CREATE OR REPLACE FUNCTION zipfit_ops.metric_open_by_source()
 RETURNS TABLE(source_group text, denominator bigint, numerator bigint, with_attachments bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 가볍게 …」 1) — announcements 행의 묶음 키는 title_dedup_key(저장 생성 칸 = announcement_dedup_key(title))를 읽는다(행마다 함수 호출 없음 · 결과 같음).
-- 🔵 2026-10-17(우편함 「코드·운영 — … 상태판 칸 …」 6 · 다운님 결정 2026-10-02 「분석률 둘을 나란히」) — 열린 카드 기준 분석률(출처별).
--   분모 = 목록에 보이는 열린 대표(get_announcements_deduped · status ≠ 접수마감) 전부(첨부·마감 거리로 거르지 않는다 — 「사용자가 보는 카드」 중 비율).
--   갈래 = 대표 출처: LH · MYHOME 단독(대표가 MYHOME = 같은 묶음에 LH 행이 없다) · SH · 그 밖은 출처 이름 그대로.
--   분자·묶음 규칙(link_map · 같은 회차 = 같은 마감(둘 다 비면 같음) ∨ 링크)은 metric_analysis_rate 와 같다. with_attachments = 분모 중 묶음에 첨부가 있는 수.
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
  select d.announcement_id, d.source, d.apply_end, k.k
  from get_announcements_deduped(null, null, null) d
  join keyed k on k.announcement_id = d.announcement_id
  where d.status <> '접수마감'
),
judged as (
  select r.*,
    (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0)
       from keyed g where g.k = r.k and jsonb_typeof(g.attachment_urls) = 'array') as attachments,
    exists (select 1 from keyed g
              join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
             where g.k = r.k
               and (g.apply_end is not distinct from r.apply_end or g.linked)
               and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')) as done
  from reps r
)
select case source when 'MYHOME' then 'MYHOME 단독' else source end as source_group,
       count(*) as denominator, count(*) filter (where done) as numerator,
       count(*) filter (where attachments > 0) as with_attachments
from judged
group by 1
order by 2 desc, 1;
$function$
