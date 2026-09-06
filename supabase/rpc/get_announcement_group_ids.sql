CREATE OR REPLACE FUNCTION public.get_announcement_group_ids(p_announcement_id text)
 RETURNS TABLE(announcement_id text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
WITH target AS (
  SELECT announcement_dedup_key(title) AS dedup_key
  FROM announcements
  WHERE announcement_id = p_announcement_id
  LIMIT 1
)
SELECT a.announcement_id
FROM announcements a, target t
WHERE a.title IS NOT NULL
  AND announcement_dedup_key(a.title) = t.dedup_key;
$function$
