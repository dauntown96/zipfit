-- 서울 이전 — 새 DB 비우기(wipe · 한 트랜잭션 · 새 DB 만) — 2026-11-20 claude.ai 판정 ⑤2(프로젝트 다시 만들기 기각).
-- 지우는 것: zipfit_ops 스키마 · public 안 우리 객체(덤프로 만든 것) · auth 사용자 두 표의 행.
-- 남기는 것: public 스키마 자체 · supabase_admin 기본 권한 · 확장(pg_cron · pg_net 등) — 다음 run 첫 줄(seoul-move-pre.sql)이 postgres 기본 권한을 다시 정리한다.
-- 가드(워크플로 단계가 먼저 본다): 새 DB project_self.ref ≠ 새 ref(전환 전) ∧ 새 DB cron 잡 0.
drop schema if exists zipfit_ops cascade;
do $$
declare r record;
begin
  -- 뷰·물질화 뷰 → 표 → 시퀀스(남은 것) — 확장 소속은 빼고
  for r in select c.oid, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v','m')
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop %s if exists public.%I cascade', case r.relkind when 'v' then 'view' else 'materialized view' end, r.relname);
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p','f')
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop table if exists public.%I cascade', r.relname);
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'S'
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop sequence if exists public.%I cascade', r.relname);
  end loop;
  -- 함수·프로시저
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    if exists (select 1 from pg_proc where oid = r.oid) then  -- 앞 cascade 로 이미 지워졌으면 건너뜀(oid::regprocedure 가 숫자로 바뀐다)
      execute format('drop routine %s cascade', r.oid::regprocedure);
    end if;
  end loop;
  -- 형: 복합형(pg_class relkind c) · 도메인·열거·범위(typrelid 0) — 확장 소속 빼고
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'c'
              and not exists (select 1 from pg_depend d where d.objid = c.reltype and d.deptype = 'e') loop
    execute format('drop type if exists public.%I cascade', r.relname);
  end loop;
  for r in select t.typname, t.typtype from pg_type t join pg_namespace n on n.oid = t.typnamespace
            where n.nspname = 'public' and t.typrelid = 0 and t.typelem = 0 and t.typtype in ('d','e','r')
              and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e') loop
    execute format('drop %s if exists public.%I cascade', case r.typtype when 'd' then 'domain' else 'type' end, r.typname);
  end loop;
end $$;
delete from auth.identities;
delete from auth.users;
