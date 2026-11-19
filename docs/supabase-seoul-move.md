# Supabase 서울 이전 — 의존 목록 · 절차 · 비용 · 되돌리기(조사)

2026-11-19 11:30 KST 실측(우편함 「조사(읽기만) — Supabase 프로젝트를 싱가포르(ap-southeast-1)에서 서울(ap-northeast-2)로 옮기는 일 …」) · **DB 쓰기 0 · 설정 변경 0 · 프로젝트 생성 0** · 값(키·비밀·연결 문자열)은 이 파일에 없다 — 이름만.

- 지금: 프로젝트 `khdpjjyspmlqtzperoqg` · region `ap-southeast-1` · Postgres 17.6.1.127 · 컴퓨트 Small(2코어 · 2GB) · 조직 Pro · DB 132MB · `auth.users` 1(카카오 1) · storage 버킷 0 · 객체 0.
- 공식 문서는 Supabase 문서 MCP(`search_docs`)로 읽었다 — 이 세션 네트워크는 `supabase.com`을 막는다(CONNECT 403).

## 1. 의존 목록

### 1-0. 이전 날 바꿀 자리 = 3곳(ref·anon 키 함께) — 서울 이전 준비 ①(2026-11-19 · 마이그레이션 `2026-11-19_02_seoul_prep_project_ref`) · ①′(같은 날 · `2026-11-19_03_seoul_prep_anon_key`)

| # | 자리 | 바꾸는 법 |
|---|---|---|
| 1 | **DB** `zipfit_ops.project_self` 한 행(`ref` · `anon_key`) — `public.ops_project_url()`이 읽어 cron 14잡 · `analysis_dispatch_tick` · `ops_uptime_ping`이 주소를 만들고, `public.ops_project_anon_key()`가 읽어 `ops_uptime_ping`이 공개 REST를 부른다 | 새 DB에서 `update zipfit_ops.project_self set ref = '<새 ref>', anon_key = '<새 anon 키>', updated_at = now();`(데이터 쓰기 · 관리 API) |
| 2 | **저장소** `supabase/config.toml` `project_id`(ref) + `supabase/public-anon-key.txt`(anon 키 한 줄) — `deploy-functions.yml`(「프로젝트 ref 읽기」 단계) · `.github/db/migrate.py` · `.github/health/lib.mjs` · `visual.mjs` · `scripts/` 5가 읽는다(anon 키는 `migrate.py` 공개 REST 확인 · `lib.mjs` `ANON_KEY`) | 두 줄 한 PR |
| 3 | **화면** `index.html` `SUPABASE_URL` · `PROFILE_API_URL` · `DELETE_ACCOUNT_API_URL`(ref 글자 3줄) · `SUPABASE_ANON_KEY` | 표시층과 겹치지 않는 회차에 · `sw.js` `CACHE_NAME` +1(원칙 9) |

- 문서·기록은 바꾸지 않아도 동작에 영향 없음: `CLAUDE.md` 「Supabase 설정」(URL · anon 키 · 「싱가포르」) · `docs/network-allowlist.md`(클라우드 환경 허용 목록에 새 호스트 한 줄 — 다운님) · `docs/history.md` · `docs/dictionary/recheck-baseline.json`(뽑은 기록) · 적용된 `supabase/migrations/*`(적용 기록 — 고치지 않는다).
- `docs/cron-jobs.sql`은 ref 글자 0 — 새 DB에서 그대로 돌리면 된다(1번 행이 먼저 있어야 한다 · 마이그레이션이 덤프의 `zipfit_ops`로 따라간다).

### 1-1. 저장소 `zipfit` — ref·URL·키가 글자로 박힌 자리(조사 때 · 2026-11-19 오전 — 위 1-0으로 줄었다)

