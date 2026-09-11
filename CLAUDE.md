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
| 2026-09-11 | **자격진단 소득 판정을 공식 기준액 표 + 가산 합산으로 바꿨다**(🔴 **DDL 2회(테이블 `urban_worker_monthly_income` 신설 · `eligibility_criteria` 컬럼 2개 추가) · DB 적재 8행 · 기본기준 UPDATE 7행(가산) + 3행(정정·`basis_note`) · `index.html`·`sw.js` 2개 수정 · PR #48 병합(병합 커밋 `40e4258`) · `CACHE_NAME` v82→v83 · EF 배포 0 · RPC 0 · `user_profiles` 미변경 · Notion ⑩·⑤ 수정**). ① 🔴 **밑값이 출처 불명 상수였다.** `MEDIAN_INCOME`이 공식 기준액 대비 1인 59.8%·2인 64.9%·3인 60.2%·4인 68.4%·5인 75.9%·6인 82.2%로 비율이 제각각이라 어느 표에서도 나오지 않는 값이었고, **공고 한도의 절반 수준으로 판정해 틀린 탈락이 나가고 있었다.** ② 🔴 **`LIMIT130`·`LIMIT200`의 정체가 밝혀졌다 — 매입임대 전세형 공고 한 건의 게시표다.** 경기남부 신혼·신생아Ⅱ 공고문 4쪽 표가 두 상수의 1~5인 10개 값과 글자 단위로 같다. 130/200은 그 유형 전용 비율이고 **1·2인 가산이 이미 녹아 있어** 다른 유형(70·50·100·150·160%)에 대해 문구가 거짓이었다. ③ 🔴 **기준액 표를 공고문 3건이 독립적으로 재현했다** — 성남 영구임대(2015122300020331)가 **100% 열을 직접 게시**하고, 인천남동 국민임대(…0224)가 70·80·90% 열, 대전충남 매입임대Ⅰ(…0188)가 70·90% 열을 게시한다. 합계 100개 값이 `round(income_100 × pct / 100)`으로 전부 일치한다. `apply.lh.or.kr`이 컨테이너 프록시 403이라 0-2 URL은 못 열었고 **이 교차 대조로 갈음했다**(`source_note`에 남겼다). ④ 🔴 **가산은 합산이다 — 지시서 원안(`Math.max` 비합산)이 폐기됐다.** 공고문 본문이 「소득·자산 기준은 가산항목에 따라 일정 비율로 가산되며, **가산항목이 중복시 합산 적용됩니다**」라 적고 게시표가 값으로 보여준다: 서울대방 맞벌이 2인가구 130%(=100+20+10) · 한부모 2인가구 1자녀 120%(=100+10+10) · 영구임대 일반입주자 2인가구 1자녀 70%(=50+10+10) · 광명 청년 2인가구 1자녀 120%. **자산·자동차 축은 `pick()` 그대로 뒀다** — 그쪽 가산은 비율이 아니라 고시표 값이라 더할 대상이 없다. ⑤ **원문 대조 9행 결과 — 1·2인 가산 비율이 7행 전부에서 1인 +20%p·2인 +10%p로 같다.** 분양·통합공공임대는 `basis_announcement_id`가 NULL이라 NULL로 뒀다. ⑥ **맞벌이에도 가산이 붙는 것이 게시값으로 확인됐다** — 대전충남 90% 행의 1인 4,194,699원(=110%)·2인 5,866,270원(=100%), 경기남부 200% 행의 1인 8,389,399원(=220%), 서울대방 「맞벌이 2인 가구 130%」. ⑦ **상충 3건을 정정했다**: 매입임대/일반 `income_pct` 100→**70**(원문 「70% 이하 … 본인 및 배우자 모두 소득이 있는 경우 90% 이하」, 공고별 2·3·4순위 3행도 전부 70/90) · 국민임대 `income_pct_birth1/2` NULL→80/90 · 행복주택/청년 NULL→110/120. 🔴 **셋 다 `basis_note`에 조항 원문·파일명·변경 전후를 덧붙였고 기존 문장은 지우지 않았다.** 국민임대 행에는 「종전 서술이 근거로 든 세 공고(…0292/0310/0328)는 이번에 대조하지 않았다」를 함께 적었다. ⑧ **맞벌이를 진단 폼 입력으로 받는다(모름/아니오/예)** — 종전에는 화면 문구 문자열에서 되짚어 추정했다(`incomeMsg.includes('맞벌이 기준')`). **프로필·EF·설정 탭에 연결하지 않았다**(다운님 결정). 「모름」일 때만 갈리는 유형을 👫 안내로 띄운다. ⑨ **소득 문구를 자산 문구와 같은 방식으로 바꿨다** — 「소득 650만원 — 소득요건 통과 유형 3개 (가구원수 2인 기준, 한도 최대 939만원)」. 단일 숫자를 박지 않는다. ⑩ **가구원수 1~7인 + 「8인 이상」, 상한 8.** `user_profiles.members`가 integer nullable이고 CHECK가 없어 호환 문제가 없다(설정 탭 입력은 이미 1~10을 받고 있었다). ⑪ 🔴 **정수 `pct`를 먼저 곱한다** — 5인 70%가 `9,326,985×70/100 = 6,528,889.5`로 정확히 반올림 경계에 걸리고 공고 게시값이 6,528,890이다. `base*(pct/100)`으로 쓰면 한 원이 어긋난다. ⑫ **검증 V1~V16 전부 통과.** V8~V13은 `limitsFor`를 `index.html`에서 **그대로 떼어내** 돌렸고(옮겨 적으면 시험이 코드와 갈린다), 공고문 게시값과의 교차 대조 6건을 함께 넣었다. V14·V16은 헤드리스 Chromium(CDP)으로 **실제 페이지를 띄워** 확인했다 — REST 응답만 스텁했고 판정·🍼·👫·소득 문구·보류 문구가 전부 사양대로 나왔다. V4는 `supabase.co`가 프록시 403이라 curl 대신 **DB 안에서 `set local role anon`**으로 쟀다(SELECT 성공 · INSERT·UPDATE·DELETE 전부 permission denied). ⑬ 🔴 **2-2 값 UPDATE를 push 직전에 실행했다**(17:29:22 KST UPDATE → 17:29:58 KST push, 간격 36초) — 구 코드가 도는 동안 매입임대/일반 70이 먼저 들어가면 `MEDIAN_INCOME`×70으로 더 엄격한 오판이 잠깐 난다. ⑭ **V6이 「값표가 지정한 셀 외 변화 0」을 확인했다** — DDL 전후로 11행의 열 단위 지문(`to_jsonb` − `basis_note` − 신설 2컬럼)을 떠서 대조했고, 바뀐 행은 정확히 3행이다. 전체 307행·기본기준 11행·판정대상 9행 불변. ⑮ ⚠️ **V7을 문자열 그대로 통과시키려고 두 가지를 바꿨다** — 주석에서 삭제된 상수 이름을 빼고(경위는 이 이력으로 옮겼다), 변수 `isDualIncome`을 `dualApplied`로 고쳤다(「맞벌이로 추정됨」이 아니라 「맞벌이 기준을 적용한다」는 뜻이 됐다). ⑯ **하지 않은 것**: 출산자녀 가산의 판정 적용(안내 전용 유지) · 맞벌이 프로필 저장 · 자산·자동차 계산 방식 변경 · 공고별 행·`manual_check_note` 2행 백필 · 7인 이상 증분(원문에 「6인가구 기준소득금액에 추가 1인당 평균금액 579,278원을 합산」 규칙이 있고 표의 7·8인 값이 그것과 정확히 맞는 것을 확인했으나 파생값 금지 원칙에 따라 관측만 남긴다) · 9인 이상 · 전세형 자산 가산 모순 · 3번 묶음 · 기존 anon GRANT · `zipfit-backup` 접근. ⑰ **미확인**: 배포 후 첫 정기 백업에서 `schema_guard`가 신설 TABLE·POLICY·COLUMN을 통과시키는지(배포 전에는 확인 불가) · 실제 배포본에서의 육안 동작(로컬 재현으로 갈음, 다운님 몫) · 국민임대 종전 서술이 근거로 든 세 공고의 소득 가산 조항(이번 대조 대상 아님). |
| 2026-09-10 | **폴더 경합 판별 + 수리 — `mode=ensure_folder` 신설 · `mode=upload`가 `folder_id`를 받는다**(🔴 **EF 1회 배포(v5) · `supabase/functions/fetch-attachment/index.ts` 1개 수정 · PR #46 병합(병합 커밋 `31c56e5`). DB 쓰기 0 · DDL 0 · RPC 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · `attachment_urls` 미수정 · Notion 미수정**). ① 🔴 **원인은 ㈎ 순수 순서다 — 인덱스 지연이 아니다.** `mode=ensure_folder`로 간격을 달리해 실측했다: 간격 ≈0(같은 트랜잭션)에서 폴더 2개(생성 시각 290ms 차) · ≈1.2초에서 1개(두 번째가 첫 번째 것을 찾음) · ≈11초에서 1개(`created:false`, 같은 ID). Drive `files.list`의 인덱스 지연은 어느 간격에서도 관측되지 않았다. ② 🔴 **그런데 창이 좁지 않다 — 이것이 이번 회차의 핵심 수치다.** 응답 지연을 분해하면 find-only 경로가 675ms, find+create 경로가 1,376ms이므로 **`createFolder` 왕복만 약 700ms**다. 즉 두 요청의 `findFolder`가 그 700ms 안에 들어오면 둘 다 만든다. 실측 동시 발사의 지터는 200~300ms이므로 **창 안에 통째로 들어간다.** 첫 사고의 211ms 차, 재현의 290ms 차가 둘 다 이것으로 설명된다 — 「거의 동시에 쐈으니 운이 나빴다」가 아니라 **동시에 쏘면 거의 항상 갈린다**는 뜻이고, 5건이면 최대 5개다. ③ **수리는 폴더 생성을 분리하는 것이다.** `mode=ensure_folder`가 공고 폴더만 확보해 ID를 돌려주고, `mode=upload`는 `folder_id`가 오면 **찾지도 만들지도 않는다** — 그 경로에는 check-then-act가 아예 없다. ④ **하위 호환을 남기되 조용하지 않게 했다** — `folder_id` 없이 부르면 종전대로 동작하지만 응답에 `warning`과 `folder_source:'ensured'`가 붙는다. 실측에서 둘 다 나왔다. ⑤ **`folder_id`는 Drive를 부르기 전에 형식을 본다**(`/^[A-Za-z0-9_-]{10,200}$/`) — 질의문과 URL에 그대로 들어가기 때문이다. 잘못된 값은 LH·Drive 호출 없이 400이다. ⑥ **폴더 조회에 `createdTime`을 더했다** — 갈렸을 때 어느 쪽이 먼저인지를 추측하지 않고 Drive 서버 시각으로 본다. 판별이 가능했던 것도 이 값 덕이다. ⑦ 🔴 **검증 — 김제하동을 다시 받아 완주했다.** `ensure_folder`로 폴더 `1aSwmoTYneYkoUKl6qSTX89RJUqu-reeB`를 확보한 뒤 첨부 2건을 **동시에** `folder_id`와 함께 쐈다. **폴더 정확히 1개** · 파일 2건이 같은 폴더에(생성 시각 66ms 차) · **sha256 2건 전부 원본과 일치** · MIME `application/pdf`·`application/vnd.hancom.hwpx` 유지 · Google 변환 없음 · 두 응답 모두 `folder_source:'param'`. ⑧ **계측(`elapsed_ms` 기준)**: 수리 후 업로드 3,741ms(PDF 1,152,613B) · 3,907ms(hwpx 973,201B), `ensure_folder` 1,500ms. **수리 전 같은 두 건이 5,364·5,068ms였다** — `folder_id`가 Drive 왕복 2회(find+create)를 없애 건당 약 1.2~1.4초가 줄었다. 폴더 확보 1.5초를 더해도 2건에서 이미 본전이고 첨부가 늘수록 벌어진다. 파일 크기 합계 2,125,814B. ⑨ ⚠️ **`net._http_response.created`는 응답 시각이 아니라 큐 삽입 시각이다** — 직전 회차 지적을 이번에도 재확인했다. 소요는 `elapsed_ms`로만 잰다. ⑩ **가드 전수 확인**: 허용 외 host 403 · 허용 외 path 403 · 시크릿 불일치 401 · 잘못된 `folder_id` 400 · `announcement_id` 누락 400 · 상한 `MAX_SOURCE_BYTES` 6,000,000 불변(응답 `limit_bytes`로 확인). ⑪ ⚠️ **지시서와 다른 순서로 갔다** — 실행 순서가 「1장 판별 → 2장 수리」였으나 **2장을 먼저 만들고 그것으로 1장을 쟀다.** 지시서 1장이 「실제 첨부를 쓸 필요가 없다 — 폴더 생성만 일으키면 된다」고 했는데 종전 코드에는 폴더만 만드는 경로가 없었다. 수리안은 판별 결과와 무관하게 이미 정해져 있었으므로(2장 서두) 순서를 바꿔도 결론이 바뀌지 않는다. ⑫ **시험 폴더 이름은 `[시험]`이 아니라 `[임시] TEST-race-*`다** — 접두사 `[임시] `는 EF가 붙이고 호출자는 `announcement_id`만 준다. 6개 전부 **휴지통**으로 정리했다(a 2개·b·c·d·e). 첫 사고로 갈린 폴더 2개도 휴지통이다. **영구 삭제는 하나도 없다.** ⑬ **하지 않은 것**: 폴더 ID 보관 구조(2-C — 의견만) · `attachment_urls` 수정 · 잘린 hwpx 파일명 정정 · 상한 상향 · 가드 완화 · scope 확대 · 2·3번 공고 · SH·MYHOME · 분석·DB 적재 · 폴더명 정정 · Notion · `zipfit-backup` 접근. ⑭ **미확인**: 배포본과 저장소 파일의 바이트 단위 일치(MCP가 파일이 아니라 문자열을 돌려줘 해시 대조 불가 — 대신 기능 시험으로 변경 경로 전부를 훑었다) · 인덱스 지연의 하한(0.3~1.2초 구간을 만들 수단이 없었다. 다만 ㈎로 설명이 끝나므로 수리에 영향 없음) · 5건 동시 호출 실측(2건으로만 시험) · 상한 초과 건의 라이브 재현(코드 미변경으로 갈음). |
| 2026-09-10 | **`fetch-attachment`에 Drive 직접 업로드 추가 — 놓는 쪽이 뚫렸다**(🔴 **EF 2회 배포(v2 신설·v3 파일명 복원) · `supabase/functions/fetch-attachment/index.ts` 1개 수정 · PR #44 병합(병합 커밋 `3696e0c`). DB 쓰기 0 · DDL 0 · RPC 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · `attachment_urls` 미수정 · ⑩ 시스템 구조 미수정**). ① 🔴 **막혀 있던 것은 받는 쪽이 아니라 놓는 쪽이었고, 그 구간이 사라졌다.** 직전 회차에 base64가 도구 파라미터를 거치며 31,587B가 11,352B로 잘렸는데, EF가 Drive API로 직접 올리면 파일이 Supabase 안에서 LH → Drive로 바로 간다. ② **무결성이 sha256으로 확인됐다** — EF가 인코딩 전에 계산한 `75034029…4e14e`와 Drive가 돌려준 `sha256Checksum`이 일치하고 크기 333,497B도 같다. claude.ai가 커넥터로 직접 열어 **ZIP 16개 엔트리 CRC 전부 통과 · 표 92개 병합 셀까지 복원**을 확인했다. ③ **형식은 유지된다** — `application/vnd.hancom.hwpx`로 저장되고 Google 형식 변환이 없다. `metadata.mimeType`에 `application/vnd.google-apps.*`를 넣지 않는 한 Drive는 변환하지 않는다. ④ 🔴 **지시서와 다른 사실 — 허용목록에 `oauth2.googleapis.com`을 넣지 않았다.** 지시서는 「안 하면 자기 가드에 자기가 막힌다」고 했으나 `rejectReason`은 *호출자가 준 URL*과 리다이렉트 홉에만 걸리고 Drive·OAuth 호출은 상수 URL로 따로 나간다. 넣었으면 **가드가 넓어지기만 했다**(호출자가 googleapis 임의 URL을 우리를 통해 부를 수 있게 된다) — 같은 지시서 1-D 「가드를 완화하지 않는다」와 정면 충돌이다. 보고만 했고 **claude.ai가 자기 오류로 판정했다**(⑧ 판례 등재). 실측으로 `storage.googleapis.com` 403을 확인했다. ⑤ 🔴 **시크릿이 EF 환경변수에 없었다 — Vault에만 있다.** `selftest` 실측에서 `GDRIVE_CLIENT_ID`·`GDRIVE_CLIENT_SECRET`·`GDRIVE_REFRESH_TOKEN`이 전부 false다. **env 우선 · DB Vault 폴백으로 미리 짜 둔 덕에 회차가 멈추지 않았다**(폴백은 `SUPABASE_DB_URL` + 동적 `npm:postgres` import라 env로 해결되면 로드조차 되지 않는다). ⑥ **파일명이 처음에 깨졌고 그 자리에서 잡았다.** LH는 `Content-disposition`에 UTF-8 바이트를 그대로 싣고 HTTP 헤더는 latin-1로 읽히므로 「경남」이 「ê²½ë¨」으로 도착한다. **DB에서 코드포인트를 바이트로 재해석해 원문과 정확히 일치함을 확인한 뒤**(`all_below_256`이 참) `repairLatin1Utf8`을 넣어 v3로 재배포했다. ⑦ **중복은 `sha256Checksum`으로 가른다** — 같으면 `skipped_identical`(2회차 실측), 이름이 같은데 내용이 다르면 **지우지도 덮지도 않고 `conflict`로 멈춘다**(`on_dupe=replace`로만 덮는다). 체크섬을 못 받으면 크기만 보고 그 사실을 `duplicate_compared_by`에 남긴다 — **약한 근거로 같다고 말하지 않기 위해서다.** ⑧ 🔴 **상한 가드가 업로드 경로에서도 산다** — 34,378,215B 팸플릿이 `size_exceeded_declared`로 548ms만에 끝났고 **응답에 `drive` 블록 자체가 없다**(Drive 호출이 아예 안 나갔다는 뜻이다). 허용 외 호스트 403 · 허용 외 경로 403 · 시크릿 불일치 401도 그대로다. ⑨ **동시성 취약점이 닫혔다** — 다운님이 `GDRIVE_ROOT_FOLDER_ID`를 설정한 뒤 재실행하니 `root_folder_name`이 **null**이다. 코드가 `rootEnv ? null : DRIVE_ROOT_NAME`으로 쓰므로 **null이 곧 「이름찾기를 타지 않았다」는 증거**이고, 루트가 둘 생길 경로가 사라졌다. ⑩ **Drive 좌표**: 루트 `14u6Tua8-sYNGiWpn8EtqJbAt4Aif5TJa` · 공고 폴더 `1-bS8bFKJnZI43dza7wBkOa2YSZ9J-MXc`(`[임시] 2015122300020723`) · 파일 `12gIH46w_1d3pB2dZWY8rPp5qvDFVAi-M`. 파일명이 깨진 첫 시도분 `1miO-Pk2onyZ6vjwCx-vjB9aPO1qk0Dp7`은 **휴지통으로 보냈다**(영구 삭제 아님). ⑪ ⚠️ **`read_file_content`가 hwpx를 거부한다.** 다만 **대조군으로 7월에 손으로 올린 hwpx(`1NLJpXSU…`)도 똑같이 거부되는 것을 확인해 업로드 경로 탓이 아님을 갈랐다.** 분석은 `download_file_content`가 base64를 디스크로 떨어뜨리는 경로로 열린다. ⑫ **크기 상한은 올리지 않았다(6MB 유지).** 다만 **업로드 경로는 MCP 전달을 타지 않아 상한 근거가 사라진다** — 오늘 걸린 9,929,350B는 10MB 상한이면 통과한다. 관측만 남긴다. ⑬ **scope는 `drive.file`로 둔다** — 폴더가 두 곳으로 갈리는 불편보다 EF가 Drive 전체 쓰기 권한을 갖는 위험이 크다. ⑭ **하지 않은 것**: 자동화 본체 · 상한 상향 · scope 확대 · ⑩ 시스템 구조 · 시험 폴더·정상 파일 삭제 · SH · `attachment_urls` · `index.html`·`sw.js` · `zipfit-backup` 접근. ⑮ **미확인**: 배포본과 저장소 파일의 바이트 단위 일치(MCP가 파일이 아니라 문자열을 돌려줘 해시 대조 불가 — 대신 원격 blob과 로컬은 `md5 fbfd03d0…a441`로 일치) · 한 공고 첨부 여러 건의 동시 호출 거동(단건만 시험) · SH 첨부 경로. |

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
- 상세는 Notion 매뉴얼 ② 「RLS 원칙」.
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
