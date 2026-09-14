-- ZipFit 불변식 검사 (v3 · 2026-09-14)
--   v2: V1이 컬럼 단위 GRANT를 못 보던 구멍을 메움 · usage_events 허용목록 추가
--   v3: V8 보관 기간 감시 신설(삭제 잡 jobid 14가 조용히 죽는 것을 잡는다)
-- 읽기 전용. 위반이 있으면 그 행만 나온다. 아무 행도 안 나오면 통과.
with
allow_write_tables(relname, privs) as (
  values ('saved_announcements', 'DELETE,INSERT'),
         ('usage_events',        'INSERT')          -- 화면이 직접 쓰는 로그 (컬럼 단위 GRANT)
),
-- 정책 0이어도 괜찮은 테이블 (내부 로그 — 화면이 읽지 않는다)
--   ⚠️ 비워 두면 V6가 collection_run_log를 잡는다. 넣을지는 아래 주석 참조
allow_empty_policy(relname) as (
  select null::text where false   -- 지금은 비어 있다(=예외 없음)
),
allow_exec_funcs(proname) as (
  values
    ('announcement_dedup_key'), ('get_announcements_deduped'),
    ('get_announcement_group_ids'), ('get_announcement_blocks'),
    ('get_document_templates_for'), ('get_rental_stats_summary'),
    ('compute_announcement_flags'), ('protect_created_at'),
    ('protect_detail_columns'), ('set_revised_at'), ('update_updated_at')
),

-- ① public 테이블 쓰기 권한이 허용목록 밖
v1 as (
  select 'V1 테이블 쓰기' as check_name,
         c.relname as subject,
         string_agg(distinct g.priv, ',' order by g.priv) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (select unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as priv) p
  cross join lateral (
    -- 🔴 INSERT·UPDATE는 컬럼 단위 GRANT가 있을 수 있어 has_any_column_privilege로 본다.
    --    has_table_privilege는 컬럼 단위를 못 보고 false를 돌려준다(2026-09-14 실측).
    --    DELETE·TRUNCATE는 컬럼 권한이 없어 has_any_column_privilege가 22023으로 죽는다.
    select p.priv
    where case when p.priv in ('INSERT','UPDATE')
               then has_any_column_privilege('anon', c.oid, p.priv)
                 or has_any_column_privilege('authenticated', c.oid, p.priv)
               else has_table_privilege('anon', c.oid, p.priv)
                 or has_table_privilege('authenticated', c.oid, p.priv) end
  ) g(priv)
  where n.nspname = 'public' and c.relkind in ('r','p')
  group by c.relname
  having c.relname not in (select relname from allow_write_tables)
      or string_agg(distinct g.priv, ',' order by g.priv)
         is distinct from (select privs from allow_write_tables a where a.relname = c.relname)
),

-- ② public 함수 EXECUTE가 허용목록 밖
v2 as (
  select 'V2 함수 EXECUTE' as check_name,
         p.proname as subject,
         case when p.prosecdef then 'SECURITY DEFINER' else 'INVOKER' end as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (select proname from allow_exec_funcs)
),

-- ③ 시퀀스 권한
v3 as (
  select 'V3 시퀀스 권한' as check_name,
         c.relname as subject,
         string_agg(distinct g.priv, ',' order by g.priv) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (select unnest(array['SELECT','UPDATE','USAGE']) as priv) p
  cross join lateral (
    select p.priv
    where has_sequence_privilege('anon', c.oid, p.priv)
       or has_sequence_privilege('authenticated', c.oid, p.priv)
  ) g(priv)
  where n.nspname = 'public' and c.relkind = 'S'
  group by c.relname
),

-- ④ storage 버킷 (생기면 storage 기본 권한을 먼저 닫는다)
v4 as (
  select 'V4 storage 버킷' as check_name, b.name as subject,
         case when b.public then 'public' else 'private' end as detail
  from storage.buckets b
),

-- ⑤ RLS 없는 public 테이블
v5 as (
  select 'V5 RLS 미적용' as check_name, c.relname as subject, 'relrowsecurity=false' as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),

-- ⑥ RLS는 켰는데 정책이 0개 + anon에 SELECT가 열려 있다 (읽기가 조용히 빈다)
--    🔴 anon SELECT가 없으면 정책 0은 정상이다 — 두 조건이 함께여야 증상이다
v6 as (
  select 'V6 RLS 정책 0' as check_name, c.relname as subject,
         'policies=0 + anon SELECT' as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and has_table_privilege('anon', c.oid, 'SELECT')
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    and c.relname not in (select relname from allow_empty_policy)
),

-- ⑦ 기본기준 행에 한도가 비었는데 수기확인 메모도 없다
v7 as (
  select 'V7 기본기준 한도' as check_name,
         coalesce(housing_type,'(null)') || '/' || coalesce(supply_form,'(null)') || '/' || coalesce(rank::text,'-') as subject,
         concat_ws(' ',
           case when asset_limit is null then 'asset_limit=NULL' end,
           case when car_limit   is null then 'car_limit=NULL'   end) as detail
  from eligibility_criteria
  where announcement_id is null
    and manual_check_note is null
    and (asset_limit is null or car_limit is null)
)
-- ⑧ 보관 기간 — usage_events 최고령 행이 1년 + 유예(7일)보다 오래됐으면 위반
--   🔵 having이 0행 문제를 저절로 푼다: 표가 비면 min()이 NULL이고 NULL < x 는 NULL이라 행이 안 나온다.
--   ⚠️ 유예는 삭제(정확히 1년)가 아니라 감시에 둔다 — 삭제에 유예를 두면 처리방침이 약속한 1년을 넘겨 보관하게 된다.
v8 as (
  select 'V8 보관기간' as check_name,
         min(occurred_at)::text as subject,
         (now() - min(occurred_at))::text as detail
  from public.usage_events
  having min(occurred_at) < now() - interval '1 year 7 days'
)
select * from v1
union all select * from v2
union all select * from v3
union all select * from v4
union all select * from v5
union all select * from v6
union all select * from v7
union all select * from v8
order by 1, 2;
