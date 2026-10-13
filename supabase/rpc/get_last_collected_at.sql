CREATE OR REPLACE FUNCTION public.get_last_collected_at()
 RETURNS TABLE(source text, last_collected_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 출처별 마지막 성공 수집 시각(2026-10-13 · 마이그레이션 2026-10-13_01 머리 주석이 「성공」의 정의) — 주기 문구는 돌려주지 않는다.
select 'LH'::text, (select max(c.run_at) from public.collection_run_log c where coalesce(c.lh_upserted, 0) > 0)
union all
select 'MYHOME'::text, (select max(c.run_at) from public.collection_run_log c where coalesce(c.myhome_upserted, 0) > 0)
union all
select 'SH'::text, (select max(s.run_at) from public.sh_collection_run_log s
                     where coalesce(s.upserted, 0) > 0 and coalesce(s.pages_failed, 0) = 0
                       and (s.errors is null or s.errors = '[]'::jsonb))
$function$
