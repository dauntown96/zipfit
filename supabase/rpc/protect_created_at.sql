CREATE OR REPLACE FUNCTION public.protect_created_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.created_at = OLD.created_at;
  RETURN NEW;
END;
$function$
