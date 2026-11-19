CREATE OR REPLACE FUNCTION public.ops_project_anon_key()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 자기 프로젝트 공개 anon 키(2026-11-19 · 우편함 「코드·운영 — 10장」 ② · 서울 이전 준비 ①′) — ops_uptime_ping 이 공개 REST 를 부를 때 쓴다.
--   값의 자리는 zipfit_ops.project_self 한 행(anon_key) — 이전 날 ref 와 함께 바꾼다. 비밀값 아님(화면 index.html 에 공개된 값).
--   🔴 행이 없거나 비면 던진다.
declare v text;
begin
  select s.anon_key into v from zipfit_ops.project_self s where s.id;
  if v is null then
    raise exception 'zipfit_ops.project_self 에 anon_key 가 없다';
  end if;
  return v;
end
$function$