| 자리 | 무엇 | 이전 때 |
|---|---|---|
| `index.html` | `SUPABASE_URL` · `SUPABASE_ANON_KEY` · EF `save-user-profile` · `delete-account` 주소 | 1-0 3 |
| `sw.js` 32 | `supabase.co` 요청은 캐시 안 함(호스트 일반형) | 그대로 |
| `CLAUDE.md` 「Supabase 설정」 · 「기술 스택」 DB 줄 | URL · anon 키 · 「싱가포르」 | 새 값 · 지역 |
| `supabase/config.toml` `project_id` | 저장소의 유일한 ref 자리 | 1-0 2 |
| `deploy-functions.yml` · `migrate.py` · `lib.mjs` · `visual.mjs` · `scripts/` 5 | ref·anon 키는 1-0 2에서 읽음(2026-11-19 준비 ①·①′) | 1-0 2 |
| `docs/cron-jobs.sql` | cron 32잡 사본 — EF 부르는 14잡은 `public.ops_project_url() \|\| '/functions/v1/…'` | 그대로 |
| DB 함수 `analysis_dispatch_tick` · `ops_uptime_ping` | 주소는 `ops_project_url()` · anon 키는 `ops_project_anon_key()` | 1-0 1 |
| `supabase/migrations/*`(옛 적용 파일) | 옛 ref URL | 고치지 않는다(적용 기록) |
| `docs/network-allowlist.md` | 컨테이너 허용 목록 줄 `khdpjjyspmlqtzperoqg.supabase.co` | 클라우드 환경 「Default」에 새 호스트 한 줄(다운님) |

### 1-2. 저장소 `zipfit-backup`

| 자리 | 무엇 | 이전 때 |
|---|---|---|
| Actions Secret `SUPABASE_DB_URL` | `backup.yml` 127 `PGCONN`(덤프 · 스키마 · 행 수) | 새 연결 문자열(다운님) |
| `heartbeat.yml` · `restore-drill.yml` | ref 글자 없음(덤프 파일만 읽음) | 그대로 |

### 1-3. GitHub Actions Secrets · 클라우드 환경

| 이름 | 저장소 | 이전 때 |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `zipfit`(9곳 · 배포 · check · apply · health) | 계정 토큰이라 그대로(새 프로젝트도 같은 계정) |
| `SUPABASE_DB_URL` | `zipfit-backup` | 바꿈 |
| 클라우드 환경 network secret `api.supabase.com` | 세션 · 루틴 | 그대로(계정 단위) |
| 허용 목록 `khdpjjyspmlqtzperoqg.supabase.co` | 세션 · 루틴 | 새 호스트 더함 |

### 1-4. DB 안(덤프에 따라가는 것 · 다시 넣는 것)

| 것 | 지금 | 이전 때 |
|---|---|---|
| cron | 32잡 — `net.http_post`로 EF 부르는 잡 14(주소 = `public.ops_project_url()` · `cron_secret_v2` · 2026-11-19 준비 ①로 ref 글자 0 · 조사 때 「15」는 1 많게 셈) · 함수 부르는 잡 · 정리 잡 | `cron` 스키마는 백업 덤프 밖 → `docs/cron-jobs.sql` 그대로 다시 만듦(1-0 1 행 먼저) · 🔴 옛 프로젝트 잡은 먼저 끔 |
| Vault | 7 — `cron_secret_v2` · `gdrive_client_id` · `gdrive_client_secret` · `gdrive_refresh_token` · `github_actions_dispatch_token` · `zipfit_routine_fire_token` · `zipfit_routine_fire_url` | 값은 프로젝트 키로 암호화 → 새 프로젝트에서 못 풂(키 옮기기는 아래 3장) · 다시 넣음(다운님) |
| DB가 바깥을 부르는 함수 | `ops_health_dispatch` · `ops_screen_dispatch` · `ops_backup_dispatch` · `ops_backup_poll` → `api.github.com` · `ops_uptime_ping` → `kkokzip.com` · 자기 REST · `analysis_dispatch_tick` → 자기 EF · 루틴 발사 URL | 자기 주소·anon 키는 1-0 1 한 행(`ops_project_url()` · `ops_project_anon_key()`) |
| 확장 | pg_cron 1.6.4 · pg_net 0.20.3 · pg_stat_statements 1.11 · pgcrypto 1.3 · supabase_vault 0.3.1 · uuid-ossp 1.1 | 새 프로젝트에서 켬 |
| 스키마 | public · zipfit_ops(우리) · auth · storage · cron · net · vault · graphql · realtime · supabase_migrations · extensions | auth는 공식 복원 길에 포함 |

### 1-5. Edge Function 17 · 비밀값 14(이름만)

