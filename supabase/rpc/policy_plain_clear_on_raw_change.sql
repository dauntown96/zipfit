CREATE OR REPLACE FUNCTION public.policy_plain_clear_on_raw_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.content_plain := NULL;
  NEW.content_plain_at := NULL;
  NEW.content_plain_check := NULL;
  RETURN NEW;
END;
$function$
