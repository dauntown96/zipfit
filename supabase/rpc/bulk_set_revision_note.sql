CREATE OR REPLACE FUNCTION public.bulk_set_revision_note(p_ids text[], p_notes text[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  UPDATE announcements a
  SET revision_note = v.note
  FROM (SELECT unnest(p_ids) AS id, unnest(p_notes) AS note) v
  WHERE a.source = 'LH' AND a.announcement_id = v.id
    AND a.revision_note IS NULL
    AND v.note IS NOT NULL AND v.note <> '';
$function$
