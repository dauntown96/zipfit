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

### 2026-09-16 — `get_announcement_price_summary` 재생성, 권한은 전과 같게 되돌림

`round_state`·`source_round` 두 컬럼을 **더하느라** `RETURNS TABLE`이 바뀌었다.
🔴 그 경우 `CREATE OR REPLACE`가 거부되므로 `DROP FUNCTION` 후 재생성해야 하고,
**DROP과 함께 ACL이 통째로 사라진다.** 그래서 재생성 직후 손으로 되돌렸다.

재생성 **전** ACL(`proacl`) — 이것이 되돌림 기준이다:

```
postgres=X/postgres | service_role=X/postgres | anon=X/postgres | authenticated=X/postgres
```

```sql
-- 재생성 직후 그 자리에서 (원칙 15 — 새 함수는 만든 자리에서 손으로 닫는다)
revoke execute on function public.get_announcement_price_summary(text[]) from public;
grant  execute on function public.get_announcement_price_summary(text[]) to anon, authenticated, service_role;
```

재생성 **후** ACL — 전과 **같다**(실측으로 대조함):

```
postgres=X/postgres | service_role=X/postgres | anon=X/postgres | authenticated=X/postgres
```

⚠️ `anon`이 남아 있어야 한다 — 카드 1층 요약은 로그인 없이도 뜨고 프론트가 anon 키로 부른다.
⚠️ 속성도 함께 확인했다: `STABLE` · `SECURITY INVOKER` · owner `postgres` 전부 전과 같다.

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

### 2026-09-14 — `usage_events` 신설 (사용 로그)

측정 장치가 하나도 없어 「아무도 안 쓴다」와 「쓰는지 모른다」가 구분되지 않던 것을 메운다.
🔴 **이 회차는 그릇만 만든다 — 화면에서 보내는 코드는 0이다.**

🔴 **다른 테이블과 정반대다: 화면(`anon`)이 직접 INSERT한다.** 그래서 이 표만 규칙이 다르고,
다른 데서 이 모양을 흉내 내면 안 된다.

**실행**

```sql
create table public.usage_events (
  id              bigint generated always as identity primary key,
  event           text        not null,
  occurred_at     timestamptz not null default now(),
  session_id      text        not null,
  user_id         uuid                 default auth.uid(),
  announcement_id text,
  props           jsonb       not null default '{}'::jsonb,
  constraint usage_events_event_check check (event in (
    'page_view','notice_open','notice_save','notice_unsave','search',
    'filter_apply','diagnosis_start','diagnosis_complete','recommend_click','attachment_open')),
  constraint usage_events_session_id_check      check (char_length(session_id) between 8 and 64),
  constraint usage_events_announcement_id_check check (announcement_id is null or char_length(announcement_id) <= 64),
  constraint usage_events_props_size_check      check (char_length(props::text) <= 2048)
);

revoke all on table public.usage_events from anon, authenticated, public;
grant insert (event, session_id, announcement_id, props)
  on table public.usage_events to anon, authenticated;

alter table public.usage_events enable row level security;
create policy "anon can insert usage_events" on public.usage_events
  for insert to anon, authenticated
  with check (user_id is not distinct from auth.uid());

create index idx_usage_events_occurred_at       on public.usage_events (occurred_at);
create index idx_usage_events_event_occurred_at on public.usage_events (event, occurred_at);
```

(`COMMENT` 5건은 생략했다 — Supabase 마이그레이션 `create_usage_events`에 전문이 있다.)

#### 🔴 권한을 컬럼 단위로 열었다 — 이 표의 핵심이다

`grant insert`에 **컬럼 목록이 붙어 있다.** 그래서 화면은 `event`·`session_id`·`announcement_id`·`props`
네 개만 값을 정할 수 있고, 나머지 셋은 **손댈 수 없다.**

