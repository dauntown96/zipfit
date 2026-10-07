# ZipFit — Claude 작업 지침서

> **이 파일은 규약과 좌표를 담는다.** Claude Code 세션마다 전문이 자동 주입되므로, 매번 읽혀야 하는 것만 둔다.
> Claude Code와 claude.ai 모두 이 파일을 기준으로 작업한다.
> **최근 이력**: 아래 「최근 작업 이력」 3건과 [`docs/history.md`](docs/history.md)를 본다. 🔴 **갱신일을 여기 손으로 적지 않는다** — 손으로 적는 구조는 낡는다(2026-09-09 하루에 세 번 놓쳤다).

## 📌 이 파일의 소관 — 무엇을 담고 무엇을 안 담는가

| 담는다 | 담지 않는다 |
|---|---|
| 코딩 원칙·환경 제약 | 완료 작업 이력 → 🔴 **`docs/history.md`에 append** |
| 프로젝트 좌표(스택·ID·전역변수·함수 목록) | 할 일·미결 → Notion 백로그 DB |
| DB 함수·트리거 정의 → 🔴 **`supabase/rpc/`에 덤프** | 배포·마이그레이션 실행(거기 고쳐도 DB는 안 바뀐다) |
| 수집 API 카테고리 실측표 | 구현 사실(판정 조건·게이트) → Notion ⑩ |
| 정본 라우팅(아래) | 수치·현황 → **조회로 확인한다** |

🔴 **완료한 작업은 여기가 아니라 `docs/history.md` 맨 위에 쓴다.** 이 파일의 「최근 작업 이력」에는 최신 3건만 두고, 새 이력이 들어오면 밀려난 것을 `docs/history.md` 맨 위로 옮긴다.

## 🧭 이 문서에 없는 것 — 어디로 가는가

