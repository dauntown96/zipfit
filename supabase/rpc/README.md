# `supabase/rpc/` — DB 함수·트리거 정의 기록

## 🔴 이 파일들은 기록이지 배포 경로가 아니다

여기를 고쳐도 **DB는 바뀌지 않는다.** 마이그레이션 러너가 없고, 일부러 두지 않았다.
DB를 바꾸려면 Supabase에서 직접 실행해야 한다.

## 🔴 DB 함수를 고치기 전에 현재 정의를 여기 먼저 커밋한다

그래야 그 변경의 **diff가 git에 남는다.** 고친 뒤에 덤프하면 「변경 전」이 영영 사라진다.
2026-09-05에 함수 4개를 신설·재생성했는데 git에 아무 기록이 없어, 그 회차의 diff는 복원할 수 없다.

## 🔴 정본은 DB다

어긋나면 **DB가 맞고 이 파일이 낡은 것이다.** 이 디렉터리를 정본으로 보고 파일만 고치면
DB가 바뀐 줄 알게 된다 — 안 바뀐다.

## 덤프 방법

`pg_get_functiondef(p.oid)`(함수) / `pg_get_triggerdef(t.oid)`(트리거 바인딩) 출력을
**손으로 옮겨 적지 말고 그대로** 파일에 쓴다. 쓴 뒤 `md5()`로 DB와 되받아 대조한다.

## 파일 구성

- `<함수명>.sql` — `public` 스키마 함수 하나씩(`pg_proc` 한 행 = 한 파일).
- `triggers.sql` — 트리거 **바인딩** 5건. 바인딩은 테이블에 걸리는 것이라 함수 파일에 넣지 않는다
  (`update_updated_at`은 두 테이블에 걸려 있다).

## ⚠️ 이 덤프는 권한(GRANT)을 담지 않는다

`pg_get_functiondef()`는 함수 정의만 내보내고 **ACL을 출력하지 않는다.** 실측으로 확인했다 —
이 디렉터리의 `.sql` 파일 어디에도 `GRANT`·`REVOKE` 줄이 없다.

🔴 **그래서 권한은 파일을 봐서 알 수 없다.** 누가 어떤 함수를 부를 수 있는지는 DB에서 조회한다.

```sql
select p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_x,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as svc_x,
       array_to_string(p.proacl, ' | ') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by p.proname;
```

⚠️ `proacl`이 NULL이면 「권한 없음」이 아니라 **기본 권한을 그대로 쓴다**는 뜻이다.
`pg_default_acl`에서 `postgres`·`supabase_admin` 두 역할이 `public` 스키마 함수 기본 EXECUTE를
anon·authenticated에 주고 있어, **새 함수는 열린 채로 태어난다.**

## 권한 변경 이력

기록만 한다. 여기를 고쳐도 DB는 바뀌지 않는다 — 위 「배포 경로가 아니다」와 같다.

### 2026-09-11 — 쓰기 함수 2개의 EXECUTE를 anon·authenticated에서 회수

`bulk_set_revision_note`·`bump_detail_fetch_fail`은 둘 다 `SECURITY DEFINER`이고 역할 검사가
없어 **RLS를 통과하지 않는다.** 공개된 anon 키로 `/rest/v1/rpc/`를 부르면 앞의 함수는 화면
「정정사유」에 임의 문구를 써 넣을 수 있고, 뒤의 함수는 수집 우선순위를 흔들 수 있었다.

실제 호출자는 `supabase/functions/collect-announcements` 하나뿐이고, 그 EF는
`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` 클라이언트로 부른다.

```sql
revoke execute on function public.bulk_set_revision_note(text[], text[]) from public, anon, authenticated;
revoke execute on function public.bump_detail_fetch_fail(text[]) from public, anon, authenticated;
grant  execute on function public.bulk_set_revision_note(text[], text[]) to service_role;
grant  execute on function public.bump_detail_fetch_fail(text[]) to service_role;
```

되돌리기:

```sql
grant execute on function public.bulk_set_revision_note(text[], text[]) to public;
grant execute on function public.bump_detail_fetch_fail(text[]) to public;
```