| 컬럼 | 화면이 정하나 | 누가 정하나 |
|---|---|---|
| `id` | ❌ | identity(시퀀스 권한 없이도 채워진다 — 찜하기 선례와 같다) |
| `occurred_at` | ❌ | 서버 `now()`. 클라이언트 시계가 끼어들지 못한다 |
| `user_id` | ❌ | `auth.uid()` 기본값. **위조가 구조적으로 불가능하다** |
| `event`·`session_id`·`announcement_id`·`props` | ✅ | 화면 |

⚠️ **그래서 `relacl`에는 `anon`이 아예 없다.** 권한은 `pg_attribute.attacl`에 있다
(`anon=a/postgres`). 테이블 ACL만 보면 「anon 권한 0」으로 보이니 **컬럼 ACL을 함께 조회한다.**

```sql
select a.attname, coalesce(array_to_string(a.attacl,' | '),'(없음)')
from pg_attribute a where a.attrelid='public.usage_events'::regclass and a.attnum>0
order by a.attnum;
```

#### 🔴 이 신설은 불변식 V1에 **안 잡힌다** — 불변식 쪽이 낡았다

V1이 `has_table_privilege(…,'INSERT')`를 쓰는데 **이 함수는 컬럼 단위 GRANT를 보지 못한다.**
2026-09-14 실측: `has_table_privilege('anon','public.usage_events','INSERT')` = **false**,
`has_any_column_privilege(…)` = **true**.

🔴 **즉 누구든 컬럼 단위로 쓰기를 열면 V1은 조용하다.** 이 표만의 문제가 아니라 검사 자체의 구멍이다.
고치는 법 — 컬럼 단위로 줄 수 있는 권한만 함수를 바꾼다(`DELETE`·`TRUNCATE`는 컬럼 권한이 없어
`has_any_column_privilege`가 `unrecognized privilege type`으로 죽는다):

```sql
case when priv in ('INSERT','UPDATE','REFERENCES')
     then has_any_column_privilege(role, tbl, priv)
     else has_table_privilege(role, tbl, priv) end
```

원본 SQL은 claude.ai가 갖고 있어 여기서 고치지 않았다. 허용목록에 더할 문구는 두 줄이다.

```
usage_events / anon          INSERT  (컬럼 단위: event, session_id, announcement_id, props)
usage_events / authenticated INSERT  (컬럼 단위: event, session_id, announcement_id, props)
```

#### 사건 종류를 늘릴 때

```sql
alter table public.usage_events
  drop constraint usage_events_event_check,
  add  constraint usage_events_event_check check (event in ( …기존 + 신규… )) not valid;
```

🔴 **`NOT VALID`를 붙인다** — 기존 행을 다시 훑지 않아 표가 커진 뒤에도 즉시 끝난다(새 행은 그대로 검사된다).
🔴 **화면보다 DB를 먼저 고친다.** 제약이 송신보다 앞서야 새 사건이 버려지지 않는다.

#### 되돌리기

```sql
drop table public.usage_events;
```

정책·인덱스·시퀀스가 함께 사라진다. 🔴 **`CASCADE`를 붙이지 않는다** — 참조가 생겼으면 실패해야 한다.
⚠️ 되돌리면 그때까지 쌓인 로그도 함께 사라진다(백업 덤프 말고는 복구 수단이 없다).

### 2026-09-14 (2차) — `user_profiles.usage_log_consent` 추가 (이용 기록 선택 동의)

이용 기록에 **회원 식별자를 붙여도 되는지**에 대한 선택 동의. 처리방침 「서비스 이용 기록」 절과 짝이다.

**실행**

```sql
alter table public.user_profiles
  add column usage_log_consent boolean not null default false;
```

(`COMMENT` 1건은 생략했다 — Supabase 마이그레이션 `add_usage_log_consent_to_user_profiles`에 전문이 있다.)

#### 🔴 기본값이 `false`인 이유 — 그리고 NULL을 안 쓴 이유

「동의함」을 기본으로 두면 **선택 동의의 뜻이 사라진다.** 선례도 같다 — `marketing_alert`가 `default false`다.

