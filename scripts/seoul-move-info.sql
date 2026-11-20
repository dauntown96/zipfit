-- 서울 이전 사전 조사·참고(읽기만 · 비교 대상 아님 — cron · Vault 는 6 뒤 대조)
\pset footer off
\echo '== 서버'
select current_setting('server_version') as server, current_user as who;
\echo '== 우리가 만든 역할(관리형 밖) — 0이어야 roles 덤프가 빈다'
select rolname from pg_roles
 where rolname !~ '^(pg_|supabase|pgsodium)' and rolname not in ('postgres','anon','authenticated','service_role','authenticator','dashboard_user','pgbouncer','cli_login_postgres') order by 1;
\echo '== postgres 아닌 소유자(public · zipfit_ops 객체)'
select pg_get_userbyid(relowner) as owner, count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','zipfit_ops') group by 1
union all select 'fn:'||pg_get_userbyid(proowner), count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','zipfit_ops') group by 1 order by 1;
\echo '== auth 표에 걸린 우리 트리거(덤프 밖 — 있으면 따로 옮김)'
select event_object_schema||'.'||event_object_table as t, trigger_name from information_schema.triggers where event_object_schema='auth' order by 1,2;
\echo '== 확장'
select extname, extversion from pg_extension order by 1;
\echo '== cron · Vault(6 뒤 대조)'
select (select count(*) from cron.job) as cron_jobs, (select count(*) from cron.job where active) as cron_active, (select count(*) from vault.secrets) as vault_secrets;
\echo '== public 표 수'
select count(*) as public_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r';
