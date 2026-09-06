CREATE OR REPLACE FUNCTION public.bump_detail_fetch_fail(p_ids text[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  UPDATE announcements
  SET detail_fetch_fail_count = COALESCE(detail_fetch_fail_count, 0) + 1,
      detail_fetch_last_attempt = now()
  WHERE source = 'LH' AND announcement_id = ANY(p_ids);
$function$