`NULL`을 허용해 「아직 묻지 않았다 / 거절했다 / 동의했다」 셋으로 가르는 방법도 있었고 **쓰지 않았다.**
동작이 갈리지 않기 때문이다 — 「묻지 않았다」와 「거절했다」는 둘 다 *`user_id`를 붙이지 않는다*로 똑같이 끝난다.
반면 3상태는 송신 코드에 `NULL`이 참으로 평가되는지를 매번 따지게 만든다.
🔴 **동의 플래그에서는 애매함을 없애는 쪽이 「물어봤는지」를 기록하는 것보다 값지다.**

`NOT NULL`이라 기존 행도 즉시 `false`로 채워진다(PG11+라 테이블 재작성 없음). 그 값은 실제와도 맞는다 —
2026-09-14 현재 **아무도 동의한 적이 없고 송신 코드도 없다.**

⚠️ 나중에 「묻지 않았다」를 따로 세야 하면 그때 `NULL`을 허용하면 된다(되돌림이 `ALTER COLUMN DROP NOT NULL` 한 줄).

#### 권한

컬럼 ACL을 따로 만들지 않았다 — `user_profiles`의 테이블 SELECT 권한(`anon=r`·`authenticated=r`)이 그대로 덮고,
쓰기는 종전대로 `save-user-profile` EF(service_role)만 한다. **불변식 위반은 늘지 않는다**(실측).

#### 🔴 아직 이 컬럼을 바꿀 화면이 없다 — EF가 막고 있다

`save-user-profile`이 **하드코딩 허용목록**(`FIELD_MAP`)으로만 쓰고, `SELECT` 컬럼 목록도 하드코딩이다.
목록에 없는 키는 `if (key in body)` 루프에서 **조용히 버려지고 EF는 `success: true`를 돌려준다.**

🔴 **그래서 체크박스만 먼저 붙이면 「켜짐 → 저장됐다고 표시 → 새로고침하면 꺼짐」이 된다.**
동의 기록이 거짓이 되는 형태라 **이 회차에서는 화면을 붙이지 않았다.** 붙이려면 EF에 두 줄이 먼저 들어가야 한다.

```ts
// ① FIELD_MAP 에
usageLogConsent: { col: 'usage_log_consent', conv: toBool },
// ② GET 이 돌려주는 SELECT 컬럼 목록에
'usage_log_consent',
```

⚠️ EF 배포는 `CLAUDE.md` 원칙 23의 「되돌리기 어려운 것」이라 확인을 받고 한다.

#### 되돌리기

```sql
alter table public.user_profiles drop column usage_log_consent;
```

⚠️ 그때까지 기록된 동의 여부가 함께 사라진다.

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

---

### 2026-09-12 — 취소공고 플래그 · 두 `target` CTE의 `LIMIT 1` 제거

한 회차에서 함수 **3개**를 손봤다. 같은 회차에 묶은 이유는 `get_announcement_group_ids`와
`get_announcement_blocks`가 **같은 결함을 각자 갖고 있어서** 한쪽만 고치면 조용히 어긋나기
때문이다.

| 함수 | 무엇을 | 변경 전 md5 | 변경 후 md5 |
|---|---|---|---|
| `get_announcements_deduped` | `cancel_keys` CTE + `has_cancel_notice` 컬럼 | `fa999d94a484a548ec50b294b5ab1e48` | `15457abee9717e4104f669d98b2ed7fa` |
| `get_announcement_group_ids` | VOLATILE → STABLE, `target`의 `LIMIT 1` 제거 | `24ddfd7e2a1958e822f1e7842dfaf087` | `32765df988b515646752bbf641bff368` |
| `get_announcement_blocks` | `target`의 `LIMIT 1` 제거 | `9b20f1f693a0a06a1242b87eacdd2008` | `2c4b8ccb19daa37f354c1cf355c15f3d` |

🔴 **`get_announcements_deduped`는 `CREATE OR REPLACE`로 안 됐다.** 반환 컬럼을 더하면
`cannot change return type of existing function`이 난다. `DROP` 뒤 재생성해야 하며, 이번엔
**하나의 `DO` 블록 안에서** 처리했다(단일 문이라 실패하면 통째로 롤백된다).