- 함수(전부 ACTIVE): `check-source-pages` · `collect-announcements` · `collect-gh-announcements` · `collect-lh-cutoff` · `collect-lh-images` · `collect-lh-notices` · `collect-lh-promo` · `collect-rental-stats` · `collect-sh-announcements` · `complex-geo-fill` · `fetch-attachment` · `public-status` · `seoul-api` · `submit-feedback` · `test-login` — `verify_jwt` false · `delete-account` · `save-user-profile` — `verify_jwt` true(관리 API 값 = `config.toml`).
- 우리가 넣은 비밀 7(다시 넣음 · 다운님): `CRON_SECRET_V2` · `GDRIVE_ROOT_FOLDER_ID` · `JUSO_COORD_KEY` · `JUSO_SEARCH_KEY` · `LH_API_KEY` · `MOLIT_RENT_API_KEY` · `ODCLOUD_API_KEY`.
- 플랫폼이 주는 것 7(새 프로젝트가 저절로): `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_DB_URL` · `SUPABASE_JWKS` · `SUPABASE_PUBLISHABLE_KEYS` · `SUPABASE_SECRET_KEYS`.
- 배포는 `deploy-functions.yml`(`supabase/config.toml` `project_id` 바꾼 뒤 dispatch로 17개 전부).

### 1-6. Auth · 바깥

| 것 | 지금 | 이전 때 |
|---|---|---|
| 공급자 | 카카오 하나(이메일 · 전화 꺼짐) · SMTP 없음 · 훅 없음 | 새 프로젝트 카카오 켜고 client id·secret 다시(다운님) |
| Site URL · 리디렉트 허용 | `https://kkokzip.com/` · `https://kkokzip.com/**` · `https://www.kkokzip.com/**` | 같은 값 |
| 카카오 개발자 콘솔 Redirect URI | `https://<ref>.supabase.co/auth/v1/callback`(Supabase 카카오 안내) | 🔴 새 ref 콜백을 더함(다운님) — 안 하면 로그인 실패 |
| JWT 만료 | 3600초 | 같은 값 · 서명 키가 달라 기존 세션은 다시 로그인 |
| Better Stack(바깥 감시 · 3분) | EF `public-status` 주소 | 새 주소(다운님) |
| `kkokzip.com` | GitHub Pages(CNAME) · Supabase 사용자 도메인 추가 기능 없음 | DNS 변경 0 |
| 카카오 지도 JS 키 | 도메인 제한(`kkokzip.com`) | 그대로 |
| 루틴 발사 | Vault `zipfit_routine_fire_url`·`_token` | 같은 값 다시 넣음 |

## 2. 걷을 수 있는 우회 — 해외 축

| 자리 | 지금 | 이전 뒤 |
|---|---|---|
| EF `seoul-api` 「서울 아니면 자신에게 넘김」(`x-zf-region-hop`) | 싱가포르에서 불리면 서울로 한 번 넘김(로그 11-18~19: 싱가포르 232 · 서울 229) | 넘김은 걷을 수 있음 — 🔴 함수는 남김(키를 EF 비밀에서만 쓰는 고정 API 표 · 레이트 제한이 본뜻). EF 실행 지역은 **부르는 쪽 가까운 곳**이라 서울 DB의 `net.http_post`면 서울에서 돈다 |
| EF `fetch-attachment` `SEOUL_ONLY`(`www.bmc.busan.kr`) · `x-region` | 서울 실행일 때만 열림 | 걷을 수 있음(남겨도 해 없음) · 첫 호출로 실측 뒤 |
| DB `net.http_get` 지방공사 게시판(경북·경남) · juso · `data.myhome.go.kr` | 싱가포르 DB: 부산 Apache 403 · `data.myhome.go.kr` 시간 초과 · juso robots 200(11-12) | 서울 DB에서 다시 잼 — 국내 AWS 대역도 막는 곳이 있을 수 있다(미측정) |
| `docs/data-sources.md` 「출구 지역」 · `docs/network-allowlist.md` · `CLAUDE.md` DB 줄 | 싱가포르 전제 | 고쳐 씀 |
| 🔴 남길 것 | Claude Code 컨테이너 · 루틴 출구는 여전히 해외 — 컨테이너가 juso·bmc를 직접 부르는 길은 계속 막힘 · `CLAUDE.md` 컨테이너 메모 그대로 | — |
| juso 좌표 저장 판정 | 「해외 아이피 좌표 API 신청 제한」 · 보안각서 「국외 반출 금지」(우편함 「조사 — 단지 좌표」) | 해외 축은 풀림 · 약관 15조② 축은 남음 |