🔴 **함수 본문은 바꾸지 않았다.** 두 `.sql` 파일은 그대로이고 `pg_get_functiondef` 출력과 여전히 같다.

### 2026-09-11 (2차) — 테이블 쓰기 · 시퀀스 · 기본 권한 회수 + 로그인 읽기 0행 수정

🔴 **실행 전 스냅샷**(되돌리기 근거). public 테이블 16개 중 `eligibility_criteria_bak_20260908`(anon 없음)과
`urban_worker_monthly_income`(`anon=rm`)을 뺀 **14개가 전부** `anon=arwdDxtm` · `authenticated=arwdDxtm`이었고,
시퀀스 7개가 전부 `anon=rwU` · `authenticated=rwU`였다. `postgres` 기본 권한(public)은
테이블 `arwdDxtm` · 함수 `X` · 시퀀스 `rwU`를 anon·authenticated에 주고 있었다.
정책은 `anon can read announcements`(roles=anon) · `anon can read document_templates`(roles=anon)였다.

**실행**

```sql
-- ① 테이블 쓰기 회수 (SELECT는 건드리지 않는다)
revoke insert, update, delete, truncate, references, trigger, maintain on table
  public.announcement_extras, public.announcement_policies, public.announcements,
  public.category_discovery_log, public.collection_run_log, public.data_categories,
  public.document_templates, public.eligibility_criteria, public.housing_units,
  public.rental_housing_history, public.rental_housing_stats, public.saved_announcements,
  public.scoring_criteria, public.user_profiles
from anon, authenticated;
grant insert, delete on table public.saved_announcements to authenticated;   -- 찜하기만 예외
revoke maintain on table public.urban_worker_monthly_income from anon, authenticated;

-- ② 기존 시퀀스 7개
revoke usage, select, update on sequence
  public.announcements_id_seq, public.collection_run_log_id_seq, public.document_templates_id_seq,
  public.rental_housing_history_id_seq, public.rental_housing_stats_id_seq,
  public.saved_announcements_id_seq, public.user_profiles_id_seq
from anon, authenticated;

-- ③ postgres 기본 권한 (public 스키마)
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger, maintain on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated;

-- ④ 로그인 사용자가 공고를 0행으로 읽던 것 — 정책 이름·조건은 그대로 두고 대상 역할만 넓힌다
alter policy "anon can read announcements"       on public.announcements      to anon, authenticated;
alter policy "anon can read document_templates"  on public.document_templates to anon, authenticated;
```

**되돌리기**

```sql
grant insert, update, delete, truncate, references, trigger, maintain on table
  public.announcement_extras, public.announcement_policies, public.announcements,
  public.category_discovery_log, public.collection_run_log, public.data_categories,
  public.document_templates, public.eligibility_criteria, public.housing_units,
  public.rental_housing_history, public.rental_housing_stats, public.saved_announcements,
  public.scoring_criteria, public.user_profiles
to anon, authenticated;
grant maintain on table public.urban_worker_monthly_income to anon, authenticated;
grant usage, select, update on sequence
  public.announcements_id_seq, public.collection_run_log_id_seq, public.document_templates_id_seq,
  public.rental_housing_history_id_seq, public.rental_housing_stats_id_seq,
  public.saved_announcements_id_seq, public.user_profiles_id_seq
to anon, authenticated;
alter default privileges for role postgres in schema public
  grant insert, update, delete, truncate, references, trigger, maintain on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to anon, authenticated;
alter policy "anon can read announcements"       on public.announcements      to anon;
alter policy "anon can read document_templates"  on public.document_templates to anon;
```

🔴 **함수 기본 EXECUTE는 이것으로 닫히지 않는다 — 실측이다.**
위 ③의 함수 줄을 실행한 뒤 시험 함수를 만들어 보면 ACL이 `=X/postgres | postgres=X/postgres | service_role=X/postgres`이고
anon·authenticated EXECUTE가 **여전히 true**다. `=X`가 **PUBLIC** 항목이고 두 역할이 PUBLIC의 일원이기 때문이다.
스키마 단위로 `revoke execute ... from public`을 해도 결과가 같다(둘 다 트랜잭션 안에서 만들고 롤백해 확인했다).
전역(`in schema` 없이) `alter default privileges for role postgres revoke execute on functions from public`만 닫힌다.

