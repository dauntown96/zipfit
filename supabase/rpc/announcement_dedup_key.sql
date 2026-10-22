CREATE OR REPLACE FUNCTION public.announcement_dedup_key(p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(p_title, '^(\s*(\[정정공고\]|\[\s*조기\s*(접수)?\s*마감\s*\]|[\[(]\s*(재)?(수정|정정)[^\])]*[\])]|[\[(]\s*[''‘’`]?\s*(\d{2,4}\s*[-./]\s*)?\d{1,2}\s*[-./]\s*\d{1,2}\s*\.?\s*(재)?(수정|정정)\s*(공고)?\s*[\])])\s*)+', ''),
          '[''‘’`"“”″]', '', 'g'
        ),
        '\s+', '', 'g'
      ),
      '\.{2,}', '.', 'g'
    )
$function$