## 3. 이전 절차(공식 안내 + 우리 장치)

공식 원문:
- 「Migrating within Supabase」 https://supabase.com/docs/guides/platform/migrating-within-supabase — "Project migration is primarily for changing regions …" · 유료 요금제는 「Restore to another project」를 권한다고 적혀 있다.
- 🔴 그러나 「Restore to a new project」 https://supabase.com/docs/guides/platform/clone-project — "The data will remain in the same region as the source project to ensure compliance with data residency requirements." → **지역 변경에는 못 쓴다.**
- 그래서 「Backup and Restore using the CLI」 https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore — `supabase db dump … --role-only` · 스키마 · `--use-copy --data-only` 세 파일 → 새 프로젝트에 `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql`. Vault·열 암호화는 "copy the root encryption key to your new project" — `GET/PUT /v1/projects/{ref}/pgsodium`(관리 API). 마이그레이션 기록은 `supabase_migrations` 따로(우리 기록은 `zipfit_ops.schema_migrations`라 본 덤프에 들어감).
- 「Sign in with Kakao」 https://supabase.com/docs/guides/auth/social-sign-in/auth-kakao — 콜백 `https://<project-ref>.supabase.co/auth/v1/callback`을 카카오 Redirect URI에.
- 지역 바꾸기 문제 해결 글(`…/troubleshooting/change-project-region-eWJo5Z`)은 이 세션에서 열지 못함(문서 MCP 검색에 안 나옴 · `supabase.com` 막힘) — 요청서 근거(claude.ai)를 따른다.

순서(제안 — 실행하지 않았다):

| # | 일 | 누가 | 화면 영향 |
|---|---|---|---|
| 0 | 새 프로젝트(서울 · Small) 만들기 · 확장 6 켜기 · 카카오 공급자 · 리디렉트 · 카카오 콘솔 새 콜백 더하기 · EF 비밀 7 · Better Stack 새 감시(꺼 둔 채) | 다운님 | 없음 |
| 1 | 저장소 PR 준비(1-0 2·3 — `config.toml` `project_id` · `supabase/public-anon-key.txt` · `index.html` 4줄) — 병합은 6에서 · `docs/cron-jobs.sql`·DB 함수는 고칠 것 없음 | Claude Code | 없음 |
| 2 | 🔴 옛 프로젝트 cron 32 모두 끔(`cron.alter_job(…, active := false)`) · 진행 중 루틴 0 확인 | Claude Code(데이터 쓰기 · 승인 뒤) | 수집 멈춤 시작 |
| 3 | 덤프 셋(roles · schema · data) | 다운님 PC 또는 Actions | 없음(읽기) |
| 4 | 새 프로젝트에 복원 · pgsodium 루트 키 옮김(또는 Vault 7 값 다시 넣음) | 다운님 | 없음 |
| 5 | 비교 SQL(아래 5장)로 옛 = 새 | Claude Code(읽기) | 없음 |
| 6 | 새 DB `zipfit_ops.project_self` 행을 새 ref·anon 키로(1-0 1 · 덤프가 옛 값을 싣고 온다 — `docs/cron-jobs.sql`보다 먼저) → PR 병합 → EF 17 배포 · `docs/cron-jobs.sql` 새 DB에서 실행 · 화면 새 ref 배포(`CACHE_NAME` +1) | Claude Code | 🔴 전환 순간 — 로그인 사용자는 다시 로그인 |
| 7 | health-ops · health-screen · 공개 REST · 로그인 확인 · Better Stack 새 감시 켬 · 옛 감시 끔 · `zipfit-backup` Secret 바꿈 | 함께 | — |
| 7′ | 🔴 juso 좌표 단계 켜기 + 전 단지 채움(행안부 답 — 좌표제공 API 결과는 국내 서버에만 · 2026-11-19 우편함 「코드·운영 — 11장」): `complex-geo-fill` `JUSO_COORD_ENABLED = true` PR(병합 = 배포) → 좌표 빈 `complex_geo` juso 행 다시 채움 → 전 단지 넓히기. 순서는 아래 「서울 이전 뒤 좌표 켜는 순서」 | Claude Code | 지도 핀이 카카오 지오코딩에서 juso 좌표로(대략 원 줄어듦) |
| 8 | 옛 프로젝트는 일시 중지(읽기 보존 · 되돌림 대비) → 며칠 뒤 삭제 | 다운님 | — |