⚠️ **그 전역 줄은 실행하지 않았다.** `postgres`가 소유한 확장 세 개의 함수가 전부 PUBLIC EXECUTE에 기대고 있어서다 —
`pgcrypto` 36/36 · `uuid-ossp` 10/10 · `pg_stat_statements` 2/3. 기존 함수는 기본 권한 변경에 영향받지 않지만,
`ALTER EXTENSION ... UPDATE`를 `postgres`로 돌리면 함수가 다시 만들어지면서 PUBLIC EXECUTE 없이 태어난다.

🔵 **그래서 새 RPC는 그 자리에서 손으로 닫는다** — `revoke execute ... from public, anon, authenticated` 뒤 필요한 역할에만 grant.
`CLAUDE.md` 원칙 15에 같은 내용을 적었다.

---

## 스키마 변경 이력 (DDL)

기록만 한다 — 위 「권한 변경 이력」과 같다. 여기를 고쳐도 DB는 바뀌지 않는다.

### 2026-09-12 — `eligibility_criteria_bak_20260908` DROP

2026-09-08 기준값 갱신 전으로 되돌릴 수단으로 만든 스냅샷이다. 그 존재 이유였던
「되돌릴 수단이 없다」는 전제가 같은 날 오판으로 드러났다 — `zipfit-backup`의 자동 덤프가
매일 돌고 09-08자 덤프도 확보돼 있다.

🔴 **이름 대조 체계의 첫 삭제 사례다.** 백업 쪽 `schema_guard`가 이것을 「사라진 이름」으로 읽고
한 회차 실패하며, 승인은 `zipfit-backup` 쪽 짝 문서가 처리한다.

**실행 전 확인** (셋 다 0행이어야 실행한다 — 하나라도 나오면 멈춘다)

```sql
-- (1) 이 테이블을 참조하는 제약
select conrelid::regclass, conname from pg_constraint
where confrelid = 'public.eligibility_criteria_bak_20260908'::regclass;

-- (2) 뷰·머티리얼라이즈드뷰·함수 본문·룰·cron 명령문에 이름이 등장하는지
select 'view' k, viewname from pg_views where schemaname='public' and definition ilike '%eligibility_criteria_bak_20260908%'
union all select 'matview', matviewname from pg_matviews where schemaname='public' and definition ilike '%eligibility_criteria_bak_20260908%'
union all select 'func', p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind in ('f','p') and pg_get_functiondef(p.oid) ilike '%eligibility_criteria_bak_20260908%'
union all select 'cron', jobname from cron.job where command ilike '%eligibility_criteria_bak_20260908%';

-- (3) 원본과 스냅샷의 현재 행 수
select (select count(*) from public.eligibility_criteria) as live,
       (select count(*) from public.eligibility_criteria_bak_20260908) as bak;
```

⚠️ **(2)에서 `pg_get_functiondef(p.oid)`는 `prokind in ('f','p')`로 걸러야 한다** —
집계 함수(`prokind='a'`)에 부르면 `"array_agg" is an aggregate function`으로 쿼리 전체가 죽는다.

**실행** (2026-09-12 01:15 UTC = 10:15 KST)

```sql
DROP TABLE public.eligibility_criteria_bak_20260908;
```

🔴 **`CASCADE`를 붙이지 않는다.** 참조가 있으면 실패해야 한다 — 실행 전 확인과 같은 방어다.

**실행 시점 상태**: 304행 · 컬럼 18 · 트리거 0 · 정책 0 · RLS 켜짐 · ACL은 `postgres`·`service_role`뿐.
`public` 테이블 16 → 15. `eligibility_criteria` 307행 불변.

### 되돌리기

🔴 **`DROP TABLE`에 대응하는 한 줄짜리 SQL은 없다.** 복구 수단이 셋 있고, 셋 다 DB 밖에 있다.

1. 🔴 **`zipfit-backup`의 일일 덤프** — 2026-09-08(스냅샷 생성) 이후 ~ 2026-09-12(삭제) 사이의
   어느 회차든 이 테이블을 담고 있다. 그 덤프에서 `eligibility_criteria_bak_20260908` 블록만 꺼내
   `psql`로 되먹인다. **이것이 정규 경로다.**
