-- 서울 이전 비교 SQL(읽기만) — docs/supabase-seoul-move.md 5장 ①②③ + 우편함 「서울 이전 ②」 덧 11:4x ④.
-- 옛 · 새 두 DB에서 같은 결과여야 한다. 값은 표 이름 · 수 · md5뿐(개인정보 값 0 — 원칙 36).
\pset footer off
\echo '== ① 표별 행 수'
select n.nspname || '.' || c.relname as t,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as n
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and n.nspname in ('public', 'zipfit_ops')
union all select 'auth.users', count(*) from auth.users
union all select 'auth.identities', count(*) from auth.identities
order by 1;
\echo '== ② 핵심 표 md5'
select 'announcements' t, md5(string_agg(announcement_id || '|' || coalesce(title,'') || '|' || coalesce(status,''), E'\n' order by announcement_id)) from announcements
union all select 'announcement_policies', md5(string_agg(id::text || '|' || coalesce(content_raw,'') || '|' || coalesce(content_plain,''), E'\n' order by id)) from announcement_policies
union all select 'housing_units', md5(string_agg(id::text || '|' || coalesce(address,'') || '|' || coalesce(deposit::text,'') || '|' || coalesce(monthly_rent::text,''), E'\n' order by id)) from housing_units
union all select 'complexes', md5(string_agg(id::text || '|' || road_key, E'\n' order by id)) from complexes
union all select 'schema_migrations', md5(string_agg(filename || '|' || sha256, E'\n' order by filename)) from zipfit_ops.schema_migrations;
\echo '== ③ 함수 수(public · zipfit_ops) · 정의 md5 묶음'
select count(*) as functions,
       md5(string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' || md5(pg_get_functiondef(p.oid)), E'\n' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))) as defs_md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','zipfit_ops') and p.prokind in ('f','p');
\echo '== ④ 기본 권한(public)'
select pg_get_userbyid(d.defaclrole) as role, n.nspname, d.defaclobjtype, d.defaclacl::text
  from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
 where n.nspname = 'public' order by 1,3;
\echo '== ④ 표별 RLS'
select n.nspname || '.' || relname as t, relrowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','zipfit_ops') and relkind='r' order by 1;
\echo '== ④ anon 표 권한'
select table_schema, table_name, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
 where grantee='anon' and table_schema in ('public','zipfit_ops') group by 1,2 order by 1,2;
\echo '== ④ 정책·함수 권한 묶음 md5'
select (select md5(coalesce(string_agg(schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\n' order by schemaname, tablename, policyname),'')) from pg_policies where schemaname in ('public','zipfit_ops')) as policies_md5,
       (select md5(coalesce(string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||coalesce(p.proacl::text,'')||'|'||p.prosecdef, E'\n' order by 1),'')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','zipfit_ops')) as func_acl_md5;