- **cron 두 곳 동시 실행 막기**: 2(옛 잡 모두 끔)를 6(새 잡 만듦)보다 먼저 · 새 잡은 복원 뒤 「대조」 SELECT로 32잡을 확인한 다음에만.
- **수집 없는 시간대**: 수집 잡은 UTC 0~9시(KST 09~18시)와 18시(KST 03시 야간 · 백업 18:00 · 생존 신호 18:40). 병합 금지 22:00~08:00 KST(원칙 13)까지 겹치면 **KST 19:20~20:25 또는 20:55~21:55**(KST 19:13 LH 공지 · 20:30~20:50 원문 키 대조 · 매시 :34 좌표 채움 · 10분마다 발송·감시는 어느 때나 돈다 — 2에서 끈다).
- **예상 중단 시간**: 화면 읽기(공고 목록)는 옛 프로젝트가 7까지 살아 있어 끊기지 않는다 · 끊기는 것은 수집·분석·점검(2~6 · DB 132MB 덤프·복원은 수 분 단위 — 실측 없음 · 어림) · 로그인 사용자는 6에서 다시 로그인(지금 1명).

## 4. 비용(문서 원문 · 2026-11-19 확인)

- 「Manage Compute usage」 https://supabase.com/docs/guides/platform/manage-your-usage/compute — Small "$0.0206" 시간당 · 월 "~$15" · "Compute is charged by the hour … If a project runs for part of an hour, you are still charged for the full hour." · "Paid plans include $10 in Compute Credits" · "Each project you launch increases your monthly Compute costs." · 예시 「Projects not running for full month」 — 지운 프로젝트는 돈 시간만.
- 지금(관리 API `billing/addons`): `ci_small` "$0.0206/hour (~$15/month)" · 조직 `pro`.
- 겹치는 기간 더 드는 돈 ≈ 0.0206 × 시간 — 하루 ≈ $0.49 · 1주 ≈ $3.46 · 2주 ≈ $6.92(옛 프로젝트를 일시 중지하면 "Paused projects do not count towards Compute usage").
- 지역별 가격 차이 문장은 못 찾음(찾은 곳: compute 사용량 문서 · 가격 페이지는 `supabase.com` 막힘).

## 5. 되돌리기 · 위험

### 비교 SQL(옛 · 새 두 곳에서 같은 결과여야 한다 · 읽기만)

```sql
-- ① 표별 행 수(public · zipfit_ops · auth.users)
select n.nspname || '.' || c.relname as t,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as n
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and n.nspname in ('public', 'zipfit_ops')
union all select 'auth.users', count(*) from auth.users
order by 1;

-- ② 핵심 표 md5(키 순 · 수집이 매번 바꾸는 updated_at 은 뺀다 — 원칙 26 축)
select 'announcements' t, md5(string_agg(announcement_id || '|' || coalesce(title,'') || '|' || coalesce(status,''), E'\n' order by announcement_id)) from announcements
union all select 'announcement_policies', md5(string_agg(id::text || '|' || coalesce(content_raw,'') || '|' || coalesce(content_plain,''), E'\n' order by id)) from announcement_policies
union all select 'housing_units', md5(string_agg(id::text || '|' || coalesce(address,'') || '|' || coalesce(deposit::text,'') || '|' || coalesce(monthly_rent::text,''), E'\n' order by id)) from housing_units
union all select 'complexes', md5(string_agg(id::text || '|' || road_key, E'\n' order by id)) from complexes
union all select 'schema_migrations', md5(string_agg(filename || '|' || sha256, E'\n' order by filename)) from zipfit_ops.schema_migrations;

-- ③ 함수 정의 = 저장소 사본(health-ops 와 같은 규칙) · cron 32잡 이름·주기 · Vault 이름 7
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','zipfit_ops');
select jobname, schedule, active from cron.job order by jobname;
select name from vault.secrets order by name;
```

