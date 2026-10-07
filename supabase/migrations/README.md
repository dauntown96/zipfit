# `supabase/migrations/` — DB 스키마·함수 변경은 이 폴더 + PR 병합으로만

> 2026-09-30 신설 (우편함 「운영 — DB 함수·스키마 변경도 PR 병합 = 적용」). 워크플로 `.github/workflows/db-migrations.yml` · 스크립트 `.github/db/migrate.py`.
> 🔴 **병합이 적용이다.** Claude Code는 SQL을 여기 쓰고 PR을 병합할 뿐, 관리 API로 운영 DB에 DDL을 직접 보내지 않는다.
> **데이터 INSERT/UPDATE/DELETE는 대상이 아니다** — 종전대로 관리 API(`CLAUDE.md` 「컨테이너 환경 메모」)로 쓴다.

## 흐름

| 때 | 하는 일 | 실패하면 |
|---|---|---|
| PR (이 폴더·`supabase/rpc/`·`.github/db/`·워크플로가 바뀜) | `migrate.py check` — 아직 적용 안 된 파일을 **되돌리기 전용** 트랜잭션으로 실제 DB에서 돌린다 | PR 체크 빨강 · 🔴 **빨간 체크의 PR은 병합하지 않는다** |
| `main` push (이 폴더가 바뀜) | `migrate.py apply` — 아직 적용 안 된 파일을 하나씩, **파일마다 한 트랜잭션**으로 적용하고 적용 기록을 같은 트랜잭션에 남긴다 | 라벨 `db-apply` 이슈가 열린다(통과하면 스스로 닫힌다) |
| `workflow_dispatch` (main) | `apply` 재실행 — 기록된 파일은 건너뛴다 | 〃 |

### check 가 보는 것 (전부 통과해야 초록)
1. 파일 규칙(아래) 위반 0.
2. 적용 SQL이 끝까지 돈다 — 맨 끝에서 결과를 담은 예외(`ZIPFIT_CHECK_RESULT`)를 일부러 던져 요청 전체를 롤백시킨다(관리 API는 요청 하나 = 트랜잭션 하나, 예외면 400으로 전체 롤백).
3. 🔴 **되돌리기 전용 증명** — 실행 전·후 스키마 지문(`public`·`zipfit_ops`의 함수 정의 md5·ACL·SECURITY DEFINER·설정·설명, 표·열·정책·트리거)이 같다. 다르면 빨강 — 병합하지 말고 먼저 확인한다.
4. 불변식 v3.8(`supabase/invariants/v3.8.sql`) 위반 수가 적용 전보다 늘지 않는다.
5. `-- zipfit:anon` 줄마다 `anon` 역할 · `statement_timeout = 3s`로 돌려 3초 안에 끝난다.
6. 파일이 건드린 함수마다: DB 정의 md5 = `supabase/rpc/<이름>.sql` 사본(`zipfit_ops` 함수는 `supabase/rpc/zipfit_ops/<이름>.sql` · 선언은 `zipfit_ops.<이름>(인자)`) · ACL·SECURITY DEFINER = 파일 머리의 선언 · 같은 이름 함수 1개.

### apply 가 보는 것
- 적용 기록 `zipfit_ops.schema_migrations`(파일명 · sha256 · 적용 시각 · 커밋 · 실행 URL)에 있는 파일은 건너뛴다 — **같은 커밋을 다시 돌려도 다시 적용되지 않는다.**
- 기록된 파일이 나중에 바뀌면(sha256 다름) 아무것도 적용하지 않고 실패한다 — **적용된 파일은 고치지 않는다. 새 파일을 더한다.**
- 트랜잭션 안에서 불변식 가드(위반 수가 늘면 예외 → 전체 롤백)와 `-- zipfit:anon` 줄(3초)을 함께 돈다.
- 적용 뒤 관리 API로 다시 읽어 check 6번과 같은 대조를 한다. 이미 커밋된 뒤라 실패하면 이슈만 열린다 → 「긴급 되돌리기」.
- 적용 기록 표는 스크립트가 트랜잭션 맨 앞에서 만든다(있으면 그대로). `public` 밖이라 백업 덤프(`--schema=public`)·`schema_guard`·REST에 보이지 않는다.

## 파일 규칙

- 이름: `YYYY-MM-DD_NN_소문자_이름.sql` — 이름 순서가 적용 순서다.
- 🔴 **트랜잭션 제어를 쓰지 않는다**(`BEGIN`·`COMMIT`·`ROLLBACK`·`SAVEPOINT` 등) — 쓰면 되돌리기 전용 체크가 성립하지 않는다. 트랜잭션은 워크플로가 만든다.
- 트랜잭션 안에서 못 도는 것 금지: `CONCURRENTLY` · `VACUUM`.
- `set role` · `zipfit.check` · 적용 기록 표를 파일에서 건드리지 않는다(검사가 쓰는 자리).
- 마지막 문장은 `;`로 끝난다.
- 🔴 **함수를 건드리면(`create`·`drop`·`alter`·`comment`·`grant`·`revoke … on function`) 머리에 선언을 둔다** — 없으면 체크가 빨강이다.
  ```sql
  -- zipfit:function get_announcement_blocks(text) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
  -- zipfit:dropped 옛_함수(text)                      -- 지운 함수(rpc 사본도 함께 지운다)
  -- zipfit:anon select * from get_announcement_blocks('2015122300020838')   -- 화면이 부르는 함수면 더한다
  ```
  - 인자는 타입만(`pg_proc`의 `oid::regprocedure` 꼴) · ACL은 적용 뒤 `proacl::text` 그대로(PUBLIC 없음이면 `=X/postgres`가 빠진다) · ACL이 기본값(NULL)이면 `acl=null`.
- 🔴 **함수 정의를 바꾸면 같은 PR에서 `supabase/rpc/<이름>.sql` 사본도 바꾼다** — 사본은 `pg_get_functiondef()` 출력 그대로다(`CLAUDE.md` 원칙 20). 체크가 「적용 뒤 정의 md5 = 사본 md5」를 되돌리기 전용 트랜잭션 안에서 본다. 원칙 20의 「고치기 전 현재 정의를 먼저 커밋」은 그대로다 — 앞 커밋에 옛 정의, 뒤 커밋에 새 정의.
- 설명(`comment on`)은 `pg_get_functiondef()`에 나오지 않는다 — 사본을 바꿀 필요가 없다.

## 🔴 긴급 되돌리기

1. **기본** — 이전 정의로 되돌리는 **새 파일**(`…_NN_revert_<이름>.sql`, 옛 정의는 `git show <커밋>:supabase/rpc/<이름>.sql`)과 사본 되돌림을 한 PR로 → 체크 초록 → 병합 → 적용. 적용된 파일을 지우거나 고치지 않는다.
2. **화면이 멈춘 급한 경우** — 다운님 확인을 받고 관리 API로 1번의 SQL을 직접 보낸다. 그 뒤 **같은 SQL을 1번 경로로 저장소에 올린다**(적용은 한 번 더 돌지만 같은 정의라 결과가 같다) — 저장소와 DB가 갈린 채 두지 않는다.

## `supabase/ddl/` 과의 관계

`supabase/ddl/`은 2026-09-30 이전 회차가 관리 API로 직접 보낸 SQL의 **기록**이다(배포 경로 아님). 이제부터 스키마·함수 변경은 이 폴더로 온다. 데이터 쓰기 기록은 종전대로 둘 수 있다.
