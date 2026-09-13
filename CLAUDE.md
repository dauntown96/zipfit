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
| 2026-09-13 | **`selection_method`·`contract_before_verification`를 채웠다 — 그리고 「수집이 덮는가」에 payload로 답했다**(🔴 **DB 데이터 쓰기 3행(`announcements`, 두 컬럼) · DDL 0 · 함수 재생성 0 · 트리거·보호 목록 미접촉 · `announcements`의 다른 컬럼 미접촉(`updated_at`만 트리거가 갱신) · 과거 회차 역전파 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · EF 배포 0 · 프론트 0 · `zipfit-backup` 미접촉 · `CLAUDE.md`·`docs/history.md` 수정 · Notion ⑩ 수정 — 새 절 1개(하위 3절, 원문 삭제 0) · PR #__ 병합(병합 커밋 `__`)**). ① 🔴 **2장 세 물음의 답 — 넣어도 안 지워진다. 근거는 「보호 목록」이 아니라 「payload」다.** 배포본 `collect-announcements` **v40 실물**을 열어 `mapLHRow`·`mapMyHomeRow`의 반환 키를 전수로 셌더니 **두 컬럼이 어느 쪽에도 없다**(SH·`upsert-announcement` 소스에는 문자열 자체가 0건). payload에 키가 없으면 `ON CONFLICT DO UPDATE`의 SET 목록에 오르지 않으므로 `protect_detail_columns()`의 보호 목록에 없어도 상관없다 — 그 트리거는 **payload에 실린 NULL**을 되돌리는 장치다. ② ✅ **말이 아니라 런으로 확인했다.** 기입(UTC 08:27:43) 뒤 **정기 런 1회**(`collection_run_log` 4416, UTC 08:30:42 = KST 17:30)가 세 행을 실제로 다시 upsert했고(`updated_at`이 08:27:43 → 08:30:38로 갱신됐다) **두 값은 그대로다.** 🔵 **두 번째 런(08:40)은 이 커밋 시점에 아직 안 돌았다** — 회신에 결과를 적는다. 🔴 즉 「행이 안 닿아서」가 아니라 「닿는데 그 컬럼을 안 싣는다」가 맞다. ③ 🔴 **1장 원문 재확인 — claude.ai가 옮긴 값과 전부 같았다.** Drive 원문 3건을 **전문으로** 읽었다(원칙 12). **김제하동**: 원문 제목이 「…(60세 이상 신청접수·**선착순 동·호 지정**·**선계약후검증**)」이고 본문이 「신청자가 선착순으로 원하는 동·호지정하여 당일 계약체결하고 이후 입주자격을 검증하는 「先계약 後검증」 방식」 · 제출서류에 **「선계약후검증 입주관련 확약서」** 실물 존재 · 「현장신청만 가능」 → `선착순방문` + `cbv=true`. **서산석림3**: 「금회 모집하는 임대주택은 방문(현장) 접수」 · 신청순위 **선착순** · 「인터넷/모바일 신청 불가능」 · 선정절차가 **청약신청 → 입주자격 검증 → 당첨자 발표**라 계약이 검증 뒤다 → `선착순방문` + `cbv=false`. **군산**: 「선계약」·「후검증」·「확약서」 **0건** → `cbv=false`. ④ 🔴 **군산의 `selection_method`가 비는 이유 — 세 값 어디에도 해당하지 않는다.** 선정방법이 **「순위 → 배점 → 추첨」**(50㎡ 미만은 거주지 순위, 이상은 청약저축 납입회수 순위)이고 **인터넷·모바일 신청을 운영**한다. 추첨은 `순위 → 배점`까지 같을 때의 **마지막 동점 처리**라 「순위 내 추첨」(`우선순위추첨`)이 아니다 — 이 형태는 LH 국민임대의 기본값이라 여기에 배지를 달면 배지가 뜻을 잃는다. 스킬 규정대로 **NULL**로 뒀다. ⑤ **`selection_method` 허용 3종**: `선착순방문`(🏃 붉은 배지) · `선계약후검증`(⚠️ 주황 배지) · `우선순위추첨`(🎲 보라 배지). 🔴 **셋은 `buildConvBadges()`에서 `if/else if/else if` 배타 분기**라 한 공고에 하나만 붙고, 세 값 밖 문자열은 **에러 없이 배지만 사라진다.** ⑥ 🔴 **그래서 김제하동을 `선계약후검증`이 아니라 `선착순방문`으로 넣었다.** `contract_before_verification`이 이미 별도 축(`data-contract-verify` → 붉은 경고 박스)이라, 같은 사실을 두 번 그리는 대신 **선착순이라는 잃을 뻔한 정보**를 배지에 실었다. ⑦ ✅ **검증 — 변경 행 정확히 3행.** 같은 문장 안에서 `to_jsonb(before)` ↔ `to_jsonb(after)`를 키 단위로 대조해 **바뀐 키가 목표 두 컬럼과 `updated_at`뿐**임을 확인했다(김제하동 `cbv false→true`·`sm ∅→선착순방문` / 서산 `sm ∅→선착순방문` / 군산은 값이 이미 목표와 같아 `updated_at`만 바뀐 **무변화 쓰기**). ⑧ ✅ **원칙 10을 구조로 지켰다.** `set_revised_at()` 본문을 먼저 읽어 `is_revised`가 false→false면 **`revised_at`·`revised_at_source`를 OLD에서 그대로 복사**함을 확인했고, 실제로 세 행 다 `revised_at` NULL · `revised_at_source='auto'` 불변이다. `protect_created_at`·`compute_announcement_flags`도 값이 안 바뀌었다. ⑨ ✅ **불변식 6 — 전수로 다시 셌다.** `selection_method` 분포가 `선계약후검증` 6 · `선착순방문` 3 · `우선순위추첨` 1 · NULL 2,634(합 2,644)로 **허용 3종 밖 0건**이다. `cbv=true`는 8행. ⑩ ✅ **불변식 5 — 세 공고 전부 일치.** 완화 축은 셋 다 원문에 「완화」 표현이 0건이고 `is_relaxed_recruitment=false`라 맞고, 선계약후검증 축은 ③대로다. ⑪ ✅ **Tier 관문 재판정** — 관문 3(`address`·`building_name` NOT NULL) 세 공고 **NULL 0행** · 관문 4(블록 함수 회귀) `get_announcement_group_ids`/`get_announcement_blocks`가 B1 때와 같은 수(김제하동 9/1 · 군산 6/5 · 서산 2/1) · 관문 2는 서산 원문의 전환이율이 **증액 6%·감액 3.5%**로 정상임을 이번 전문 읽기로 재확인 · 관문 1·5·6은 이 회차가 `housing_units`를 건드리지 않아 B1 판정 그대로다(군산은 여전히 `완료(판정 대기)`). ⑫ **하지 않은 것**: 과거 회차 역전파(완화 공고 13건 플래그 누락 보고분 포함) · 트리거·보호 목록 변경 · `announcements`의 다른 컬럼 · DDL · 함수 재생성 · 프론트·EF 접촉 · `announcement_analysis` 상태 변경. ⑬ **미확인**: 김제하동 **직전 회차(`…20310`)는 두 값이 NULL·false로 남아 있다**(역전파 범위 밖 — 다만 카드가 그리는 것은 승자인 `…20701`이라 화면 증상은 없다) · 군산의 주거약자용 원문 모순은 그대로 미해결 · 수집 payload에 이 두 키가 **나중에 추가되면** 그 순간부터 매 런 덮인다(지금은 아니다). ⑭ **범위 밖 발견**: ⓐ `mapLHRow`는 상세 실패 시 상세 파생 컬럼을 **NULL로 채워** 보내고 그 NULL을 트리거가 되돌린다 — 즉 「보호 목록에 있다」와 「payload에 있다」는 **같은 질문이 아니다.** 이 회차의 판정은 후자로만 갈렸다. ⓑ `updated_at`은 우리가 안 건드려도 매 런 바뀐다 — 「마지막 수정 시각」으로 분석 반영 시점을 재구성할 수는 없다. |
| 2026-09-13 | **낡은 회차를 화면에서 구분해 보인다 — 배너 게이트를 넓히고 세대 행마다 회차를 찍는다**(🔴 **`index.html` 수정(배너 게이트 1곳 · 문구 1개 신설 · 회차 조회·판정 함수 2개 신설 · `loadHousingUnits` 1곳 · 세대 행 렌더 1곳 · CSS 4줄) → `sw.js` `CACHE_NAME` v89→v90 · DB 쓰기 0 · DDL 0 · 함수 재생성 0(`get_announcement_group_ids` 미접촉) · 산물 삭제·숨김 0 · 권한 변경 0 · EF 배포 0 · `announcements` 미접촉 · `CLAUDE.md`·`docs/history.md` 수정 · Notion ⑩ 수정 — 회차 혼입 절에 하위 절 3개 추가(원문 삭제 0 · 제목 사라짐 0 · +3,304자) · PR #85 병합(병합 커밋 `361d337`)**). ① **1-1 게이트 — 조건을 바꾼 것이 아니라 하나를 더했다.** 종전 `if(rawRows.some(r => r.announcement_id === annId)) return '';`을 `orphan`(대표행 자신의 산물이 결과에 하나도 없다 — **글자 하나 안 바꿨다**)과 `mixed`(그 블록에 실려 온 행들의 회차가 둘 이상이다 — 새 축)의 **OR**로 넓혔다. ② 🔴 **`mixed`는 형제 ID 수가 아니라 「실제로 온 행」의 회차를 센다.** 형제가 9개여도 산물이 한 회차에만 있으면 화면에서는 안 섞인다 — 그때는 켜지 않는다. 이것이 「정상 그룹 불변」을 구조로 보장하는 자리다. ③ 🔴 **정정 제외 — 실려 온 행의 공고 중 `is_revised`가 참인 것이 하나라도 있으면 켜지 않는다**(정정은 같은 회차라 옛 산물이 유효하다). ④ 🔴 **정정 판정의 정본이 `is_revised`인 근거를 직접 조회해 확인했다.** 서울대방 그룹 4행 중 **LH 정정행 `2015122300020297`은 `is_revised=true`인데 `before_pblanc_id`가 NULL**이다(채워진 것은 MYHOME `20694_1` 한 행뿐, 값 `20652`). `[정정공고]` 접두어도 LH 제목에만 있다. **두 소스 모두에서 참인 축은 `is_revised` 하나**이며 claude.ai 판정과 실물이 일치한다. 김제하동 9개는 전부 false다. ⑤ **문구 — 기존 것은 그대로 두고 하나를 더했다.** `STALE_SRC_MSG_PLAIN`은 「이 블록이 통째로 다른 회차」인 orphan의 문구라, 대표 회차와 지난 회차가 **섞인** 상태에 그대로 쓰면 **대표 회차 행까지 낡은 것처럼 읽힌다.** 그래서 `STALE_SRC_MSG_MIXED`(「여러 회차의 정보가 함께 표시되고 있습니다. 행마다 회차를 적었으니 「이번 회차」 표시가 없는 값은 공고 원문과 함께 확인하세요.」)를 신설했고 우선순위는 `mixed` → `revised` → `plain`이다. **orphan 카드는 종전 문구를 글자 그대로 본다**(검증 ⑩에서 실측). ⑥ **1-2 배지 형태 — 주소줄에 칩 하나, 「이번/지난 + 날짜」.** `이번 회차 · 2026-09-07`(흰 바탕·초록 테두리) / `지난 회차 · 2026-07-06`(주의색 채움). 🔴 **날짜만 적으면 어느 쪽이 지금 것인지 여전히 모르므로 말과 색을 둘 다 가른다.** 모집 배지가 이미 초록 채움이라 이번 회차는 테두리형으로 두어 겹치지 않게 했다. 위치를 주소줄로 고른 것은 행의 첫 줄이 곧 그 행의 신원이고, 비고 한 줄로 내리면 긴 `extra_note` 아래로 밀려 접힌 상태에서 안 보이기 때문이다. ⑦ **날짜는 `announcements`를 한 번 더 조회해 얻는다** — `get_announcement_group_ids` 미접촉(반환 타입 변경은 DROP 후 재생성이라 ACL까지 다시 세운다). 세대정보 조회와 `Promise.all`로 나란히 보내 왕복이 늘지 않고, 그룹이 아니거나 형제가 하나면 **요청 자체를 안 보낸다**. ⑧ 🔴 **범위 밖이 아니라 1-2를 옳게 만들기 위해 dedup에 한 줄을 더했다** — 값까지 같은 세대가 두 회차에 다 있으면 살아남는 행의 회차를 **최신 쪽으로 올린다**. dedup 키에 `announcement_id`가 없어 생존 행이 어느 회차의 것인지는 정렬에 달려 있고, 그대로 두면 두 회차에 다 있는 행이 「지난 회차」로 잘못 찍힌다. **행 수는 바뀌지 않는다.** ⑨ **1-3 — 세 로더는 손대지 않았다.** `staleSourceBannerHtml`이 넷의 공유 함수라 게이트를 넓히면 넷 다 바뀔 자리였는데, 새 인자(`rounds`)를 **넘기는 쪽에서만** 켜지게 해 `policies`·`extras`·`eligibility` 호출 3곳은 인자가 4개 그대로다. 🔴 **일괄 적용은 이 회차가 갈라 잰 것을 되돌리는 일이다** — `eligibility`는 행이 완전히 접혀 증상이 없고, 거기에 「다른 회차」 배너를 띄우면 틀리지 않은 정보에 경고를 다는 셈이다. ⑩ ✅ **검증은 실제 브라우저로, `anon` 실물 응답으로 했다.** `index.html`에서 이 경로의 CSS·함수를 **그대로 잘라** 하네스에 넣고, DB `net.http_get`으로 부른 **anon REST 응답 8건(전부 200)**을 먹여 Chromium으로 네 경우를 돌렸다. **김제하동** 배너 **켜짐**(MIXED 문구)·4행·배지 4개(지난 2026-07-06 2개 · 이번 2026-09-07 2개) / **서울대방** 배너 **꺼짐**·3행·배지 0 / **정상 그룹**(`2015122300020206`) 배너 **꺼짐**·3행·배지 0 / **기존 orphan**(`2015122300020405`) 배너 **켜짐**·**종전 `PLAIN` 문구 그대로**·5행·배지 0. 420px 폭 육안도 함께 봤다. ⑪ 🔴 **서울대방은 두 겹으로 꺼진다 — 그런데 그중 하나는 내가 몰랐던 것이다.** 정정 제외가 걸리기 전에 이미 **`housing_units`가 `2015122300020297` 한 ID에만 3행 있어** 회차가 하나다(`policies`·`eligibility`는 두 ID에 걸쳐 있어 그쪽 축에서는 섞였다). 즉 이 시험은 정정 제외 로직 단독을 증명하지 못한다 — **`is_revised` 축을 단독으로 시험할 표본이 지금 DB에 없다.** ⑫ 🔴 **규모 실측 — 이번 변경으로 화면이 바뀌는 카드는 하나다.** 전 그룹을 훑어 「`housing_units`를 가진 `announcement_id`의 `announcement_date`가 COUNT(DISTINCT) ≥ 2」인 그룹을 셌더니 **김제하동 1개**뿐이다. orphan 그룹(대표행에 산물 0, 형제에만 있음)은 **78개**이고 전부 종전 문구로 계속 켜진다. ⑬ **하지 않은 것**: DB 쓰기·DDL·함수 재생성 · 김제하동 4행 삭제·숨김 · 거르기·접기 · `policies`·`extras`·`eligibility` 접촉 · `announcements` 접촉 · EF·`zipfit-backup` 접촉 · ⑩ 원문 삭제. ⑭ **미확인**: 다운님 브라우저 육안(컨테이너에서 `github.io`·`supabase.co`가 프록시 403이라 실배포 화면은 못 본다 — 하네스는 **실물 응답 + 실물 코드**지만 배포본 자체는 아니다) · 정정 제외 로직의 단독 시험(위 ⑪) · 접힌 `<details>` 안에서는 배지도 펼쳐야 보인다(lazy 구조 그대로). ⑮ 🔴 **거르기(2단계)가 필요한가 — 이번 화면에서는 근거가 안 보였다.** 혼입 그룹이 1개·4행이고 그 4행이 **같은 단지의 같은 평형**이라 나란히 서면 오히려 값 변화(보증금 17,867,000 → 18,042,000)가 읽힌다. 배너+배지로 「어느 것이 지금 것인가」가 화면에서 답해진다. 🔴 **다만 이것은 지금 규모의 판단이다** — 재공고 주기가 월 1회인 단지의 분석이 늘면 한 카드에 6회차 12행이 설 수 있고, 그때는 접는 것이 필요해진다. **판단 재료로만 적는다.** |
| 2026-09-13 | **낡은 회차의 임대조건이 카드에 함께 뜬다 — 조사. 실제 증상은 1그룹뿐이고 이미 있는 배너가 사각지대다**(🔴 **조사 전용 · 코드 수정 0 · DDL 0 · DB 데이터 쓰기 0 · 산물 삭제 0 · 함수 재생성 0 · 권한 변경 0 · `index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가 · EF 배포 0 · `CLAUDE.md`·`docs/history.md` 수정 · Notion ⑩ 수정 — 새 절 1개(하위 4절, 원문 삭제 0) · PR #83 병합(병합 커밋 `67b370f`)**). ① **1-1 (1) 네 로더가 전부 같은 경로다.** `loadHousingUnits`(3642행)·`loadPreciseEligibility`(3565)·`loadAnnouncementPolicies`(3492)·`loadAnnouncementExtras`(3178)이 넷 다 `resolveAnnouncementIds(annId, useGroup)` → `idFilterFor(ids)`로 `in.()` 조회한다. 카드 상세는 넷 다 `useGroup=true`고, 블록별 분리 표시(`toggleBlockGroup`)만 단건(`eq.`)이다. ② 🔴 **1-1 (2) 부작용이다.** `get_announcement_group_ids`는 `announcement_dedup_key(title)`가 같고 `hidden_from_listing IS NOT TRUE`인 행을 **전부** 돌려준다 — 날짜도 회차도 안 본다. `index.html` 주석이 밝힌 설계 의도는 「정정공고로 대표행이 바뀌면 옛 ID에 붙은 데이터가 안 보이게 되는 orphan을 막기 위해」이고, **정정은 같은 회차·새 ID라 옛 산물이 그대로 유효하다.** 재공고는 다른 회차인데 제목이 같아 같은 키가 된다. ③ **김제하동 그룹은 ID 9개·회차 6개**(04-08/05-08/06-08/07-06/08-06/09-07)이고 9개 전부 `is_revised=false`·`before_pblanc_id` NULL이다 — 정정이 아니라 순수 재공고다. ④ 🔴 **1-1 (3) 판정 재료는 이미 있다.** `get_announcements_deduped`의 승자 선정식이 `ORDER BY dedup_key, announcement_date DESC NULLS LAST, …`로 시작한다 — **첫 정렬키가 날짜 내림차순이라 승자는 언제나 최신 회차**이고, 카드가 들고 있는 `annId`가 곧 그 회차다. ⚠️ 다만 `get_announcement_group_ids`가 `announcement_id` 한 컬럼만 돌려줘 **형제들의 날짜를 화면이 모른다** — 날짜로 좁히려면 그 함수가 날짜를 함께 주거나 화면이 `announcements`를 한 번 더 조회해야 한다. ⑤ 🔴 **1-2 네 테이블이 갈린다. 화면 dedup 키를 SQL로 그대로 재현해 쟀다**(김제하동 그룹, 조회행→화면행): **`housing_units` 4→4 = 틀린 것**(키에 `deposit`·`monthly_rent`가 들어 있어 회차마다 달라 안 접힌다. 유효하지 않은 조건이 현재 조건과 나란히 선다) · **`announcement_extras` 12→12 = 중복이지만 틀리지 않다**(두 회차가 같은 평면도·배치도를 **각각 새로 업로드**해 Drive ID가 12개 전부 다르다. 내용은 같은 단지의 같은 도면) · **`announcement_policies` 12→11 = 중복이지만 틀리지 않다**(6 카테고리 중 날짜를 담은 것은 「선착순 선계약후검증 방식」 1건뿐이고 그것도 신규 회차 쪽에만 있다. 나머지는 할증표·중복선정·불법전대·편의시설·당첨발표 절차로 회차와 무관하다. **틀린 값 0건**) · **`eligibility_criteria` 6→3 = 증상 없음**(자격 요건이 회차 간 동일해 화면이 전부 접는다). ⑥ 🔴 **규모 — 판정식을 적는다.** 그룹 = `announcement_dedup_key(title)`(화면 그룹함수와 같은 필터), 「회차 혼입」 = 그 그룹에서 **해당 산물을 가진** `announcement_id`의 `announcement_date`가 **COUNT(DISTINCT) ≥ 2**. 결과: `housing_units` 1그룹 4행(낡은 2) · `extras` 1그룹 12행(낡은 6) · `policies` 2그룹 30행(낡은 15) · `eligibility` 2그룹 20행(낡은 10). 산물 있는 그룹은 118개. ⑦ 🔴 **그런데 둘째 그룹은 증상이 아니다.** `policies`·`eligibility`의 둘째 그룹은 **서울대방 신혼희망타운**으로 `20652_1_…`(06-29 MYHOME)와 `2015122300020297`(07-03 `[정정공고]` LH)의 짝이다 — **정정공고라 날짜만 다를 뿐 같은 회차**이고 내용이 같아 화면이 18→9·14→7로 **완전히 접는다.** 즉 **실제 증상이 있는 그룹은 김제하동 하나뿐**이고 요청서의 「1그룹」이 맞다. ⚠️ **`announcement_date` 차이만으로는 재공고와 정정공고를 못 가른다** — 서울대방이 반례다. 가르는 재료는 `is_revised`·`before_pblanc_id`·제목의 `[정정공고]` 접두어다. ⑧ 🔴 **내 판정식이 한 번 틀렸고 그 자리에서 바로잡았다.** 그룹별 회차 수를 세면서 `per`에 `aid`를 넣은 채 `count(*)`를 써 **「같은 회차의 여러 블록」이 회차 수로 세어졌다**(혼입 그룹이 수십 개로 부풀었다). `count(distinct d)`로 고치니 위 수치가 나왔다. claude.ai가 두 번 다르게 센 것과 같은 부류이며, 요청서가 「판정식을 함께 적는다」를 요구한 이유가 이것이다. ⑨ 🔴 **범위 밖 발견 — 이미 있는 장치가 사각지대다.** `staleSourceBannerHtml`이 「대표 공고와 다른 회차의 분석 데이터입니다…」라는 문구(`STALE_SRC_MSG_PLAIN`, 2996행)를 이미 갖고 있다. **그런데 게이트가 `if(rawRows.some(r => r.announcement_id === annId)) return '';`이라 대표행 자신의 산물이 하나라도 있으면 배너를 끈다.** 이 장치는 「대표행에는 없고 형제에만 있다」는 orphan 전용이고, 김제하동처럼 **양쪽 다 있는** 경우가 사각지대다. ⑩ **2장 후보 재료는 회신 본문에 9칸으로 적었다.** 🔴 **다)는 후보에서 뺐다** — 「지운 것을 어떻게 되살리는가」에 답이 없다(`zipfit-backup`은 스키마·행 단위 복원이고 선택적 복원 경로가 없다). 요청서 규칙대로다. ⑪ **하지 않은 것**: 코드·DDL·DB 쓰기·산물 삭제 어느 것도 · 김제하동 4행 정리 · 처방 선택(재료만 냈다) · `get_announcement_group_ids` 재생성 · B2 묶음 착수. ⑫ **미확인**: 브라우저 실화면(컨테이너에서 `supabase.co` 프록시 403 — DB 안에서 화면 dedup 키를 SQL로 재현하는 것이 갈 수 있는 가장 먼 곳이다) · 정정공고를 날짜로 거를 때 orphan 방지가 실제로 깨지는지(가) 안의 숨은 비용, 처방 회차에서 재야 한다) · 재공고 주기가 월 1회인 단지가 전체에 몇 개인지(지금은 김제하동만 걸렸으나 분석이 늘면 함께 는다). |

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