🔴 **`DROP`은 그 함수의 ACL도 함께 지운다.** 재생성 뒤 아래를 다시 실행해 원래 상태로
되돌렸다 — 재생성 전 `proacl`에 **PUBLIC EXECUTE가 있었고**, 권한을 좁히는 것은 이번
범위가 아니라 그대로 복원했다.

```sql
GRANT EXECUTE ON FUNCTION public.get_announcements_deduped(text, text, text)
  TO postgres, anon, authenticated, service_role;
```

⚠️ **본문을 손으로 옮겨 적지 않았다.** `pg_get_functiondef()`로 읽은 현재 정의를 DB 안에서
`replace()`로 고쳐 `EXECUTE`했고, 앵커가 정확히 1건이 아니면 `RAISE EXCEPTION`으로 멈추게
했다. 그래서 바뀌지 않은 부분은 바이트 단위로 종전과 같다.

**되돌리기.** 세 파일 모두 직전 정의가 커밋 `b1b3f74`에 있다.

```
git show b1b3f74:supabase/rpc/get_announcements_deduped.sql
git show b1b3f74:supabase/rpc/get_announcement_group_ids.sql
git show b1b3f74:supabase/rpc/get_announcement_blocks.sql
```

`get_announcements_deduped`만 되돌릴 때도 **`DROP` 뒤 재생성 + 위 `GRANT`**가 필요하다
(컬럼이 줄어드는 것도 반환 타입 변경이다). 나머지 둘은 그 출력을 그대로 실행하면 된다.
실행 뒤 `md5(pg_get_functiondef(...))`가 위 표의 「변경 전」과 같은지 대조한다.

---

### 2026-09-14 — `get_announcement_price_summary(text[])` 신설 (1층 요약 한 줄)

**새 함수다.** 카드 1층에 보증금·월세·전용면적 한 줄을 붙이려고 만들었다. 재료는
`housing_units`다 — `announcements.deposit_min` 등은 분석분이 전부 NULL이라 쓸 수 없다.

| | |
|---|---|
| 변경 전 md5 | (없음 — 이번에 신설) |
| 변경 후 md5 | `5bc539e6ebab50fd43a1f61f40da9203` |
| 파일 | `get_announcement_price_summary.sql` |
| EXECUTE | `postgres` · `anon` · `authenticated` · `service_role` (PUBLIC 없음 — 만든 자리에서 `revoke … from public, anon, authenticated` 뒤 필요한 역할에만 `grant`) |

🔴 **회차를 가르는 규칙이 프론트와 같아야 한다.** 한 그룹에 07·08·09월 세 회차가 섞여 있는
공고(김제하동)가 있고, 1층에 나가는 값이 지난 회차면 첫 화면부터 틀린다. 그래서 판정을
`index.html`의 두 곳과 **한 글자씩 맞췄다**:

- `roundInfoFor()` — `anyRevised || dates.size < 2`면 회차를 가르지 않고, 아니면 자기 행의
  `announcement_date`가 이번 회차다 → CTE `cur`
- `loadHousingUnits()` — `past.length > 0 && cur.length > 0`일 때만 갈라 보여주고, 이번 회차에
  세대정보가 하나도 없으면 그룹 전체를 쓴다 → CTE `cur_has` · `pick`

⚠️ **이 두 곳을 고치면 이 함수도 같이 고쳐야 한다.** 정본은 화면이고, 어긋나면 카드를 열었을
때의 수치와 1층 요약이 달라진다.

#### 🔴 한 회차 안에서 본문을 두 번 고쳤다 — 두 번째는 성능이다

1. **초판** — 이번 회차만 집계. 김제하동 6행이 세 회차로 갈리는 것을 못 보고 있었다.
2. **2판** — 이번 회차에 `housing_units`가 0행인 공고 2건이 요약에서 통째로 빠졌다(분석분
   10건 중 8건만 나왔다). 카드는 그럴 때 그룹 전체를 보여주므로 같은 폴백(`cur_has`)을 넣었다.
