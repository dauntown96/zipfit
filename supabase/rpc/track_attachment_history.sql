CREATE OR REPLACE FUNCTION public.track_attachment_history()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- WHEN (OLD.attachment_urls IS DISTINCT FROM NEW.attachment_urls) 로만 불린다 — 여기서 다시 비교하지 않는다.
  insert into public.announcement_attachment_history (announcement_id, source, files)
  values (OLD.announcement_id, OLD.source, OLD.attachment_urls);
  return NEW;
end
$function$

