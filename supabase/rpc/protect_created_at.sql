CREATE OR REPLACE FUNCTION public.protect_created_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.created_at = OLD.created_at;
  RETURN NEW;
END;
$function$