3. **3판(현재)** — 그룹을 `get_announcement_group_ids()`로 id마다 부르던 것을 집합 연산으로
   바꿨다. 🔴 **목록 1회분(842건)에 17.3초가 걸렸다**(EXPLAIN ANALYZE 실측). 그 함수는 호출마다
   `announcements`를 두 번 훑고 `announcement_dedup_key()`를 2,635행 전부에 건다. 집합으로 펴서
   **247.9ms**가 됐고(70배), **결과는 842건 전부 바이트 단위로 같다**(digest
   `3ed8dff6553c4a4a71587ecc66718bd3` 일치, 123행).

⚠️ **원칙 20의 「고치기 전에 덤프」를 이 함수에는 적용할 수 없었다** — 세 판 모두 같은 회차에서
태어났고 `main`에 있던 「변경 전」이 애초에 없다. 대신 위에 세 판의 경위를 남긴다.

**되돌리기.** 이 함수는 이번 회차에 생겼으므로 되돌림은 삭제다.

```sql
DROP FUNCTION public.get_announcement_price_summary(text[]);
```

🔵 **화면은 이 함수가 없어도 깨지지 않는다** — 호출이 실패하면 요약 줄 자리가 비고(캐시를
도로 비워 다음 렌더에서 다시 시도한다) 카드의 나머지는 그대로다.

---

### 2026-09-14 (3차) — `sh_collection_run_log` 신설 (SH 수집 런 로그)

SH 수집 1회 = 1행. 🔴 **지금까지 SH 런의 흔적이 어디에도 남지 않았다** — `collection_run_log`는
컬럼이 `lh_*`·`myhome_*`뿐이고, `cron.job_run_details`는 HTTP 요청이 큐에 들어간 것만 기록하며
(`succeeded` ≠ EF 성공), `net._http_response`는 약 6시간치만 남고, `collect()`의 `errors` 배열은
응답에만 담겨 사라졌다.

| | |
|---|---|
| 컬럼 | `id` · `run_at`(로그를 쓴 시각 = 런의 끝) · `started_at` · `total_pages` · `pages_failed` · `parsed` · `dedup_merged` · `upserted` · `hidden` · `visible` · `duration_ms` · `errors`(jsonb) |
| 인덱스 | `sh_collection_run_log_run_at_idx (run_at desc)` |
| 권한 | 🔴 `postgres` · `service_role`뿐. **`anon`·`authenticated`에 아무 것도 주지 않았다** |
| RLS | 켬 · 정책 0 |
| 보관 | **90일** — pg_cron jobid 16 `zipfit-purge-sh-run-log` `10 15 * * *`(UTC) |

🔵 **`anon` SELECT가 없어서 불변식 V6에 걸리지 않는다.** V6의 조건이 「정책 0 **그리고** anon
SELECT」라 권한을 안 주면 예외 목록에 넣을 필요 자체가 없다(`collection_run_log`가 V6에 걸려 있는
이유는 거기엔 anon SELECT가 있기 때문이다).

#### 🔴 미검출 횟수는 카운터 컬럼 없이 센다

「최근 N런에 안 보인 행」을 구하는 방법으로 셋을 놓고 골랐다.

| 안 | 왜 안 골랐나 / 골랐나 |
|---|---|
| 런마다 **본 ID 목록**을 담는다 | 정확하지만 표가 81×4/일로 커진다 |
| `announcements`에 **행별 카운터** | 🔴 수집이 매 런 건드리는 테이블이라 `region` 열화와 같은 구조가 된다. 보호 장치가 또 필요하다 |
| ✅ **런의 시작 시각과 `updated_at` 비교** | 🔵 **새 컬럼도 ID 목록도 필요 없다.** SH upsert는 목록에서 본 행을 전부 다시 쓰므로 `announcements.updated_at`이 곧 「마지막으로 목록에 보인 시각」이다 |

```sql
with ok_runs as (
  select started_at from public.sh_collection_run_log
  where pages_failed = 0 and errors = '[]'::jsonb and coalesce(upserted,0) > 0
)
select a.announcement_id,
       (select count(*) from ok_runs r where r.started_at > a.updated_at) as 미검출_횟수
from public.announcements a
where a.source = 'SH' and a.status <> '접수마감';
```

