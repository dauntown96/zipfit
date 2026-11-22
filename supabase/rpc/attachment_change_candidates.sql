CREATE OR REPLACE FUNCTION public.attachment_change_candidates()
 RETURNS TABLE(announcement_id text, group_key text, apply_end date, seen_at timestamp with time zone, analyzed_at timestamp with time zone, reviewed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-21(우편함 「코드·운영 — 첫 묶음」 A (가)(나)) — 분석 뒤 첨부 변경이 있는 열린 공고.
--   조건 = get_reanalysis_queue() 둘째 갈래 「분석 뒤 첨부 변경」과 같다(완료 계열 분석 ∧ 첨부 이력 seen_at > greatest(analyzed_at, attachment_reviewed_at)
--   ∧ 이력의 옛 목록이 빈 첫 채움이 아님) + apply_end ≥ 오늘(KST) — 한쪽을 바꾸면 함께 바꾼다.
--   group_key = 묶음 키(링크 표 ∪ 제목 키 — analysis_dispatch_tick 의 keyed 와 같은 규칙) || ' #첨부 ' || 마지막 변경 시각(KST 분) — 다시 바뀌면 새 몫.
--   쓰는 곳: analysis_dispatch_tick 다섯째 후보(acand · 켜기 칸 attachment_change_enabled) · health-ops attachment_review_gap(대기열에 없는 수).
-- 🔵 2026-11-22(우편함 「코드·운영 — 넷째 묶음」 A) — 「새 fileid · 내용 같음」을 뺀다: 분석 때 목록(분석 뒤 첫 이력 행의 files)에 없던 지금 목록의 fileid 가
--   모두 attachment_content_sha 에 sha 가 있고, 각 sha 가 분석 때 목록의 어느 fileid sha 와 같으면 후보 아님. 새 fileid 의 sha 를 모르면 종전대로 후보.
--   🔵 get_reanalysis_queue() 둘째 갈래는 이 거름을 아직 안 갖는다(켜기 칸 참 전 reverify 개정 때 함께 — 넷째 묶음 회신 ②).
WITH link_map AS (
  SELECT DISTINCT ON (l.linked_announcement_id)
    l.linked_announcement_id AS aid, announcement_dedup_key(lh.title) AS lh_key
  FROM public.announcement_post_links l
  JOIN public.announcements lh ON lh.announcement_id = l.lh_announcement_id
  WHERE lh.title IS NOT NULL AND lh.hidden_from_listing IS NOT TRUE
  ORDER BY l.linked_announcement_id, l.lh_announcement_id
),
x AS (
  SELECT a.announcement_id, a.apply_end, aa.analyzed_at, aa.attachment_reviewed_at, a.attachment_urls,
         COALESCE(lm.lh_key, announcement_dedup_key(a.title)) AS k,
         (SELECT max(h.seen_at) FROM public.announcement_attachment_history h
           WHERE h.announcement_id = aa.announcement_id
             AND h.seen_at > greatest(aa.analyzed_at, aa.attachment_reviewed_at)
             AND h.files IS NOT NULL
             AND jsonb_typeof(h.files) = 'array'
             AND jsonb_array_length(h.files) > 0) AS seen_at,
         (SELECT h1.files FROM public.announcement_attachment_history h1
           WHERE h1.announcement_id = aa.announcement_id
             AND h1.seen_at > greatest(aa.analyzed_at, aa.attachment_reviewed_at)
             AND h1.files IS NOT NULL AND jsonb_typeof(h1.files) = 'array' AND jsonb_array_length(h1.files) > 0
           ORDER BY h1.seen_at, h1.id LIMIT 1) AS base_files
  FROM public.announcement_analysis aa
  JOIN public.announcements a ON a.announcement_id = aa.announcement_id
  LEFT JOIN link_map lm ON lm.aid = a.announcement_id
  WHERE aa.status IN ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')
    AND a.title IS NOT NULL AND a.hidden_from_listing IS NOT TRUE
    AND a.apply_end >= (now() AT TIME ZONE 'Asia/Seoul')::date
),
y AS (
  SELECT x.*,
         ARRAY(SELECT DISTINCT substring(e->>'url' FROM 'fileid=([0-9]+)') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.base_files) = 'array' THEN x.base_files ELSE '[]'::jsonb END) e
                WHERE substring(e->>'url' FROM 'fileid=([0-9]+)') IS NOT NULL) AS old_fids,
         ARRAY(SELECT DISTINCT substring(e->>'url' FROM 'fileid=([0-9]+)') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.attachment_urls) = 'array' THEN x.attachment_urls ELSE '[]'::jsonb END) e
                WHERE substring(e->>'url' FROM 'fileid=([0-9]+)') IS NOT NULL) AS cur_fids
  FROM x
  WHERE x.seen_at IS NOT NULL
),
z AS (
  SELECT y.*,
         (SELECT array_agg(f) FROM unnest(y.cur_fids) f WHERE NOT (f = ANY (y.old_fids))) AS new_fids
  FROM y
)
SELECT z.announcement_id,
       z.k || ' #첨부 ' || to_char(z.seen_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
       z.apply_end, z.seen_at, z.analyzed_at, z.attachment_reviewed_at
FROM z
WHERE NOT (
  cardinality(z.new_fids) > 0
  AND NOT EXISTS (
    SELECT 1 FROM unnest(z.new_fids) nf
     WHERE NOT EXISTS (
       SELECT 1 FROM public.attachment_content_sha sn
         JOIN public.attachment_content_sha so ON so.announcement_id = sn.announcement_id AND so.sha256 = sn.sha256
        WHERE sn.announcement_id = z.announcement_id AND sn.file_id = nf AND so.file_id = ANY (z.old_fids)))
)
ORDER BY z.apply_end, z.announcement_id;
$function$
