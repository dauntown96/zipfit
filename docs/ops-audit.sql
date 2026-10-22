-- 정기 점검 정본 SELECT — 읽기 전용 여섯 문장(2026-10-21 · 우편함 「코드·운영 — 문서·SQL만(B): docs/cron-jobs.sql … + docs/ops-audit.sql …」 ·
--   출처: 조사 「런칭 전 점검 ① Supabase」 회신 ④ — 그 회차가 손으로 다시 짠 SELECT 여섯 · claude.ai 검증 통과 2026-10-21).
-- 쓰는 법: 스킬 zipfit-audit 3절 「시스템 정기 진단」 · 분기 정기 점검 때 Supabase 관리 API(`/database/query`)나 SQL 편집기로 **한 문장씩** 돌린다
--   (관리 API는 마지막 문장의 결과만 돌려준다 — 여섯을 한 요청에 실으면 ⑥만 보인다). launch-gates.sql 과 짝 — 게이트는 그 파일, 시스템 구조·건강은 이 파일.
-- 🔴 쓰기 0 · 개인정보 표(user_profiles · saved_announcements · usage_events — 정본 목록 zipfit-backup scripts/data_excluded.py — + auth.*)는
--    개수·크기만 나온다(CLAUDE.md 원칙 36 — 값 · 회원 id · IP · 브라우저 정보 0). ⑤만 운영 목록 함수 get_announcements_deduped 를 한 번 부른다(약 3초) —
--    G1 보호: 탐침(:x5) · 운영 점검(:25 · :55) 직전 5분과 평일 12~14시를 피한다.
-- 결과를 해석하는 자리: 판정 근거 = .github/health/security-allowlist.json(advisors 의도한 지적) · ② 「RLS 원칙」 · 우편함 「런칭 전 점검 ① Supabase」 회신 ①.
--   경보선(DB 150MB 등)은 zipfit-audit 4절 표가 정본 — 여기 적지 않는다.


-- ① 표 목록 · 크기 · 권한 지도 — public · zipfit_ops 의 표·뷰마다 행 수(추정) · 크기 · RLS · 정책 수 · anon/authenticated 권한 · 백업에 드나 · 개인정보 표인가
--    읽는 법: anon·authenticated 쓰기 권한이 있는 표는 saved_announcements(authenticated INSERT·DELETE)와 usage_events(칸 넷만 INSERT) 뿐이어야 한다(원칙 15) ·
--    쓰기 칸은 칸 단위 권한(has_any_column_privilege)까지 본다 — usage_events 는 표 권한이 아니라 칸 권한이라 표 권한만 보면 안 보인다 ·
--    rls ∧ policies = 0 ∧ 클라이언트 권한 0 = 서버 전용 표(의도 — allowlist rls_enabled_no_policy_*).
select n.nspname as schema, c.relname as name,
       case c.relkind when 'r' then 'table' when 'p' then 'table(분할)' when 'v' then 'view' when 'm' then 'matview' end as kind,
       greatest(c.reltuples, 0)::bigint as est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) as size, pg_total_relation_size(c.oid) as bytes,
       c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname) as policies,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       (has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') or has_any_column_privilege('anon', c.oid, 'INSERT,UPDATE')) as anon_write,
       has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
       (has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE')) as auth_write,
       n.nspname in ('public', 'zipfit_ops') as in_backup_schema,
       (n.nspname = 'public' and c.relname in ('user_profiles', 'saved_announcements', 'usage_events')) as personal_data_excluded
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p', 'v', 'm') and n.nspname in ('public', 'zipfit_ops')
 order by bytes desc, schema, name;


-- ② 함수 보안 — public · zipfit_ops 함수마다 SECURITY DEFINER · search_path 고정 · anon/authenticated 실행 권한(확장 소유 함수 제외)
--    읽는 법: risk = definer ∧ anon 실행 — allowlist 에 줄이 있어야 한다(2026-10-21 기준 5) · definer 인데 search_path 미고정이면 고친다(0이어야 한다).
select * from (
select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ' · '), '') as config,
       coalesce(array_to_string(p.proconfig, ' '), '') like '%search_path=%' as search_path_fixed,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_execute,
       case when p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE') then 'definer+anon'
            when p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'definer+authenticated'
            when p.prosecdef and coalesce(array_to_string(p.proconfig, ' '), '') not like '%search_path=%' then 'definer 경로 미고정'
            else '' end as risk
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'zipfit_ops') and p.prokind in ('f', 'p')
   and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
) f
 order by (risk = ''), schema, name;


