CREATE OR REPLACE FUNCTION public.get_reanalysis_queue()
 RETURNS TABLE(announcement_id text, source text, title text, announcement_date date, is_revised boolean, revision_note text, group_child_count bigint, donor_announcement_ids text[])
 LANGUAGE sql
 STABLE
AS $function$
-- (e) 선별 재분석 큐 — 「winner 자식 0 + 그룹 자식 >0」인 대표행 목록.
-- 🔴 winner 산출을 재현하지 않는다. get_announcements_deduped()를 그대로 호출해 재사용한다.
-- 🔴 분류·우선순위 점수를 만들지 않는다(사유 텍스트는 원문 그대로 반환하고, 순서는 호출 측이 정한다).
WITH winner AS (
  SELECT d.announcement_id, d.source, d.title, d.announcement_date,
         d.is_revised, d.revision_note,
         announcement_dedup_key(d.title) AS dedup_key
  FROM get_announcements_deduped(NULL, NULL, NULL) d
),
child_counts AS (
  SELECT c.announcement_id, sum(c.n)::bigint AS n
  FROM (
    SELECT announcement_id, count(*) AS n FROM eligibility_criteria   GROUP BY announcement_id
    UNION ALL
    SELECT announcement_id, count(*) AS n FROM announcement_policies  GROUP BY announcement_id
    UNION ALL
    SELECT announcement_id, count(*) AS n FROM housing_units          GROUP BY announcement_id
  ) c
  GROUP BY c.announcement_id
),
group_rows AS (
  SELECT a.announcement_id,
         announcement_dedup_key(a.title) AS dedup_key,
         COALESCE(cc.n, 0) AS child_count
  FROM announcements a
  LEFT JOIN child_counts cc ON cc.announcement_id = a.announcement_id
  WHERE a.title IS NOT NULL
    AND a.hidden_from_listing IS NOT TRUE
),
grp AS (
  SELECT dedup_key,
         sum(child_count)::bigint AS group_child_count,
         array_agg(announcement_id ORDER BY child_count DESC, announcement_id)
           FILTER (WHERE child_count > 0) AS donors
  FROM group_rows
  GROUP BY dedup_key
)
SELECT w.announcement_id, w.source, w.title, w.announcement_date,
       w.is_revised, w.revision_note,
       g.group_child_count, g.donors
FROM winner w
JOIN grp g ON g.dedup_key = w.dedup_key
LEFT JOIN child_counts cw ON cw.announcement_id = w.announcement_id
WHERE COALESCE(cw.n, 0) = 0
  AND g.group_child_count > 0
ORDER BY g.group_child_count DESC, w.announcement_id;
$function$
