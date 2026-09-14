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
| 2026-09-14 | **사용 로그 `usage_events` 신설 — 그리고 「불변식이 이 신설을 못 본다」**(🔴 **DDL 1건 — `public.usage_events` 테이블 신설(컬럼 7 · CHECK 4 · PK 1) · RLS 켬 + INSERT 정책 1건 · 인덱스 2건 · 🔴 **컬럼 단위** GRANT(anon·authenticated INSERT 4컬럼) · DB 데이터 쓰기 **0행**(검증 INSERT는 전부 트랜잭션 롤백 — 최종 `usage_events` 0행) · 다른 테이블 16개 **권한·정책·RLS·컬럼 수 전부 불변** · 함수 재생성 0 · 트리거 미접촉 · EF 배포 0 · Drive 쓰기 0 · 코드 변경 0(`index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가) · `supabase/rpc/README.md`(DDL 이력 +106행)·`CLAUDE.md`·`docs/history.md` 수정 · PR #105 병합(병합 커밋 `2c06741`)**). ① ✅ **기준선을 먼저 잡았다**(요청서 3장 1항) — 불변식 재구성 실행 결과가 요청서가 적어 둔 그대로였다: `V1 = saved_announcements/authenticated INSERT·DELETE` 2건(의도된 예외) · `V6 = collection_run_log` 1건. ⚠️ **7검사 원본 SQL은 여전히 claude.ai에만 있다** — 기록된 정의로 V1·V6을 재구성해 돌렸고(V5는 정의가 기록돼 있지 않아 재구성 불가), 전후 비교는 **같은 쿼리를 두 번 돌린 것**이라 비교로서는 유효하다. ② 🔴 **요청서와 다른 사실 — 「V1에 새 항목이 뜬다」가 안 일어났다. 그리고 그게 이 회차의 가장 큰 수확이다.** 요청서 3장 5항·4장이 V1에 `usage_events / anon INSERT`가 뜰 것으로 적었는데 **재실행 결과가 신설 전과 글자 하나까지 같았다.** 원인은 이 표가 아니라 **검사 쪽이다** — V1이 쓰는 `has_table_privilege(…,'INSERT')`는 **컬럼 단위 GRANT를 보지 못한다.** 실측: `has_table_privilege('anon','public.usage_events','INSERT')` = **false**, `has_any_column_privilege(…)` = **true**. 🔴 **즉 누가 어느 표든 컬럼 단위로 쓰기를 열면 V1은 조용하다.** ③ 🔴 **고치는 문구까지 실측으로 확정했다.** 단순 치환은 안 된다 — `DELETE`·`TRUNCATE`는 컬럼 권한이 없어 `has_any_column_privilege`에 넣으면 `22023 unrecognized privilege type`으로 **쿼리 전체가 죽는다**(실측). 권한별로 갈라야 한다: `case when priv in ('INSERT','UPDATE','REFERENCES') then has_any_column_privilege(...) else has_table_privilege(...) end`. 고친 V1을 돌려 보니 **기존 2건은 그대로이고 `usage_events` 2건만 새로 뜬다** — 허용목록에 더할 정확한 문구는 `usage_events / anon INSERT (컬럼 단위: event, session_id, announcement_id, props)`와 같은 형태의 `authenticated` 행, **두 줄**이다. 🔴 **원본 SQL을 내가 고치지 않았다** — claude.ai 소관이고 저장소에 없다(원칙 23: 되돌림 비용 밖). ④ 🔴 **`event` 제약은 CHECK로 갔다 — 셋을 견줘 골랐다.** **enum 타입**은 값 추가는 싸지만 **제거가 불가능**해 되돌림 비용에서 탈락. **참조표+FK**는 매 INSERT에 조회가 붙어 폭주 대비(1-5)와 정면으로 부딪힌다. **CHECK**는 쓰기 시점 비용이 가장 싸고 되돌림이 `ALTER TABLE` 한 줄이라 `announcement_analysis` 선례와 같은 이유로 걸린다. 🔵 **값을 늘리는 절차를 제약 COMMENT에 박아 뒀다** — `DROP CONSTRAINT … ADD CONSTRAINT … NOT VALID`. `NOT VALID`가 핵심이다(기존 행 재검사를 건너뛰어 표가 커진 뒤에도 즉시 끝난다). 🔴 **화면보다 DB를 먼저 고친다** — 이번 회차가 그릇만 만들고 송신을 다음으로 미룬 덕에 **DB가 항상 앞서는 순서가 구조적으로 보장된다**(그래서 CHECK가 사건을 버릴 위험이 없다). ⑤ 🔴 **권한을 테이블이 아니라 컬럼 단위로 열었다 — 요청서 1-4를 넘어선 자리다.** `grant insert (event, session_id, announcement_id, props)`라 화면은 나머지 셋을 **손댈 수 없다**: `occurred_at`은 서버 `now()`(클라이언트 시계가 못 끼어든다) · `user_id`는 `auth.uid()` 기본값이라 **위조가 구조적으로 불가능** · `id`는 identity다(🔵 `serial`이 아니라 identity라 **시퀀스 권한 없이 채워진다** — 2026-09-11 찜하기 선례와 같다. 실제로 새 시퀀스는 `service_role`만 가진 채 태어났다). ⚠️ **대가가 하나 있다 — `relacl`에 `anon`이 아예 없다.** 권한이 `pg_attribute.attacl`에 있어(`anon=a/postgres`) 테이블 ACL만 보면 「anon 권한 0」으로 **잘못 읽힌다.** 그게 ②의 구멍과 같은 뿌리다. ⑥ ✅ **`anon` SELECT 차단 실측 — `42501 permission denied for table usage_events`.** 요청서 4장이 「되면 설계 실패」로 못박은 항목이다. `set local role`로 11항을 돌려 **전부 설계대로** 나왔다: anon INSERT ✅ / anon SELECT·UPDATE·DELETE **전부 permission denied** / anon이 `occurred_at` 지정 **denied** / anon이 `user_id` 위조 **denied** / 목록 밖 event 오타(`notice_opne`) **CHECK 거부** / `props` 2048자 초과 **CHECK 거부** / authenticated INSERT ✅ · authenticated SELECT **denied** / 적재된 행의 `user_id`가 NULL이고 `occurred_at`이 서버 시각. 🔵 **시험 전체를 트랜잭션 안에서 돌리고 롤백했다** — 그래서 검증을 다 하고도 표는 **0행**이다. ⑦ ✅ **폭주 대비(1-5) — 상한을 셋 걸었다.** `session_id` 8~64자 · `announcement_id` ≤64자 · **`props` ≤2048자**(`char_length(props::text)`. `pg_column_size`는 IMMUTABLE이 아니라 CHECK에 못 쓴다 — 실측으로 갈랐다). 인덱스는 **2개만**(`occurred_at` 단독 = 보관기간 삭제용 · `(event, occurred_at)` = 종류별 집계용. 후자가 `event` 단독을 덮으므로 3개로 늘리지 않았다). 🔴 **`session_id`·`user_id`·`announcement_id`에는 인덱스를 안 뒀다** — 세션 단위 퍼널(추천 적중률)을 재려면 나중에 필요해지며, **그때 실제 질의를 보고 붙이는 것이 지금 추측으로 붙이는 것보다 싸다**(보고만 한다). ⑧ ✅ **크기 감시 판단 재료(요청서 5장)** — 한 행 실측 **139 B**(대표 props 기준) · 인덱스 3개 포함 추정 **약 240 B/행**. 하루 사건 수별 월 증가는 **1천 → 약 7 MB · 1만 → 약 72 MB · 10만 → 약 720 MB**다. 🔴 **지금 DB 전체가 30 MB(`public` 14 MB)라 하루 1만 건이면 일주일 안에 기존 DB 전체보다 커진다.** 감시는 `pg_total_relation_size('public.usage_events')` 한 줄이면 되고, **임계치를 지금 정하지 않는다**(요청서대로 — 얼마나 쌓이는지 본 뒤에 정한다). ⑨ ✅ **다른 테이블 불변 — 전후 같은 쿼리로 대조했다.** 16개 표의 RLS·정책 수·`anon`/`authenticated` 4권한·컬럼 수가 **전부 같다.** 표 16→17 · 시퀀스 7→8 · 정책 21→22 · 함수 14 불변 · storage 버킷 0 불변. 🔵 **Supabase 보안 린터에 `usage_events`가 한 건도 안 뜬다** — `rls_enabled_no_policy`는 기존 2건(`announcement_analysis`·`collection_run_log`)뿐이다. ⑩ ✅ **수집 런이 이 표에 닿지 않는다 — 코드로 먼저 확인했다.** EF 7개·`index.html`·`sw.js` 전체에서 `usage_events` 문자열이 **0건**이다(표가 오늘 태어났으니 당연하지만 음성 증거를 실제로 셌다). 정기 런(jobid 4, KST 09:00~18:50 10분 간격)을 넘긴 뒤에도 **0행 유지**를 확인했다. ⑪ **하지 않은 것**: 🔴 **화면에서 보내는 코드 0**(다음 회차) · 집계 RPC·대시보드 0 · 보관 기간 정책·자동 삭제 0 · 개인정보 처리방침 미접촉 · 불변식 원본 SQL 미수정 · 다른 테이블·EF·트리거·함수·프론트 0 · `announcement_id`에 FK 0(로그가 도메인 표를 제약하면 안 되고, 거부된 로그는 잃은 측정이다). ⑫ **미확인**: 다운님 브라우저 육안 · **PostgREST 경로로 실제 INSERT가 되는지**(DB 안 `set local role`로만 쟀다. 🔴 다음 회차가 반드시 `Prefer: return=minimal`로 보내야 한다 — SELECT 권한이 없어 `.select()`를 붙이면 조용히 실패한다) · V5의 정의(기록이 없어 재구성 못 함) · 컬럼 단위 GRANT가 열린 표가 다른 스키마에 또 있는지(전수 확인 안 함) · 하루 실제 사건 수(송신을 붙여야 알 수 있다). |
| 2026-09-14 | **소득 금액표를 김제하동 세 회차에 일괄 반영 — 그리고 「원문에 100% 기준액은 없다」**(🔴 **DB 데이터 쓰기 — `eligibility_criteria` 9행의 `verification_requirements`만(UPDATE 2회: 숫자형으로 한 번 넣고 화면을 본 뒤 문자열형으로 다시 썼다) · 🔴 바뀐 키가 `verification_requirements` **하나뿐**임을 `to_jsonb` 키 단위로 확인 · 행 수 9 불변 · `announcements` 미접촉 · `housing_units`·`announcement_policies`·`announcement_extras`·`announcement_analysis` 0행 · DDL 0 · 함수 재생성 0 · 트리거 미접촉 · EF 배포 0 · Drive 쓰기 0 · 코드 변경 0(`index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가) · 김제하동 세 회차 밖 **0행** · PR #103 병합(병합 커밋 `0ec834b`)**). ① ✅ **스킬 게이트 통과** — v8.7(`54,036 B`, 직전 회차와 동일). ② ✅ **1장 대조 — 세 회차 금액표가 완전히 같다. 이중으로 확인했다.** ⓐ 세 원문 PDF에서 뽑은 가구원수 8개 금액·총자산 345백만·자동차 4,542만·출산자녀표 3행이 **전부 일치**. ⓑ 더 나아가 「소득 및 자산보유 기준」 **절 전체가 sha256까지 동일**하다(`bd6a51a574903c0e5e38`, 1,997자 · 07-06 = 08-06 = 09-07). 기준연도도 셋 다 **2025년 도시근로자**다. 즉 작업이 성립한다. ③ 🔵 **덤으로 앞 회차의 산수 판정이 표 구조로 확증됐다.** B4-R에서 「1인 90% · 2인 80% · 3인↑ 70%」를 나눗셈으로 추론했는데, `pdfplumber.extract_tables()`가 셀 배치를 살려내 **1인 → 90% 열 · 2인 → 80% 열 · 3인 → 70% 열**로 직접 보여줬다. 추론이 아니라 실물이 됐다. ④ 🔴 **요청서와 다른 사실 — 원문에 「100% 기준 금액」이 없다.** 요청서 2장이 「100% 기준 금액과 적용 비율을 함께 남긴다」고 했으나 표에 적힌 것은 **적용 비율이 이미 반영된 한도액**이다. 🔴 **역산으로 복원할 수도 없다** — 8개를 비율로 나눠 보면 **정확히 떨어지는 것이 2인 하나뿐**이고(5,866,270) 나머지 7개는 소수가 남는다(1인 3,813,363.33 · 3인 8,168,428.57 …). 원문이 반올림한 결과라 원값이 ±1원 이상 불확실하다. **없는 값을 계산해 사실로 넣지 않았다** — 원문 한도액을 그대로 넣고 각 행에 적용 비율을 괄호로 병기했다. 요청서 취지(「금액과 적용 비율을 함께」)는 원문 훼손 없이 만족한다. ⑤ 🔴 **형태를 숫자에서 문자열로 바꿨다 — 화면을 보고 바꿨다.** 처음에 B2 선례(`{"1인": 5720045}`)를 따라 숫자로 넣고 실제 렌더 함수(`prettifyEligKey`·`renderEligValue`)를 돌려 봤더니 **`343.203만원`으로 나왔다** — `renderEligValue`가 숫자를 만원으로 나누는데 원 단위 끝자리가 있어 소수점 셋째 자리에서 반올림된 것이다. 원문은 **3,432,027원**인데 화면은 3,432,030원을 말한다. 🔵 **`vr`의 지배적 형태는 원래 문자열이다**(전수 1,085건 vs 숫자 11건). 숫자가 잘 보이는 선례(`출산가구_자산완화 397000000` → `39,700만원`)는 **만원 단위로 떨어지는 값**이었다. 그래서 `'3,432,027원'` 문자열로 바꿨고 화면에 원문 그대로 나온다. **요청서 3장이 「검증은 화면으로 한다」고 못박은 것이 이 판단을 만들었다** — 숫자로 뒀으면 DB는 맞고 화면은 틀린 채 끝났다. ⑥ ✅ **최종 형태** — 키 `가구원수별 월평균소득 한도(2025년 도시근로자 기준)`, 값은 `1인(90% 적용)`~`8인(70% 적용)` 8쌍. 🔴 **키에 `_`를 쓰지 않았다** — `prettifyEligKey`가 `A_B`를 `A(B)`로 바꾸므로 밑줄이 있으면 라벨이 뒤틀린다(기존 `income_amount_1인` 선례가 그 증상이다). ⑦ ✅ **검증 4항 전부 통과.** 🔴 **화면 렌더 키 distinct가 넣기 전과 같은 3**이다(9행 → 3항목) — `vr`이 9행 전부 문자열까지 동일(`vr_distinct=1`)해 중복제거가 그대로 접는다. 행 수 9 불변 · 바뀐 키 `verification_requirements` 하나뿐 · 김제하동 세 회차 밖 0행. ⚠️ 요청서가 기대한 「갱신 시각」은 안 바뀌었다 — **`eligibility_criteria`에 그 컬럼이 없다**(`created_at`만 있다). ⑧ ✅ **화면을 직접 재현해 확인했다**(고친 쪽이 먼저 본다) — `anon`이 받는 9행에 실제 중복제거·렌더 함수를 그대로 먹여 **3항목 · 각 항목에 금액표 8줄이 원문 값 그대로** 나오는 것을 봤다. ⑨ 🔵 **Playwright 질문에 실측으로 답한다 — 두 축이 다르다는 지적은 옳고, 결론은 같다.** **도구 축**: Chromium 바이너리는 **있다**(`/opt/pw-browsers/chromium-1194`, `PLAYWRIGHT_BROWSERS_PATH` 설정됨). **Playwright 패키지는 없다**(node·python 둘 다 `MODULE_NOT_FOUND`). **도달 축**: Chromium을 직접 띄워 배포본을 열어 보니 **`ERR_TUNNEL_CONNECTION_FAILED`**(Chrome 오류 페이지 183,632 B, 제목 `dauntown96.github.io`). 🔴 **curl 403과 같은 벽이다** — 프록시가 CONNECT를 거부하므로 **Playwright를 설치해도 배포본을 못 연다.** 🔵 다만 `file://`로 로컬 `index.html`을 여는 것은 되며, Supabase 호출만 대역(mock)하면 진짜 DOM을 렌더할 수 있다 — 시도하지 않았고 제안으로만 남긴다. ⑩ **하지 않은 것**: 다른 공고의 금액표 0 · `income_pct` 그대로(대체가 아니라 병기) · 100% 기준액 계산해 넣기 0 · `announcements`·DDL·함수·트리거·EF·프론트 0 · 「한 행 = 여러 회차」 라벨과 접수기간 표시 미착수(별도) · Playwright 설치 시도 0(도달이 막혀 의미가 없다). ⑪ **미확인**: 다운님 브라우저 육안 · 이 형태를 다른 공고(B1·B2·B3)의 소득 금액표에도 소급할지 · `renderEligValue`의 만원 반올림 자체를 고칠지(원칙 23의 두 시험 중 되돌림 비용에서 걸리고 요청서가 코드 0을 명시해 **보고만 한다**) · `income_amount_1인` 같은 밑줄 키가 다른 공고에 몇 건인지(전수 확인 안 함). |
| 2026-09-14 | **B4-R 재개 — 김제하동 08-06 회차 반영. 그리고 「회차를 늘렸는데 화면 행이 안 늘었다」**(🔴 **DB 데이터 쓰기 12행 — `housing_units` 2행 · `eligibility_criteria` 3행 · `announcement_policies` 6행 · `announcement_analysis` 1행(`완료` · `batch_label='2026-09-13-B4R'` · `drive_folder_id='1vn4k_oRHlBmG-WuL61LjHQGIaxQDk-6-'`) · `announcement_extras` 0행(해당 없음) · 🔴 `announcements` 미접촉(0행 — `selection_method`·`contract_before_verification` 요청서 지시대로 안 채움) · DDL 0 · 함수 재생성 0 · 트리거 미접촉 · 코드 변경 0(`index.html`·`sw.js` 미접촉이라 `CACHE_NAME` 미증가) · EF 배포 0 · Drive 쓰기 0 · `file_hash` 0 · `relaxation_detail` 0 · 다른 소급분 226건 미접촉 · PR #101 병합(병합 커밋 `722cc7f`)**). ① ✅ **스킬 게이트 통과** — v8.7(`54,036 B`, mtime 09-14 00:00, 헤더에 「전문은 PDF로 한 번만」). ② ✅ **0단계 통과** — 다운님이 올려주신 폴더가 `[임시] 2015122300020527`로 **자동 수집 규약 그대로**였고(직전 회신 제안대로), 공고문 PDF 1건(1,152,573 B)·대상 공고 일치. ③ 🔴 **2장 (1) — PDF 한 번으로 끝났지만 v8.7 조항이 시험된 것은 아니다.** hwpx를 안 연 이유는 「필요 없어서」가 아니라 **애초에 폴더에 없어서**다. ⚠️ 7월 폴더도 PDF뿐이었다(hwpx는 9월분에만 있다) — 즉 **이 단지에서는 아직 두 형식이 함께 온 적이 한 번뿐**이라 조항은 다음 기회로 미뤄진다. 🔵 **다만 병합셀 문제는 PDF만으로 풀렸다** — 소득표가 `70% 80% 90%` 세 열 머리 아래 값이 한 줄로 납작해져 어느 열인지 안 보였는데, **산수가 답을 줬다**: 1인 3,432,027÷0.9 · 2인 4,693,016÷0.8 · 3인 5,717,900÷0.7이 각각 100% 기준 3,813,363 / 5,866,270 / 8,168,429로 떨어진다. 즉 **행마다 적용 비율이 다르고**(1인 90% · 2인 80% · 3인↑ 70%) 국민임대 표준 규칙과 정확히 맞는다. hwpx를 열 일이 없었다. ④ ✅ **2장 (2) 소요 8분 13초 — B1 김제하동 8분 17초와 4초 차**(0.99배). 같은 공고의 다른 회차라 조건이 거의 같았고 결과도 거의 같다. 🔵 **선례가 둘이나 있어 「무엇을 넣을지」를 정하는 데 시간이 거의 안 들었다** — 대신 「선례와 갈릴지」를 판정하는 데 썼다(⑦). ⑤ 🔴 **2장 (3) 세 점이 생겼고, 중간 점이 평평했다.** 07-06 → 08-06 **보증금·월임대료 네 값 전부 변화 0**, 08-06 → 09-07 **전부 +0.98%**. 즉 2개월에 걸쳐 고르게 오른 것이 아니라 **한 회차에 한 번 일괄 인상**됐다. 🔵 그래프 항목의 첫 실재 재료다 — 추이선은 직선이 아니라 **계단**이다. ⑥ 🔴 **2장 (4) — 접힌 목록은 여전히 2행이다. 회차를 3개로 만들었는데 화면 행이 안 늘었다.** 실제 프론트 함수(`roundInfoFor`·중복제거·`attachRoundDiffs`)를 그대로 떼어내 `anon`이 받는 6행을 넣어 돌린 결과: **바깥 2행(09-07) · 접힘 2행 · 합 4**로 종전과 같다. **07-06과 08-06의 값이 완전히 같아 중복제거가 한 행으로 합쳤고 회차가 최신(08-06)으로 올라갔기 때문**이다. 🔵 **그래서 2단화 판단의 답이 나왔다 — 행을 늘리는 것은 「회차 수」가 아니라 「값이 바뀐 횟수」다.** 지금 구조에서는 6회차가 다 분석돼도 값이 세 번만 바뀌었으면 접힘은 3행이다. ⚠️ **대신 새 문제가 드러났다 — 화면에서 `2026-07-06`이라는 날짜가 사라졌다.** 접힌 한 행이 두 회차를 대표하는데 라벨은 최신 것 하나만 단다. 값으로는 틀리지 않지만(08-06에도 그 값이었다) 「이 값이 07-06부터였다」가 안 보이고, **접수기간을 2단 헤더에 붙이려면 이 「한 행 = 여러 회차」를 먼저 다뤄야 한다.** ⑦ 🔴 **선례와 갈린 자리가 둘 — 하나는 따르고 하나는 안 따랐다.** **(가) v8.7의 「소득은 비율+금액표」를 이번에 적용하지 않았다.** 자격기준 로더의 중복제거 키가 **화면에 그리는 필드 전부**이고 거기 `verification_requirements`가 들어 있다 — 8월에만 금액표를 넣으면 7·9월과 달라져 **자격기준 항목이 3개에서 6개로 늘고 사용자에게는 같은 내용이 두 번 보인다.** 스킬 자신이 경계하는 「유령 항목」과 같은 해악이라 **넣지 않고 보고한다**(원칙 23). 🔵 **깨끗한 해법은 세 회차에 한꺼번에 넣는 것**이고 그건 이 요청서 범위 밖이다. **(나) `age_min=60`은 넣었다** — 9월 선례가 그렇고 7월만 NULL이다. 이 컬럼은 **렌더에도 중복제거 키에도 없어** 화면 영향이 0이라 갈릴 위험 없이 더 최신 선례를 따랐다. ⑧ ✅ **정책 6건을 7월과 문자열 동일하게 넣었다** — 8월 원문을 여섯 축으로 전부 대조했고 **내용이 같았다**(회차별 날짜는 정책문에 안 들어 있고 `apply_start/end`가 이미 갖고 있다). 정책 로더가 `category+content_raw`로 접으므로 **화면 항목 변화 0**이다(그룹 18행 → distinct 11, 추가 전과 같음). ⑨ ✅ **`announcement_extras` 0행은 「해당 없음」**이다 — 8월 폴더에 이미지가 없고 **원문이 사진·평면도를 파일로 부르지도 않는다**(첨부 목록 자체가 없다). 7·9월의 도면 6건은 같은 단지의 같은 그림이라 새로 넣을 것이 없다. ⑩ ✅ **검산 전부 통과** — 계약금+잔금=계 두 행 정확 일치, 계약금이 계의 5%에 10원 올림(34형 893,400 vs 893,350 · 42형 1,246,000 vs 1,245,950) · 건설호수 32+47=79로 단지 개요와 일치 · **전환 열은 이 공고에 아예 없어 절대원칙 6 해당 없음** · 전체 `housing_units` 합계가 2,555행/123,840,242,900 → **2,557행/123,883,295,190**으로 **차이 43,052,290이 신규 2행의 보증금·월임대료 합과 정확히 일치**. ⑪ ✅ **순위·배점이 없는 공고다** — 원문이 「지역제한, 순위, 배점 상관없이 신청가능합니다」라고 못박는다. 주거약자 언급은 제출서류 템플릿 잔재 1건뿐이고 **별도 물량 구분이 없어** 행을 나누지 않았다. `manual_check_note`도 선례대로 NULL — 60세·무주택·소득·자산은 전부 우리가 묻는 축이다. ⑫ **하지 않은 것**: 1건에서 멈춤(06-08 이전은 원문 없음) · 전문 2회 추출 0 · 다른 소급분 226건의 `drive_folder_id` 0 · `announcements` 0행 · EF·트리거·DDL·프론트 0 · 7·9월 선례 행 수정 0. ⑬ **미확인**: 다운님 브라우저 육안(프록시 403) · 8월 회차에 hwp본이 실제로 있었는지(`attachment_urls`가 NULL이라 원문이 무엇을 부르는지 알 수 없다) · 회차가 **값까지 다른** 3점이 됐을 때의 접힘 행 수(이번엔 값이 같아 안 늘었다) · v8.7 금액표 조항을 세 회차에 한꺼번에 적용할지. |

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