-- ③ cron 전수 · 7일 실패 — 잡마다 주기(UTC) · active · 7일 실행 수 · 실패 수 · 마지막 실행(KST) · 마지막 상태 · command md5
--    읽는 법: 잡 수 · 이름 · command md5 가 docs/cron-jobs.sql(사본)과 같아야 한다 · failed_7d > 0 이면 마지막 return_message 를 따로 본다.
select j.jobid, j.jobname, j.schedule, j.active, md5(j.command) as cmd_md5,
       count(d.runid) filter (where d.start_time > now() - interval '7 days') as runs_7d,
       count(d.runid) filter (where d.start_time > now() - interval '7 days' and d.status <> 'succeeded') as failed_7d,
       to_char(max(d.start_time) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as last_start_kst,
       (select d2.status from cron.job_run_details d2 where d2.jobid = j.jobid order by d2.start_time desc limit 1) as last_status
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid and d.start_time > now() - interval '8 days'
 group by j.jobid, j.jobname, j.schedule, j.active, j.command
 order by j.jobid;


-- ④ 수집 건강 7일 — LH·마이홈(collection_run_log)과 SH(sh_collection_run_log)의 날짜(KST)별 실행 수 · 에러 런 · 런타임 평균·p95·최대(초)
--    읽는 법: zipfit-audit 4절 「수집 런타임 p95 · 에러율」 줄의 새 값 · 에러 런 = errors 가 비지 않은 런(LH는 배열 · 빈 런은 NULL).
select 'LH·MYHOME' as source, to_char(run_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as day_kst, count(*) as runs,
       count(*) filter (where errors is not null and errors not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)) as error_runs,
       round(avg(duration_ms) / 1000.0, 1) as avg_s,
       round((percentile_cont(0.95) within group (order by duration_ms) / 1000.0)::numeric, 1) as p95_s,
       round(max(duration_ms) / 1000.0, 1) as max_s
  from public.collection_run_log
 where run_at > now() - interval '7 days'
 group by 2
union all
select 'SH', to_char(run_at at time zone 'Asia/Seoul', 'YYYY-MM-DD'), count(*),
       count(*) filter (where errors is not null and errors not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb) or pages_failed > 0),
       round(avg(duration_ms) / 1000.0, 1),
       round((percentile_cont(0.95) within group (order by duration_ms) / 1000.0)::numeric, 1),
       round(max(duration_ms) / 1000.0, 1)
  from public.sh_collection_run_log
 where run_at > now() - interval '7 days'
 group by 2
 order by 1, 2;