2. **현행 `eligibility_criteria`와의 차이로 재구성** — 스냅샷은 기준값 갱신 **전** 상태이므로,
   09-08 갱신분을 되짚으면 근사할 수 있다. ⚠️ 근사일 뿐 동일 복원이 아니다.
3. **빈 껍데기가 필요할 뿐이면** 아래로 만든다(데이터는 들어오지 않는다).

```sql
create table public.eligibility_criteria_bak_20260908 (
  id uuid, region text, housing_type text, supply_form text, rank integer,
  income_pct numeric, income_pct_dual_income numeric, asset_limit bigint, car_limit bigint,
  source_announcement_id text, created_at timestamp with time zone, announcement_id text,
  subscription_months_required integer, subscription_payments_required integer,
  income_limit_exempt boolean, asset_limit_exempt boolean,
  verification_requirements jsonb, eligibility_schema_type text
);
alter table public.eligibility_criteria_bak_20260908 enable row level security;
revoke all on table public.eligibility_criteria_bak_20260908 from anon, authenticated;
```

⚠️ **행 수가 원본과 다르다** — 삭제 시점에 원본 307 · 스냅샷 304였다. 09-08 이후 원본에 3행이
늘었다는 뜻이며, **이 삭제는 그 3행과 무관하다.** 복구할 때 307행을 기대하지 않는다.

## 함수 본문 변경 이력

권한·DDL과 달리 이쪽은 **파일 diff가 곧 기록**이다. 아래는 그 diff를 어디서 찾는지와
되돌리는 방법만 적는다.

### 2026-09-12 — `protect_detail_columns()`에 `region` 가드 추가

**무엇을.** 기존 15개 컬럼의 `coalesce(NEW.x, OLD.x)` 뒤에 블록 하나를 더했다.

```sql
IF NEW.region IS NOT NULL AND OLD.region IS NOT NULL
   AND NOT (NEW.region ~ '[0-9]' OR NEW.region ~ '(읍|면|동|리|로|길)')
   AND     (OLD.region ~ '[0-9]' OR OLD.region ~ '(읍|면|동|리|로|길)')
THEN
  NEW.region := OLD.region;
END IF;
```

🔴 **왜 축이 다른가.** 나머지 15개는 NULL로 덮이므로 `coalesce`가 걸린다. `region`은
`mapLHRow`가 `addr ?? (regionRaw || null)`로 만들어 **NULL이 되지 않고 「덜 정확한 값」
(`CNP_CD_NM` 지역본부명)으로 덮인다.** 그래서 「주소형인가」를 묻는 별도 술어가 필요했다.

**막는 방향은 하나뿐이다** — 주소형 → 지역본부명. 아래 셋은 그대로 통과한다.
INSERT(이 트리거는 `BEFORE UPDATE` 전용) · 지역본부명 → 지역본부명 · 주소형 → 주소형.

⚠️ **탈출구 `zipfit.allow_null_clear`가 이 가드도 함께 푼다.** 함수 맨 위에서 통째로
빠져나가는 구조이기 때문이며, 이름과 달리 NULL 소거 전용이 아니다.

**판정식의 근거.** LH가 실제로 보내는 `CNP_CD_NM` 25종(`전국`·`인천광역시 외` 포함)을
전수 대조해 **하나도 주소형으로 갈리지 않는 것**을 확인한 뒤 골랐다(2026-09-12).

**되돌리기.** 한 줄짜리 SQL은 없고, **직전 정의를 그대로 다시 실행하면 된다.**
직전 정의는 커밋 `54ca066` 시점의 `supabase/rpc/protect_detail_columns.sql`이다.

```
git show 54ca066:supabase/rpc/protect_detail_columns.sql
```

그 출력을 그대로 실행한 뒤 `md5(pg_get_functiondef(...))`가
`d1745de8f7153d888fde4450d088290e`인지 대조한다(변경 후는 `4181561ceaa9e0a26acb5b307f480de6`).
🔴 **`DROP TRIGGER`로 되돌리지 말 것** — 그러면 보호 대상 15개까지 함께 풀린다.
