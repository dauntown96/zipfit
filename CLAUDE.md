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
| 2026-09-12 | **`region` 열화 차단(트리거 술어) · `sigungu_nm='외'` 제거 · `collect-rental-stats` 조용한 실패 차단**(🔴 **EF 배포 2회(`collect-announcements` v39→v40 · `collect-rental-stats` v20→v21) · DB 함수 본문 재생성 1건(`protect_detail_columns`) · EF 소스 2개·`supabase/rpc/` 2개·`CLAUDE.md`·`docs/history.md` 수정 · PR #__PR__ 병합(병합 커밋 `__MERGE__`) · DDL 0 · DB 권한 변경 0 · 데이터 쓰기 0(백필 0) · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · Notion ⑩ 수정**). ① 🔴 **고른 방법 — DB 트리거에 술어 하나를 얹었다.** `protect_detail_columns()` 본문 끝에 「NEW가 주소형이 아니고 OLD가 주소형이면 OLD 유지」를 더했다. 제약 넷을 한 번에 만족하는 유일한 자리였다 — **INSERT는 손대지 않아**(BEFORE UPDATE 전용) 새 공고가 `region`을 갖고 태어나고, 지역본부명→지역본부명과 주소형→주소형은 그대로 통과하며, 막히는 방향은 「주소형→지역본부명」 하나뿐이다. 되돌리기는 직전 정의 재실행 한 번이다. ② **버린 방법 셋과 이유.** ⓐ *EF에서 `region` 키를 조건부로 뺀다* — PostgREST 벌크 upsert는 배치 안 객체들의 키가 전부 같아야 해서 행마다 뺄 수 없고, 통째로 빼면 422행이 INSERT를 겸하므로 새 공고가 `region` 없이 태어난다(PR #33이 같은 이유로 철회한 안이다). ⓑ *EF가 먼저 읽고 판단한다* — 500행 선-조회를 150초 예산 안에 넣는 것이고, 같은 런의 상세 upsert와 check-then-act로 경합한다. ⓒ *`on conflict do update`의 갱신 컬럼 목록을 좁힌다* — supabase-js·PostgREST가 컬럼 단위 지정을 노출하지 않아 원시 SQL RPC로 갈아야 하고, 그래도 「새 값이 더 나쁜가」 판정은 어딘가에 여전히 필요하다. ③ **판정식을 고르기 전에 오분류를 먼저 쟀다.** LH가 실제로 보내는 `CNP_CD_NM` **25종 전수**(`전국`·`인천광역시 외`·`전남광주통합특별시 외` 포함)를 대조해 **주소형으로 갈리는 것이 0건**임을 확인했다. 반대로 실제 주소는 숫자나 읍·면·동·리·로·길을 사실상 항상 포함한다. ④ **트랜잭션 안에서 6항을 시험하고 롤백했다** — 주소형→본부명 차단 · 본부명→본부명 갱신 · 주소형→주소형 갱신 · `building_name` NULL 무시(15개 보호 회귀) · 탈출구로 강제 되돌리기 · INSERT 통과. 전부 통과했고 롤백 뒤 남은 흔적 0(시험행 0 · LH 910행 불변). ⑤ **원칙 20 순서를 지켰다** — 변경 전 정의가 이미 `main`에 있었고 DB와 md5가 같음을 먼저 확인했다(`d1745de8…`). 변경 후 정의도 되받아 md5를 대조했다(`4181561c…`, 파일과 일치) — **손으로 옮겨 적다 생긴 차이가 0이라는 뜻**이다. ⑥ 🔴 **배포 검증에 `?mode=authcheck` 프로브를 썼다.** `deploy_edge_function`이 내용 문자열을 받는 구조라 잘림이 가장 무서운데, **부팅에 실패하면 이 프로브가 200을 못 준다**(모듈 최상단의 `requireEnv`·`createClient`가 먼저 돌기 때문). 배포 전 200 → 배포 후 200을 두 EF 모두에서 확인했고, 배포본 전문을 다시 받아 저장소와 대조했다(수정 hunk 양쪽·머리·말미 모두 온전). ⑦ 🔴 **지시서와 다른 사실 — `sigungu_nm='외'`는 29행이 아니라 70행이다.** 29는 `region='인천광역시 외'` 한 가지를 센 수이고, 시도 여럿을 합치면 70이다(윈도우 안 35 · 밖 35). 🔴 **LH의 `sigungu_nm`은 NULL 840 + `'외'` 70이 전부라 진짜 시군구가 들어온 적이 한 번도 없다** — 그래서 「외」를 버려도 잃는 정보가 없다. ⑧ ✅ **자연 교정을 실측했다 — 백필 없이 한 런 만에 닫혔다.** `sigungu_nm`은 보호 대상이 아니라 기본 목록 upsert가 매 런 다시 쓴다. 배포 직후 첫 정기 런(04:30 UTC)에 **윈도우 안 35 → 0**. 🔴 **윈도우 밖 35행은 그대로 `'외'`다** — 목록에 안 나와 upsert 대상이 아니기 때문이고, 지시서대로 백필하지 않았다. ⑨ ✅ **모수 정의가 실물과 맞는 것을 확인했다.** 지시서가 고정한 정의(`announcement_date` 90일 AND (`apply_end` NULL 또는 90일))로 세면 **502**이고, 같은 시각 `collection_run_log.lh_fetched`도 **502**다. 날짜 조건만 쓰면 508이라 6행 어긋난다 — 앞으로 이 항목은 502 쪽 정의로만 센다. ⑩ **`region` 첫 런 결과는 주소형 35 · 지역명만 467이다.** 🔴 **이 절대값으로 성공을 판정하지 않는다** — 가드가 들어가기 직전까지 이미 전부 열화된 상태였고 상세 캡이 90건이라, 누적은 이 런부터 시작한다. 판정은 다음 런들에서 **단조 증가**로 한다. ⑪ **1-4 간섭 없음 — 오히려 완화됐다.** 「미시도」 건은 그 런에서 상세를 못 받는데 기본 목록 upsert는 이미 끝난 뒤였다. 가드가 생기면서 미시도가 잃는 것에서 **`region` 복구 기회가 빠진다**(더 이상 열화되지 않으므로). `detail_fetch_fail_count`가 안 오르는 성질은 그대로이며 코드를 건드리지 않았다. ⑫ **3-1 — 세 개 전부 `requireEnv`로 바꿨다.** 🔴 **그 배포가 성립했다는 것 자체가 `ODCLOUD_API_KEY`가 설정돼 있다는 실측이다**(원칙 16이 요구하는 선확인) — 미설정이었다면 v21이 부팅에 throw해 authcheck가 200을 못 준다. ⑬ ⚠️ **범위 밖을 함께 고쳤다 — 지시서는 `ODCLOUD_API_KEY` 하나만 지목했다.** `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`도 같은 파일에서 `!` 단언이었고, 두 시험을 통과해 함께 고쳤다(판정 근거가 코드 안에 있고, 되돌림이 한 줄씩이다). 동작 변화는 **throw 지점이 28행에서 9행으로 당겨지고 메시지가 한국어 표준 문구가 되는 것뿐**이라 회귀가 없다. 이로써 저장소 EF 7개에 `Deno.env.get('X')!`가 0개다. ⑭ **3-2 조사(수정 없음).** ⓐ 불릴 자리는 배치 루프 안이다 — 서명이 `(단지명, 형명, existing, incoming)`이고 `stat_id: existing.id`를 쓰며, `rental_housing_history.stat_id`에 `rental_housing_stats(id)` **외래키**가 걸려 있다(고아 0). ⚠️ git은 경위를 증언하지 못한다 — 파일이 `7335f66`(09-02)에 들어올 때 **이미 호출문이 없었다.** 다만 DB는 증언한다: 406행이 전부 2026-06-29 00:28~00:36 UTC에 몰려 있고 `rental_housing_stats`의 최초 `collected_at`이 같은 날 00:32다. ⓑ **선행 조건 둘** — upsert가 행을 제자리에서 교체하므로 배치마다 `(단지명,형명,source_updated_at)`으로 선-조회가 필요하고(8,115행 = 17배치), 외래키 때문에 그 조회가 `id`를 함께 가져와야 한다. ⓒ 🔴 **상수를 동적으로 바꾸는 것과 이 함수를 살리는 것은 보완이 아니라 대안이다** — 키가 고정이라 행이 교체되는 구조에서만 「이전 값 대 새 값」 비교가 성립하고, 키에 진짜 갱신일을 넣으면 스냅샷마다 새 행이 쌓여 이력 테이블이 필요 없어진다. ⑮ **범위 밖 발견(보고만)**: `CNP_CD_NM`에 `전국`이라는 값이 있다(16행). `sido_nm`이 `전국`이 되는데 시도명이 아니다 — 이번엔 손대지 않았다. ⑯ **하지 않은 것**: `sigungu_nm` 29(실제 70)행 백필 · `detectAndRecordChanges()` 호출·삭제 · `SOURCE_UPDATED_AT` 변경 · `rent_min`·`deposit_min` 0 접힘(의도된 설계) · `upsert-announcement` 정규식 · `esm.sh` 범위 지정 고정(단독 회차) · 윈도우 밖 3건 · `index.html`·`sw.js` · `zipfit-backup`. ⑰ **미확인**: 다음 런들에서 주소형이 단조 증가하는지(회신 시점에 두 런까지만 봤다) · 배포 뒤 처음 들어온 **신규** 공고의 `region`(그 사이 새 공고가 없었다) · odcloud 응답에 갱신일 키가 있는지(키 없음·외부 호출 안 함) · 주간 런(다음 일요일 18:00 UTC)에서 v21이 실제로 8,000여 행을 다시 upsert하는지. |
| 2026-09-12 | **수집 파이프라인 EF 전제 조사 — ⑩ 서술 셋이 실물과 어긋났다**(🔴 **조사 전용 · 코드 수정 0 · EF 배포 0 · DB 쓰기 0 · DDL 0 · 함수 본문 0 · DB 권한 변경 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · `CLAUDE.md`·`docs/history.md` 2개 수정 · PR #60 병합(병합 커밋 `ad8e151`) · Notion ⑩ 수정 — 정정·확인 블록 5개, 새 절 7개**). ① 🔴 **`region` 열화의 정체 — 한 런이 `region`을 두 번 쓴다.** `mapLHRow` 호출 지점 넷 중 422행(기본 목록)·682행(late_retry)은 상세를 안 넘겨 `CNP_CD_NM`(지역본부명)을 싣고, 542·589행만 `addr`을 싣는다. 기본 목록 upsert는 매 런 500여 건 **전부**를, 상세는 ≤90건을 쓴다. 그래서 주소형 행 수는 누적량이 아니라 **직전 한 런의 상세 성공량**이다. ② 🔴 **⑩ 「윈도우 안 459행은 상세조회가 성공하면 자연 복구된다」가 반증됐다.** 모수 508행(`source='LH'` · `announcement_date ≥ 오늘−90일`) 중 상세 시도 이력 416행을 시도 시각으로 가르면 **직전 런(02:20 UTC) 55행에서만 주소형 35건**이고 **그 이전 361행은 0건**이다. ③ 🔴 **런 도중을 우연히 관측했다.** 02:20 런의 기본 upsert 직후·상세 upsert 직전에 돈 쿼리가 **508행 전부 지역명(주소형 0)**을 돌려줬고, 3분 뒤 같은 쿼리가 **주소형 35 · 지역명 473**이었다. 열화와 부분 복구가 한 런 안에서 차례로 일어난다. ④ 🔴 **⑩이 예고한 등가(`region` 열화 = sbd 파생 NULL)가 실제로 깨졌다.** 열화 473행 중 sbd 파생이 하나라도 살아 있는 행 **20**(넷 다 살아 있는 행 16). **검증 요구대로 집합을 명시한다 — 「열화+sbd 생존 20」과 「열화+활성 20」은 수가 같지만 교집합이 0이다.** 앞은 전부 비활성, 뒤는 전부 활성이다. ⑤ **분해 검증도 성립한다** — 열화 473 = 시도 없음 92 + 시도 있음 381이고, 381 = `detail_fetch_fail_count = 0` 350 + `> 0` 31이다. ⑥ 🔴 **직전 런 시도 55건은 전부 `detail_fetch_fail_count = 0`이다** — 그중 열화 20건은 실패가 아니라 「`dsSplScdl`만 오고 `dsSbd`가 안 온 성공」이다. `if (r.sbd \|\| r.scdl)` OR 게이트를 통과하면서 `addr`이 null이라 `CNP_CD_NM`으로 떨어진다. ⑦ **`region`을 쓰는 곳은 EF뿐이다** — `public` 함수 전수(`prokind in ('f','p')`)에서 `region`이 나오는 셋(`compute_announcement_flags`·`get_announcements_deduped`·`protect_detail_columns`)은 전부 읽기만 하고, `applySidoMerge()`·`normSido()`는 `sido_nm` 한 줄에만 쓰인다. ⑧ 🔴 **지시서·⑩과 다른 사실 — `region`에도 통합 명칭이 들어 있다.** ⑩은 통합 명칭이 `sido_nm`에만 들어간다고 적는데 `전남광주통합특별시 순천시 신월큰길 54(…)` 같은 값이 실재한다. 우리 코드가 `region`에 그 맵을 적용하는 지점이 없으므로 **LH 상세 응답의 주소 자체가 통합 명칭을 쓴다**는 관측이다. ⑨ 🔴 **⑩의 `mapLHRow` 행 번호 넷이 전부 낡았다** — 416·502·549·636 → 실물 **422·542·589·682**. 2026-09-09 `372afaf`가 행을 밀었고 성격 서술은 넷 다 맞다. 같은 번호가 `supabase/rpc/protect_detail_columns.sql` 주석에도 있으나 이번엔 고치지 않았다(DB 함수 본문 변경 0). ⑩ **윈도우 밖 활성 3건은 09-09의 그 3건이다** — `2015122300019841`(04-29) · `2015122300019919`(05-13) · `2015122300020090`(06-10). 셋 다 `updated_at`이 2026-09-09보다 일러 그때 이미 목록 밖이었다. **새로 흘러든 행 0 — 흐르는 것이 아니라 고착이다.** ⚠️ 목록에 없는 덕에 `region`이 안 덮여 3건 중 2건이 주소형이다. ⑪ **목록 없이 상세만 부르는 경로는 지금 구조로 불가능하다** — 상세 URL이 요구하는 5개 중 `PAN_ID`만 DB에 있고 `SPL_INF_TP_CD`·`CCR_CNNT_SYS_DS_CD`·`UPP_AIS_TP_CD`·`AIS_TP_CD`는 `announcements` 69컬럼 어디에도 없다. **범위는 「상세·base upsert 분리」 하나가 아니라 둘이다**(코드 4개 보관 또는 윈도우 확대 + 분리). ⑫ **PR #33 트리거가 그 위험을 줄이긴 했다** — `mapLHRow`가 싣는 27키 중 14개가 보호된다. 지켜지지 않는 것은 `title`(NOT NULL이라 조용한 손실이 아니라 23502 오류) · `region`·`sido_nm`·`sigungu_nm` · `status`·`apply_end`·`announcement_date`·`url`·`housing_type` · `is_revised`(null이 아니라 false로 뒤집혀 coalesce가 안 걸린다)다. ⑬ **`rent_min`·`deposit_min`의 0 접힘은 `mapMyHomeRow` 384·385행 하나뿐이다** — LH·SH 매핑에는 그 두 키가 아예 없다. 전체 2,644행에서 `rent_min = 0`이 **0건**(NULL 1,823 · >0 821이고 값이 있는 것은 MYHOME 1,642행뿐), `deposit_min`도 같다. ⑩ 서술은 지금 코드와 일치한다. ⚠️ 화면도 truthy 검사 5곳이라 0과 NULL을 못 가른다. ⑭ **`SOURCE_UPDATED_AT`은 40행 상수이고 읽는 곳은 163행 하나인데, 그 하나가 upsert 충돌키의 셋째 컬럼이다** — 주 1회(jobid 11, `0 18 * * 0` UTC = 월요일 03:00 KST) 같은 **행**이 제자리에서 교체된다. 실측: 8,114행의 `collected_at`이 **전부 2026-09-06 18:00 UTC** 안에 있다. ⑮ 🔴 **이력이 안 남는 진짜 이유는 상수가 아니라 죽은 코드다** — `detectAndRecordChanges()`는 정의만 있고 **호출문이 0건**이다. `rental_housing_history` 406행이 전부 2026-06-29 8분 구간에서 왔고 그 뒤 0행이다. 동적 재료가 응답에 있는지는 **미확인**(코드가 읽는 키는 `data`·`totalCount` 둘뿐이고, `APIS`의 `updated` 필드는 아무도 읽지 않는다). ⑯ **`collect-rental-stats`의 env 3건은 결과가 갈린다** — `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`는 `createClient`가 부팅에 throw하고(`supabaseUrl is required.` / `supabaseKey is required.`, `@supabase/supabase-js@2.116.0`로 실측), `ODCLOUD_API_KEY`만 **조용히 통과**해 `serviceKey=undefined`로 나가고 응답이 `success: true, upserted: 0`이 된다. ⑰ **`upsert-announcement`는 미배포다 — 배포본 목록 조회로 확인했다**(배포 5개: `collect-announcements` v39 · `collect-rental-stats` v20 · `collect-sh-announcements` v9 · `save-user-profile` v16 · `fetch-attachment` v5). 제어문자 정규식은 126행 하나이고 경계값이 U+0000·U+0008·U+000B·U+000C·U+000E·U+001F다. **배포본 EF에 사본 0건.** ⑱ **⑩의 `LIST_TIMEOUT_MS` 절은 최신이다** — 그 경로 코드가 2026-09-09 이후 바뀌지 않았다(배포본 v39가 저장소와 같다). 어긋남도 계속 관측된다: 2026-09-06 15:41 UTC 런이 목록 4콜 전부 `TimeoutError`인데 `duration_ms = 114,943`이고 이론 상한은 51초다. 최근 14일 955런 중 오류 런 59(6.2%). ⑲ 🔴 **`res.text()` 구멍의 서술을 좁혔다** — `AbortSignal.timeout()`이 본문 스트림에도 붙는 것이 표준이라 「타임아웃이 없다」로 단정할 수 없다(컨테이너에 Deno가 없어 **미실측**). 확정된 것은 `.catch(() => '')`가 예외를 삼켜 **본문 구간 사고가 `json_parse_failed`·빈 `body` 스니펫과 구별되지 않는다**는 쪽이다. ⑳ **미시도 건이 잃는 것**: 그 런의 `region` 복구 기회 · scdl·sbd 갱신 · `revision_note` · `attachment_urls`. 반대로 `detail_fetch_fail_count`가 안 올라 **만성 실패로 집계되지 않아 느린 재시도 대상도 되지 못한다**. ⚠️ ⑩의 「다음 런 1순위로 돌아온다」는 `apply_start`가 NULL인 행에만 해당한다(정렬 키가 「시도 안 함」이 아니라 「`apply_start` NULL」이다). ㉑ **하지 않은 것**: 코드·EF·DB 어떤 변경도, 수집 EF 수동 호출도, cron 접촉도, `zipfit-backup` 접촉도 하지 않았다. `index.html` 미접촉. ㉒ **미확인**: odcloud 응답에 갱신일 키가 있는지(API 키가 없고 외부 호출을 하지 않았다) · Deno의 `AbortSignal` 본문 abort 실동작 · 배포본 `esm.sh/@supabase/supabase-js@2`가 실제로 어느 패치 버전인지 · claude.ai의 502/467과 내 508/473의 차이가 모수 정의 때문인지 측정 시각 때문인지. |
| 2026-09-12 | **스냅샷 테이블 `eligibility_criteria_bak_20260908` DROP + 죽은 컬럼 3개 ⑩ 기록**(🔴 **DDL 1회(DROP TABLE 1) · `supabase/rpc/README.md`·`docs/history.md`·`CLAUDE.md` 3개 수정 · PR #58 병합(병합 커밋 `e4f37e5`) · DB 권한 변경 0 · 데이터 쓰기 0 · 함수 본문 0 · EF 배포 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · Notion ⑩ 수정**). ① **실행 창을 먼저 쟀다** — `zipfit-backup` 정기 백업 실물이 20:27~20:44 UTC(KST 05:30 전후)에 시작하므로 안전 창은 KST 06:00~다음날 04:00이고, 실행 시각이 **KST 10:13**이라 창 안이었다. ② **실행 전 확인 3개가 전부 0행이라 실행했다** — 참조 제약 0 · 뷰·머티리얼라이즈드뷰·함수 본문·룰·cron 명령문에 이름 0건 · 저장소 코드에도 0건(`README.md`·`CLAUDE.md`의 이력 서술 2곳이 전부이고 코드 경로가 아니다). ③ ⚠️ **지시서의 (2) 쿼리는 그대로 돌리면 죽는다** — `pg_get_functiondef(p.oid)`를 집계 함수에 부르면 `"array_agg" is an aggregate function`으로 쿼리 전체가 실패한다. `prokind in ('f','p')` 필터를 더해 다시 돌렸고, 같은 김에 머티리얼라이즈드뷰·룰·cron 명령문까지 넓혀 봤다(전부 0건). 이 함정을 README에 적었다. ④ **DROP 실행: 2026-09-12 01:15 UTC = 10:15 KST.** `CASCADE`를 붙이지 않았다. ⑤ **검증 4개 전부 통과** — `public` 테이블 수가 직전 16에서 직후 15로 정확히 1 줄었고(절대수가 아니라 같은 쿼리로 두 번 셌다), `eligibility_criteria`는 전후 307행 불변이며, `to_regclass('public.eligibility_criteria_bak_20260908')`가 NULL이다. ⑥ **되돌리기 절차를 README에 「스키마 변경 이력 (DDL)」 절을 새로 열어 적었다** — 🔴 **`DROP TABLE`에 대응하는 한 줄짜리 SQL은 없다.** 정규 경로는 `zipfit-backup`의 09-08~09-12 일일 덤프에서 이 테이블 블록만 꺼내 되먹이는 것이고, 껍데기만 필요할 때 쓸 `create table` 18컬럼 원문을 삭제 전에 떠서 함께 넣었다. ⑦ 🔴 **행 수가 원본과 다른 것을 복구 시 기대값으로 못박았다** — 삭제 시점 원본 307 · 스냅샷 304다. 09-08 이후 원본에 3행이 늘었다는 뜻이며 이 삭제는 그 3행과 무관하다. ⑧ **⑩에 「`announcements`에 쓰이지 않는 컬럼이 있다」 절을 열었다**(수집 파이프라인 아래). 세 컬럼이 무엇도 채우지 않고 무엇도 읽지 않는다는 것, 근거(`index.html`·`sw.js`·EF 7개 소스 검색 0건 · DB 함수 `prosrc` 전수 0건)를 `[VERIFY]`와 함께 적었다. ⑨ 🔴 **지시서와 다른 사실 — `collected_at`은 비어 있지 않다.** 지시서는 「EF가 안 채우고 `updated_at`이 그 역할을 한다」고 했는데, 실측하면 2,644행이 **전부 채워져 있고**(컬럼 기본값 `now()`가 넣는다) `created_at`과 **2,644/2,644 전부 같으며** `updated_at`과는 **2,644/2,644 전부 다르다.** 즉 그 역할을 하는 것은 `updated_at`이 아니라 `created_at`이고, `collected_at`은 그 복사본이다. 「EF가 안 채운다」는 절반만 맞다 — EF는 안 쓰지만 컬럼 기본값이 쓴다. ⑩ **그래서 이 컬럼의 위험은 「비었다」가 아니라 「갱신되지 않는다」로 적었다** — `collected_at` 최신이 2026-09-11인데 `updated_at` 최신은 2026-09-12 01:10 UTC이고 그 사이에도 수집은 돌았다. 이름만 보고 「마지막 수집 시각」으로 읽으면 틀린다. ⑪ **`original_id`는 2,644행 전부 NULL이라 혼동 위험을 따로 적었다** — `id`(행 PK)·`announcement_id`(공고 식별자)와 셋이 별개이고, 「original이니까 원본 공고 ID겠지」로 조인·필터에 넣으면 결과가 조용히 0행이 된다. ⑫ **`is_notified`는 2,644행 전부 `false`이고 `true`가 0건** — 알림 경로가 미구현이라 그 기능이 생기면 살릴지 판단한다고 적었다. ⑬ **⑩ 절을 같은 세션에서 다시 열어 훑었다**(원칙 19) — 표가 4행 × 3열로 일관되고 닫혔으며, 절 제목 중복 0 · `# 사용자 데이터` 헤더 1개로 그대로다. ⑭ **하지 않은 것**: `CASCADE` · 죽은 컬럼 3개 DROP · `index.html`·`sw.js`·EF 변경 · 권한·정책·트리거 변경 · `zipfit-backup` 접촉(승인 실행은 짝 문서 몫) · 데이터 쓰기. ⑮ **미확인**: 다음 `zipfit-backup` 회차가 이 삭제를 「사라진 이름」으로 읽고 한 번 실패하는 것 — 짝 문서의 승인 실행 전까지는 구조적으로 확인할 수 없다 · 삭제된 테이블이 실제 덤프 파일에 담겨 있는지(컨테이너에서 `zipfit-backup` 저장소에 접근하지 않았다). |

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