| 찾는 것 | 정본 |
|---|---|
| 세션 시작 — 지금 상황·절대원칙 | [🏠 L0 시작](https://www.notion.so/3b48aaa7e15581f88981d0c636de780c) |
| 구현 사실 — 판정 조건·게이트·데이터 흐름·캡 | [⑩ 시스템 구조](https://www.notion.so/3ce8aaa7e155813ca69ff94e71a82277) |
| 할 일·미결·보류 (**유일한 정본**) | [📋 백로그 DB](https://www.notion.so/7786386dbb054269bdff55033aafe19e) — 등재 때 「런칭」과 함께 「쓸 시점」(S0 런칭 전 ~ S5 사업화 · 여러 개)도 채운다 · 런칭선 앞이면 S0(⑦ 「외부 도구를 들일 때」 · ⑨ 2026-10-07) |
| 판단이 뒤집힌 경위 | [⑧ 판례집](https://www.notion.so/3b48aaa7e15581c0bcd7d3c8868df713) |
| 3자 분장·git·지시서·병합 규약 | [⑦ 협업 규약](https://www.notion.so/3b48aaa7e155816ea873d4c3f006510a) |
| 어디를 봐야 할지 모를 때 | [⑨ 라우팅 규약](https://www.notion.so/3b98aaa7e155812686b6ff3d11ea43fa) — 5장 검색 키워드 사전 |
| 요청서·회신 — 한 회차 = 한 페이지 | [📬 ZipFit 우편함](https://www.notion.so/eeb36bcacbff40bb816716b1b393f4be) — 착수 때 「작업중」 · 끝나면 「## 회신」 절(원칙 22)·「회신 완료」·PR 칸. 🔴 규약 정본은 ⑦ 「2026-09-29 운영 구조 재편」 |

⚠️ **헤더에 출처(⑦·⑨ 등)를 밝힌 코딩 원칙은 전부 그 문서의 요약 사본이다. 어긋나면 정본이 이긴다.** 🔴 **각 조항 헤더의 반영 시점이 그 조항의 유효기간이다** — 그보다 뒤에 정본이 바뀌었으면 그 조항은 낡은 것이다. 번호를 여기 나열하지 않는다(조항이 늘 때마다 이 줄이 또 낡는다).

---

## 📍 프로젝트 개요

- **서비스명**: 꼭집 — 꼭 맞는 집만 꼭 집어서(전국 공공임대·분양 공고 맞춤 매칭 서비스 · 2026-10-06 ZipFit에서 바꿈)
- 🔴 **이름 규칙**: 사용자에게 보이는 곳 = 「꼭집」 / 기계가 이름으로 찾는 곳(저장소 · 스킬 · cron · Vault · `localStorage` 키 · `CACHE_NAME` 접두 · 함수·CSS 이름 `zf*` · 봇 UA `ZipFitBot` · Drive 폴더 `ZipFit 자동수집`) = 코드명 `zipfit` 그대로
- **배포 URL**: https://kkokzip.com (옛 `https://dauntown96.github.io/zipfit`은 301로 넘어온다)
- **GitHub**: https://github.com/dauntown96/zipfit (main 브랜치 push → 자동 배포)
- **구조**: 단일 파일 (`index.html`) — 빌드 없음, 정적 배포
- **대상**: 한국 공공주택 청약·임대 신청자, 모바일 우선 (max-width: 720px)

---

## 🛠 기술 스택

| 영역 | 내용 |
|---|---|
| 프론트엔드 | HTML/CSS/JS 단일 파일 (index.html) |
| 공고 데이터 | Supabase RPC `get_announcements_deduped()` |
| 데이터 수집 | **LH·MYHOME**은 Edge Function `collect-announcements`를 pg_cron이 주간(KST 09~18시) 10분 간격 + 아침 워밍 2회 + 야간 1회 부르고, **SH**는 `collect-sh-announcements`를 하루 4회(KST 09·12·15·18시) 부른다. **LH 매입 홍보물 목록**은 `collect-lh-promo`가 KST 09:05~18:35 30분마다 새 공고·첨부 바뀐 공고만 `announcement_promo_files`에 남긴다(목록만 — 받기·Drive·extras 연결은 분석 회차). **LH 단지형 이미지 탭 목록**(평면도·조감도·배치도 등 — 매입 밖)은 `collect-lh-images`가 KST 09:17~18:47 30분마다 같은 조건으로 `announcement_complex_images`에 남긴다(목록만 · 2026-10-02). 스케줄은 UTC로 등록돼 있고 현행 값은 `cron.job` 조회로 본다. 상세: ⑩ 「수집 크론은 언제 도나」 · **자동 점검**: GitHub Actions `health-ops.yml`(운영 · 30분마다 25·55분 UTC — 🔴 GitHub schedule이 아니라 Supabase pg_cron `zipfit-health-ops-dispatch`가 `ops_health_dispatch()`로 workflow_dispatch를 부른다 · GitHub schedule은 2시간마다 예비 · `ops_gap`은 ⚠️ 경고만 — 2026-10-03 #328) · `health-screen.yml`(배포본 화면 · 매일·병합 뒤) — 실패하면 라벨 `health-ops`/`health-screen` 이슈가 열리고 회복하면 닫힌다 · **DB 변경**: `db-migrations.yml`(PR 되돌리기 전용 체크 · 병합 뒤 적용 — 실패하면 라벨 `db-apply` 이슈 · 원칙 32) |
| 사용자 프로필 | Edge Function `save-user-profile` (GET/POST, **`verify_jwt=true`**, 식별자는 JWT의 `auth.uid()` — 이메일 기반 식별은 2026-08-13 폐기, CORS는 EF 상수 `ALLOWED_ORIGINS` 허용 목록 — `https://dauntown96.github.io` · `https://kkokzip.com` · `https://www.kkokzip.com` 중 요청 Origin과 완전히 같은 것만 돌려준다 · `delete-account`도 같다 · 2026-10-06) |
| 공고 첨부 수신 | Edge Function `fetch-attachment`는 호출자가 준 URL(허용목록 호스트만)의 바이트를 돌려주거나 `mode=upload`로 Google Drive `[임시] <announcement_id>` 폴더에 직접 올린다(폴더는 `mode=ensure_folder`로 먼저 확보해 `folder_id`로 넘긴다 · DB 쓰기 없음). 운반 상한은 기본 6MB이고 `mode=upload&large=resumable`만 200MB이며, 인증은 Vault `cron_secret_v2`의 `x-cron-secret`이다. 상세: ⑩ 「공고 첨부 수집」 |
| 알림·트리거 | 🔴 **없음 — Make.com은 2026-08-27 미사용 확정**. 검토했고 안 쓰기로 한 것이지 미검토가 아니다(재검토 트리거는 📦 아카이브 「MCP 생태계 보류」에). 알림 경로는 미구현 상태이며 후보는 백로그 「카카오 알림톡」 |
| 외부 API | LH 분양임대공고 API, 마이홈포털 API, 카카오맵 API |
| DB | Supabase PostgreSQL (프로젝트 ID: `khdpjjyspmlqtzperoqg`, 싱가포르) |
| 인증 | **Supabase Auth** (카카오 OAuth + 이메일 매직링크 — 코드 입력 방식 아님, 아래 제약 참고). 신원은 JWT(`auth.uid()`), 프로필 API는 `verify_jwt=true`. 이메일+쿠키(`zipfit_email`) 경로는 2026-08-13 **완전 제거**. `user_profiles`에 RLS 정책 3종(본인 행 select/update/insert) 적용 |

### Supabase 설정
- **URL**: `https://khdpjjyspmlqtzperoqg.supabase.co`
- **anon key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs`
- **RPC**: `get_announcements_deduped(p_region, p_type, p_status)` — null 시 전체 반환
- **인증**: Supabase Auth 세션(localStorage). 쿠키 `zipfit_email`은 2026-08-13 폐지

> ⚠️ **Edge Function 버전은 여기 적지 않는다**(⑨ 1장 — 수치는 기록하지 않는다). 현행 버전은 Supabase에서 조회한다.

### 🧰 컨테이너 환경 메모 — 세션마다 다시 겪는 것

- 🔴 **`pdfplumber`가 이 컨테이너에 없다**(2026-09-22 실측). `pip install pdfplumber`만 하면 `_cffi_backend` 결손으로 import가 죽으니 **`pip install pdfplumber cffi`**로 함께 올린다. ⚠️ `cryptography`는 debian 패키지라 `--upgrade`가 `RECORD file not found`로 실패하지만 **그대로 동작한다** — 재시도하지 않는다.
- 🔴 **DB 쓰기의 기본 경로는 관리 API 파일 실행이다**(B51 실측 · B54 판정). ⚠️ **데이터 쓰기(INSERT·UPDATE·DELETE)만이다 — 스키마·함수 변경(DDL)은 원칙 32**(2026-09-30). `POST https://api.supabase.com/v1/projects/khdpjjyspmlqtzperoqg/database/query`에 `{"query": "<SQL>"}`를 싣는다 — SQL을 파일로 쓰고 `python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1], encoding="utf-8").read()}))' f.sql | curl -sS -X POST <엔드포인트> -H 'Content-Type: application/json' --data-binary @-`. 🔴 **`jq -Rs`로 싣지 않는다**(B57 실측 — 168KB 파일에서 한글 5글자가 깨졌다. 입력을 조각으로 읽다 UTF-8 멀티바이트를 가른다. 가드가 잡아 롤백됐다). 🔴 **인증은 프록시가 주입한다** — 토큰 환경변수는 없고 헤더를 붙이지 않는다. 키·토큰 값을 회신·로그·커밋에 찍지 않는다.
  - 요청 하나 = 트랜잭션 하나(명시 `BEGIN`/`COMMIT`도 된다) · `DO` 가드가 예외를 던지면 **HTTP 400으로 요청 전체가 롤백**된다 · 성공은 201 · **마지막 문장의 결과만** 돌아온다 · 1,025,039B 페이로드 통과 · `statement_timeout` 2분.
  - 🔴 **응답은 약 30초에 프록시 502(`upstream request failed`)로 끊길 수 있다**(2026-10-07 실측 3회 · 30.4~30.6초 — `statement_timeout` 2분보다 먼저). 끊겨도 서버의 트랜잭션은 커밋됐을 수 있다 — **커밋 여부는 기록 표·행 수로 따로 확인**한다. 긴 쓰기는 트랜잭션 안 검증을 줄여 30초 안에 두고, 전수 대조는 커밋 뒤 읽기로 한다. 롤백 전용 시험 파일을 잘라 쓸 때는 끝 예외(`raise exception 'RESULT …'`)를 함께 남긴다(같은 날 시험 파일의 「시험 전용 스위치 끄기」 한 줄이 커밋된 사고).
  - **롤백 전용 시험**: `DO` 블록 안에서 쓰고 읽은 값을 `raise exception 'RESULT …'`로 내보내면 결과는 400 메시지로 보이고 쓰기는 남지 않는다(B53 트리거 시험).
  - 컨테이너에서 `*.supabase.co` anon REST는 curl로 열린다(2026-10-02 실측 200 — B53 때는 프록시 403이었다) · `apply.lh.or.kr` 공고 페이지도 curl 200(2026-10-02). 🔴 다시 막히면 anon REST 확인(원칙 29)은 DB 안에서 `net.http_post(…)`로 부르고 `net._http_response`를 읽는다(B53).
  - 🔴 **지방공사 게시판 도메인(`gbdc.co.kr`·`gndc.co.kr` 등)도 컨테이너에서 프록시 403이다**(B56) — 게시판 **본문 텍스트**는 `net.http_get(…)`으로 받는다. 첨부 바이너리(hwp·pdf)는 `net._http_response.content`가 `text`라 깨져 받지 못하고, `fetch-attachment` 허용목록에도 없다 — 지방공사 공고 분석을 열 때 허용목록을 함께 연다.
- ⚠️ **Drive `download_file_content`는 약 14KB 이하 작은 파일을 파일로 떨어뜨리지 않고 대화로 들인다**(B51 원주문막1 평면도) — base64를 되살릴 수 없어 판독 불가다. 서브에이전트에 맡기거나 다른 경로(`fetch-attachment` 등)로 받는다.
- 🔴 **백업 덤프(`zipfit-backup/dumps/*.dump` — pg_dump 17 형식)를 조사에 쓸 때 컨테이너 `pg_restore` 16은 못 읽는다**(`unsupported version (1.16) in file header` — 2026-09-30 실측). **`pgdumplib`(설치돼 있다)로 읽는다** — `pgdumplib.load(경로)`.
- **국토부 아파트 전월세 실거래 API** — 컨테이너 환경변수 `MOLIT_RENT_API_KEY`(이름만 적는다) · `https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent`(`LAWD_CD` 5자리 · `DEAL_YMD` YYYYMM) · 🔴 **전북은 새 코드 `52xxx`**(군산 `52130` — 2026-08 totalCount 293, B51 실측) · 금액은 만원 단위 쉼표 문자열(`deposit`·`monthlyRent`).

---

## 🔌 LH·MYHOME 수집 API 카테고리 참고 (2026-07-12 전수조사)

> 카테고리 '39' 누락 사건(공공분양·신혼희망타운 전체가 LH 수집에서 빠져있었음) 이후, LH API가 실제로 제공하는 `UPP_AIS_TP_CD` 전 구간(01~99 샘플링)을 직접 조회해 확정한 목록. **다음에 LH 쪽 수집 파라미터를 만지거나 "카테고리 다 커버되나?" 재점검할 때 이 표를 먼저 대조할 것.**

| UPP_AIS_TP_CD | 내용 | 수집 여부 |
|---|---|---|
| `01` | 토지(부지 매각/임대) | ❌ 제외(주택 아님, 서비스 범위 밖) |
| `05` | 분양주택(일반 매각·잔여세대 등, **2026-08-11 실측 30건** — 현행 수집 윈도우(오늘-90일)와 동일 조건 기준) | ❌ **보류 확정(분양 분석 확장 시점까지)** — 상세 근거는 Notion L1 참고 |
| `06` | 임대주택(행복주택/국민임대/영구임대 등 일반임대) | ✅ 수집 중 |
| `13` | 매입임대 | ✅ 수집 중 |
| `22` | 분양·(구)임대상가(입찰) | ❌ 제외(상가, 주택 아님) |
| `39` | 공공분양(신혼희망타운) | ⚠️ **부분 수집** — `AIS_TP_CD_NM`에 '분양' 포함 시 `fetchNoticeList()`에서 필터 배제. 행복주택 계열만 유입(2026-07-12 추가) |
| 나머지(02,03,04,07~12,14~21,25,30,35,40,45,50,99 등) | 전부 빈 목록 확인 | — |

- 🔴 **`collect-announcements`의 `?mode=probe`는 DB에 한 줄도 쓰지 않고 원본 응답을 보여준다**(`collection_run_log`에도 안 남는다). ⚠️ **페이지 파라미터가 소스마다 다르다 — LH 목록은 `page`, MYHOME은 `mh_page`다**(2026-09-18 실측: `page`로 6회 불렀더니 전부 1쪽이 돌아왔다). `net.http_post`로 Vault `cron_secret_v2`의 `x-cron-secret`을 실어 부른다.
- 조회 방법: `net.http_get()`로 `UPP_AIS_TP_CD`를 하나씩 바꿔가며 `PG_SZ=1`로 호출 → `dsList` 비어있는지/`ALL_CNT` 확인. `collect-announcements`의 `fetchNoticeList()` 카테고리 루프(`for (const tp of [...])`)와 항상 대조.
- **MYHOME(`HWSPR02/rsdtRcritNtcList`) 특성**: 카테고리 파라미터 자체가 없어(`fetchMyHome()`가 항상 전량 수집, 페이지네이션 캡 2000건으로 충분) 우리 쪽 수집 파라미터 문제는 없음. 🔴 **`totalCount` 실측: 2026-07-12 270 → 2026-09-18 530**(옛 값을 지우지 않고 이력으로 둔다 — 늘어나는 추세 자체가 관측이다). 다만 MYHOME 자체 데이터셋이 LH보다 훨씬 작음(2026-07-12 기준 고유 공고 약 130건, 약 1년 롤링 윈도우) — LH가 지역본부별로 훨씬 많은 개별 공고를 올리는 반면 MYHOME은 그 중 일부만 큐레이션해서 보여주는 구조로 추정됨. **"LH만 있음" 그룹이 훨씬 많은 것(296 vs MYHOME만 36 — 2026-07-12 실측)은 우리 수집 로직 버그가 아니라 두 소스의 태생적 커버리지 차이**(LH 샘플 20건 전수를 MYHOME API에 직접 대조해 전부 없음을 확인 — 2026-07-12).
- **LH 수집 자체의 알려진 한계**: `fetchNoticeList()`가 `PAN_ST_DT`를 오늘-90일로 제한 — 90일보다 오래된 LH 공고는 LH 소스 행이 아예 생기지 않음(단, MYHOME 쪽에 이미 있으면 그걸로 대체 노출되므로 라이브 서비스에 실질적 데이터 손실은 없음, 다만 LH 쪽 상세정보 보강 기회는 놓침). 의도적 설계로 판단되나 필요시 윈도우 확장 검토 가능.
- **SH(서울주택도시개발공사, 2026-08-19 신설)**: API가 아니라 `housing.seoul.go.kr/site/main/sh/publicLease/list` **HTML 목록 스크래핑**이다(robots 전면 허용 확인). 별도 EF `collect-sh-announcements`가 담당하며 `collect-announcements`와 합치지 말 것 — LH 상세조회 90칸 슬롯이 이미 포화라 잠식하면 안 된다. 컨테이너에서는 SH 도메인이 프록시 403이라 조사·검증이 불가능하니 EF의 `?mode=probe`를 `net.http_post`로 호출해 확인할 것. **스케줄**: pg_cron jobid 8 `zipfit-collect-sh-announcements`, 등록값 `0 0,3,6,9 * * *`(UTC) = **09:00/12:00/15:00/18:00 KST 1일 4회**, `?mode=collect` 호출.
- **재발방지 체크리스트(신규 소스/카테고리 추가 시)**: (1) 이 표에 없는 새 카테고리를 추가하기 전, 위 조회 방법으로 `01~99` 재스캔해 빠진 코드가 없는지 확인 → (2) 새 코드 추가 시 이 표도 함께 갱신 → (3) 추가 직후 `SELECT title, b.announcement_id AS old_id FROM announcements a JOIN announcements b ON b.title=a.title AND b.announcement_id<>a.announcement_id WHERE a.created_at > <추가시각> AND a.source='LH'` 패턴으로 고아화 재발 여부 즉시 전수 확인(2026-07-12 인천계양A3 고아화 사고 때 쓴 쿼리, 이번에 `eligibility_criteria`/`announcement_policies`/`housing_units`가 그룹조회로 전환돼 있어 앞으로는 자동 방지되지만 새로운 단일-ID 조회 로직을 추가할 경우 재확인 필요)

---

## 🔑 핵심 전역 변수

```js
SUPABASE_URL / SUPABASE_ANON_KEY
noticeData[]        // Supabase 공고 배열
noticeLoaded        // 필터 칩 초기 로드 여부
activeNoticeRegion / activeNoticeType / activeNoticeStatus
noticeFilterOptions // { regions, types, statuses }
currentUser         // { email, alert_email, marital, regions, types, ... } — 프로필 로드 결과
selectedRegions / selectedTypes   // 추천탭 필터 Set
settingsRegions / settingsTypes   // 설정탭 칩 Set
allRegions[]        // DB 동적 지역 목록
zfAuth              // Supabase 클라이언트(SDK 미로드 시 null)
zfSession           // 현재 Supabase 세션
ZF_REDIRECT_TO      // 배포 루트(하드코딩 아님, location에서 산출)
```

---

## 🔧 주요 함수 목록

```js
initNoticeFilters()                    // 전체 데이터 1회 로드 → 필터 칩 구성
loadNoticeData()                       // 필터 변경 시 RPC 재호출
renderNoticeList(filtered, total)
loadRegionsFromSupabase()              // 전국 지역 동적 로드
renderPersonalizedRecommendations()    // 맞춤 추천 — currentUser 의존
zfSignInKakao() / zfSendLoginLink()     // 로그인(카카오·이메일 매직링크)
zfApplySession(session)                // 세션 진입 → 프로필 로드 → 화면 전환
zfAccessToken()                        // 세션 토큰(없으면 null → EF 호출 안 함)
zfFetchProfile() / zfPostProfile(p)    // EF 호출 공통(Authorization 필수)
zfPayloadFromCurrentUser(extra)        // 전체 payload 생성(부분 전송 금지)
saveUserProfile(lvl)
saveSettings() / applySettingsToUI(p)
onSettingChange()                      // 토글 변경 시 자동 저장
goMain(n) / goStep(n)
toggleDetail(id, card) / initMapForHouse(h, id)
ageStateFor(row, birthYear)            // 나이 축 3분기 판정 ok/no/check — 기준값 정본은 DB age_min·age_max
diagnose() / matchHouses() / renderMatchResults(rows)
```

---

## 🕘 최근 작업 이력 (최신 3건)

🔴 **전체 이력은 [`docs/history.md`](docs/history.md)에 있다.** 아래는 최신 3건의 **요약**이다 — 🔴 **행당 600바이트 안**(회차 · 한 줄 요약 · PR 번호). 전문은 `docs/history.md` 맨 위 같은 날짜·회차 행에 있다(2026-09-28 B60부터).
🔴 **새 이력은 `docs/history.md` 맨 위에 쓴다.** 여기에 쌓지 않는다 — 그러면 다시 518KB가 된다.

| 날짜 | 내용 |
|---|---|
| 2026-10-07 | **코드 — Z-2 ① PR-B 반영 + 10** — 링크 규칙 Z2-link-v3 적용(942→930 · 빠짐 13 · 광명 `…20143` 대표 · 렌더 81장 중 72 같음·의도 4·무관 2 · #376) · #372 오탐 처방 — 발송 응답을 `ops_dispatch_log` 로 옮겨 판정(#377 · #372 닫힘) |
| 2026-10-07 | **코드 — Z-2 ① PR-B ⏸ 반영 전 멈춤 + 9** — 링크 규칙 Z2-link-v3(panId + 같은 공고일) 롤백 시험 942→930: 빠짐 13 예고대로 · 광명 원공고 `…20143` 대표로 섬 · 「📑」 5장(예고 7) → 판정 대기(#373 닫음) · 점검기 `migrate.py`·`health-ops`가 `zipfit_ops` 사본도 대조(#374) |
| 2026-10-07 | **코드 — Z-1 ③ 8·9** — 세대 `seq`(10-06 덤프 순서 채움 · #367) + 화면 `order=deposit.asc,seq` · sw v168(#368) — 렌더 12장 중 11장 이전 전과 같음 · `…20818`·`…20726`은 원문 순서와 다름(덤프 순서 자체) · `.github/health/card-text.mjs` 카드 글자 뽑기 도구 |

---

## 🚫 코딩 원칙

1. **단일 파일 유지** — `index.html` 하나. JS/CSS 분리 금지
2. **수정 최소화** — 요청된 것만. 관련 없는 리팩토링 금지
3. **장기 확장성** — 하드코딩 대신 동적 처리
4. **모바일 우선** — max-width: 720px
5. **한국어** — 모든 UI 텍스트
6. **프레임워크 금지** — React, Vue, npm, 번들러 모두 금지
7. **기존 클래스명·ID 변경 금지**
8. **Make.com 건드리지 말 것**
9. **index.html 수정 시 sw.js CACHE_NAME 버전도 +1** — 브라우저 캐시 강제 갱신 필요
10. **`revised_at_source='user_verified'` 보호 규칙** — 앞으로 어떤 자동 정리·백필·리셋 스크립트를 작성하든 `announcements.revised_at`/`revised_at_source`를 건드리는 UPDATE에는 반드시 `WHERE revised_at_source != 'user_verified'` 조건(또는 동등한 보호)을 포함할 것. 다운님이 직접 원문을 확인해서 넣은 실제 게시일이 자동 로직에 의해 조용히 덮어써지면 안 됨
11. **정정/신규 공고를 실제보다 늦게 처음 발견한 것으로 의심되는 사례 발견 시** (예: PAN_ID/pblancId 번호대가 오래됐는데 오늘 처음 수집됨) — 추측으로 날짜를 채우거나 리셋하지 말고, 다운님께 보고 후 실제 게시일 확인을 요청할 것. 확인되면 `revised_at`/`revised_at_source='user_verified'`로 반영(서울대방 사례와 동일 절차)
12. **첨부문서(공고 원문·QnA 등)는 미리보기가 아니라 전체를 읽은 뒤에만 반영한다** — 정본은 스킬 `zipfit-notice-analysis` 절대원칙 1·3. 경위: `docs/history.md` 2026-07-08
13. **git — 브랜치·push·병합** (2026-09-02 개정, ⑦ 「git 원칙」·「병합은 누가 하는가」 반영)
- **지정 브랜치 지시문이 없는 세션** → 자가검증 통과 시 `main`에 직접 push.
- **지정 브랜치 지시문이 붙은 세션** → 세션 브랜치에 push한 뒤 🔴 **Claude Code가 GitHub MCP로 PR 생성·병합까지 한다.** 다운님께 넘기지 않는다.
  - `gh` CLI는 이 환경에 **없다**(2026-09-01 실측). `mcp__github__create_pull_request` → `mcp__github__merge_pull_request`를 쓴다.
- 🔴 **push는 완료가 아니다. 병합까지가 작업의 끝이다** — 스케줄 워크플로와 배포는 기본 브랜치 기준으로 돈다.
- 🔴 **완료 보고에 병합 결과(PR 번호·병합 커밋)를 반드시 적는다.** 병합이 작업의 일부이므로 생략하지 않는다.
- push 전에 **반드시 `git fetch origin main`** — 세션 시작 시 `origin/main` 원격추적 ref가 낡은 채로 seeding된다. 이걸 안 하면 `non-fast-forward` 거부를 환경 차단으로 오판한다.
- push 검증은 로컬이 아니라 **원격 blob으로** — `git show origin/main:<파일>`.
- 🔴 **누적 파일에 새 줄을 쓰기 전에 `origin/main`을 세션 브랜치에 먼저 머지한다**(2026-09-17 신설 — ⑦ 「2026-09-17 개정」 반영) — `docs/history.md`·`CLAUDE.md`처럼 맨 위에 append 하는 파일이 대상이다. **리베이스가 아니라 머지다.** 계기: squash 병합으로 세션 브랜치가 `main`과 갈려 같은 이력 줄을 두 쪽이 따로 갖게 됐고, PR 병합이 충돌로 거절됐다(PR #154·#155). 먼저 머지하면 그 자리에서 나던 충돌이 아예 생기지 않는다.
- 🔴 **squash 병합 뒤 같은 브랜치에 다시 push할 때는 `git diff <원격 브랜치 head> origin/main`이 비었음을 먼저 증명하고, 그 증명이 선 뒤에만 `--force-with-lease=<브랜치>:<원격 head>`를 쓴다. 증명 없이 force 하지 않는다**(2026-09-22 신설 — ⑦ 2026-09-22 개정 반영).
- 예외(다운님 확인 후 진행): 되돌리기 어려운 변경(인증·로그인 경로, 컬럼 DROP, RLS 적용). 이때도 **PR 생성은 Claude Code가 한다**.
- ⚠️ 원격 브랜치 삭제는 이 환경에서 프록시 403으로 막혀 있다. 정리는 다운님이 GitHub 웹에서 한다.
14. **3자 업무 분장** (2026-09-09 개정 — ⑦ 2026-09-03 재배정까지 반영. 🔴 **정본은 ⑦ 배정표**)
- **claude.ai**: 판단·설계, 작업지시서 작성, 🔴 **공고 분석 묶음 사후 점검**, 🔴 **실행 결과 재검증**(Supabase 읽기 중 이것만), **Notion의 판단·규약·경위**, 웹 검색.
- **Claude Code**: DB 쓰기(INSERT/UPDATE/DDL), 코드 읽기·쓰기, git·PR·병합, 🔴 **Supabase 읽기 — 조사·현황 파악**, 검증 설계, **Notion의 구현·데이터 사실**, Drive 원문 수령, 🔴 **공고 원문 분석·반영(묶음 단위)**, PDF 해시 추출(`pdfplumber`), 🔴 **배포본·LH 공고 페이지 1차 확인**(실물 — 컨테이너 Chromium은 curl 중계 · 2026-09-29). claude.ai는 그것을 **독립 재검증**한다.
- ⚠️ **묶음 절차의 정본은 분석·재확인 스킬이다** — 여기 옮겨 적지 않는다. 상태 정본은 `announcement_analysis`다.
- **다운님**: 원문 업로드, 브라우저 육안 확인, 사실관계 최종 판정, 스킬 교체, 계정 권한.
- 🔴 **핵심은 「조사」와 「재검증」을 가른 것이다.** 둘 다 SELECT를 돌리지만, 조사는 *무슨 일이 벌어지고 있나*이고 재검증은 *Claude Code가 한 일이 맞나*다. **후자를 넘기면 쓴 주체가 검증하게 되어 이 구조가 무너진다.**
- 🔴 **Notion 배정은 열거가 아니라 원리다 — 「그 사실을 직접 본 쪽이 쓴다」.**
  - **구현·데이터 사실**(코드 동작 · 컬럼이 담는 것 · API가 주는 것) → **Claude Code.** ⑩ 구현 사실 · ⑥⑤② 구현 서술 · 우편함 「## 회신」 절이 여기다(2026-09-29).
  - **판단·규약·경위**(왜 그렇게 정했나 · 무엇이 뒤집혔나 · 무엇을 할 것인가) → **claude.ai**
  - ⚠️ **페이지 번호로 가르지 않는다** — 열거하면 목록 밖이 또 면제된다. 한 페이지에 둘이 섞이면 나누어 쓴다.
  - 🔴 **문구를 넘겨 옮겨 적게 하는 것은 마지막 수단이다.** 불가피하면 verbatim으로 옮기고 경위를 본문에 남긴다. 경위: `docs/history.md` 2026-09-09
- ⚠️ 2026-07-29자 구 서술(「Supabase 읽기는 claude.ai가 직접」)은 **폐기됐다.** 조사는 Claude Code 몫이다.
15. **RLS 원칙 — 켜기 전에 읽는 쪽을 먼저 본다** (2026-08-12 신설 — 2026-09-03 이력 분리 시 제목줄 유실, 2026-09-05 복원)
- **개인정보가 들어가는 테이블은 SELECT 정책도 만들지 않고** Edge Function 경유로만 접근한다.
- RLS를 켜기 전 해당 테이블을 읽는 **RPC의 SECURITY 속성을 확인할 것** — `SECURITY INVOKER`면 RLS가 적용돼 정책 없이는 화면이 조용히 빈다(에러도 안 남).
- 🔴 **SELECT 정책의 대상 역할에 `anon`만 적지 않는다** (2026-09-11 추가) — `anon`만 적으면 **로그인 사용자가 0행을 본다.** 2026-09-11까지 `announcements`·`document_templates`가 그랬고, 프론트가 조회를 전부 anon 키로 보내서 드러나지 않았을 뿐이다. 로그인 경로가 읽을 수 있어야 하는 표는 `to anon, authenticated`로 둔다.
- 🔴 **새 테이블은 쓰기 권한 없이 태어난다** (2026-09-11 추가) — `postgres` 기본 권한에서 테이블 쓰기·시퀀스를 걷어냈다. 쓰기는 service_role이 한다. 로그인 사용자가 직접 써야 하는 표만 그 자리에서 명시 GRANT 한다(현재 `saved_announcements`의 INSERT·DELETE 하나뿐).
- 🔴 **새 RPC는 만든 자리에서 손으로 닫는다** (2026-09-11 추가) — `revoke execute on function … from public, anon, authenticated` 뒤 필요한 역할에만 grant. ⚠️ **기본 권한으로는 함수가 닫히지 않는다** — PostgreSQL이 함수 EXECUTE를 PUBLIC에 전역 기본으로 주고, 스키마 단위 기본 권한은 그것을 덜어내지 못한다(실측). 전역으로 걷어내는 줄은 `postgres`가 소유한 확장(`pgcrypto`·`uuid-ossp`·`pg_stat_statements`)의 함수가 전부 PUBLIC EXECUTE에 기대고 있어 **일부러 실행하지 않았다.**
- ⚠️ **`supabase_admin` 기본 권한은 여전히 열려 있다** — `postgres`가 그 역할의 멤버가 아니라 바꿀 수 없다. 대시보드 SQL 편집기 등 다른 역할로 만든 객체는 열린 채 태어날 수 있으니 **만들었으면 ACL을 조회한다**(`relacl`·`proacl`).
- 상세는 Notion 매뉴얼 ② 「RLS 원칙」과 `supabase/rpc/README.md` 「권한 변경 이력」.
16. **환경변수는 `Deno.env.get('X')!` 로 쓰지 않는다** (2026-08-12 신설)
- `!`는 **타입 단언일 뿐 런타임 검사가 아니다** — 미설정 시 `undefined`가 되어 크래시 없이 조용히 잘못 동작한다(예: `serviceKey=undefined`로 외부 API 호출 → 수집이 소리 없이 실패).
- 값이 없으면 **명시적으로 throw하는 `requireEnv` 헬퍼**를 쓴다.
```ts
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}
```
- 시크릿에 **하드코딩 폴백(`?? '값'`)을 두지 않는다** — 키 로테이션이 무력화되고, 환경변수 미설정 사실 자체가 드러나지 않는다.
- 폴백을 제거하기 전에는 **해당 환경변수가 실제로 등록돼 있는지 먼저 실측**할 것(미설정 상태로 배포하면 수집·웹훅이 즉시 멈춘다).
17. **외부 CDN 스크립트 도입 3조건** (2026-08-13 신설)
- 외부 CDN 스크립트는 다음 **3조건을 전부 충족할 때만** 도입한다. 하나라도 미충족이면 **도입 금지**.
  1. **버전 완전 고정** — `@2.39.7`처럼 패치 버전까지 명시. `@2`/`@2.x`/`@latest` 같은 **범위 지정 금지**(CDN이 조용히 새 버전을 내려주면 우리가 검증하지 않은 코드가 전 사용자에게 배포된다).
  2. **SRI `integrity` 해시 필수** — `integrity="sha384-..."` + `crossorigin="anonymous"`. CDN이 침해되거나 파일이 바뀌면 브라우저가 실행을 거부한다.
  3. **`sw.js` PRECACHE 포함** — 오프라인/캐시 일관성 확보. `index.html`만 캐시되고 스크립트는 매번 네트워크에 의존하면 오프라인에서 앱이 통째로 깨진다.
- 현재(2026-09-28 코드 확인): `index.html`의 외부 스크립트는 둘이다 — 카카오맵 SDK(21행)와 `@supabase/supabase-js@2.112.3`(23행). supabase-js는 3조건을 모두 갖췄다 — ① 패치 버전까지 고정 ② `integrity="sha384-…"` + `crossorigin="anonymous"` ③ `sw.js` `PRECACHE_EXTERNAL`(CDN 장애 때 install 전체가 거부되지 않도록 `PRECACHE`와 따로 `c.add(u).catch`로 담는다).
- ⚠️ **기존 카카오맵 SDK는 3조건을 하나도 충족하지 않는다**(버전 미지정 `sdk.js`, SRI 없음, 프로토콜 상대경로 `//`, PRECACHE 미포함). 소급 적용 대상이나 카카오 SDK는 URL에 버전을 못 박는 방식을 제공하지 않아 1·2번이 구조적으로 불가능 — 신규 도입분에만 이 원칙을 적용하고 카카오는 예외로 둔다.
18. (22 ⑥에 흡수 — 2026-09-28)
19. **구조를 크게 바꾼 파일은 같은 세션 안에서 한 번 다시 읽는다** (2026-09-05 신설 — ⑨ 8-13 반영)
- **발동 조건**: 블록이 이동하거나 삭제된 변경. 값 하나를 고친 것은 대상이 아니다.
- **보는 것 셋**: ① 번호·순서가 이어지는가 ② **표·목록 구조가 일관된가 — 열수·중첩·닫힘** ③ 같은 말이 두 번 있는가.
- 🔴 **행 끝이 닫혔는지만 보지 않는다** — 한 표 블록 안의 모든 행이 **같은 열수**인지를 본다. 닫힘은 행의 끝만 보고, 열수는 행 전체를 본다.
- 🔴 **이것은 검증이 아니다.** 검증은 「의도한 변경이 됐는가」를 보고, 이 절차는 **「의도하지 않은 것이 함께 일어났는가」**를 본다. 축이 반대라 검증을 아무리 촘촘히 해도 이쪽은 안 잡힌다.
- 경위: `docs/history.md` 2026-09-03 · 2026-09-05
- ⚠️ 정본은 **Notion ⑨ 8-13**이다. 어긋나면 ⑨가 이긴다.
20. **DB 함수(RPC·트리거)를 고치기 전에 현재 정의를 `supabase/rpc/`에 먼저 커밋한다** (2026-09-05 신설)
- 🔴 **순서가 전부다.** 고친 뒤에 덤프하면 「변경 전」이 사라져 그 회차의 diff가 영영 안 남는다. 2026-09-05 함수 4개 신설·재생성분이 실제로 그렇게 됐다.
- 🔴 **`supabase/rpc/`는 기록이지 배포 경로가 아니다.** 거기를 고쳐도 DB는 안 바뀐다 — 마이그레이션 러너를 일부러 두지 않았다.
- 🔴 **정본은 DB다.** 어긋나면 DB가 맞고 파일이 낡은 것이다.
- 덤프는 `pg_get_functiondef`(함수)·`pg_get_triggerdef`(트리거 바인딩) 출력을 **손으로 옮겨 적지 말고 그대로** 쓰고, `md5()`로 되받아 대조한다.
- 상세는 `supabase/rpc/README.md`.
21. **상한이 있는 목록은 「먼저 넣고 넘치는 것을 빼낸다」** (2026-09-05 신설 — ⑨ 8-13절 반영)
- 🔴 새 항목을 **맨 위에 먼저** 넣고 → 상한을 넘긴 항목을 아래에서 빼내 `docs/history.md`로 옮긴다.
- 「빼내고 그 자리에 삽입」하면 삽입 위치가 빼낸 자리를 따라가 **정렬이 조용히 깨진다.** 2026-09-05에 **두 회차 연속** 이 실패가 났고, 둘 다 내용 보존·번호 연속 검증은 통과한 상태였다.
- ⚠️ **규칙이 없어서 생긴 것이 아니다** — 이력표에 「새 이력은 맨 위에 쓴다」가 이미 있다. 조항을 더하지 않고 **실행 순서만 뒤집는다.**
22. **회신에는 일곱 항목을 항상 넣는다** (2026-09-05 신설 · 2026-09-28 7항 — ⑦ 「회신 필수 항목」 반영)
- **적용 범위**: Claude Code가 claude.ai에 보내는 **모든 회신**(지시서·요청서·협의서 어느 쪽에 대한 답이든).
- 🔴 **자리** (2026-09-29 — ⑦ 「운영 구조 재편」): 회신은 📬 우편함 회차 페이지 「## 회신」 절에 쓴다 · 착수 때 상태 「작업중」 · 끝나면 「회신 완료」 + PR 칸.
- ① **미확인** — 내 축(내가 못 한 것) / 상대 축(구조적으로 불가)
- ② **범위 밖 발견·제안** — 고쳐야 할 것. 🔴 `zipfit`의 열린 `health-ops`·`health-screen`·`db-apply` 이슈를 **착수·마감 두 번** 보고, 있으면 여기 한 줄(다운님은 GitHub 알림을 받지 않는다 — 2026-09-29 · 병합이 점검을 돌려 회차 도중에 이슈가 생긴다 — #283)
  - 🔴 범위 밖 발견은 **회신 ②로** 낸다 — 작업 제안 카드(spawn_task)를 띄워도 다운님은 누르지 않는다(우편함 경로 · 2026-09-30)
- ③ **지시서와 다른 사실** — 전제·식별자·수치가 실물과 달랐던 것. 🔴 요청의 공고 목록·수치·ID는 **참고값**이다 — 착수 때 실측(폴더 파일 수 · 목록 행 수 · LH 페이지)으로 확정하고, 다르면 여기 적는다
- ④ **실제로 실행한 것** — 수정·배포·push 여부, 브랜치, PR·커밋. 🔴 0도 쓴다(「DB 변경 0 / 코드 변경 0」). 🔴 공고 분석 회차면 🅐 **공고 카드**(스킬 「공고 카드」 · 카드마다 「비교·융합」 칸 — 지난 회차 대비 수치 · 템플릿 형제에 없는 조항 + 정책 행 id · 같은 시군·같은 유형 ㎡당 월임대료, 표본 5 미만이면 쓰지 않음 · 없으면 「없음」)와 🅑 **분석률**(반영 전·후를 ⑨ 5장 산식으로 · 측정 시각 UTC · 「분자 증가분 = 이번에 완료 계열로 닫은 공고 수」 성립 여부 · 분석 없는 회차는 「분자 불변」)을 더한다. 🔴 **「Notion 쓴 곳」 한 줄** — 쓴 페이지·절 이름, 없으면 「없음」(2026-09-30 B67 — 빠지면 보이게)
- ⑤ **claude.ai에게 요청** — 컨테이너 프록시로 못 여는 외부 파일·CDN·Drive 이미지·게시판 첨부는 ⑤로 claude.ai에 넘긴다 — claude.ai는 다운님 브라우저(Playwright)로 연다(⑦ 「상대 축」 2026-09-28)
- ⑥ **위치 표시** — 대주제부터 ✅(완료) 🔵(진행 중) ⏸(보류) ⏭(다음 회차). 🔴 한 회차에서 무엇이 닫혔고 무엇이 열린 채인지가 회신 안에서 드러나야 한다. ⚠️ ⑦의 「Claude Code에게 가는 모든 것은 문서다」·「다운님 몫에는 어떻게를 적는다」는 지시서를 쓰는 쪽(claude.ai)의 규약이라 Claude Code의 행동을 바꾸지 않는다 — 여기 옮기지 않는다
- ⑦ **확장 제안** — 이번 작업에서 **본 것**에서 나온 아이디어 최소 1·최대 3. 칸 여섯(관찰 · 근거(행 id·수치·파일·줄) · 사용자 가치 · 화면이라면 · 필요한 데이터 · 런칭선 앞/뒤). 🔴 근거 없으면 0이 정답이고 「없음」이라 적는다 · 공고 분석 묶음은 **근거 있는 관찰 하나로** 최소 1을 채운다(스킬 v9.2 — 「근거 없으면 0」과 같은 뜻: 관찰이 있으면 근거도 있다) · 🔴 구현하지 않는다(원칙 30) · 백로그·아이디어 모음과 겹치는지 먼저 본다 · ②는 고칠 것, ⑦은 더할 것
- 🔴 **「없음」도 답이다** — 빈칸과 미작성은 구분되지 않는다. 검증 표 항목은 고정하지 않는다(지시서가 그때그때 정한다).
- 🔴 **건수에는 센 곳을 함께 적는다** — 화면에 보이는 것을 묻는 항목이면 모수는 언제나 `get_announcements_deduped()`다. 실측 예시는 여기 싣지 않는다(실측표는 ⑦·⑩).
- 경위: `docs/history.md` 2026-09-05 · 2026-09-15 · 2026-09-23 · 2026-09-28(B52). ⚠️ 정본은 **Notion ⑦**이다. 어긋나면 ⑦이 이긴다.
23. **지시서 범위 밖을 발견했을 때 — 고칠까 보고만 할까** (2026-09-09 신설 — ⑦ 2026-09-03 반영)
- 🔴 **지시서가 명시한 방법을 다른 방법으로 대체하지 않는다.** 예외 없음.
- **범위 밖에서 잘못된 것을 발견하면 아래 두 시험을 둘 다 통과할 때만 고치고 알린다.** 하나라도 아니면 **보고만 한다.**
  - **① 자기완결성** — 판정 근거가 **지시서·코드·DB 실물 안에** 있는가?
  - **② 되돌림 비용** — 되돌리는 것이 **diff 한 줄**인가?
- 🔴 **되돌리기 어려운 것**(삭제·스키마·배포·병합·대량 UPDATE)은 근거가 아무리 확실해도 **멈추고 확인받는다.** 두 시험을 통과해도 예외가 아니다.
- ⚠️ **「명백히」 같은 확신어를 쓰지 않는다** — 두 시험이 그 자리를 대신한다.
- 🔴 **「운영 — 데이터 쓰기」 페이지에 발송기 설정 변경(`analysis_dispatch_config` 스위치·유예·몫)을 섞지 않는다** — 발송기 설정은 코드 페이지에서만 바꾼다(⑦ 2026-10-02).
- 🔴 **DB 함수·RPC·트리거는 지시서 범위 밖이면 고치지 않는다 — 멈추고 보고한다.** 기한이 걸렸으면 회신 맨 위 「범위 밖 적용」에 적고 판정을 받는다(B26 판정 2026-09-25).
- ⚠️ 정본은 **Notion ⑦ 「지시서 밖을 발견했을 때 — 고칠까 보고만 할까」**다. 어긋나면 ⑦이 이긴다.
24. **작업 대상은 저장소 이름이 아니라 작업 디렉터리 경로로 판정한다** (2026-09-15 신설 · **2026-09-16 개정** — ⑦ 「2026-09-16 개정」 반영)
- 🔴 **「`zipfit` 터미널인가」로 묻지 않는다. 「지금 어느 경로에서 작업하는가」로 묻는다.**
- **계기**: ⑦은 두 저장소의 Claude Code 터미널이 다르다고 전제했으나, 2026-09-15 실측에서 **한 컨테이너에 `/home/user/zipfit`과 `/home/user/zipfit-backup`이 함께 클론돼 있고 GitHub 스코프도 둘 다 열려 있었다.** 그래서 「이 터미널이 `zipfit-backup`이면 실행하지 마십시오」 같은 가드가 **판정 불능**이 된다 — 참도 거짓도 아니다.
- ⚠️ 지시서에 이름 기준 가드가 적혀 있어도 **경로로 판정하고 그 사실을 회신 ③에 적는다.** 가드를 무시하는 것이 아니라 판정 가능한 축으로 바꿔 읽는 것이다.
- 🔴 **「한 문서는 한 저장소만」은 2026-09-16에 폐기됐다.** 두 저장소가 한 세션에 함께 붙는 것이 확정 운영이라, 한 장에 두 저장소 작업을 싣는다. 대신 세 줄이 선다.
  - **문서는 하나다** — 저장소마다 지시서를 쪼개지 않는다.
  - **항목마다 대상 저장소를 표식으로 붙인다** — `[zipfit]` / `[zipfit-backup]`. 표식이 없으면 어느 쪽인지 묻는다.
  - 🔴 **회신 ④ 「실제로 실행한 것」은 저장소별로 나눠 적는다.** 커밋 경계는 여기서 지킨다.
- 🔴 **근거는 「터미널이 다르다」가 아니라 「커밋 경계가 다르다」였고, 그 근거는 살아 있다** — 다만 그것이 요구하는 것은 **문서를 쪼개는 것이 아니라 회신을 쪼개는 것**이다(2026-09-16 정정). `zipfit` 쪽은 커밋·PR·병합으로 끝나고 `zipfit-backup` 쪽은 「코드 변경 0」으로 끝나는데, **회신 ④를 저장소별로 나누면 그 둘이 섞이지 않는다.** 한 장으로 묶는 것 자체는 그것을 흐리지 않는다.
- ⚠️ 정본은 **⑦ 협업 규약 맨 아래 「2026-09-16 개정」**이다. 어긋나면 ⑦이 이긴다.
25. (`zipfit-backup` `CLAUDE.md`로 이동 — 2026-09-28)

26. **컬럼을 더한 회차의 렌더 검증은 「매핑을 거친 행」으로 한다** (2026-09-17 신설)
- 🔴 **발동 조건**: DB·RPC에 컬럼을 더하고 화면이 그것을 읽게 한 회차.
- 🔴 **RPC가 돌려주는 것과 화면이 보는 것은 같지 않다.** 그 사이에 RPC 행을 화면 행으로 옮기는 매핑이 있고, **거기에 키를 더하지 않으면 화면은 그 컬럼을 영영 못 본다.**
- 🔴 **검증에 RPC 행을 그대로 렌더 함수에 넣으면 그 매핑을 건너뛴다** — 통과하지만 배포본은 안 된다. 2026-09-17에 실제로 그랬다(`first_announcement_date`·`schedule_varies`가 `zfMapNoticeRows`에 없어 v112 배포본의 `zfNoticeDate`가 늘 `announcement_date`로 떨어졌는데, 회신의 「렌더 실측」은 RPC 행을 직접 넣은 대역이라 통과했다). PR #137도 같은 자리였다.
- **그래서 이렇게 한다**: ① 매핑 함수를 **배포 코드에서 그대로 떠내고** ② 대역은 **fetch/RPC 응답까지만** 두고 ③ 그 응답을 매핑에 넣은 **결과 행**으로 렌더를 돌린다.
- 🔴 **응답을 손으로 옮겨 적었으면 봉합한다** — DB가 계산한 `md5(json_agg(...)::text)`와 파일 md5를 대조한다. 2026-10-02부터 컨테이너에서 Supabase anon REST가 curl로 열려(200) 실 응답을 그대로 중계할 수 있다 — 관리 API로 받은 행을 대역에 옮겨 쓸 때만 봉합이 필요하다.
- 🔴 **봉합 축은 「전 행」이 아니라 「렌더가 읽는 필드」다** (2026-09-17 추가) — RPC 행 전체의 md5는 `updated_at` 처럼 **수집이 매 런 바꾸는 필드**를 품고 있어 회차 사이에 그대로 낡는다(같은 네 공고가 `530e8b8b…` → `b2c21417…`). 그래서 렌더가 실제로 읽는 필드만 골라 **canonical md5**(`string_agg(…, E'\n' order by …)`)로 DB와 대조한다 — 그 축에서는 같은 재료가 `276ab3a8…`로 그대로였다. ⚠️ **필드를 고르는 것은 검증을 느슨하게 하는 것이 아니다** — 렌더가 안 보는 칸이 달라진 것은 이 검증이 답할 물음이 아니고, 전 행 md5는 그 물음을 섞어 **매번 깨지는 축**이 된다.
- ⚠️ **회신에 「어느 경로를 거친 행인가」를 적는다.** 적지 않으면 대역과 실물이 구분되지 않는다.

27. **공고 분석 스킬은 묶음을 시작할 때와 압축 뒤 첫 DB 쓰기 전에 다시 불러온다** (2026-09-23 신설 — B12 조사)
- 공고 분석 묶음(신규 분석·재확인·이미지 연결·그 산물을 고치는 회차 포함)을 시작할 때, 그리고 🔴 **컨텍스트 압축 뒤 첫 DB 쓰기 전에** `zipfit-notice-analysis`(재확인이면 `zipfit-notice-reverify`)를 다시 불러온다.
- 🔴 **이름이 목록에 있다는 것은 본문을 안다는 뜻이 아니다.** 압축은 불러온 스킬 본문을 잘라 낸다 — 2026-09-23 B13 도중 압축 뒤 되살아난 사본 끝에 「skill content truncated for compaction」 표식이 붙어 있었다.
- **제정 사유**: B9에 한 번 불러온 뒤 압축이 두 번 지나갔고, B11은 그 사이 스킬에 있던 조항 넷을 모른 채 반영했다(B12 조사).
- ⚠️ 스킬 본문을 여기 옮기지 않는다 — 정본은 스킬이다. 불러온 사실은 회신 ④에 적는다.

28. **문서는 살아 있다 — 규칙·스킬·포맷·매뉴얼은 판단의 권위가 아니라 지금까지의 판단 기록이다** (2026-09-23 신설 — 다운님 지시, ⑦ 같은 제목 절 반영)
- 스킬·규칙·회신 포맷·Notion 매뉴얼, 그리고 이 `CLAUDE.md` 자신도 **그때까지 내린 판단을 적어 둔 것**이다. 실물(코드·DB·원문)과 어긋나 보이면 **따르기 전에 먼저 의심한다.**
- 어긋남을 찾으면 회신 ②에 **개정·통폐합·신설·삭제** 중 무엇을 제안하는지와 그 근거(어느 실물과 어긋났는가)를 적는다. 조용히 따르지도, 조용히 건너뛰지도 않는다.
- 🔴 **예외 문장을 덧붙여 낡은 조항을 살려 두기보다 고쳐 쓰기·합치기·지우기를 먼저 본다.** 「단,」·「⚠️ 다만」이 쌓인 조항은 읽는 쪽이 본문과 예외 중 어느 것이 지금의 판단인지 가를 수 없다.
- ⚠️ **의심은 멈춤 조건도 대체 권한도 아니다** — 지시서가 명시한 방법은 원칙 23대로 다른 방법으로 바꾸지 않는다. 이 원칙의 몫은 의심한 것과 그 근거를 회신에 남기는 것이다.
- ⚠️ 정본은 **Notion ⑦**이다. 어긋나면 ⑦이 이긴다.

29. **RPC·DB 함수 변경의 검증은 그 함수를 실제로 부르는 역할의 조건으로 잰다** (2026-09-25 신설 — H1)
- 🔴 **재는 조건은 셋이다** — 그 함수를 부르는 역할(화면 목록이면 `anon`) · **그 역할의 `statement_timeout`** · **전 컬럼**. 한도는 적어 두지 않고 그때 조회한다(`pg_roles.rolconfig`).
- 🔴 **postgres 대조와 화면 대역은 시간 한도를 타지 않는다** — 둘 다 「결과가 같은가」에는 답하지만 「그 역할의 한도 안에 끝나는가」에는 답하지 못한다.
- 잰 시간이 **한도의 1/3을 넘으면 `EXPLAIN ANALYZE`**로 계획을 본다.
- **적용 뒤에는 공개 REST(anon 키)로 200과 행 수를 확인한다.**
- **제정 사유**: B30이 `get_announcements_deduped()`를 바꾼 뒤 비로그인 목록이 anon `statement_timeout`에 걸려 HTTP 500으로 비었다(H1). B30 검증은 postgres 대조와 RPC 응답을 막은 화면 대역뿐이라 통과했다.

30. **Claude Code도 ZipFit의 총괄이다 — 요청받은 것 너머를 보되, 사실과 제안을 섞지 않고 승인 없이 구현하지 않는다** (2026-09-28 신설 — B52, 다운님 확정. claude.ai 쪽 정본은 Notion L0 절대원칙 14)
- **총괄로 본다** — 총괄·데이터·개발·디자인·마케팅·CS·운영을 함께 생각한다. 작업을 마칠 때 **그 결과로 무엇을 얻었고, 무엇과 이을 수 있고, 어떤 기능·화면으로 이어지는지**를 한 번 더 본다. 그 결과는 회신 ⑦ 「확장 제안」에 담는다(원칙 22).
- 🔴 **사실과 제안을 섞지 않는다** — DB에는 원문에 있는 것만 넣는다(공고 분석 스킬 그대로). **원문 = 공고문 + 같은 공고의 공급기관 공고 페이지(LH·SH·지방공사)** · 공고 페이지 값은 출처를 밝혀 쓴다(다운님 2026-10-02 · L0 원칙 3 · 2026-10-06 LH 밖 공급기관으로 넓힘). 제안은 회신 ⑦·백로그 후보에만 산다. 제안을 정책 행·`extra_note`·`verification_requirements`·코드 주석에 쓰지 않는다.
- 🔴 **제안은 승인 없이 구현하지 않는다** — 지시서·요청서가 명시한 것만 만든다. 「작아서」·「명백해서」는 예외 사유가 아니다(원칙 23의 두 시험은 **잘못된 것을 고치는** 자리에만 선다).
- 🔴 **우회로를 짜기 전에 「도구가 있으면 끝나는가」를 먼저 묻는다** — 스킬·MCP·에이전트·연동이 필요하면 다운님께 말한다(설치·연결은 다운님 몫). 찾을 때는 GitHub의 별 많은 저장소부터 본다. 요청할 때는 **무엇이 · 왜 · 없으면 무엇을 대신 하는지**를 한 줄씩 적는다.
- ⚠️ 이 원칙은 권한을 넓히지 않는다 — 되돌리기 어려운 것(원칙 13 예외·원칙 23)은 그대로 멈추고 확인받는다.

31. **Edge Function은 직접 배포하지 않는다 — `main` 병합이 배포다** (2026-09-29 신설 — 배포 자동화 회차)
- `supabase/functions/**`를 고친 PR을 병합하면 `.github/workflows/deploy-functions.yml`이 **바뀐 함수만** 하나씩 배포한다. 🔴 병합 뒤 Actions 결과(성공 · 새 버전)를 회신 ④에 적는다.
- 되돌리기는 이전 커밋으로 되돌린 PR, 또는 `workflow_dispatch`로 함수 하나를 재배포한다.
- `verify_jwt`의 정본은 `supabase/config.toml`이다(배포 뒤 워크플로가 관리 API 값과 대조해 다르면 실패). 🔴 허용 목록 밖 함수(`fetch-attachment-probe` · `upsert-announcement`)는 배포하지 않는다 — 새 함수를 배포하려면 워크플로 `ALLOWED`·dispatch 선택지·`config.toml`을 같은 PR에서 고친다.
- 토큰은 Actions Secret `SUPABASE_ACCESS_TOKEN`만 쓴다(저장소 설정은 다운님 몫).

32. **DB 스키마·함수 변경은 적용 SQL 파일 + PR 병합으로만 — 관리 API로 운영 DB에 DDL을 직접 보내지 않는다(데이터 쓰기는 종전대로)** (2026-09-30 신설 — 우편함 「운영 — DB 함수·스키마 변경도 PR 병합 = 적용」)
- `supabase/migrations/YYYY-MM-DD_NN_이름.sql`에 쓰고 PR을 연다 → `db-migrations.yml` check가 **되돌리기 전용** 트랜잭션으로 실제 DB에서 돌린다(스키마 지문 전후 같음 · 불변식 v3.8 · `anon` 3초 · 함수 정의 md5 = `supabase/rpc/` 사본 · ACL·SECURITY DEFINER = 파일 선언). 🔴 **빨간 체크의 PR은 병합하지 않는다.**
- 병합하면 apply가 **아직 기록 안 된 파일만** 파일마다 한 트랜잭션으로 적용하고 `zipfit_ops.schema_migrations`에 같은 트랜잭션으로 기록한다. 🔴 병합 뒤 Actions 결과(적용 · 대조)를 회신 ④에 적는다. 실패하면 `db-apply` 이슈.
- 파일 규칙(트랜잭션 제어 금지 · 함수 선언 줄 · 사본 갱신)은 `supabase/migrations/README.md`가 정본이다. 원칙 20(고치기 전 정의 먼저 커밋)은 그대로다.
- 🔵 **`check`는 모든 PR에서 결과를 낸다**(2026-09-30 · PR #281) — DB 파일(다섯 경로)을 안 건드린 PR은 「해당 없음」으로 즉시 통과(DB 호출 0). `main` 필수 체크는 **다운님 저장소 설정 뒤** 켜진다 — 그 전에는 결과만 나고 병합을 막지 않으니 원칙대로 초록을 보고 병합한다.
- 🔵 **사본 = DB는 매시 검사된다**(2026-09-30) — `health-ops`가 public·`zipfit_ops` 함수 전수 「DB 정의 md5 = `supabase/rpc/` 사본(`zipfit_ops`는 `supabase/rpc/zipfit_ops/`)」을 읽기만 해서 대조한다(`migrate.py`와 같은 규칙 · 끝 줄바꿈 무시). 사본 없는 새 함수·함수 없는 사본도 실패 → `health-ops` 이슈.
- 🔴 **긴급 되돌리기** — 이전 정의로 되돌리는 새 마이그레이션 PR(적용된 파일은 고치지 않는다). 화면이 멈춘 급한 경우만 다운님 확인 뒤 관리 API로 직접 보내고, 같은 SQL을 곧바로 이 경로로 저장소에 올린다.

33. **화면 문구 갈래를 바꾸는 회차는 `health-screen` 판정표를 같은 PR에서 고친다** (2026-09-30 신설 — 이슈 #283)
- 대상: 카드 요약 자리(`[data-sum-for]`)의 문구를 더하거나 바꾸는 변경 → `.github/health/screen-check.mjs`의 `phraseOf`(화면 문구 → 갈래)와 DB 기대값(갈래 계산 SQL).
- 계기: ④ 링크에 둘째 문구(「같은 게시물에 올라왔어요」)를 더한 회차가 판정표를 안 고쳐, 배포 직후 점검이 「알수없음」으로 실패했다(PR #282 → 이슈 #283).

---

## 🔗 주요 링크

| 항목 | URL |
|---|---|
| 배포 | https://kkokzip.com |
| GitHub | https://github.com/dauntown96/zipfit |
| Supabase | https://supabase.com/dashboard/project/khdpjjyspmlqtzperoqg |
| 노션 시작점 | 🏠 L0 — https://www.notion.so/3b48aaa7e15581f88981d0c636de780c |
