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
| 2026-09-15 | **2026-09-15 규약 개정의 역방향 연쇄를 메웠다 — 그리고 ②와 ⑩이 서로 다른 말을 하던 것을 실물로 갈랐다**(🔴 **코드 변경 0 · DB 쓰기 0 · DDL 0 · EF 배포 0 · 프론트 미접촉 · `index.html`·`sw.js` diff 0줄 · `CLAUDE.md` 원칙 24·25 신설 + 22에 1줄 흡수 · Notion ⑩ 6곳·② 2곳 반영 · `zipfit-backup` 미접촉**). ① 🔴 **`region` 보호 여부 — ②가 틀렸고 ⑩이 맞았다.** ②는 「트리거 주석에 의도적 제외로 명시돼 있다」고 적고 있었으나, 함수 정의를 조회하니 `NEW.region := OLD.region` 가드가 **실제로 있다**(2026-09-12 신설분). ⑩ 「막았다 — 2026-09-12」가 정확했다. ②를 정정하고 **판정식·실측은 ⑩이 정본이라 가리키게만** 했다. ② 🔴 **보호 컬럼은 15가 아니라 16이다 — 기억이 아니라 `prosrc`를 세었다.** `NEW.x := coalesce(...)` 전수로 16개(`apply_end` 포함)이고, `region`은 축이 달라 목록 밖에 별도 술어로 선다. ②의 목록을 통째로 다시 썼다. 🔵 **바인딩도 함께 확인했다** — `protect_detail_columns_trigger (BEFORE UPDATE on announcements)` 1건, 재생성 없음. ③ ✅ **`apply_end`는 한 곳만 서술한다.** ⑩ 「`apply_end`가 보호 대상이 아니다」 절에 해소 경위를 쓰고, ②는 그리로 **가리키기만** 했다 — 같은 문단을 두 곳에 두지 않는다. ④ 🔴 **⑩의 「문자열 축 여덟(아홉)」이 낡아 있었다.** PR #126이 여섯을 날짜 축으로 옮겼고 `REGION_SCOPE`(아홉째)는 사본을 지워 같은 술어를 부르게 했다. 남은 둘은 **카드 배지와 `opacity`**이고 의도적이다 — 「기관이 마감이라고 했는가」와 「지금 접수 가능한가」는 다른 질문이다. 낡은 표는 지우지 않고 2026-09-12 시점의 기록으로 남겼다. ⑤ 🔴 **네 상태다. 지시서는 「세 상태」라고 적었다.** `applyWindowState`는 `open`·`before`·`closed`·`unknown` **넷**을 돌려준다(⑩ ① 절이 이미 그렇게 적고 있었다). 네 상태가 화면의 무엇에 닿는지를 표로 넣었다. ⑥ 🔴 **커버리지에 분모를 적었다.** SH 상세 본문 접수기간은 **상세가 열린 9건 중 5건**(분모는 `hidden_from_listing=false` 12건에서 상세 없는 3건을 뺀 것)이고, 4건은 첨부 PDF에만, 3건은 상세 페이지 자체가 없다. ⑦ 🔴 **robots를 두 도메인으로 갈라 적었다.** ⑥에는 `housing.seoul.go.kr`(`Allow: /`)만 있었다. 상세 도메인 `www.i-sh.co.kr`은 `User-agent: *`에 우리 경로가 안 걸리지만 **AI 크롤러 13종을 이름으로 `Disallow: /`** 한다(`ClaudeBot`·`GPTBot` 등). 🔵 **⑩에는 사실만 적고 긁을지 말지의 판정은 ⑧·다운님 몫으로 남겼다.** ⑧ ✅ **백업 축 둘도 ⑩에 넣었다(짝 문서).** 리허설 판정식은 `(errors ignored on restore: N) − (허용 패턴 매치 구문 수)`이고 **부호 세 경우를 전부** 적었다 — 양수 실패 · 0 통과(종료 코드가 1이어도) · **음수도 실패**(파싱이 깨진 것이라 모를 때 초록을 주면 거짓 초록이 된다). 허용 패턴을 매 회차 뽑는 곳이 `auth_fk_names(schema_path)`임을 적어 **건수·표 이름·제약 이름을 박지 않았다는 사실이 증명되게** 했다. ⑨ ✅ **권한 대조 네 축과 「낡은 절」 정정.** ⑩ 「권한 변경은 검사 대상이 아니다」는 `--no-privileges` 시절 기록으로 남기고 정정했다. 기준은 **DB가 아니라 파일**(`schema/zipfit_schema_YYYYMMDD.sql`, 매 백업 회차 `backup.yml`이 갱신)이고, 세 상태가 갈리는 자리는 **기준 쪽이 비었는가 하나뿐**이다. `[VERIFY]` 현재 네 축은 **전부 🟡** — 최신 덤프가 옵션 제거 이전이라 기준에 ACL이 없다. ⑩ ✅ **`CLAUDE.md` — 원칙 24(작업 디렉터리를 경로로 판정) · 25(리허설 허용 오류 목록을 늘리지 않는다) 신설, 1-B는 검증 표를 이미 다루는 22에 흡수.** 결번·중복 0, 셋 각각 정확히 1회. ⑪ **하지 않은 것**: 🔴 **SH 상세 파싱 0**(robots 판정 전) · 트리거 수정 0(조회만) · ⑦·⑥·⑧ 미접촉 · ⑩·②에 새 최상위 절 0 · 낡은 서술 삭제 0(전부 정정 블록으로 덮었다) · `zipfit-backup` 저장소 미접촉. ⑫ **미확인**: 🔴 **⑩·②의 Notion 렌더 결과를 되읽지 못했다** — `fetch`가 한글 음절을 손상시켜 왕복 대조가 손상을 원문 오타로 오판할 수 있다(⑦ 「verbatim 인용의 예외」). 앵커 매치 성공과 무오류 반환까지만 확인했다 · 네 축의 실제 값(09-16 리허설 이후) |
| 2026-09-15 | **「접수기간 미상」을 화면에 드러냈다 — 그리고 지시서의 대상 건수 전제가 틀린 것을 구현 중에 잡았다**(🔴 **DB 변경 0 · DDL 0 · RPC 0 · EF 배포 0 · 프론트 `index.html` 1파일 + `sw.js` `CACHE_NAME` v96→**v97** · 판정 지점 8곳 중 6곳 이전·2곳 유지**). ① 🔴 **`applyWindowState`는 이미 `'unknown'`을 돌려주는데 화면에 그 상태가 없었다.** 카드는 `접수마감: -`로 그리고 배지·정렬·필터는 `status === '접수마감'` 문자열을 봤다. 그래서 한 일은 둘이다 — **`'unknown'`을 화면 상태로 만들고**, 문자열 판정 지점을 날짜 축으로 옮겼다. ② ✅ **술어를 하나로 세웠다 — `isHiddenAsClosed`.** 「날짜상 마감」이거나 「날짜를 모르는데 기관이 마감이라고 함」일 때만 감춘다. 🔴 `'unknown'`만으로는 감추지 않는다. 🔵 **`REGION_SCOPE`의 사본을 지우고 이 술어를 부르게 했다** — 같은 갈래가 두 벌이면 목록 필터와 지역 분포가 조용히 갈린다. ③ 🔴 **지시서 검증표의 「`unknown` = `apply_end IS NULL` = SH 92건」이 틀렸다.** `applyWindowState`는 **시작·마감 중 하나만 없어도** `'unknown'`이라 실제 대상은 **786건**(SH 92 + 비SH 694)이다. 🔴 **그래서 첫 구현이 반증 항목 3(기존 표시 손실)을 깼다** — `apply_start`만 없고 마감일은 아는 LH 694건의 마감일이 화면에서 사라졌다. **둘 다 없을 때만 줄을 통째로 바꾸도록 고쳤고**, 한쪽만 결측이면 아는 쪽을 그대로 두고 빈 자리만 `'미상'`으로 적는다(`'-'`는 「없다」로도 읽힌다). 🔵 실사용 영향은 작다 — 비SH 694건 중 **693건이 이미 기관 마감**이라 기본 필터에서 빠진다(안 빠지는 것은 1건). ④ ✅ **정렬을 네 단계로 넓혔다** — `open`(0) → `before`(1) → **`unknown`(2)** → `closed`(3). 미상은 마감보다 위다. 미상+기관마감은 3으로 떨어진다. ⑤ ✅ **문구는 「없음」이 아니라 「미상」이다** — 「접수기간 없음」은 상시모집으로 읽힌다. 칩 `📅 접수기간 미상`(회색, 기존 `.chip` 체계 그대로)과 날짜줄 `접수기간 미상 — 📄 원문에서 확인`(원문 링크 인라인). 새 디자인 언어를 만들지 않았다. ⑥ ✅ **실측 검증 — Playwright로 실제 화면을 봤다.** 컨테이너 Chromium + RPC 응답 stub(5행: open·before·unknown·미상+기관마감·closed). `pageerror` 0 · 마감숨김 ON에서 **미상은 남고 미상+기관마감·마감은 빠짐** · OFF에서 순서가 정확히 `open → before → unknown → closed` · 미상 카드에만 칩과 원문 링크. ⚠️ **CDN(jsdelivr)이 프록시 403이라 빈 스크립트로 채웠다** — 코드가 SDK 미로드를 이미 다룬다(`zfAuth=null`). ⑦ ✅ **단위 시험 21건 통과** — 실물 `index.html`에서 함수 원문을 잘라 와 돌렸다(사본을 만들지 않았다). 술어·정렬순위·칩·날짜줄·부분결측 보존까지. ⑧ 🔴 **(나)로 남긴 것 2곳 — 배지와 opacity다.** 카드의 `<span class="htag">`는 **기관이 말한 status를 그대로** 보여주는 자리라 날짜 축으로 옮기지 않았다. 「기관이 마감이라고 했는가」와 「지금 접수 가능한가」는 다른 질문이고, 미상 칩이 그 위에 **더해진다**(대체하지 않는다). ⑨ **2-5 조사 — SH는 개방목록을 직접 싣지 않는다.** 「공공데이터 개방소개」는 안내 페이지뿐이고 실제 목록은 `data.go.kr?keyword=서울주택도시공사`로 넘긴다. 🔴 **그 호스트를 못 읽었다** — 컨테이너 프록시와 Supabase `pg_net` **양쪽에서** TCP/SSL 핸드셰이크 타임아웃(25s·30s·20s 세 번). 데이터셋 유무는 **미확인**이다. ⑩ **하지 않은 것**: 🔴 **SH 상세 파싱 0**(robots 판정 전) · RPC 미접촉 · DB 쓰기 0 · 배지 체계 재설계 0 · `sigungu_nm`·첨부 수집·SH 빈 페이지 3건 전부 미접촉 · `zipfit-backup` 미접촉. ⑪ **미확인**: 🔴 **`data.go.kr`의 SH 데이터셋 목록**(위 ⑨) · **브라우저 육안 확인**(Playwright는 stub 데이터이고 실제 배포본이 아니다) · 미상 칩이 실제 SH 92건에 그려지는 것(stub 1건으로만 봤다) |
| 2026-09-15 | **`apply_end`를 보호 목록에 넣었다 — 증상이 0일 때 넣는 것이 요점이다**(🔴 **DDL 0 · 함수 1개 `CREATE OR REPLACE` 교체(`protect_detail_columns`, 본문 +1행 · 주석 +6행) · 표·정책·cron 전부 불변 · EF 배포 0 · 프론트 미접촉 · `index.html`·`sw.js` diff 0줄 · 실제 행 UPDATE 0(시험은 전부 롤백)**). ① 🔴 **종전 제외 근거가 LH·MYHOME에만 성립했다.** 주석이 「`apply_end`·`announcement_date`·`status`·`title`·`url` — 목록에서 매 런 오므로 NULL이 될 일이 없다」였는데, `collect-sh-announcements`의 `mapRow`가 `apply_start`과 **같은 줄에서**(`index.ts:183-184`) `apply_end`에도 리터럴 null을 싣는다(하루 4회). **같은 트리거 본문 주석이 그 사실을 이미 적어 놓았고**, `apply_start`은 그래서 보호에 들어갔는데 `apply_end`만 빠져 있었다. ② 🔵 **지금 피해는 0이다** — SH 92행의 `apply_end`가 전부 null이라 지워질 값이 없다. 🔴 피해는 SH 접수기간 상세 파싱이 들어오는 순간 시작되므로 **파싱보다 먼저** 넣었다. ③ ✅ **`CREATE OR REPLACE`로 교체했다 — `DROP` → 재생성을 쓰지 않았다.** 수집이 KST 09:00~18:50에 10분 간격으로 돌아 그 창에 런이 끼면 정확히 막으려던 소거가 그때 일어난다(트리거 주석이 같은 이유로 금지하고 있다). 트리거 바인딩은 재생성하지 않았다 — `protect_detail_columns_trigger on announcements` 1건 그대로. ④ ✅ **원칙 20 — 고치기 전에 대조했고 드리프트가 0이었다.** `supabase/rpc/protect_detail_columns.sql`의 md5가 `pg_get_functiondef` 출력과 **정확히 일치**(`4181561c…`)했다. 고친 뒤 왕복 대조도 일치(`72485dad…`). ⚠️ 파일 6,930바이트 vs `def_len` 4,757은 한글 멀티바이트라 **문자 수와 바이트 수 차이**일 뿐 드리프트가 아니다. ⑤ ✅ **실측 검증 — 실제 LH 행(`0000061062`, 원래값 `2026-04-10`)에 쓰고 전부 롤백했다.** `DO` 블록 끝에서 `RAISE EXCEPTION`으로 관측값을 실어 던져 **롤백과 보고를 한 번에** 했다: null 쓰기 → `2026-04-10` 그대로(보호됨) · non-null 갱신 → `2099-12-31` 반영(🔴 **반증 항목 통과 — 정상 갱신 경로가 살아 있다**) · 원복 → `2026-04-10` · 탈출구(`SET LOCAL zipfit.allow_null_clear='on'`) 안 → `NULL` 써짐. 롤백 후 그 행 `2026-04-10`·전체 non-null **2,562 불변**·스위치 `null`(누출 0). ⑥ 🔴 **SH `mapRow`의 리터럴 null은 정확히 셋이고, 이제 둘이 보호된다.** `sigungu_nm`·`apply_start`·`apply_end`뿐이다(전수 확인). `sigungu_nm`은 여전히 제외인데 **근거의 축이 다르다** — 「`get_announcements_deduped`의 `best_location`이 그룹 단위로 coalesce한다」이지 「매 런 온다」가 아니다. 이번 정정과 무관하게 유효하다. ⑦ ✅ **`announcement_date`·`status`·`title`·`url`은 건드리지 않았다.** SH 92행 전부 non-null인 것을 **관측했으나**(`mapRow`가 `row.announceDate`·`mapStatus(row.status)`·`row.title`·`row.url`로 실값을 싣는다) 확인만으로 보호 목록을 늘리지 않았다 — 보호는 되돌리기 쉬워도 「지워야 할 값이 안 지워지는」 반대 방향 사고를 만든다. ⑧ **하지 않은 것**: `collect-sh-announcements` 미접촉(리터럴 null 제거 대안 미채택 — 트리거 주석의 「왜 EF가 아니라 트리거인가」 넷이 그대로 적용된다) · SH 접수기간 상세 파싱 0 · 보호 목록에 다른 컬럼 0 · `region` 가드 미접촉 · `backup.yml` 미접촉(기대 개수 env는 2026-09-08에 사라졌고 함수 이름이 안 바뀌어 `schema_guard`가 그대로 통과한다). ⑨ **미확인**: 🔴 **다음 SH 수집 런(00/03/06/09 UTC) 이후 `apply_end` non-null 행 수가 줄지 않는 것** — 기준값 2,562를 적어 두었고 다음 런 뒤 대조해야 한다 · SH가 `sigungu_nm`을 실제로 채우게 되는 시점(지금은 0/92) |

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
- 🔴 **건수를 적을 때는 그 수를 어디서 셌는지 함께 적는다** (2026-09-15 추가 — ⑦ 「검증 기대값의 모수는 `get_announcements_deduped()`로 센다」). 같은 이름의 건수가 정의에 따라 여러 값이 된다 — 2026-09-15에 「접수기간 미상 대상」이 `apply_end IS NULL` 기준 92, 「시작·마감 중 하나라도 결측」 기준 786, 화면에 실제로 그려지는 것 17로 **셋 다 달랐다.** 🔴 **화면에 보이는 것을 묻는 항목이면 모수는 언제나 `get_announcements_deduped()`다** — `announcements` 원본을 그대로 세면 소스 중복·블록 분할 때문에 실제의 몇 배가 나온다(② 「가장 자주 틀리는 것」).
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
24. **작업 대상은 저장소 이름이 아니라 작업 디렉터리 경로로 판정한다** (2026-09-15 신설 — ⑦ 「2026-09-15 정정 — 「터미널이 다르다」는 항상 성립하지 않는다」 반영)
- 🔴 **「`zipfit` 터미널인가」로 묻지 않는다. 「지금 어느 경로에서 작업하는가」로 묻는다.**
- **계기**: ⑦은 두 저장소의 Claude Code 터미널이 다르다고 전제했으나, 2026-09-15 실측에서 **한 컨테이너에 `/home/user/zipfit`과 `/home/user/zipfit-backup`이 함께 클론돼 있고 GitHub 스코프도 둘 다 열려 있었다.** 그래서 「이 터미널이 `zipfit-backup`이면 실행하지 마십시오」 같은 가드가 **판정 불능**이 된다 — 참도 거짓도 아니다.
- ⚠️ 지시서에 이름 기준 가드가 적혀 있어도 **경로로 판정하고 그 사실을 회신 ③에 적는다.** 가드를 무시하는 것이 아니라 판정 가능한 축으로 바꿔 읽는 것이다.
- 🔴 **한 문서는 한 저장소만 다룬다는 ⑦ 규약은 그대로다.** 두 저장소가 함께 보인다고 해서 한 회차에 섞지 않는다.
25. **복원 리허설의 허용 오류 목록을 늘리지 않는다** (2026-09-15 신설 — ⑥ 「🔴 복원 리허설의 허용 오류 목록을 늘리지 않는다」 반영)
- **적용 대상은 `zipfit-backup`의 `scripts/restore_drill.py`**이지만, 규약 파일이 여기라 여기 적는다.
- 🔴 **새 오류가 관측되면 목록에 넣지 말고 실패로 둔다.** 「이것도 상시니까」로 셋째를 더하는 순간 판정이 다시 무의미해진다 — 매일 뜨는 경보는 읽히지 않게 되고 진짜 실패가 함께 묻힌다.
- 늘려야 할 근거가 생기면 **백로그에 등재해 판단을 받는다.** 리허설 회차에서 즉석으로 정하지 않는다.
- ⚠️ 허용 패턴이 지금 둘인 것과, 그 둘을 **매 회차 덤프에서 뽑는다**는 것은 구현 사실이라 ⑩이 정본이다. 여기는 「늘리지 않는다」만 적는다.

---

## 🔗 주요 링크

| 항목 | URL |
|---|---|
| 배포 | https://dauntown96.github.io/zipfit |
| GitHub | https://github.com/dauntown96/zipfit |
| Supabase | https://supabase.com/dashboard/project/khdpjjyspmlqtzperoqg |
| 노션 시작점 | 🏠 L0 — https://www.notion.so/3b48aaa7e15581f88981d0c636de780c |
