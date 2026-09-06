CREATE OR REPLACE FUNCTION public.announcement_dedup_key(p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(p_title, '^(\s*(\[정정공고\]|[\[(]\s*(재)?(수정|정정)[^\])]*[\])])\s*)+', ''),
          '[''‘’`"“”″]', '', 'g'
        ),
        '\s+', '', 'g'
      ),
      '\.{2,}', '.', 'g'
    )
$function$