🔴 **`run_at`이 아니라 `started_at`으로 비교한다.** `run_at`은 로그를 쓴 시각(런의 끝)이고 그
런에서 본 행들의 `updated_at`은 그보다 **앞선다** — `run_at`으로 비교하면 방금 본 행까지
미검출로 센다. 2026-09-14 첫 런에서 실제로 그렇게 나왔다(81행을 막 upsert한 직후인데 전부 1).
고친 뒤: 떨어져 나간 6행 **2**, 지금 목록에 있는 12행 **0**.

⚠️ **`pages_failed > 0`이거나 `errors`가 비지 않은 런은 제외한다** — 「안 보였다」와 「못 봤다」를
가르기 위해서다. 이게 없으면 수집 장애가 마감으로 둔갑한다.

#### `started_at`은 트리거가 채운다 — EF를 다시 배포하지 않으려고

| 함수 | md5 | 파일 |
|---|---|---|
| `sh_run_log_fill_started_at()` | `d549aa462c2b336691e3b67ca3cc3a59` | `sh_run_log_fill_started_at.sql` |

⚠️ **생성 컬럼(`generated always as`)으로는 못 만든다** — `timestamptz - interval`이 STABLE이지
IMMUTABLE이 아니라 `42P17: generation expression is not immutable`로 거부된다. 그래서
BEFORE INSERT 트리거로 둔다. 🔵 `duration_ms`가 `startedAt`부터의 경과 시간 그대로라 런 시작이
정확히 복원되고, DEFAULT는 BEFORE ROW 트리거보다 먼저 적용되므로 `new.run_at`은 이미 채워져 있다.
🔵 호출자가 `started_at`을 직접 실으면 그 값을 존중한다(나중에 EF가 보내도 덮어쓰지 않는다).

**되돌리기.**

```sql
DROP TABLE public.sh_collection_run_log;              -- 트리거도 함께 사라진다
DROP FUNCTION public.sh_run_log_fill_started_at();
SELECT cron.unschedule('zipfit-purge-sh-run-log');
```

🔵 **EF는 되돌리지 않아도 된다** — `logRun()`이 실패를 삼키므로 표가 없으면 콘솔 에러만 남고
수집은 그대로 돈다.

---

### 2026-09-14 (4차) — SH 자동 마감 규칙 · `collection_run_log` anon SELECT 회수

#### `sh_auto_close_log` 신설 — 왜 표를 만들었나

되돌리기 어려운 UPDATE라 근거가 남아야 한다. 🔴 **「안 만들고 되는 길」을 먼저 봤고, 없었다.**

| 담을 것 | 유도 가능한가 |
|---|---|
| 이전 `status` | 지금은 전부 `'공고중'`이라 유도되지만(SH `mapStatus`가 두 값뿐), **`mapStatus`가 바뀌면 조용히 틀린다.** 유도 가능 ≠ 기록됨 |
| 닫은 시각 | 닫는 UPDATE가 `updated_at`을 밀어 남지만, 그 행이 목록에 다시 나타나면 **덮어써진다** |
| 미검출 횟수 | 🔴 **유도가 불가능하다** — 횟수를 `updated_at`(마지막으로 본 시각)에서 세는데 **닫는 UPDATE 자체가 그 `updated_at`을 파괴한다** |

마지막 하나가 결정적이라 표를 만들었다. 권한은 `postgres`·`service_role`뿐, RLS 켬 · 정책 0 → V6에 안 걸린다.

🔵 **「닫았다 열렸다」가 반복되면 같은 `announcement_id`로 행이 여러 개 쌓인다.** 다시 열린 사실은 따로 쓰지 않는다 — SH 스크랩이 `status`를 되돌리므로 **「close 행이 있는데 `announcements.status`가 다시 `'공고중'`이고 `updated_at > closed_at`」**이면 그 사이에 목록에 다시 나타난 것이다. **쓰기 경로를 늘리지 않고 유도된다.**

#### `sh_close_missing(p_threshold, p_dry_run)` 신설

