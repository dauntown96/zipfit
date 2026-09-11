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
