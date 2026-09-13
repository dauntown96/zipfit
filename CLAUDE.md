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
| 2026-09-13 | **공고 분석 상태 테이블 `announcement_analysis` 신설 — 227건 소급 백필**(🔴 **DDL 1건(테이블 1 · 부분 인덱스 1 · CHECK 1 · 주석 8) · DB 데이터 쓰기 227행(백필) · 권한 변경 — 새 테이블에 한해 RLS 켬 + `anon`·`authenticated` REVOKE ALL + `service_role` GRANT · `announcements` 미접촉(행 2,644·컬럼 68 불변) · 함수 재생성 0 · `get_reanalysis_queue()` 미접촉 · `file_hash` rename 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · EF 배포 0 · 스킬 수정 0 · `CLAUDE.md`·`docs/history.md` 수정 · Notion ⑩ 수정 — 새 절 1개(하위 2절, 원문 삭제 0) · PR #__ 병합(병합 커밋 `__`)**). ① 🔴 **1-3 FK — 걸지 않았다. 그런데 지시서가 예상한 이유와 다르다. 「걸 수 없다」가 먼저다.** 지시서는 CASCADE냐 RESTRICT냐를 물었는데, `announcements`의 PK는 **대리키 `id`**이고 유니크 제약은 **`(source, announcement_id)`** 하나뿐이다 — `announcement_id` 단독을 가리킬 대상이 **없다.** FK를 걸려면 `announcements`에 유니크를 새로 얹어야 하고 그건 이 지시서가 금지한 「`announcements` 미접촉」을 깨는 일이다. ② **그래서 삭제 경로 확인은 보조 근거가 됐고, 그쪽도 같은 답이다.** `announcements`를 가리키는 FK가 DB 전체에 **0개**(형제 표 `housing_units`·`announcement_extras` 등도 전부 FK 없음 — 즉 FK 없음이 기존 규약이다), 삭제 경로는 **EF 7개 · `public` 함수 본문 전수 · cron 5잡 어디에도 `announcements` DELETE가 없다**(수집은 `onConflict: 'source,announcement_id'` upsert만 한다). ③ **정합은 재고 있다** — 백필 227행 전부 `announcements`에 대응 행이 있고(`points_to_missing_ann` 0), 반대로 `housing_units` 고아 행도 0이다. ④ **1-2 제약 — CHECK를 골랐다.** 근거 셋: ⓐ 스킬 개정 주기가 짧다(v8.0→v8.2가 며칠이었다) ⓑ **되돌림 비용이 다르다** — CHECK는 DROP/ADD로 값을 빼는 것까지 되고 `ALTER TYPE … ADD VALUE`는 **되돌릴 수 없다** ⓒ `public` 스키마에 enum 타입이 지금 **0개**라 enum은 새 부류를 들이는 일이다. 한글값은 지시서대로 — `announcements.status`가 이미 `접수중`을 한글로 담는다. 허용값 6종. ⑤ 🔴 **2장 `anon` — SELECT도 주지 않았다. 그리고 안 걷으면 새 위반이 났을 자리다.** 화면이 이 표를 안 읽는다(`index.html`·EF 참조 0)는 것이 첫 근거고, 더 중요한 것은 **`public` 스키마 기본 권한이 새 테이블에 `anon`·`authenticated` SELECT를 얹어 준다**는 점이다(`pg_default_acl`에 `anon=r/postgres` 실측). 그대로 두면 **RLS 켜짐 + 정책 0 + `anon` SELECT** = 불변식 V6에 새로 걸린다 — `collection_run_log`가 지금 걸려 있는 바로 그 모양이다. `revoke all … from anon, authenticated`로 걷어냈고 최종 ACL은 `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`다. ⑥ ✅ **역할 전환 실측** — `set local role`로 `anon` SELECT·INSERT, `authenticated` SELECT를 각각 시도해 **셋 다 `permission denied for table announcement_analysis`**. 조용히 비는 것이 아니라 오류로 떨어진다. ⑦ ✅ **3장 직접 셌다 — 227. claude.ai 수와 같다.** `housing_units`의 distinct `announcement_id`이고, 다른 수가 나오면 멈추라는 지시가 있었으나 같아서 진행했다. ⑧ **`analyzed_at`은 추정하지 않았다 — 근거 시각이 DB에 있었다.** 그 공고 `housing_units`의 `max(created_at)`을 넣었다(산물이 실제로 쓰인 시각). 227건이 **2026-07-02~07-31의 서로 다른 23일**에 흩어져 있어 상수가 아니고 NULL은 0건이다. `batch_label`·`drive_folder_id`는 227건 전부 NULL(지시서대로). ⑨ ✅ **검증 5항 — 불변식은 신설 전과 완전히 같다.** 전: `V1 = saved_announcements/authenticated INSERT·DELETE`(원칙 15가 적어 둔 의도된 예외) · `V5 = 없음` · **`V6 = collection_run_log` 1건.** 후: **글자 하나까지 동일.** 위반이 늘지 않았다. ⑩ **검증 3항** — `announcements` 행 2,644 · 컬럼 68로 신설 전후 불변. 상태 분포는 227건 전부 `완료(소급)`, 다른 값 0건. ⑪ **4장 옮길 때 바뀔 곳 — 좁다. 호출부가 0이다.** `get_reanalysis_queue()`를 부르는 곳이 `index.html` 0건 · EF 7개 0건 · 그 함수를 부르는 다른 `public` 함수 0개 · 스킬 본문 0건이다(세션이 그때그때 손으로 부른다). 그래서 옮길 때 바뀌는 것은 **반환 시그니처 8컬럼**(`announcement_id`·`source`·`title`·`announcement_date`·`is_revised`·`revision_note`·`group_child_count`·`donor_announcement_ids`)과 `supabase/rpc/get_reanalysis_queue.sql` 덤프뿐이다. 🔴 **이 회차에서 재생성하지 않았다** — 지금은 판정이 둘(상태 테이블 · 건수 합산)로 공존한다. ⑫ ⚠️ **지시서와 다른 사실 — ⑩에 `# DB 구조` 헤딩이 없다.** 대신 바로 그 주제를 다루는 기존 절 「지금 「이 공고가 분석됐는가」를 무엇으로 아나」(2026-09-12 신설) 다음에 새 절을 넣었다. 그 절은 **지우지 않았다** — 신설 전 상태의 기록이다. ⑬ ⚠️ **범위를 한 줄 넘겼다 — 직전 회차 이력의 `PR #__ 병합(병합 커밋 `__`)` 자리표시자를 `PR #80` · `529b157`로 채웠다.** 내가 쓴 줄이고 값이 병합 결과로 확정돼 있으며 되돌림이 한 줄이다(원칙 23 두 시험 통과). ⑭ **하지 않은 것**: `announcements` 컬럼 추가·트리거 변경 · `get_reanalysis_queue()` 재생성 · `file_hash` rename · 완료 계열 셋으로 백필 · `drive_folder_id` 채우기 · 스킬 수정 · 프론트·EF·`zipfit-backup` 접촉 · ⑩ 원문 삭제. ⑮ **범위 밖 발견(보고만)**: ⓐ 저장소에 **테이블 DDL을 적는 자리가 없다** — `supabase/rpc/`는 README가 「함수 하나씩 + `triggers.sql`」로 못박아 두어 테이블이 들어갈 곳이 아니다. 이번 DDL은 Supabase 마이그레이션 이력에만 남는다. ⓑ **불변식 7검사 SQL도 저장소에 없다**(2026-09-12 회차가 「돌릴 자리 없음」이라 적어 둔 그대로다) — 이번엔 기록된 정의로 V1·V5·V6을 재구성해 돌렸고, 전후가 같다는 결론은 **같은 쿼리를 두 번 돌린 것**이라 비교로서는 유효하다. ⓒ `created_at`·`updated_at`을 넣지 않았다 — 지시서 컬럼표에 없어 그대로 갔다. 필요하면 뒤에 붙이면 된다. ⑯ **미확인**: 검증 6항(다음 정기 런 뒤 행 수 불변) — 아래 참조. |
| 2026-09-13 | **없는 첨부를 화면에서 정직하게 다룬다 — 그리고 「207개가 없다」가 브라우저가 보는 것과 달랐다**(🔴 **`index.html` 수정(첨부 갤러리 1구역 — CSS 9줄 + 렌더 · 실패 처리 함수 3개 · 모달 2곳) → `sw.js` `CACHE_NAME` v88→v89 · EF 배포 0 · DB 쓰기 0 · DDL 0 · 함수 재생성 0 · 권한 변경 0 · `announcement_extras` 값 수정·삭제·숨김 0 · Drive 공유 설정 미접촉 · `file_hash` rename 0 · `CLAUDE.md`·`docs/history.md` 수정 · Notion ⑩ 수정 — 새 하위 절 2개(원문 삭제 0) · PR #80 병합(병합 커밋 `529b157`)**). ① 🔴 **지시서와 다른 사실 — 「207개가 없다」는 커넥터가 보는 것이고, 브라우저가 보는 것은 다르다.** 같은 distinct Drive ID **1,126개를 익명 공개 경로**(`drive.google.com/thumbnail?id=…&sz=w300`, DB `net.http_get`)로 **전수** 조회했더니 **200 `image/*` 1,124 · 404 2 · 판정 못 한 것 0**이다. ② 🔴 **404 2개도 파일은 멀쩡하다.** 둘 다 팸플릿 PDF이고 Drive 메타데이터로 존재가 확인된다 — 부천원종 C1블록 **62,192,176B**(`uc?export=view`가 PDF 본문까지 200으로 돌려줬다) · 당진우강송산 **86,584,736B**. **용량이 커서 Drive가 썸네일을 안 만들어 주는 것**이다. 즉 **익명 방문자가 실제로 못 보는 파일은 지금 0개**다. ③ ⚠️ **커넥터와 공개 경로가 갈린다.** 앞 회차가 `files.get` 404로 판정한 `15sv5G7V7JW2NDgJQUT3SSulHigec5Tk0`(춘천 `20762_1`)은 지금도 커넥터에서 `Requested entity was not found`인데 익명 `thumbnail`·`uc` 둘 다 **200 image/jpeg**로 실제 바이트를 준다. 같은 「없어진 폴더」 표본 10개(춘천·화천·양구·완주·제주)도 전부 200이다. **왜 갈리는지는 확정 못 했다** — 소유·공유 범위가 바뀐 것인지 커넥터 색인 문제인지 가르지 못했다. 앞 회차의 「익명 요청에 `Sign in`이 돌아온다」도 지금은 재현되지 않는다(다운님이 Drive 공개 설정을 별도로 진행 중이었다). ④ 🔴 **그래서 고친 것은 「몇 개가 없다」에 기대지 않는다.** 무엇이 실패하든 그 자리에서 다루는 장치라 공개 설정이 바뀌어도 그대로 맞는다. ⑤ **1-2 고른 방법 — `onerror`. 버린 방법 — 사전 존재 확인.** 사전 확인은 브라우저에서 **구조적으로 불가능**하다: `drive.google.com`이 `Access-Control-Allow-Origin`을 주지 않아 `fetch`/XHR HEAD가 CORS로 막히고 `mode:'no-cors'`는 opaque 응답이라 status를 못 읽는다. 읽을 수 있는 길은 OAuth를 붙인 Drive API뿐인데 클라이언트에 토큰·스코프를 새로 들이는 일이다. 비용도 `onerror`가 싸다 — 사전 확인은 타일마다 요청이 하나 더 붙지만 `onerror`는 이미 일어나는 로드에 얹혀 **추가 요청 0**이다. ⑥ **사진·평면도**: 썸네일 실패 → `<img>`를 자리표시자(`불러올 수 없음`)로 바꾸고 **타일 자리와 주소·동호 라벨은 남긴다**(조용히 감추면 손실이 화면에서 사라진다). `(N건)`은 실패마다 다시 세어 **실제 보이는 수**와 맞추고, 못 띄운 수는 라벨 뒤(`· N건은 지금 불러올 수 없어요`)와 묶음 상단 안내줄에 **따로** 적는다. ⑦ 🔴 **팸플릿은 썸네일 실패를 「없다」의 근거로 쓰지 않는다 — ②가 반례다.** 팸플릿의 표시 경로는 모달 `/preview`라 축이 다르다. 중립 문구(`📄 미리보기 없음`)로 두고 `(N건)`에서 빼지 않으며 모달도 그대로 연다. ⚠️ **지워진 팸플릿의 `/preview` 안에는 여전히 Drive 자신의 「파일을 찾을 수 없습니다」가 뜬다** — iframe은 `onerror`가 안 먹고 안쪽이 교차출처라 판정 근거가 없다. **남은 구멍이며 숨기지 않고 적는다.** ⑧ **1-1 (5) 두 실패는 화면이 구분하지 못한다.** ①없음(404)과 ②권한 없음(로그인 페이지로 리다이렉트)은 HTTP 층에서는 다르지만 그 차이가 페이지까지 오지 않는다 — `<img>`의 `onerror`는 상태코드를 주지 않고 CORS 때문에 직접 읽어볼 수도 없다. 그래서 문구가 원인을 단정하지 않는다: 「지금 불러올 수 없어요. 원본 파일이 지워졌거나 자리를 옮겼을 수 있고, 열람 권한이 없어서일 수도 있어요.」 ⑨ ✅ **검증은 실제 브라우저로 했다 — 컨테이너의 Playwright·Chromium.** `index.html`에서 첨부 CSS와 함수를 **그대로 잘라** 하네스에 넣고, **`anon` REST 응답**(DB `net.http_get`으로 `announcement_extras?announcement_id=like.20762_3*` 호출, 200·7행)을 그대로 먹인 뒤 Drive 요청을 라우트로 가로채 200/404를 만들었다. 세 경우 전부 통과: **A 전부 정상** — 깨진 `<img>` 0 · 자리표시자 0 · 안내줄 없음 · `(8건)` **표시 변화 없음**. **B 사진2+평면도1 없음 · 팸플릿 썸네일만 없음** — 깨진 `<img>` **0** · `(5건) · 3건 불러오기 실패` · 그룹 `사진 (1건)·2건` `평면도 (3건)·1건` `팸플릿 (1건)`(팸플릿은 안 빠진다) · 라벨 3개 보존 · 모달이 문구로 바뀜. **C 전부 실패(비로그인 상태 모사)** — 깨진 `<img>` **0** · `(1건) · 7건 불러오기 실패` · 라벨 7개 보존 · 팸플릿 모달은 `/preview`를 그대로 연다. ⑩ **검증 4항 — 로그인 미상태 화면**: 위 C가 그 모습이다. 지금은 ②로 인해 **있는 파일도 실패하면** 갤러리가 통째로 자리표시자가 되고 제목이 `(0건) · N건 불러오기 실패`가 된다. 정직하지만 원인은 못 가른다. **고치는 것은 이 문서 범위 밖**(Drive 공유 설정). ⚠️ 단, ①~③ 때문에 **지금은 익명으로도 뜬다** — 다운님 2026-09-13 육안(안 보임)과 오늘 관측이 어긋나며, 공개 설정 작업이 그 사이에 들어갔을 가능성이 크다. **재육안이 필요하다.** ⑪ **`<details>`라 접힌 상태에서는 `(N건)`이 아직 원래 수다** — lazy 이미지가 펼쳐야 로드되므로 구조적으로 그렇다. 펼치는 순간 다시 세어진다. ⑫ **하지 않은 것**: DB 쓰기·210행 삭제·숨김·수정 · Drive 공유 설정 접촉 · `file_hash` rename · 없는 파일 재업로드 · EF 접촉 · `zipfit-backup` 접촉 · ⑩ 원문 삭제(전부 추가 블록). ⑬ **미확인**: 커넥터와 공개 경로가 갈리는 원인 · 다운님 재육안(컨테이너에서 `drive.google.com`·Supabase 도메인이 프록시 403이라 실제 배포 화면은 못 본다) · 지워진 팸플릿 iframe을 우리 문구로 바꾸는 길 · 「썸네일은 뜨는데 원본만 없는」 이미지가 있는지(오늘 표본에서는 0). |
| 2026-09-12 | **7번 묶음(SH 수집) 전제 조사 재실행 — 이미 끝난 회차였다. 그래서 델타만 적는다**(🔴 **조사 전용 · 코드 수정 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · EF 배포 0 · EF `?mode=collect` 미호출 · DB 데이터 쓰기 0 · DDL 0 · 함수 재생성 0 · 권한 변경 0 · `CLAUDE.md`·`docs/history.md` 수정 · Notion ⑩ 수정 — 기존 4개 절에 추가 블록 4개(원문 삭제 0)**). ① 🔴 **지시서와 다른 사실 — 이 작업요청서는 이미 실행돼 병합돼 있었다.** 같은 문서가 PR #71(병합 커밋 `751bd38`)로 끝났고 `docs/history.md` 맨 위 「SH 수집 전제 조사 — 접수기간은 원본에 있다. 상세 본문에」가 그것이며, Notion ⑩에도 「SH 수집은 어디서 무엇을 읽는가」 절과 「좌표 주의 (2026-09-12 확인)」 블록이 이미 있었다. **모르고 처음부터 다시 돌렸고, 1~7장 결론이 전부 같게 나왔다** — 목록 하나만 읽는 것 · 접수기간은 상세 본문에 있고 자치구는 구조적으로 없는 것 · `markExpired()`가 SH에 영영 안 걸리는 것 · 숨김 15건과 화면 누출 0건 · 분석 산물 0건. **독립 재현이 된 셈이고, 아래 넷만 새 것이다.** ② 🔴 **1장 델타 — 접수기간 라벨은 3종이 아니라 최소 4종이고, 다구간이 아닌 공고가 있다.** 표본을 하나 더 열었다 — `SH_308799` 금천구 1인가구 청년 맞춤형주택 본문은 **「■ 접수기간 : 2026.08.19.(수) ~ 2026.09.17.(목) 18시」 한 줄**이다. 네 번째 라벨(`접수기간`)이고 순위별·인터넷/방문별로 갈리지 않는 **단일 구간**이라 `apply_start`·`apply_end` 한 쌍에 그대로 들어간다. 🔴 **앞 회차의 「한 쌍으로 접는 규칙이 따로 필요하다」가 전량에 걸리는 말이 아니었다** — 수요자맞춤형처럼 자치구 단위 소규모 공고는 접는 규칙 없이 옮겨진다. 파싱 난이도가 공고 유형에 따라 갈린다. ⚠️ 라벨이 4종에서 끝나는지는 여전히 미확인이다(표본 4건이 전부다). ③ **3장 델타 — 롤링 윈도우를 다른 방법으로 재현했고 한 축을 더 얻었다.** 앞 회차는 런의 `updated_at`으로 갈음했는데, 이번엔 **목록 9페이지를 전부 `net.http_get`으로 받아 `seq` 집합을 DB와 직접 맞댔다.** 수는 같다 — 목록 생존 **81** · DB **92** · 이탈 **11** · 그중 `공고중`이면서 숨김 아닌 것 **6**. 🔴 **더해서 「목록에 있는데 DB에 없는 것」이 0건이다** — 수집이 빠뜨리는 것은 없다는 뜻이고, `updated_at` 갈음으로는 잴 수 없던 축이다. 굳은 6건 중 4건(`SH_306988` 금천 예술인 · `SH_308569` 양천 신혼부부 · `SH_308571` 양천 청년협동조합 · `SH_309073` 성동 마장)은 전부 `수요자맞춤형`이고 화면 카드로 실제로 선다. 나머지 2건(`SH_309403`·`SH_310046`)은 `(수정)` 승자 `SH_310107`에게 dedup으로 흡수돼 카드로는 안 뜬다 — **화면에 서는 굳은 카드는 6장이 아니라 4장이다.** ④ 🔴 **4장 델타 — 「원본에 카테고리 파라미터가 있는지 미확인」을 절반 좁혔다. 있다.** i-sh 상세 페이지 HTML에 `itm_seq` 파라미터가 `1·2·4·8·16·32·64·128·256·512·1024`의 **비트마스크 11값**으로 들어 있고(퀵링크가 `multi_itm_seqs=1,2,4,…,1024`로 전량을 켠다), 네비 라벨은 「주택분양·주택임대·주택매입·입주안내·토지·상가/공장·보상/이주·현상설계·기타」다. 🔴 **그러나 우리가 긁는 자리에는 그 축이 없다** — `housing.seoul.go.kr` publicLease 목록 컬럼은 실측 8개(번호·청약유형·공고명·공고게시일·발표일·모집상태·담당부서·링크)뿐이고, i-sh 게시판 목록 화면(`m_241/list.do`)에도 컬럼으로 안 나온다(번호·제목·담당부서·등록일·조회수). ⚠️ **`itm_seq` 값이 「공고 vs 게시문」을 가르는지는 여전히 미확인** — 값과 라벨의 대응을 안 봤다. ⑤ 🔴 **6장 델타 — 판정식을 넓히면 8곳이 아니라 9곳이다.** ⑩이 적어 둔 판정식(「`'접수마감'`을 `===`·`!==`로 비교」)으로는 **지금도 정확히 8곳**이 맞다. 다만 지시서가 물은 것은 「`status` 문자열로 접수·마감을 판정하는 자리」이고 **그 판정식으로는 9곳**이다 — 아홉째가 `index.html` **1985행**, 인사이트 지역별 모수 `REGION_SCOPE`의 `!/마감$/.test(String(r.status\|\|'').trim())`다(2026-09-10 신설, 커밋 `1380833`). `===`가 아니라 접미사 검사라 전수에 안 걸렸을 뿐 축은 같다. **문자열 축을 날짜 축으로 옮기는 회차는 여덟이 아니라 아홉을 봐야 한다.** ⑥ **행 번호도 갱신했다** — PR #73·#75가 `index.html`을 고쳐 8곳의 현재 위치가 1100·1114·1581·1821·1832·2704·2739·3898행이다(종전 기록은 1099·1113·1580·1820·1831·2703·2738·3891). ⑦ **2장은 같은 답이 나왔다(재현).** `index.html` 805~879행을 그대로 `node`로 잘라 실행하고 **`anon` RPC 응답**(DB에서 `net.http_post`, 200·838행)의 SH `공고중` 15행을 먹였다 — 카드 날짜줄은 15행 전부 **`모집공고: YYYY-MM-DD / 접수기간: - ~ -`**이고 `applyWindowState`는 15행 전부 `'unknown'`, `isAcceptingNow`·`isClosingSoon`·`isNewNotice` 전부 0건이다. 🔴 **접었을 때와 펼쳤을 때가 다르다** — 접힌 카드에는 대시 두 개가 보이는데, 펼친 상세 그리드는 `if(applyStart\|\|applyEnd)` 게이트라 **접수기간 행 자체가 빠진다.** ⑧ **하지 않은 것**: 코드·EF·DB 어떤 변경도 · 처방 설계(접수기간 파싱 방식·마감 판정 조건·게시문 필터) · 제목 정규식 안 · 6장 9곳 전환 설계 · `zipfit-backup`·LH·MYHOME 접촉 · ⑩ 원문 삭제(전부 추가 블록으로만 적었다). ⑨ **미확인**: 접수기간 라벨이 4종에서 끝나는지 · `itm_seq` 값과 라벨의 대응 · Innorix 없이 첨부를 받을 수 있는지 · `SH_309403` 본문 미수신(앞 회차 관측)의 원인 — 이번에 재현을 시도하지 않았다 · 브라우저 실화면(컨테이너에서 Supabase·SH 도메인이 프록시 403이라 육안은 다운님 몫이다). |

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
