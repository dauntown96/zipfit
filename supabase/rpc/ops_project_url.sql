CREATE OR REPLACE FUNCTION public.ops_project_url()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 자기 프로젝트 주소(2026-11-19 · 우편함 「코드·운영 — 서울 이전 준비 ①」) — cron 잡과 함수가 EF·REST 를 부를 때 이 값으로 URL 을 만든다.
--   값의 자리는 zipfit_ops.project_self 한 행(ref) 하나 — 이전 날 그 행만 바꾼다. 비밀값 아님.
--   🔴 행이 없거나 비면 던진다(빈 주소로 조용히 부르지 않게).
declare v text;
begin
  select 'https://' || s.ref || '.supabase.co' into v from zipfit_ops.project_self s where s.id;
  if v is null then
    raise exception 'zipfit_ops.project_self 에 ref 가 없다';
  end if;
  return v;
end
$function$