| | |
|---|---|
| md5 | `e9117ae81a5bb4f2ebd36b2e127043d5` |
| 파일 | `sh_close_missing.sql` |
| EXECUTE | `postgres` · `service_role`뿐 (PUBLIC·anon·authenticated 없음) |
| 🔴 문턱 | **`p_threshold`의 기본값 8이 유일한 자리다.** SH가 하루 4회(00/03/06/09 UTC)라 8회 = 만 2일 |

🔵 **cron 잡은 인자 없이 부르고, 시험은 인자를 넘겨서 한다** — 그래서 시험하려고 문턱을 「임시로 낮췄다 되돌리는」 일이 없다. `p_dry_run=true`면 무엇이 닫힐지만 돌려주고 쓰지 않는다.

#### 🔴 왜 수집 EF가 아니라 pg_cron인가

직전 회차에 **삭제 잡을 수집에 얹지 않은 이유**는 「수집이 멈추면 그것도 멈춘다」였다. 여기는 **반대로 보일 수 있지만 결론은 같다**:

- 미검출 횟수가 **「성공한 런의 수」로 정의**되므로, 수집이 멈추면 `ok_runs`가 안 늘고 **아무것도 안 닫힌다**
- 즉 **안전성을 스케줄러가 아니라 판정식이 준다.** 언제 돌든 결과가 같다
- 그래서 되돌리기가 싼 쪽을 고른다 — `cron.unschedule` 한 줄이면 끝이고, **EF 재배포(2026-08-26 사고 구조)를 한 번 더 타지 않는다**

**pg_cron jobid 17 `zipfit-sh-close-missing` `20 0,3,6,9 * * *`(UTC)** — SH 수집 20분 뒤라 그 회차 런 로그가 이미 쓰여 있다.

#### 2026-09-14 시험 — 닫고 되돌렸다

| 단계 | 결과 |
|---|---|
| 기본 문턱 8로 실제 실행 | **0행** — 아무도 8회에 안 닿았다 |
| 문턱 2 · `p_dry_run=true` | **6행** 표시 · 쓰기 0 |
| 문턱 2 실제 UPDATE(트랜잭션 안) | SH 안마감 **18 → 12** · 마감기록 **6행**(전부 `threshold=2`) |
| `rollback` 뒤 | SH 안마감 **18** · 마감기록 **0행** · 마감 74 — **원상** |
| cron 프로브(1분 주기, 같은 명령) | `succeeded` · `return_message='0 rows'` · 0.004초 → 확인 뒤 `unschedule` |

⚠️ 여기서는 `return_message='0 rows'`가 **뜻이 있다** — 명령이 함수를 직접 `SELECT`하기 때문이다. `net.http_post`를 부르는 수집 잡들의 `'1 row'`와 다르다.

#### `collection_run_log` — anon SELECT 회수

```sql
revoke select on public.collection_run_log from anon, authenticated;
```

🔴 **예외 목록에 넣지 않고 권한을 걷었다.** 예외로 덮으면 다음에 진짜 문제가 생겨도 조용하다.
읽는 곳 확인(2026-09-14): 저장소 전체에서 이 표를 **읽는** 코드 0건, DB 안의 함수·뷰도 0건. 쓰는 곳은
`collect-announcements`의 insert 하나뿐이고 service_role로 돈다. ⚠️ RLS·정책은 안 건드렸다 — 어차피
RLS 켬 + 정책 0이라 anon은 **이미 0행을 보고 있었다**(권한만 남아 있던 것이다).

**되돌리기.**

```sql
SELECT cron.unschedule('zipfit-sh-close-missing');
DROP FUNCTION public.sh_close_missing(integer, boolean);
DROP TABLE public.sh_auto_close_log;
GRANT SELECT ON public.collection_run_log TO anon, authenticated;   -- 되돌릴 이유는 없다
```

⚠️ **이미 닫힌 행은 자동으로 안 열린다.** `sh_auto_close_log`의 `prev_status`로 되돌린다.
🔵 단, 그 공고가 SH 목록에 다시 나타나면 **다음 스크랩이 스스로 연다.**
