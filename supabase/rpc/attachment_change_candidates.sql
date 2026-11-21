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
--   🔴 내용 해시(sha)는 DB 에 없다 — fileid 만 바뀌고 내용 같은 것은 받은 뒤 루틴(reverify 「첨부 변경」)이 sha 로 가려 attachment_reviewed_at 을 채워 닫는다.
WITH link_map AS (
  SELECT DISTINCT ON (l.linked_announcement_id)
    l.linked_announcement_id AS aid, announcement_dedup_key(lh.title) AS lh_key
  FROM public.announcement_post_links l
  JOIN public.announcements lh ON lh.announcement_id = l.lh_announcement_id
  WHERE lh.title IS NOT NULL AND lh.hidden_from_listing IS NOT TRUE
  ORDER BY l.linked_announcement_id, l.lh_announcement_id
),
x AS (
  SELECT a.announcement_id, a.apply_end, aa.analyzed_at, aa.attachment_reviewed_at,
         COALESCE(lm.lh_key, announcement_dedup_key(a.title)) AS k,
         (SELECT max(h.seen_at) FROM public.announcement_attachment_history h
           WHERE h.announcement_id = aa.announcement_id
             AND h.seen_at > greatest(aa.analyzed_at, aa.attachment_reviewed_at)
             AND h.files IS NOT NULL
             AND jsonb_typeof(h.files) = 'array'
             AND jsonb_array_length(h.files) > 0) AS seen_at
  FROM public.announcement_analysis aa
  JOIN public.announcements a ON a.announcement_id = aa.announcement_id
  LEFT JOIN link_map lm ON lm.aid = a.announcement_id
  WHERE aa.status IN ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')
    AND a.title IS NOT NULL AND a.hidden_from_listing IS NOT TRUE
    AND a.apply_end >= (now() AT TIME ZONE 'Asia/Seoul')::date
)
SELECT x.announcement_id,
       x.k || ' #첨부 ' || to_char(x.seen_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
       x.apply_end, x.seen_at, x.analyzed_at, x.attachment_reviewed_at
FROM x
WHERE x.seen_at IS NOT NULL
ORDER BY x.apply_end, x.announcement_id;
$function$
