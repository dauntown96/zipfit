# ZipFit — Claude 작업 지침서

> **이 파일은 규약과 좌표를 담는다.** Claude Code 세션마다 전문이 자동 주입되므로, 매번 읽혀야 하는 것만 둔다.
> Claude Code와 claude.ai 모두 이 파일을 기준으로 작업한다.
> **마지막 갱신**: 2026-09-02 (완료 이력을 `docs/history.md`로 분리)

## 📌 이 파일의 소관 — 무엇을 담고 무엇을 안 담는가

| 담는다 | 담지 않는다 |
|---|---|
| 코딩 원칙·환경 제약 | 완료 작업 이력 → 🔴 **`docs/history.md`에 append** |
| 프로젝트 좌표(스택·ID·전역변수·함수 목록) | 할 일·미결 → Notion 백로그 DB |
| 수집 API 카테고리 실측표 | 구현 사실(판정 조건·게이트) → Notion ⑩ |
| 정본 라우팅(아래) | 수치·현황 → **조회로 확인한다** |

🔴 **완료한 작업은 여기가 아니라 `docs/history.md` 맨 위에 쓴다.** 이 파일의 「최근 작업 이력」에는 최신 2건만 두고, 새 이력이 들어오면 밀려난 것을 `docs/history.md` 맨 위로 옮긴다.

## 🧭 이 문서에 없는 것 — 어디로 가는가

| 찾는 것 | 정본 |
|---|---|
| 구현 사실 — 판정 조건·게이트·데이터 흐름·캡 | Notion **⑩ 시스템 구조** — (URL: claude.ai 보완) |
| 할 일·미결·보류 | Notion **📋 백로그 DB** (유일한 정본) — (URL: claude.ai 보완) |
| 판단이 뒤집힌 경위 | Notion **⑧ 판례집** — (URL: claude.ai 보완) |
| 3자 분장·git·지시서·병합 규약 | Notion **⑦ 협업 규약** — (URL: claude.ai 보완) |
| 어디를 봐야 할지 모를 때 | Notion **⑨ 5장 검색 키워드 사전** — (URL: claude.ai 보완) |