(2026-11-19 11:3x KST 지금 DB에서 ①②③ 모두 읽기로 돌려 오류 0 — ③ 함수 73 · cron 32 · Vault 7. 이전 직전에 한 번 더 돌린다.)

- **실패 때 돌아가는 길**: 옛 프로젝트를 지우지 않고 일시 중지만 → 되돌림 = 옛 프로젝트 재개 · cron 32 다시 켬 · 화면·EF·Actions ref 되돌린 PR · 카카오 Redirect URI는 둘 다 등록해 둔 채. 전환 뒤 새 DB에만 쓰인 것(수집 · 분석 · 로그인)은 옛 쪽에 없다 — 되돌릴 때 잃는 창은 6~되돌림 사이.
- **공공 API 키가 IP·도메인에 묶였나**: data.go.kr 서비스키(`LH_API_KEY` · `MOLIT_RENT_API_KEY` · `ODCLOUD_API_KEY`) — 묶임 문장 못 찾음(찾은 곳: 포털 상세 15058530 · 15057017 · 15056663) · juso 승인키 — 신청서에 「URL(IP)을 입력하세요」 칸이 있다(business.juso.go.kr 신청 화면) · 그 값에 호출이 묶이는지는 못 찾음 · 우리 호출은 EF(서울 실행)라 출구 IP가 이전으로 바뀌지 않는다(지금도 서울). 카카오 지도 JS 키 — 도메인 제한(`kkokzip.com`)이라 무관.
- **처리방침 자리**: `docs/privacy/2026-10-22.html`(배포 `privacy.html`) 「4. 처리 위탁 및 제3자 제공」 표 「Supabase · 데이터베이스 및 인증 (서버 소재: 싱가포르)」 · 「5. 국외 이전」 표 첫 행 「Supabase (싱가포르 · privacy@supabase.com)」 — 서울로 옮기면 두 자리를 고쳐야 한다(국외 이전 행을 남길지는 판단 — Supabase 백업 저장 위치는 못 찾음).
- **그 밖 위험**: 덤프 안 옛 ref URL(함수 둘 · cron 15잡) · 새 프로젝트 anon 키가 바뀌어 health 점검·화면 고정본이 한꺼번에 실패(1-1을 한 PR로) · `zipfit-backup` 첫 회차 「사라짐」 검사가 auth·cron 차이를 잡을 수 있음.

## 6. 서울 실행 실측 — EF 실행 로그(지난 24시간 · 2026-11-19 11:2x KST · `function_edge_logs`)

| 함수 | 실행 지역 | 건수 | 중앙값 ms | p90 ms |
|---|---|---:|---:|---:|
| `seoul-api` | ap-southeast-1(받아서 서울로 넘김) | 232 | 226 | 438 |
| `seoul-api` | ap-northeast-2(실제 바깥 호출) | 229 | 163 | 320 |
| `public-status`(DB 읽기 한 번 · 바깥 감시) | ap-southeast-1 | 109 | 766 | 1,095 |
| 〃 | eu-central-1 | 145 | 928 | 1,026 |
| 〃 | ap-southeast-2 | 111 | 1,304 | 1,412 |
| 〃 | us-east-1 | 76 | 1,356 | 1,461 |
| 〃 | us-west-2 | 69 | 1,308 | 1,563 |

- **서울 ↔ 싱가포르 넘김 비용 ≈ 중앙값 차 63ms**(226 − 163) — 이전 뒤 없어지는 자리.
- 서울에서 돌며 싱가포르 DB를 읽는 EF 로그는 지난 24시간 0건(`save-user-profile` 4건은 us-east-1) — 「서울 EF ↔ 싱가포르 DB 왕복」 자체는 이미 있는 로그로 잴 수 없다.
- 그 밖 EF(수집 · 점검)는 모두 ap-southeast-1(싱가포르 DB의 `net.http_post`가 부름) — 이전 뒤에는 서울에서 돈다.
