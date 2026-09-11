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
| 할 일·미결·보류 (**유일한 정본**) | [📋 백로그 DB](https://www.notion.so/7786386dbb054269bdff55033aafe19e) |
| 판단이 뒤집힌 경위 | [⑧ 판례집](https://www.notion.so/3b48aaa7e15581c0bcd7d3c8868df713) |
| 3자 분장·git·지시서·병합 규약 | [⑦ 협업 규약](https://www.notion.so/3b48aaa7e155816ea873d4c3f006510a) |
| 어디를 봐야 할지 모를 때 | [⑨ 라우팅 규약](https://www.notion.so/3b98aaa7e155812686b6ff3d11ea43fa) — 5장 검색 키워드 사전 |

⚠️ **헤더에 출처(⑦·⑨ 등)를 밝힌 코딩 원칙은 전부 그 문서의 요약 사본이다. 어긋나면 정본이 이긴다.** 🔴 **각 조항 헤더의 반영 시점이 그 조항의 유효기간이다** — 그보다 뒤에 정본이 바뀌었으면 그 조항은 낡은 것이다. 번호를 여기 나열하지 않는다(조항이 늘 때마다 이 줄이 또 낡는다).

---

## 📍 프로젝트 개요

- **서비스명**: ZipFit — 전국 공공임대·분양 공고 맞춤 매칭 서비스
- **배포 URL**: https://dauntown96.github.io/zipfit
- **GitHub**: https://github.com/dauntown96/zipfit (main 브랜치 push → 자동 배포)
- **구조**: 단일 파일 (`index.html`) — 빌드 없음, 정적 배포
- **대상**: 한국 공공주택 청약·임대 신청자, 모바일 우선 (max-width: 720px)

---

## 🛠 기술 스택

| 영역 | 내용 |
|---|---|
| 프론트엔드 | HTML/CSS/JS 단일 파일 (index.html) |
| 공고 데이터 | Supabase RPC `get_announcements_deduped()` |
| 데이터 수집 | **LH·MYHOME**: Edge Function `collect-announcements` + pg_cron **3잡 · 하루 63회**(전부 UTC) — jobid 4 `*/10 0-9 * * *`(KST 09:00~18:50, 10분 간격 60회) · jobid 12 `40,50 23 * * *`(KST 08:40·08:50 워밍) · jobid 13 `0 18 * * *`(KST 03:00 야간 1회). 셋 다 active이고 명령문이 동일하다. 🔴 **야간을 걷고 주간에 몰아준 것이다**(2026-09-08 — 60일 실측 신규 공고가 KST 09~18시에 99.6%, 20~08시에 0건. 변경 전 `*/20` 72회 중 45회가 신규 0건 구간에서 돌았다) / **SH**: Edge Function `collect-sh-announcements` + pg_cron(jobid 8, `0 0,3,6,9 * * *` UTC = 09/12/15/18시 KST 4회) |
| 사용자 프로필 | Edge Function `save-user-profile` (GET/POST, **`verify_jwt=true`**, 식별자는 JWT의 `auth.uid()` — 이메일 기반 식별은 2026-08-13 폐기, CORS는 `https://dauntown96.github.io` 고정) |
| 공고 첨부 수신 | Edge Function `fetch-attachment` — URL 하나를 받아 ① 그 바이트를 base64로 돌려주거나 ② `mode=upload`면 **Google Drive에 직접 올린다**(2026-09-10 추가). DB 쓰기 없음. **왜 필요한가**: 컨테이너 egress 프록시가 `apply.lh.or.kr`·`i-sh.co.kr`·`housing.seoul.go.kr`를 403으로 막고, `pg_net`은 `net._http_response.content`가 `text`라 바이너리가 깨진다(878,331B → 109옥텟). 🔴 **업로드가 붙은 이유는 놓는 쪽이 막혀 있었기 때문이다** — ①의 base64가 Drive에 닿으려면 모델 출력(도구 파라미터)을 거쳐야 해서 31,587B가 11,352B로 조용히 잘렸다. ②는 그 구간을 아예 타지 않는다(파일이 Supabase 안에서 LH → Drive로 바로 간다). 🔴 **호출자가 준 URL로 나가는 유일한 EF라 허용목록이 범위 장치다** — 호스트 4개에 더해 LH는 `/lhapply/` 경로까지 좁혔다. 🔴 **거기에 `oauth2.googleapis.com`·`googleapis.com`을 넣지 않는다** — 이 목록은 *호출자가 준 URL*과 리다이렉트 홉만 검사하고 Drive·OAuth 호출은 상수 URL로 따로 나가므로, 넣으면 가드가 넓어지기만 한다(2026-09-10 판정, ⑧ 판례). 리다이렉트는 `redirect: 'manual'`로 홉마다 재검사한다. 운반 상한 `MAX_SOURCE_BYTES = 6,000,000`(초과 시 본문 없이 메타데이터와 `reason`만, **업로드 경로도 동일**). `verify_jwt=false` + Vault `cron_secret_v2`의 `x-cron-secret`. 🔴 **폴더는 `mode=ensure_folder`로 먼저 확보하고 `mode=upload`에 `folder_id`로 넘긴다**(2026-09-10 추가) — `folder_id`가 오면 upload는 폴더를 찾지도 만들지도 않아 check-then-act가 사라진다. 안 넘기면 종전대로 동작하되 응답에 `warning`과 `folder_source:'ensured'`가 붙는다. ⚠️ **동시 호출에서 갈리는 창은 `createFolder` 왕복 약 700ms이고 동시 발사 지터(200~300ms)보다 넓다** — 그래서 「거의 동시」가 아니라 사실상 매번 갈린다(2026-09-10 실측, 첫 사고 211ms·재현 290ms). 인덱스 지연은 관측되지 않았다(≈1.2초·≈11초 간격에서 모두 찾음). **업로드 규약**: 앱 소유 루트(`GDRIVE_ROOT_FOLDER_ID`) 아래 `[임시] <announcement_id>` 폴더 · 원본 MIME 유지(Google 형식 변환 없음) · 중복은 Drive `sha256Checksum` 대조 후 기본 skip이고 이름이 같은데 내용이 다르면 `conflict`로 멈춘다(`on_dupe=replace`로만 덮어쓴다). ⚠️ **scope가 `drive.file`이라 앱이 만든 것만 접근된다** — 기존 Drive 공고 폴더에는 넣을 수 없다(권한이 아니라 scope 문제). ⚠️ **`gdrive_client_id`·`gdrive_client_secret`·`gdrive_refresh_token`은 EF 환경변수가 아니라 DB Vault에만 있다** — 코드가 env 우선 · Vault 폴백으로 읽는다. ⚠️ **`fetch-attachment-probe`는 폐기됐다** — 기능을 들어내 410만 돌려주며, 슬롯 삭제는 다운님이 대시보드에서 한다 |
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

- 조회 방법: `net.http_get()`로 `UPP_AIS_TP_CD`를 하나씩 바꿔가며 `PG_SZ=1`로 호출 → `dsList` 비어있는지/`ALL_CNT` 확인. `collect-announcements`의 `fetchNoticeList()` 카테고리 루프(`for (const tp of [...])`)와 항상 대조.
- **MYHOME(`HWSPR02/rsdtRcritNtcList`) 특성**: 카테고리 파라미터 자체가 없어(`fetchMyHome()`가 항상 전량 수집, 페이지네이션 캡 2000건으로 충분) 우리 쪽 수집 파라미터 문제는 없음. 다만 MYHOME 자체 데이터셋이 LH보다 훨씬 작음(2026-07-12 기준 totalCount=270, 고유 공고 약 130건, 약 1년 롤링 윈도우) — LH가 지역본부별로 훨씬 많은 개별 공고를 올리는 반면 MYHOME은 그 중 일부만 큐레이션해서 보여주는 구조로 추정됨. **"LH만 있음" 그룹이 훨씬 많은 것(296 vs MYHOME만 36)은 우리 수집 로직 버그가 아니라 두 소스의 태생적 커버리지 차이**(LH 샘플 20건 전수를 MYHOME API에 직접 대조해 전부 없음을 확인).
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
diagnose() / matchHouses() / renderMatchResults(lvl)
```

---

## 🕘 최근 작업 이력 (최신 3건)

🔴 **전체 이력은 [`docs/history.md`](docs/history.md)에 있다.** 아래는 직전 맥락 전달용 발췌가 아니라 **이 3건이 여기 있는 것 자체가 정본**이며, `docs/history.md`와 중복되지 않는다.
🔴 **새 이력은 `docs/history.md` 맨 위에 쓴다.** 여기에 쌓지 않는다 — 그러면 다시 518KB가 된다.

| 날짜 | 내용 |
|---|---|
| 2026-09-11 | **공개 키로 부를 수 있던 쓰기 함수 2개의 EXECUTE 회수 + DB 권한 지도 조사**(🔴 **DB 권한 변경 1회(REVOKE 2 · GRANT 2) · `supabase/rpc/README.md` 1개 수정 · PR #54 병합(병합 커밋 `de4801e`) · DDL 0 · 함수 본문 변경 0 · 데이터 쓰기 0 · EF 배포 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · Notion ⑩ 수정**). ① 🔴 **RLS가 함수 안에서는 발동하지 않는다.** `bulk_set_revision_note`·`bump_detail_fetch_fail`은 둘 다 `SECURITY DEFINER`인데 본문에 역할 검사가 없어 정책을 통과하지 않고 `announcements`를 직접 쓴다. 그런데 anon EXECUTE가 열려 있어 **공개된 anon 키만 있으면 `/rest/v1/rpc/`로 부를 수 있었다** — 앞의 함수는 화면 「정정사유」에 임의 문구를 써 넣고, 뒤의 함수는 상세조회 우선순위를 흔든다. ② **선확인 3개가 전부 통과해서 실행했다** — 호출자는 `collect-announcements` 하나이고 `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`로 부른다(배포본 v39 원문 확인). `index.html`·`sw.js`·cron 명령문·다른 함수 본문·뷰 어디에도 두 이름이 없다(값으로 전수 검색). service_role은 회수 전에도 명시 GRANT를 갖고 있었다. ③ **검증 V-A1~V-A3·V-A5 통과.** 회수 후 anon·authenticated false · service_role true이고, `set local role anon`으로 부르면 `permission denied for function`, `service_role`로는 빈 배열 호출이 성공한다. 실행 전후 `announcements` 2,644행 · `revision_note` non-null 105 · `detail_fetch_fail_count` 합 47 · 시도 이력 427이 전부 같다. ④ 🔴 **덤프 파일은 권한을 담지 않는다.** `pg_get_functiondef()`가 ACL을 출력하지 않아 `supabase/rpc/`의 `.sql` 어디에도 GRANT 줄이 없다 — **파일만 봐서는 누가 부를 수 있는지 알 수 없다.** 그 사실과 조회 SQL, 이번 변경·되돌리기 SQL을 README에 적었다. 두 `.sql` 파일은 손대지 않았고 DB 정의와 md5가 여전히 같다(`39d1f320…`·`dbd2fd1a…`). ⑤ 🔴 **원인은 기본 권한이다** — `pg_default_acl`에서 `postgres`·`supabase_admin` 두 역할이 `public` 스키마 기본으로 anon·authenticated에 테이블 `arwdDxtm` · 함수 `X` · 시퀀스 `rwU`를 준다. 새 객체가 매번 열린 채 태어나고, 지금까지 스냅샷·`_bak`·`urban_worker_monthly_income`이 전부 손 REVOKE로 좁혀졌다. ⑥ 🔴 **그런데 우리가 바꿀 수 있는 것은 절반뿐이다** — MCP `execute_sql`은 `postgres`로 돌고(`current_user`=`session_user`=`postgres` 실측), **`postgres`는 `supabase_admin`의 멤버가 아니다**(`pg_has_role` false). `supabase_admin` 쪽 기본 권한은 이쪽에서 손댈 수 없다. ⑦ **기존 객체는 기본 권한과 별개다** — 생성 시점에 실제 GRANT로 굳어 `relacl`에 박히므로 기본 권한을 바꿔도 이미 있는 16개 테이블은 하나도 안 바뀐다. 반대 방향도 확인됐다: `urban_worker_monthly_income`은 기본이 여전히 `arwdDxtm`인데 `anon=rm`으로 남아 있다. ⑧ 🔴 **트리거 함수의 EXECUTE는 발화 시점에 검사하지 않는다** — 임시 테이블에 `update_updated_at()`을 걸고 EXECUTE를 전부 회수한 뒤 anon으로 UPDATE 했더니 **성공했고 트리거도 발화했다**(트랜잭션 롤백으로 확인, 남은 흔적 0). `CREATE TRIGGER` 때 한 번 볼 뿐이다. 그래서 트리거 함수 5개의 anon EXECUTE는 회수해도 안전하다. ⑨ 🔴 **`announcements`를 로그인 사용자로 읽으면 0행이다** — SELECT 정책의 roles가 `anon` 하나라서다. `document_templates`도 같고, 나머지 12개 테이블은 anon·authenticated가 같은 수를 본다. 지금 드러나지 않는 것은 **프론트의 데이터 조회가 전부 anon 키로 나가기 때문**이고, 세션 토큰을 쓰는 곳은 `saved_announcements` 세 곳과 `save-user-profile` EF뿐이다. 「로그인했으니 토큰으로 보내자」로 한 줄만 바꾸면 공고 목록이 에러 없이 통째로 빈다. ⑩ **`collection_run_log`는 RLS가 켜져 있고 정책이 0개라 GRANT가 열려 있어도 anon·authenticated 둘 다 0행이다** — 의도된 상태다. ⑪ **시퀀스 7개 전부 anon이 USAGE·SELECT·UPDATE를 갖는다.** 테이블 쓰기는 RLS가 막지만 `setval`로 값을 흔드는 경로는 남는다. **실제로 부르지 않았다** — `nextval`은 롤백되지 않아 상태를 바꾸기 때문이고, 권한 조회로만 확인했다. ⑫ **노출 면 관측**: `public`에 뷰·머티리얼라이즈드 뷰 0개 · storage 버킷 0개 · `graphql_public`에는 `graphql` 함수 하나뿐. ⑬ **EF 7개 중 DB를 쓰는 5개가 전부 service_role 클라이언트다**(`collect-announcements`·`collect-sh-announcements`·`collect-rental-stats`·`save-user-profile`·`upsert-announcement`). ⑭ **하지 않은 것**: 두 함수 외의 어떤 GRANT·REVOKE·`ALTER DEFAULT PRIVILEGES`도 실행하지 않았다 · 함수 본문·SECURITY 속성·volatility 미변경 · 테이블 SELECT 미회수 · 수집 EF 수동 호출·cron 미접촉 · `eligibility_criteria_bak_20260908` DROP · 백업 관련 작업 · 모바일 넘침 등 표시 항목. ⑮ **미확인**: V-A4(다음 정기 수집 런의 권한 오류 0건) — 마지막 런이 KST 18:50이고 다음 런은 **2026-09-12 03:00 KST**(jobid 13)라 회신 전에 오지 않는다 · Supabase 대시보드 SQL 편집기가 어느 역할로 도는지(컨테이너에서 잴 수 없다) · `apply_migration`의 실행 역할(마이그레이션 행을 남기게 되어 시험하지 않았다) · `data_categories`·`category_discovery_log`·`scoring_criteria`의 소비처(검색 0건이라는 음성 증거뿐이라 「없다」로 확정하지 않는다). |
| 2026-09-11 | **표시층 B부 — 임대조건 중립 표기 · 혼인상태 「해당 없음」 · 축별 문구에서 개수 제거**(🔴 **`index.html`·`sw.js` 2개 수정 · 커밋 1개 · PR #52 병합(병합 커밋 `bfcb566`) · `CACHE_NAME` v84→v85 · DB 쓰기 0 · DDL 0 · RPC 0 · EF 배포 0 · Notion ⑩·⑤ 수정**). ① 🔴 **B-1 — 하드코딩 라벨이 맞는 행은 1,127행 중 502행뿐이었다.** `renderHousingUnitRow`가 두 임대조건에 「1순위 · 2·3순위」를 박고 있었는데, `deposit_priority1`이 채워진 30공고 1,127행을 전수로 가르면 이원화 원인이 최소 5개 축이다 — 청년매입임대 순위 502행 · 신혼신생아Ⅱ 전세형의 소득 80% 초과 255행 · 영구임대 가군/나군 14행 · 행복주택 청년의 소득 유무 5행 · 국민임대 수급자 1행 · **원인 미상 350행.** ② 🔴 **260행은 이름이 값과 반대였다** — `priority1` 쪽이 기본보다 **비싼** 조건인 행이 정확히 260행이고, 화면은 그것을 「1순위」라 불렀다. ③ **중립 표기로 바꿨다**(다운님 결정) — 기본 조건을 먼저, `priority1`을 다음에 「또는」으로 잇고 「어느 조건이 적용되는지는 비고·공고문에서 확인하세요」 한 줄을 붙였다. 원인 라벨 컬럼 신설·백필은 2차 소탕 2단계다. ④ 🔴 **지시서와 다른 사실 — ⑧ 규칙이 지목한 자리는 `extra_note`가 아니라 `supply_form`이다.** 원문은 「`deposit_priority1`/`rent_priority1`을 반드시 채우고, `supply_form`에 이원화 원인을 명시한다」인데 그 컬럼은 `eligibility_criteria`에 있어 **공고×순위 단위**다. 세대 행 하나의 두 조건을 라벨링할 자리가 아니고, 30공고 중 11공고는 `eligibility_criteria` 행이 0개다. ⑤ **원인 단서의 분포**: `extra_note`가 어느 쪽이 무엇인지 말하는 행 380 · `supply_form`에 순위는 있으나 컬럼 매핑이 없는 행 228 · 단서 없음 519. **같은 축 안에서도 공고마다 적은 쪽이 다르다** — 대전·부산 청년매입임대는 기본 쪽(「청년일반: …」)을, 경남은 `priority1` 쪽(「수급자: …」)을 적었다. 추출식 하나로 라벨을 뽑으면 여기서 뒤집힌다. ⑥ **B-2 — `single`(해당 없음 · 혼인 중이 아님)을 두 `<select>`에 넣었다.** 원문 요건 표현이 「혼인 중이 아닐 것」이라 라벨을 그렇게 잡았다(claude.ai 결정). `condMap`에 키를 명시했고 `CHILD_SCORE_MARITALS`는 건드리지 않았다. ⑦ 🔴 **EF·DB 변경이 0인 근거를 먼저 쟀다** — `user_profiles`에 CHECK 제약이 **하나도 없고**(테이블 전체), `save-user-profile`의 `FIELD_MAP.marital`이 `toTextOrNull`이라 **허용목록 자체가 없다.** 저장된 프로필은 1행(`married_7`)이라 백필 대상도 0이다. ⑧ 🔴 **`marital`은 자격 판정에 전혀 쓰이지 않는다** — 값 6종을 각각 검색한 결과 소비처는 세 곳뿐이고(`CHILD_SCORE_MARITALS` · `condMap` · 저장 payload) `moneyOk`·`ageStateFor`·`matchHouses` 어디에도 없다. 그래서 미혼자가 「혼인가구(기타)」를 골라도 판정 결과는 한 건도 바뀌지 않았고, 남은 문제는 저장값 하나였다. ⑨ **B-3 — 한 화면에서 「유형」이 셋을 가리켜 숫자가 갈렸다.** 축별 문구는 `criteria` 기준 행을, 「신청 가능한 주택 유형」 목록은 판정을 통과한 기준 행을, 유형 칩은 고유 `housing_type`을 센다. 실측 1인·소득 300만·자산 2억·1998 입력에서 **10·9·8·5**가 동시에 떴다. ⑩ **개수를 빼고 모집단을 `judgeRows`로 맞췄다**(다운님 결정) — 「소득 450만원 — 소득 기준을 충족하는 유형이 있어요 (가구원수 2인 기준, 유형별 한도 최대 939만원)」. 🔴 **(가) 모집단 교정만으로는 숫자가 맞지 않는다**는 것을 먼저 재고 보고했다 — 2인·450만 입력에서 10이 8로 줄 뿐 목록 6·칩 5와 여전히 다르다. ⑪ **`judgeRows` 정의를 판정부에서 문구부 위로 올렸다** — 충족 여부와 한도 최대값이 같은 모집단에서 나오게 하기 위해서다. 자동차 「모름」 문구의 한도 범위도 같은 모집단으로 옮겼는데, 빠지는 2행의 `car_limit`이 둘 다 NULL이라 **오늘 값으로는 문자열이 그대로다**(3,620만원~4,542만원). ⑫ **C-1 `extractRegionTop` 삭제** — 값으로 재검색해 참조 0을 확인한 뒤 지웠다. 직전 회차가 「범위 밖 변경 때문에 0이 됐다」며 남겨 둔 것을 이번에 닫았다. ⑬ 🔴 **C-2 — 기각된 가설이 사용자 문구로 살아 있었다.** 「지역본부마다 가점 평가항목 구성이 다를 수 있어요」는 ⑧ 「기각된 가설 3건」②가 2026-07-02 원본 PDF 재대조로 기각한 전제다. **새 제도 주장을 넣지 않고** 「청약저축 납입횟수·거주기간·장애인 항목 등은 ZipFit이 계산하지 않아요」로 바꿨다 — 코드가 계산하지 않는다는 사실만 말한다. ⑭ **검증 V1~V8 전부 통과.** V2는 축이 다른 세 공고의 실제 DB 행으로 `renderHousingUnitRow`를 **그대로 떼어내** 렌더했고(두 금액이 DB 값 그대로 · 금지어 0 · 비고 불변), V4는 헤드리스 Chromium으로 실제 페이지를 띄워 「해당 없음」 결과가 「혼인가구(기타)」와 **문자열 동일**하고 저장 payload가 `marital='single'`임을 확인했다. V6은 「충족하는 유형이 있어요」 출현이 `judgeRows` 축별 통과 행 1개 이상과 정확히 일치함을 입력 5종으로 봤다. ⑮ ⚠️ **V1·V5·V7을 문자열 그대로 통과시키려고 내 주석 세 곳을 고쳐 썼다** — 경위를 설명하려고 옛 라벨·옛 문구를 주석에 인용했더니 grep에 걸렸다. 직전 회차와 같은 일이다. 경위는 이 이력에 둔다. ⑯ **원칙 19 재읽기에서 한 가지를 잡았다** — `extractRegionTop` 삭제가 다음 섹션 헤더 앞 빈 줄까지 함께 지워 관행이 깨져 있었다. 되돌렸다. ⑰ **하지 않은 것**: 라벨 컬럼 신설·백필 · `extra_note` 내용·표시 · 2636행 청약통장 문구 · `REGION_SCOPE` · status 8곳 · 취소공고 그룹 · `CHILD_SCORE_MARITALS`·EF·`user_profiles` · 「신청 가능한 주택 유형」 목록과 칩 자동선택의 계산 방식 · `zipfit-backup` 접근. ⑱ **미확인**: 실제 배포본 육안 동작(로컬 재현·헤드리스로 갈음, 다운님 몫) · 519행의 실제 이원화 원인(DB에 단서가 없고 `apply.lh.or.kr`이 프록시 403이라 원문 확인 불가) · 📋 공고 분석 로그 140,101자의 전문(정정 84곳의 앞뒤 220자만 훑었다). |
| 2026-09-11 | **표시층 ① 틀린 표시 3건 — 지역 칩 · 자격기준 중복제거 키 · `docs/history.md` 표 복구**(🔴 **`index.html`·`sw.js`·`docs/history.md` 3개 수정 · 커밋 2개(코드/이스케이프 분리) · PR #50 병합(병합 커밋 `e5717c2`) · `CACHE_NAME` v83→v84 · DB 쓰기 0 · DDL 0 · RPC 0 · EF 0 · Notion ⑤ 수정**). ① **A-1 — 설정·추천 지역 칩이 `region`을 다시 파싱하고 있었다.** `extractRegionTop(r.region)`을 `r.region_top`으로 바꿨다. 🔴 **어긋나는 행이 실측 83행이다 — 지시서는 15행이라 했다.** 가장 큰 것이 `region='서울'`인 73행이고, 칩이 19개에서 17개로 줄면서 「서울」(「서울특별시」와 중복)과 「전라남도」(통합 전 명칭)가 사라진다. ② 🔴 **A-1을 한 줄만 고치면 조용한 퇴행이 생겨 같은 값을 보는 곳을 하나 더 고쳤다**(범위 밖, 원칙 23 두 시험 통과). 칩이 `region_top`이 된 뒤에도 맞춤 추천 필터(1822행)는 `extractRegionTop(n['지역'])`으로 되짚고 있어, 저장된 「서울특별시」가 그 73행을 통째로 걸러낸다. `noticeData`가 이미 `'지역대분류': r.region_top`을 담고 있었고 **소비처가 0이었다.** RPC의 `p_region`도 `region_top`과 대조하므로(`bl.best_sido = p_region` 또는 같은 CASE 식) `matchHouses()`가 제 값을 넘기게 되는 것도 같은 변경이다 — 종전에는 「서울」 칩이 `p_region='서울'`로 나가 0건을 받았다. ③ ⚠️ **`extractRegionTop` 정의를 지우지 않았다.** 지시서는 「참조가 0이 되면 함수 정의도 지운다」였으나, 0이 된 것이 ②의 범위 밖 변경 **때문**이라 되돌림이 한 줄로 끝나도록 남겼다. 현재 참조 0·정의 1이다. ④ 🔴 **A-2 — 지시서 전제가 렌더 경로와 달랐다.** 지시서는 「`*_birth1/2`·`age_min`·가산 2개가 키에 없어 그 값만 다른 형제 행이 접혀 사라진다」였는데, **아코디언은 그 컬럼들을 애초에 그리지 않는다.** 그리지 않는 값만 다른 두 행은 화면에서 완전히 같아 보이므로 접는 것이 맞고, 같은 지시서의 원칙(「키 = 화면에 그리는 필드 전부」·「`select`에 있지만 렌더되지 않는 컬럼은 키에 넣지 않는다」)이 그것을 지시한다. **원칙을 따르고 전제를 버렸다.** ⑤ **실제 누락은 다른 둘이었다** — `income_limit_exempt`·`asset_limit_exempt`가 **그려지는데 키에 없었다.** 넣어서 7개 → 9개가 됐다. ⑥ **키를 배열 하나(`ELIG_RENDER_FIELDS`)로 모아 렌더 바로 위에 뒀다.** 한 배열에서 키와 렌더를 **둘 다** 만들지는 못했다 — 렌더가 필드마다 서식이 달라(배제 표기가 금액을 *대신*하고, 맞벌이가 소득과 한 줄로 묶인다) 1:1 사상이 아니다. V-A4로 두 목록이 같음을 본다. ⑦ **V-A3 실측: 지금 갈리는 쌍이 0건이다.** 공고별 296행 116그룹에서 ⑤로 되살아날 행도, 지시서 전제대로 미렌더 컬럼까지 넣었을 때 늘어날 행도 **둘 다 0**이다. 실제 3개 그룹으로 대조해 수정 전후 표시 행 수가 같음을 확인했다(19/19 · 17/17 · 7/7 — 서울대방 그룹은 14행이 7행으로 접히고 새 키도 똑같이 접는다). 화면은 그대로이고 키가 앞으로 맞는다. ⑧ 🔴 **A-3 — 직전 회신이 보고한 7행 중 2행이 오탐이었다.** 20·21행은 이미 `\|`로 이스케이프돼 있었고, 제가 **원시 `\|`를 세서** 걸린 것이다. 비이스케이프 기준으로 다시 세면 **5행(46·140·201·203·214), 내용 `\|` 21개**다. ⑨ **경계를 못 가른 행은 없다** — 다섯 행 전부 경계 `\|`가 정확히 0·13·끝 세 곳이고(`\| ` + 10자 날짜 + ` `), 나머지는 전부 백틱 코드 안이다(`r.sbd \|\| r.scdl` 꼴의 JS·정규식·`'SH_'\|\|seq`). 그 21개만 바꿨다. ⑩ **V-A6이 바이트로 증명한다** — 추가한 백슬래시만 되돌리면 커밋 전 파일과 md5가 같고(`f2dae5eb3fe7`), 파일 길이 증가분이 정확히 21자다. 행 이동·병합·재정렬 0. 날짜 역전 2곳(2026-08-28→08-31, 2026-07-01→07-02)은 **기록된 순서 자체가 이력**이라 그대로 뒀다(다운님 결정). ⑪ **검증 V-A1~V-A7 전부 통과.** V-A1·V-A2는 설정 칩 = RPC `region_top` 값집합 = 메인 필터 칩(17개 일치), V-A4는 키 배열과 렌더가 읽는 필드의 **양방향 차집합 0**(9개 동일), V-A5는 이력행 284건 전부 헤더와 같은 비이스케이프 `\|` 3개. ⑫ ⚠️ **지정 브랜치를 `origin/main`에서 재시작했다** — 직전 PR #48·#49가 병합돼 브랜치가 병합 완료분만 담고 있었다. fast-forward라 이력을 고쳐 쓰지 않았다. ⑬ **Notion**: ⑤ 역참조표의 「중복 제거 키가 7개 컬럼 조합이다」를 표로 바꿔 정정하고, `announcements` 표에 `region_top` 행을 넣었다. ⑩ 시스템 구조에는 이 키를 다룬 서술이 없어 손대지 않았다. ⑭ **하지 않은 것**: B부 수정(승인 문서 대기) · 0-2의 네 항목(태백철암1·입주예정·status 8곳·`apply_start` NULL) · 날짜 역전 행 이동 · 이스케이프 외 글자 · RPC·`extractRegionTop` 로직 · 아코디언 표시 내용 · 기존 anon GRANT · 취소공고 그룹 · `zipfit-backup` 접근. ⑮ **미확인**: 실제 배포본에서 칩이 17개로 뜨는지(로컬 대조로 갈음, 다운님 육안 확인 몫) · `extractRegionTop` 정의를 지울지(claude.ai 판단 대기) · 정정 전 칩을 저장해 둔 사용자의 프로필 값(「서울」·「전라남도」)이 새 칩 목록과 맞지 않는 건의 처리. |

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
12. **공고 원문·QnA 등 첨부문서는 반드시 전체를 확인한 후 policies/eligibility에 반영할 것 — 미리보기(일부만 로드된 상태)만 보고 요약·반영 금지**: 2026-07-08 신혼신생아Ⅰ·Ⅱ "재계약 소득기준 및 할증" 항목이 QnA 문서를 미리보기로만 보고 뭉뚱그려 반영됐다가, 전체 텍스트 재확인 후 소득구간별 할증률 등 세부 수치가 크게 달랐던 것이 확인되어 정정한 사례 있음(아래 완료 이력 참고) — 앞으로 Google Drive 등에서 문서를 열람할 때는 미리보기 스니펫이 아닌 전체 내용(`read_file_content` 등)을 확인한 후에만 DB에 반영할 것
13. **git — 브랜치·push·병합** (2026-09-02 개정, ⑦ 「git 원칙」·「병합은 누가 하는가」 반영)
- **지정 브랜치 지시문이 없는 세션** → 자가검증 통과 시 `main`에 직접 push.
- **지정 브랜치 지시문이 붙은 세션** → 세션 브랜치에 push한 뒤 🔴 **Claude Code가 GitHub MCP로 PR 생성·병합까지 한다.** 다운님께 넘기지 않는다.
  - `gh` CLI는 이 환경에 **없다**(2026-09-01 실측). `mcp__github__create_pull_request` → `mcp__github__merge_pull_request`를 쓴다.
- 🔴 **push는 완료가 아니다. 병합까지가 작업의 끝이다** — 스케줄 워크플로와 배포는 기본 브랜치 기준으로 돈다.
- 🔴 **완료 보고에 병합 결과(PR 번호·병합 커밋)를 반드시 적는다.** 병합이 작업의 일부이므로 생략하지 않는다.
- push 전에 **반드시 `git fetch origin main`** — 세션 시작 시 `origin/main` 원격추적 ref가 낡은 채로 seeding된다. 이걸 안 하면 `non-fast-forward` 거부를 환경 차단으로 오판한다.
- push 검증은 로컬이 아니라 **원격 blob으로** — `git show origin/main:<파일>`.
- 예외(다운님 확인 후 진행): 되돌리기 어려운 변경(인증·로그인 경로, 컬럼 DROP, RLS 적용). 이때도 **PR 생성은 Claude Code가 한다**.
- **코드(index.html 등) 변경 시 sw.js CACHE_NAME +1 규칙은 그대로 유지**(원칙 9번).
- ⚠️ 원격 브랜치 삭제는 이 환경에서 프록시 403으로 막혀 있다. 정리는 다운님이 GitHub 웹에서 한다.
14. **3자 업무 분장** (2026-09-09 개정 — ⑦ 2026-09-03 재배정까지 반영. 🔴 **정본은 ⑦ 배정표**)
- **claude.ai**: 공고 원문 분석·판단·설계, 작업지시서 작성, 🔴 **실행 결과 재검증**(Supabase 읽기 중 이것만), **Notion의 판단·규약·경위**, 웹 검색.
- **Claude Code**: DB 쓰기(INSERT/UPDATE/DDL), 코드 읽기·쓰기, git·PR·병합, 🔴 **Supabase 읽기 — 조사·현황 파악**, 검증 설계, **Notion의 구현·데이터 사실**, Drive 원문 수령, PDF 해시 추출(`pdfplumber`).
- **다운님**: 원문 업로드, 브라우저 육안 확인, 사실관계 최종 판정, 스킬 교체, 계정 권한.
- 🔴 **핵심은 「조사」와 「재검증」을 가른 것이다.** 둘 다 SELECT를 돌리지만, 조사는 *무슨 일이 벌어지고 있나*이고 재검증은 *Claude Code가 한 일이 맞나*다. **후자를 넘기면 쓴 주체가 검증하게 되어 이 구조가 무너진다.**
- 🔴 **Notion 배정은 열거가 아니라 원리다 — 「그 사실을 직접 본 쪽이 쓴다」.**
  - **구현·데이터 사실**(코드 동작 · 컬럼이 담는 것 · API가 주는 것) → **Claude Code.** ⑩ 시스템 구조가 여기다.
  - **판단·규약·경위**(왜 그렇게 정했나 · 무엇이 뒤집혔나 · 무엇을 할 것인가) → **claude.ai**
  - ⚠️ **페이지 번호로 가르지 않는다** — 열거하면 목록 밖이 또 면제된다. 한 페이지에 둘이 섞이면 나누어 쓴다.
  - 🔴 **문구를 넘겨 옮겨 적게 하는 것은 마지막 수단이다**(2026-09-03 재배정 사유가 「옮겨 적는 단계에서 오류가 난다」였다). 불가피하면 verbatim으로 옮기고 경위를 본문에 남긴다.
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
- 배경: `index.html`의 외부 스크립트는 현재 **카카오맵 SDK 1건뿐**(13행)이고 Supabase 통신은 전부 순수 `fetch`다. Supabase Auth 도입 시 `@supabase/supabase-js`가 두 번째이자 **이 원칙의 첫 적용 대상**이 되므로 기준을 미리 못박아 둔다.
- ⚠️ **기존 카카오맵 SDK는 3조건을 하나도 충족하지 않는다**(버전 미지정 `sdk.js`, SRI 없음, 프로토콜 상대경로 `//`, PRECACHE 미포함). 소급 적용 대상이나 카카오 SDK는 URL에 버전을 못 박는 방식을 제공하지 않아 1·2번이 구조적으로 불가능 — 신규 도입분에만 이 원칙을 적용하고 카카오는 예외로 둔다.
18. **회신 끝에 「위치 표시」를 단다** (2026-09-04 신설 — ⑦ 2026-09-03 반영)
- 이슈 하나를 마칠 때마다 **대주제부터** 진행 상태를 ✅(완료) 🔵(진행 중) ⏸(보류) ⏭(다음 회차)로 적는다.
- 🔴 **한 회차에서 무엇이 닫혔고 무엇이 열린 채인지가 회신 안에서 드러나야 한다** — 이것이 없으면 다음 세션이 노션 백로그를 다시 훑어야 열린 것을 안다.
- ⚠️ ⑦에 같은 시기 신설된 「Claude Code에게 가는 모든 것은 문서다」·「다운님 몫에는 어떻게를 적는다」는 **작업지시서를 쓰는 쪽(claude.ai)의 규약**이라 Claude Code의 행동을 바꾸지 않는다. 정본은 ⑦이며 여기 옮기지 않는다.
19. **구조를 크게 바꾼 파일은 같은 세션 안에서 한 번 다시 읽는다** (2026-09-05 신설 — ⑨ 8-13 반영)
- **발동 조건**: 블록이 이동하거나 삭제된 변경. 값 하나를 고친 것은 대상이 아니다.
- **보는 것 셋**: ① 번호·순서가 이어지는가 ② **표·목록 구조가 일관된가 — 열수·중첩·닫힘** ③ 같은 말이 두 번 있는가.
- 🔴 **행 끝이 닫혔는지만 보지 않는다** — 한 표 블록 안의 모든 행이 **같은 열수**인지를 본다. 2026-09-05 8-13 신설 회차에 기술 스택 표의 닫는 구분자를 고쳤는데 **바로 다음 회차에 같은 행이 다시 걸렸다**(셀 안 스트레이 구분자로 그 행만 3열). 닫힘은 행의 끝만 보고, 열수는 행 전체를 본다.
- 🔴 **이것은 검증이 아니다.** 검증은 「의도한 변경이 됐는가」를 보고, 이 절차는 **「의도하지 않은 것이 함께 일어났는가」**를 본다. 축이 반대라 검증을 아무리 촘촘히 해도 이쪽은 안 잡힌다.
- **제정 사유**: 2026-09-03의 `CLAUDE.md` 이력 분리(541,799→25,121 B)는 **검증을 통과했다** — 이동 행의 바이트 완전 일치까지 확인했다. 그런데 같은 작업에서 코딩원칙 15번 제목줄이 사라지고 09-03 행의 표 구조가 깨졌다. **옮긴 것이 온전한지는 봤고, 옮기고 난 자리가 온전한지는 안 봤다.** 두 건 다 한 번 다시 읽었으면 그 자리에서 보였다.
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
22. **회신에는 여섯 항목을 항상 넣는다** (2026-09-05 신설 — ⑦ 「회신 필수 항목」 반영)
- **적용 범위**: Claude Code가 claude.ai에 보내는 **모든 회신.** 지시서·요청서·협의서 어느 쪽에 대한 답이든 같다.
- 고정 6항: ① **미확인**(①내 축 = 내가 못 한 것 / ②상대 축 = 구조적으로 불가) ② **범위 밖 발견·제안** ③ **지시서와 다른 사실**(전제·식별자·수치가 실물과 달랐던 것) ④ **실제로 실행한 것**(수정·배포·push 여부, 어느 브랜치, PR·커밋) ⑤ **claude.ai에게 요청** ⑥ **위치 표시**(원칙 18).
- 🔴 **「없음」도 답이다.** 해당 없으면 「없음」이라 쓴다. ④는 「DB 변경 0 / 코드 변경 0」처럼 **0도 쓴다.** 빈칸과 미작성은 구분되지 않는다 — 읽는 쪽은 후자를 전자로 읽는다.
- **검증 표 항목은 고정하지 않는다** — 지시서마다 기대값이 다르고, 고정하면 해당 없는 칸을 억지로 채우게 된다. 검증 항목은 지시서가 그때그때 지정한다.
- **제정 사유**: 지시서 포맷(입력)은 2026-08-20부터 있었으나 **회신 포맷(출력)이 없었다.** claude.ai가 매번 「회신에 담아 주실 것」을 손으로 적어 왔고 항목이 그때그때 달랐다 — 한 번만 빠지면 그 정보는 사라진다.
- ⚠️ 정본은 **Notion ⑦**이다. 어긋나면 ⑦이 이긴다.
23. **지시서 범위 밖을 발견했을 때 — 고칠까 보고만 할까** (2026-09-09 신설 — ⑦ 2026-09-03 반영)
- 🔴 **지시서가 명시한 방법을 다른 방법으로 대체하지 않는다.** 예외 없음.
- **범위 밖에서 잘못된 것을 발견하면 아래 두 시험을 둘 다 통과할 때만 고치고 알린다.** 하나라도 아니면 **보고만 한다.**
  - **① 자기완결성** — 판정 근거가 **지시서·코드·DB 실물 안에** 있는가?
  - **② 되돌림 비용** — 되돌리는 것이 **diff 한 줄**인가?
- 🔴 **되돌리기 어려운 것**(삭제·스키마·배포·병합·대량 UPDATE)은 근거가 아무리 확실해도 **멈추고 확인받는다.** 두 시험을 통과해도 예외가 아니다.
- ⚠️ **「명백히」 같은 확신어를 쓰지 않는다** — 두 시험이 그 자리를 대신한다.
- ⚠️ 정본은 **Notion ⑦ 「지시서 밖을 발견했을 때 — 고칠까 보고만 할까」**다. 어긋나면 ⑦이 이긴다.

---

## 🔗 주요 링크

| 항목 | URL |
|---|---|
| 배포 | https://dauntown96.github.io/zipfit |
| GitHub | https://github.com/dauntown96/zipfit |
| Supabase | https://supabase.com/dashboard/project/khdpjjyspmlqtzperoqg |
| 노션 시작점 | 🏠 L0 — https://www.notion.so/3b48aaa7e15581f88981d0c636de780c |