⚠️ 아래 코딩 원칙 13·14번은 ⑦의 **요약 사본**이다. 어긋나면 **⑦이 정본**이다.

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
| 데이터 수집 | **LH·MYHOME**: Edge Function `collect-announcements` + pg_cron (**20분 간격 상시 수집** — jobid 4, `*/20 * * * *`, active, timeout 120초). 공고 게시 시각이 불규칙하고(LH·SH·GH·지자체공사·마이홈 각각 상이), LH API 호출 한도 내라 20분 간격으로 확정 | / **SH**: Edge Function `collect-sh-announcements` + pg_cron(jobid 8, `0 0,3,6,9 * * *` UTC = 09/12/15/18시 KST 4회)
| 사용자 프로필 | Edge Function `save-user-profile` (GET/POST, **`verify_jwt=true`**, 식별자는 JWT의 `auth.uid()` — 이메일 기반 식별은 2026-08-13 폐기, CORS는 `https://dauntown96.github.io` 고정) |
| 알림·트리거 | Make.com Free 플랜 (알림·이메일 전용) |
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
diagnose() / matchHouses() / renderMatchResults(lvl)
```

---

## 🕘 최근 작업 이력 (최신 2건)

🔴 **전체 이력은 [`docs/history.md`](docs/history.md)에 있다.** 아래는 직전 맥락 전달용 발췌가 아니라 **이 2건이 여기 있는 것 자체가 정본**이며, `docs/history.md`와 중복되지 않는다.
🔴 **새 이력은 `docs/history.md` 맨 위에 쓴다.** 여기에 쌓지 않는다 — 그러면 다시 518KB가 된다.

| 날짜 | 내용 |
|---|---|
| 2026-08-28 | **document_templates 해시 정규화 규칙 A~D 적용 + 2-up 원문 10행 복구 (DB만)**. 4단계에 걸친 조사→규칙설계→검증→반영. **게이트**: `pdfplumber 0.11.10` 파이프라인이 2026-08-21 baseline 해시를 행별로 정확히 재현함을 먼저 확인(행별 자체검증 = 정확성 오라클). **규칙**: A(작성예시 페이지 절단, 앵커 2종 `<작성 예시>`·`[이 페이지는 제출 ×]`) / B(지역본부·지사명 → `<OFFICE>`·`<BRANCH>`) / C(별지·붙임 번호와 쪽표시 제거) / D(연도 자리표시자 → `<DATE>`) 순서 적용 후 NUL 제거 + 전체 공백 제거 + SHA-256. **규칙 E(정규화하지 않음)**: `LH`↔`공사`, `(확정일자가 표시되어야 함)` 유무, `계약자는 영구` 유무, `자격심사 및 선정순위 결정`↔`자격심사` — 실제 판(版) 차이라 분리 유지. **🔴 3단계의 「원문 부재」 판정은 틀렸다**: 괴산동부·전북남부권 공고문은 **2-up 레이아웃**(PDF 1쪽에 문서 2쪽)이라 PDF 23쪽인데 문서 쪽번호는 46까지 간다. 쪽번호를 1쪽부터 순서대로 읽어 **문서 쪽 N ⇒ PDF page ⌈N/2⌉, 홀수=좌·짝수=우** 대응을 확정한 뒤 좌우 크롭으로 **10행 전부 baseline 재현 성공**(id 90~93, 95~100). 한 서식이 두 쪽에 걸치는 경우(예: p19R+p20L)도 정상 처리. **최종 범위**: 98행 중 **79행 재계산**(`[NORM:ABCD-v1]`), **19행 baseline 유지**(`[NORM:baseline]` + 사유코드 — hwpx 7행·영암 extract_tables 재분리 5행은 `(EXTRACT_UNREPRODUCIBLE)`, 표 설명 기반 7행은 `(TABLE_SUMMARY)`). ⚠️ hwpx 21·22는 재현에 성공했으나 배치 일관성 원칙에 따라 나머지 5행과 함께 제외. **규칙 발동 수**: A 2 / B 49 / C 62 / D 60 — 🔴 A 발동 0이면 실패라는 기준 충족. **병합 결과**: distinct 해시 79→57(재계산분 기준), 전체 98행 기준 75종. 새 병합군 8개는 **전부 같은 doc_category**이며, 표본 3쌍(id7↔94 / 8↔83 / 64↔81)을 정규화 전 원문으로 직접 diff한 결과 차이가 **지역본부명과 쪽표시뿐**임을 확인(다른 서식이 잘못 합쳐진 사례 0건). 기존 중복쌍 `fa7d5828`(64·88)은 함께 `cc81bc9a`로 이동했고 81이 합류. **반영 방식**: 🔴 UPDATE를 CTE로 묶지 않고 **행 단위 개별 문장**으로 25/25/25/23 4배치 실행(2026-08-10 판례 — CTE로 묶으면 조용히 건너뛴다). `sample_source`는 **덮어쓰지 않고 태그만 덧붙였다** — `[HASH_SRC:]`/`[EXTRACT:]` 98/98 온전. **검증**: 총 98행 불변, `[NORM:]` 태그 누락 0건(79+19=98). **미조치(백로그)**: id 32 태그 모순(`sample_source`는 표 설명 기반이라는데 `[HASH_SRC:ORIGINAL_DOC]`), 강원 위임장 `doc_category` 오배정 의심, id 55 결번(미채번/삭제 구분 불가), id 71·72 병합이 2026-08-25에 이력 없이 이뤄져 99→98행이 된 것 — 이번 범위 밖이라 관측만 기록. 코드 변경 없음(DB만) |
| 2026-08-31 | **`upsert-announcement` 배포 철회 게이트 확인 — 🔴 철회 미완(대시보드 수동 삭제 필요), 코드·시크릿 전부 보존**. 이 함수는 `verify_jwt:false` + `service_role` 쓰기(RLS 우회)라 `WEBHOOK_SECRET` 하나가 유일한 관문인 **무인증 쓰기 엔드포인트**인데, 원래 호출자로 보이던 Make를 다운님이 쓰지 않기로 확정(2026-08-27)해 배포를 내리기로 했다. **게이트 4종 전부 통과**: ①cron 잡 3개(4 `*/20`·8 `0 0,3,6,9`·11 `0 18 * * 0`)의 `command`를 실조회 — 셋 다 각각 `collect-announcements`/`collect-sh-announcements`/`collect-rental-stats`를 부르며 이 함수를 부르는 잡은 **없음** ②`index.html`·`sw.js`에 `upsert-announcement` 문자열 **0건** ③다른 EF 소스에서 이 함수를 호출하는 코드 **0건**(`supabase/` 전체 grep, 자기 디렉터리 제외) ④Edge 함수 호출 로그에서 이 함수 **0건**. ⚠️ **④의 한계(정직 보고)**: `query_logs`는 **최대 24시간 창**이라 지시서가 요구한 30일치를 볼 수 없었다 — 확인한 것은 **최근 24시간 0건**이다. 다만 같은 쿼리로 다른 함수는 잡히므로(collect-announcements 72건·collect-sh 4건·collect-rental-stats 1건) 쿼리 자체가 무효라서 0이 나온 것은 아님을 대조로 확인했다. **🔴 철회는 실행하지 못했다**: 이 세션의 Supabase MCP에는 **Edge Function 삭제 도구가 없다**(`list`/`get`/`deploy`뿐). 지시서가 "방법이 확실하지 않으면 추측으로 실행하지 말라"고 했고, Management API를 임의 호출할 인증 수단도 없어 **다운님이 대시보드에서 직접 삭제**해야 한다(2026-08-12 `test-lh-detail`·`test-myhome-api` 삭제 때와 동일 경로). 현재 배포 상태는 **v15 ACTIVE·`verify_jwt:false`** 그대로다. **보존한 것(의도적)**: `supabase/functions/upsert-announcement/`(`index.ts`+`deno.jsonc`)를 git에서 **지우지 않았고**, `WEBHOOK_SECRET` 환경변수도 **지우지 않았다** — 되살릴 때 필요하다. `WEBHOOK_SECRET`을 참조하는 곳은 이 함수의 `index.ts` 하나뿐임을 저장소 전체 grep으로 확인했으므로(그 외엔 CLAUDE.md 서술뿐), 배포만 내리면 이 시크릿을 읽는 코드는 **한 곳도 남지 않는다**. **되살리는 법**: git의 `supabase/functions/upsert-announcement/`를 `verify_jwt:false`로 재배포하면 되고, `WEBHOOK_SECRET`은 유지돼 있다. **수집 회귀 확인**: 철회를 못 했으니 "철회 후 첫 수집"은 대상이 없으나 현재 상태를 확인 — `collection_run_log` id 3499(08-31 00:20 UTC) `lh_fetched=485`/`myhome 291/287`/`errors=null`로 평소값(470~480대) 정상. 직전 id 3498은 전 경로 504(업스트림 `SERVICETIMEOUT_ERROR`)로 0건이나 이는 2026-08-25·26에 이미 규명된 LH 게이트웨이 간헐 장애이며 이번 작업과 무관하다(바로 다음 회차에 자동 회복). **DB·코드 변경 없음**(CLAUDE.md만) — 이 세션이 지정 브랜치 외 push를 막아 `claude/upsert-announcement-rollback-207ilk`에만 push |

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
14. **3자 업무 분장** (2026-09-02 개정 — ⑦ 2026-08-27 재배정 반영. 🔴 **정본은 ⑦ 배정표**)
- **claude.ai**: 공고 원문 분석·판단·설계, 작업지시서 작성, 🔴 **실행 결과 재검증**(Supabase 읽기 중 이것만), Notion 기록, 웹 검색.
- **Claude Code**: DB 쓰기(INSERT/UPDATE/DDL), 코드 읽기·쓰기, git·PR·병합, 🔴 **Supabase 읽기 — 조사·현황 파악**, 검증 설계, Drive 원문 수령, PDF 해시 추출(`pdfplumber`).
- **다운님**: 원문 업로드, 브라우저 육안 확인, 사실관계 최종 판정, 스킬 교체, 계정 권한.
- 🔴 **핵심은 「조사」와 「재검증」을 가른 것이다.** 둘 다 SELECT를 돌리지만, 조사는 *무슨 일이 벌어지고 있나*이고 재검증은 *Claude Code가 한 일이 맞나*다. **후자를 넘기면 쓴 주체가 검증하게 되어 이 구조가 무너진다.**
- ⚠️ 2026-07-29자 구 서술(「Supabase 읽기는 claude.ai가 직접」)은 **폐기됐다.** 조사는 Claude Code 몫이다.
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

---

## 🔗 주요 링크

| 항목 | URL |
|---|---|
| 배포 | https://dauntown96.github.io/zipfit |
| GitHub | https://github.com/dauntown96/zipfit |
| Supabase | https://supabase.com/dashboard/project/khdpjjyspmlqtzperoqg |
| Notion (참고용) | https://www.notion.so/3878aaa7e1558102ae9bf39dbb9a2efe |