-- ⑤ 중복 카드(출처 섞임 기준) · 고아 행 — 목록 대표(get_announcements_deduped)에서 「공고일 · 접수 시작 · 접수 마감 셋이 같음 ∧ 출처가 다름(LH·MYHOME·SH)」인 묶음 수와
--    공고(announcements)에 없는 announcement_id 를 가진 산물 행 수.
--    🔴 중복 기준은 「날짜 셋 같음」만이 아니다 — 그것만으로는 같은 날 함께 낸 다른 공고(청년 · 신혼Ⅰ · 신혼Ⅱ · 지역본부별)가 걸려 오탐 106(2026-10-21 조사 ③).
--    dup_groups > 0 이면 dup_sample 의 제목을 원문과 대조한다(다른 공고일 수 있다 — 표본 3/3 다른 공고였다).
--    고아 = announcement_id 가 있는데 그 공고가 없는 행(0이어야 한다) · null_id_* = 공고에 안 붙은 유형 공통 행(2026-10-21 자격 11 · 정책 2 — 06-30 · 07-02 · 09-08 생성) —
--    고아가 아니다(그래서 따로 센다 · 쓰임은 이 파일이 판정하지 않는다).
--    🔴 목록 함수를 한 번 부른다(약 3초) — 머리 주석의 시각 규칙을 지킨다.
with d as materialized (
  select announcement_id, source, title, announcement_date, apply_start, apply_end from get_announcements_deduped()
),
g as (
  select announcement_date, apply_start, apply_end, count(*) as n, count(distinct source) as sources,
         string_agg(source || ' ' || left(title, 40), ' / ' order by source, announcement_id) as titles
    from d
   where announcement_date is not null and apply_start is not null and apply_end is not null
   group by 1, 2, 3
  having count(distinct source) > 1
)
select (select count(*) from d) as list_rows,
       (select count(*) from g) as dup_groups,
       (select coalesce(json_agg(json_build_object('date', announcement_date, 'start', apply_start, 'end', apply_end, 'n', n, 'titles', titles)
                                 order by announcement_date desc), '[]'::json)
          from (select * from g order by announcement_date desc limit 10) s) as dup_sample,
       (select count(*) from public.housing_units x where x.announcement_id is not null and not exists (select 1 from public.announcements a where a.announcement_id = x.announcement_id)) as orphan_housing_units,
       (select count(*) from public.announcement_extras x where x.announcement_id is not null and not exists (select 1 from public.announcements a where a.announcement_id = x.announcement_id)) as orphan_extras,
       (select count(*) from public.eligibility_criteria x where x.announcement_id is not null and not exists (select 1 from public.announcements a where a.announcement_id = x.announcement_id)) as orphan_eligibility,
       (select count(*) from public.announcement_policies x where x.announcement_id is not null and not exists (select 1 from public.announcements a where a.announcement_id = x.announcement_id)) as orphan_policies,
       (select count(*) from public.announcement_schedule x where x.announcement_id is not null and not exists (select 1 from public.announcements a where a.announcement_id = x.announcement_id)) as orphan_schedule,
       (select count(*) from public.announcement_apply_routes x where x.announcement_id is not null and not exists (select 1 from public.announcements a where a.announcement_id = x.announcement_id)) as orphan_apply_routes,
       (select count(*) from public.eligibility_criteria where announcement_id is null) as null_id_eligibility,
       (select count(*) from public.announcement_policies where announcement_id is null) as null_id_policies;


-- ⑥ 용량 — DB 전체 · 스키마별(표·색인·TOAST 합) · 큰 표 10 · 지우는 장치가 없는 기록(cron.job_run_details) 행·크기
--    읽는 법: zipfit-audit 4절 「DB 용량」 줄의 새 값 · 스키마별 합은 DB 전체보다 작다(카탈로그 밖 공간 · WAL 제외).
select pg_size_pretty(pg_database_size(current_database())) as db_size, pg_database_size(current_database()) as db_bytes,
       (select json_agg(json_build_object('schema', schema, 'size', pg_size_pretty(bytes), 'bytes', bytes) order by bytes desc)
          from (select n.nspname as schema, sum(pg_total_relation_size(c.oid))::bigint as bytes
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where c.relkind in ('r', 'p', 'm') group by 1) s) as by_schema,
       (select json_agg(json_build_object('table', schema || '.' || name, 'size', pg_size_pretty(bytes), 'est_rows', est_rows) order by bytes desc)
          from (select n.nspname as schema, c.relname as name, pg_total_relation_size(c.oid) as bytes, greatest(c.reltuples, 0)::bigint as est_rows
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where c.relkind in ('r', 'p', 'm')
                 order by pg_total_relation_size(c.oid) desc limit 10) t) as top10,
       (select count(*) from cron.job_run_details) as cron_run_details_rows,
       pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as cron_run_details_size;
