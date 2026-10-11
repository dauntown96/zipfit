CREATE OR REPLACE FUNCTION public.sh_run_log_fill_started_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.started_at is null and new.duration_ms is not null then
    new.started_at := new.run_at - (new.duration_ms * interval '1 millisecond');
  end if;
  return new;
end;
$function$
