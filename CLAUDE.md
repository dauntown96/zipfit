# ZipFit — Claude 작업 지침서

> **이 파일이 유일한 세이브포인트입니다.**
> Claude Code와 claude.ai 모두 이 파일을 기준으로 작업합니다.
> **마지막 업데이트**: 2026-07-03 (announcement_extras 사진·평면도 프론트엔드 노출 완료 — sw.js v33 배포 완료)

## 🔜 다음 세션 작업 예정
- **🔴 지오코딩 진단로그 실사용 확인 필요**: F12 콘솔에서 `[ZipFit geocode]` 로그를 여러 공고에서 직접 확인 — Lv1 실패→Lv2 성공 비율(정제 효과 입증), Lv1·Lv2 모두 실패→Lv3까지 가는 비율(높으면 정제 로직 추가 보완 필요). 확인 후 진단용 console.warn 제거 검토
- **프론트엔드에 나머지 신규 데이터 노출**: scoring_criteria(가점표) — housing_units·announcement_policies·eligibility_criteria·announcement_extras는 반영 완료. 자격진단 결과·가점 계산 등에 scoring_criteria 반영 필요
- **사진/평면도 썸네일 실사용 확인 필요**: 샌드박스가 drive.google.com egress 자체를 차단해 실제 썸네일 HTTP 200 여부는 이번 세션에서 검증 불가(권한은 Drive API로 anyone:reader 확인함). 다운님이 실제 사이트에서 재매핑 5개 공고 포함 사진/평면도 썸네일이 실제로 로드되는지, 클릭 시 새 탭에서 열리는지 확인 필요

---

## 🔄 Claude Code ↔ claude.ai 실시간 공유 방식

이 프로젝트는 두 Claude 인스턴스가 협업합니다:

| 역할 | 담당 |
|---|---|
| **Claude Code** | ZipFit 코드 수정, 버그 픽스, git push, CLAUDE.md 업데이트 |
| **claude.ai** | Notion, Gmail, 스킬, 메모리, 코드 외 모든 작업 |

### 공유 채널
- **CLAUDE.md** (이 파일) = 유일한 세이브포인트
- Claude Code가 작업 완료 시 `/done` 커맨드로 CLAUDE.md 업데이트 + git push
- claude.ai는 매 ZipFit 세션 시작 시 아래 URL로 최신 상태 확인:
  ```
  https://raw.githubusercontent.com/dauntown96/zipfit/main/CLAUDE.md
  ```

### claude.ai에게 (세션 시작 시 읽을 것)
- ZipFit 작업 요청이 오면 위 URL을 먼저 fetch해서 현재 진척도 파악 후 응답
- 코드 수정은 Claude Code에 위임, 커넥터/스킬/Notion은 claude.ai가 직접 처리

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
| 데이터 수집 | Edge Function `collect-announcements` v3 + pg_cron (매일 KST 09:00, 15:00 — 2회, timeout 120초) |
| 사용자 프로필 | Edge Function `save-user-profile` v5 (GET/POST, CORS 완료) |
| 알림·트리거 | Make.com Free 플랜 (알림·이메일 전용) |
| 외부 API | LH 분양임대공고 API, 마이홈포털 API, 카카오맵 API |
| DB | Supabase PostgreSQL (프로젝트 ID: `khdpjjyspmlqtzperoqg`, 싱가포르) |
| 인증 | 이메일+쿠키 기반 (추후 Supabase Auth 마이그레이션 예정) |

### Supabase 설정
- **URL**: `https://khdpjjyspmlqtzperoqg.supabase.co`
- **anon key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs`
- **RPC**: `get_announcements_deduped(p_region, p_type, p_status)` — null 시 전체 반환
- **쿠키명**: `zipfit_email`

---

## 🗂 탭 구조

| 탭 | ID | 상태 |
|---|---|---|
| 추천 | main1 | ✅ 완성 |
| 공고 | main2 | ✅ 완성 |
| 인사이트 | main3 | ✅ 기본 완성 |
| 관리 | main4 | ✅ 저장한 공고 완성 |
| 설정 | main5 | ✅ 완성 |

---

## 🔑 핵심 전역 변수

```js
SUPABASE_URL / SUPABASE_ANON_KEY
noticeData[]        // Supabase 공고 배열
noticeLoaded        // 필터 칩 초기 로드 여부
activeNoticeRegion / activeNoticeType / activeNoticeStatus
noticeFilterOptions // { regions, types, statuses }
currentUser         // { email, marital, regions, types, ... }
HOUSES[]            // 하드코딩 주택 29개 (추후 DB 연동)
selectedRegions / selectedTypes   // 추천탭 필터 Set
settingsRegions / settingsTypes   // 설정탭 칩 Set
allRegions[]        // DB 동적 지역 목록
ZF_COOKIE           // 'zipfit_email'
```

---

## 🔧 주요 함수 목록

```js
initNoticeFilters()                    // 전체 데이터 1회 로드 → 필터 칩 구성
loadNoticeData()                       // 필터 변경 시 RPC 재호출
renderNoticeList(filtered, total)
loadRegionsFromSupabase()              // 전국 지역 동적 로드
renderPersonalizedRecommendations()    // 맞춤 추천 — currentUser 의존
loginWithEmail(email)                  // 로그인 + 프로필 로드
saveUserProfile(lvl)
saveSettings() / applySettingsToUI(p)
onSettingChange()                      // 토글 변경 시 자동 저장
goMain(n) / goStep(n)
toggleDetail(id) / initMapForHouse(h, id)
diagnose() / matchHouses() / renderMatchResults(lvl)
```

---

## 🚨 현재 버그 목록

### 🔴 즉시 수정 필요

1. ✅ ~~**맞춤추천 `currentUser` 타이밍 버그**~~ (완료 2026-06-23)
   - `loginWithEmail()` 내 `currentUser=profile` 직후 `renderPersonalizedRecommendations()` 재호출 추가

2. ✅ ~~**알림 설정 저장 버그**~~ (완료 2026-06-25)
   - `saveSettings()` 내 `currentUser` 업데이트 시 `alert_on`, `new_notice_alert`, `marketing_alert` 필드 누락 수정

3. ✅ ~~**확성기 배너 동적화**~~ (완료 2026-06-25)
   - `updateBannerFromDB()` 추가 — 접수중 공고 우선, 없으면 최신 공고 1건으로 배너 자동 업데이트

4. ✅ ~~**pg_cron 공고 수집 중단**~~ (완료 2026-07-02)
   - 헤더 JSON 이스케이프 오류로 collect-announcements 트리거 실패 → cron job 재생성(jobid 4, 5)으로 수정, 매일 09:00/15:00 정상 작동 확인

5. ✅ ~~**정정공고 시 원본 공고 중복 노출**~~ (완료 2026-07-02)
   - `get_announcements_deduped()` RPC 수정 — 제목 접두어 "[정정공고]" 무시하고 매칭하도록 변경

6. ✅ ~~**대전충남 신혼신생아Ⅱ 중복 공고**~~ (완료 2026-07-02)
   - 동일 RPC에서 제목 공백 정규화로 해결

7. 🔵 **카카오맵 구청 표시 문제** — 보류 (2026-07-02)
   - 호별 주소 데이터 구조상 현재 구현 불가로 판단, 추후 재검토

### 🟡 기능 개선
- ✅ NEW 배지 동적 계산 (`created_at` 기준 48시간) — 이미 구현됨 확인
- ✅ 마감임박 배지 (`apply_end` 기준 3일 이내) — 이미 구현됨 확인
- ✅ 공고 탭 헤더 "전국 공공임대·분양 공고 전체 목록" 수정 완료
- ✅ 정정공고 처리 (`[정정공고]` 감지 → 배지 표시) (완료 2026-06-25)
- ✅ 공고 카드에 `area_min/max`, `total_units`, `move_in_date` 표시 (완료 2026-06-25)

### 🔴 즉시 수정 필요 (스프린트 2)

4. ✅ ~~**MYHOME `announcement_id` 생성 로직 버그**~~ (완료 2026-06-25)
   - ~~현재: `pblancId + "_" + houseSn` → 지역별 중복 구분 불가~~
   - 수정: `[pblancId, houseSn, brtcNm, signguNm].filter(Boolean).join('_')` — v8 배포 완료

### 🟢 중장기
- SH·GH 등 추가 공공기관 API 연동
- 공고별 동적 자격 진단 시스템
- 커스텀 도메인 (zipfit.kr)
- Supabase Auth 마이그레이션
- ✅ HOUSES[] → DB 연동 (완료 2026-06-25)
- ✅ 마이홈포털(MYHOME) 공고 수집 — collect-announcements v7 (완료 2026-06-25)

---

## ✅ 완료된 작업 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-03 | announcement_extras(사진·평면도) 프론트엔드 신규 노출 — housing_units/announcement_policies와 동일한 슬롯 기반 패턴으로 `loadAnnouncementExtras()`/`driveFileIdFrom()` 신규 구현, Drive 파일 URL에서 fileId 추출해 `drive.google.com/thumbnail?id=...&sz=w300` 썸네일 그리드로 렌더링(사진/평면도 그룹 분리, 클릭 시 원본 Drive 파일 새 탭). 공고 상세 슬롯 순서를 자격기준→세대정보→**사진·평면도**→정책안내로 확장(`extras-slot-${id}` 추가). `.extras-*` CSS 및 다크모드 배경(`.extras-thumb`)·텍스트(`.extras-title`/`.extras-group-label`) 선택자 반영. sw.js v32→v33. Drive 폴더 공유설정을 "링크가 있는 모든 사용자(뷰어)"로 변경한 뒤 실제 파일 하나(`1hnZyZCzgRmLFrCyQqZQk7EgZTmw8Esbb`)의 권한을 Google Drive API로 직접 조회해 `anyone:reader`임을 확인함. **다만 샌드박스가 drive.google.com egress 자체를 정책상 차단하고 있어(kakao.com과 동일한 종류의 제약) 실제 썸네일 HTTP 200 응답이나 브라우저에서의 실제 로딩은 이번 세션에서 검증 불가** — Playwright 모의 fetch로 렌더링 로직(2건/1건 그룹 분리, caption 조합, fileId 추출, 순서 고정, 사진 없는 공고 무표시, 다크모드 텍스트/배경)만 확인함. 다운님이 실제 사이트에서 재매핑 5개 공고 포함 여러 공고를 열어 썸네일이 실제로 뜨는지, 클릭 시 새 탭에서 열리는지 최종 확인 필요 |
| 2026-07-03 | announcement_extras orphaned id 5개(7054/7058/7065/3554/3555) 재매핑 — claude.ai가 building_address/dong_ho/Drive 파일 메타데이터 대조로 실제 공고 5건(경남_신혼신생아Ⅰ·Ⅱ, 부천시_취창업청년, 대구경북_비분양전환형, 서울대방)을 특정, 검증된 매핑을 그대로 UPDATE 적용(29건). 검증: orphaned id 잔존 0건, 재매핑 29건 전부 get_announcements_deduped() 매칭 성공(matched=true, 3554:12/3555:7/7054:1/7058:6/7065:3), announcement_extras 전체 355건 unmatched 0건. **다만 index.html 전체를 검색한 결과 `announcement_extras`/`extra_type`/`file_url`/`dong_ho`/`building_address`를 참조하는 프론트엔드 코드가 단 한 줄도 없음을 확인** — DB 매핑은 정확해졌지만 이 데이터를 읽어 사진·평면도를 렌더링하는 코드 자체가 애초에 구현된 적이 없어 사이트에는 여전히 아무것도 뜨지 않음. 작업지시서의 "프론트엔드 코드는 이미 있다"는 전제가 사실이 아니었음을 확인하고 정정, 신규 구현이 별도로 필요한 상태로 다음 세션 작업 예정에 등록 |
| 2026-07-03 | eligibility_criteria 전역진단 오염 버그 수정 + 공고별 정밀 자격기준 노출 — `eligibility_criteria` 35건이 사실 `source_announcement_id`로 이미 두 그룹(전국 공통 '기본기준' 8건 vs 특정 공고 전용 27건)이 나뉘어 있었는데 `diagnose()` 1단계 전역 조회 쿼리가 이 구분 없이 35건을 몽땅 섞어 써서, 전역 진단인데 특정 지역 기준까지 비교에 섞이는 오염 상태였음. `announcement_id` 컬럼 신규 추가 후 27건을 housing_units/기존 announcement_policies에서 이미 검증된 id로 매핑(새로 추론 없음), `loadEligibilityCriteria()` fetch URL에 `source_announcement_id=eq.기본기준` 필터 추가해 전역 진단은 8건만 쓰도록 수정. 27건은 오늘 만든 announcement_policies와 동일 패턴으로 `loadPreciseEligibility()` 신규 구현해 공고 상세에 "🎯 이 공고 정밀 자격기준" 섹션으로 노출(`.elig-*` CSS, 다크모드 배경·텍스트 선택자 포함). sw.js v29→v30. 검증: 27건 전부 announcement_id 확정 및 get_announcements_deduped() 매칭 성공(matched=true), '기본기준' 8건은 housing_type 8종 커버(매입임대만 supply_form 2종) — 기존 대비 실질적 자격진단 커버리지 축소 없이 노이즈만 제거됨 확인. Playwright 모의 fetch로 전역조회 URL 필터·8건 로드·공고별 정밀기준 렌더링(2건 케이스: 소득·자산·차량가액 필드별 표시, 값 없는 필드는 생략)·정밀기준 없는 공고 무표시·다크모드 텍스트 색상(#e8e8e8) 검증 완료 |
| 2026-07-03 | announcement_policies 정책 카테고리 6종 백필 — category_discovery_log(20개 공고 원문 전수조사 기록)에서 재계약 최장거주기간·조건부 연장/예비입주자 자격 유효기간/혼인관계 특수조건/기숙사 성별분리 공급/기숙사 운영규정·퇴거승인 조항/입주 전 실사 조건부 공급 6개 카테고리 관련 finding 36건을 ILIKE 패턴으로 조회 후 눈으로 검토, 부천시_취창업청년의 "재계약 시 임대조건 변경 규칙"(재계약 기간이 아닌 임대료 재산정 내용이라 최장거주기간 카테고리와 무관) 1건을 오탐으로 제외하고 35건 채택. announcement_id는 housing_units.announcement_label 매핑을 우선 재사용하고, housing_units에 없는 3개 라벨(광명제1R구역_행복주택_매입형/서울대방_신혼희망타운_건설형/대구경북_든든전세_분양전환형)은 기존 announcement_policies 적재분 및 get_announcements_deduped() title 매칭으로 재확인, 14개 공고 전부 announcement_id 확정(NULL 처리 없음). 같은 공고·카테고리 내 복수 finding은 하나의 content_raw 문단으로 합쳐 33행 INSERT(재계약 9/예비입주자 8/혼인관계 4/기숙사 성별분리 4/기숙사 운영규정 4/입주전 실사 4), data_categories 6종 status를 설계완료_미적재→반영완료로 갱신. 검증: 카테고리별 건수 정확히 일치, 정책 노출 공고 수 5→17건으로 증가, get_announcements_deduped() 매칭 실패 0건 확인. 코드 변경 없음(기존 loadAnnouncementPolicies()가 새 행을 자동 노출) |
| 2026-07-03 | 공고별 정책 안내(announcement_policies) 프론트엔드 노출 — housing_units와 동일 패턴(카드 상세 오픈 시 announcement_id로 fetch)으로 `loadAnnouncementPolicies()` 신규 구현, 카테고리별 리스트(중복신청탈락규칙/보증금-월세전환/청약통장요구여부/동호수배정방식/위임장제출서류/최하층우선배정) 렌더링. `escapeHtml()` 헬퍼 신규 추가(파일 내 기존 이스케이프 유틸 없었음 확인 후 추가) — content_raw가 원문 텍스트라 이스케이프 없이 넣으면 XSS·레이아웃 깨짐 위험. `.policy-*` CSS를 기존 `.hu-*` 톤에 맞춰 추가, 다크모드 배경(`.policy-item`)·텍스트(`.policy-title`/`.policy-content`) 선택자도 누락 없이 반영(과거 세션에 다크모드 텍스트 미반영 사고가 있었던 지점이라 특별히 확인). sw.js v28→v29. DB 조회 결과 실제로 매칭 가능한 공고는 5건(2015122300020202, 2015122300020209, 20647_1_경기도_광명시, 20648_1_경기도_광명시, 20652_1_서울특별시_영등포구) — 나머지 2건(보증금-월세전환/위임장 카테고리, 대전충남 청년매입임대 추정)은 announcement_id가 의도적으로 NULL 유지된 상태라 프론트엔드에 노출되지 않음(작업 지시서의 "6개 공고"와 달리 5개 공고에서만 실제로 섹션이 뜸, 나머지는 애초에 매칭 불가한 데이터 상태). Playwright 모의 fetch로 정책 있음(HTML 특수문자 포함 content_raw로 XSS 이스케이프 확인)/없음 두 케이스와 다크모드 텍스트 색상(#e8e8e8 정상 적용) 검증 완료 |
| 2026-07-02 | 🟡 지오코딩 3단계 폴백 + 진단로깅 추가 (실사용 검증 대기중, "해결완료" 아님) — `initMapForHouse()`의 기존 폴백이 전체 상세주소 실패 시 곧바로 "시/도+시군구"로 떨어져, 오늘 넣은 "건물주소 우선" 로직이 무색해지고 다시 시청/구청급 좌표가 뜨는 문제 재발견. `toGeocodeAddress()` 헬퍼(괄호 이후 제거, 없으면 번지수 이후 건물명/호수 토큰 제거)를 추가해 Lv1(전체주소)→Lv2(정제된 도로명)→Lv3(시/도+시군구, 최후수단) 3단계 폴백으로 재구성, 각 단계 결과를 `console.warn('[ZipFit geocode] ...')`로 진단 로깅(임시, 검증 후 제거 예정). sw.js v27→v28. 오늘 처음으로 실제 카카오 API가 왜 실패하는지 마주한 이슈라 Playwright 모의 검증(로직 흐름 자체가 의도대로 동작함만 확인 — Lv1 실패→Lv2 성공 케이스, Lv1·Lv2 실패→Lv3 성공 케이스)만으로는 완료로 간주하지 않음. **다음 세션에서 실제 사이트 F12 콘솔로 `[ZipFit geocode]` 로그를 여러 공고에서 직접 확인 후 결과에 따라 정제 로직 추가 보완 필요** |
| 2026-07-02 | 카드 초기 지도, 시군구보다 세대별 건물주소 우선하도록 재설계 — 오전에 sigungu_nm null 문제를 고치면서 카드 최초 오픈 시 1차 시군구 지오코딩이 "성공"해버리게 됐는데, 그 성공 결과가 시/군/구청 좌표라 오히려 부정확해지는 회귀 발생(원래는 이 지오코딩이 실패해서 건물주소 폴백이 우연히 발동했던 것). 근본 원인은 "시군구 먼저 시도 후 실패 시 건물주소 폴백"이라는 순서 자체가 잘못된 것 — housing_units가 있는 공고는 건물주소가 시군구보다 항상 정확하므로 시군구 지오코딩을 아예 건너뛰고 건물주소를 곧바로 쓰도록 재설계. toggleDetail()은 precise_address 있을 때만 즉시 지오코딩하고 없으면 huRegionFallback에 시군구 주소만 저장해두고 대기, loadHousingUnits()가 유닛 있으면 renderHousingGroupRows()에서 첫 건물주소로 지도 초기화(주경로), 유닛이 없거나 로드 실패(catch)할 때만 huRegionFallback을 최후수단으로 사용. sw.js v26→v27. Playwright kakao.maps 모의 객체 + 실제 DB에서 가져온 케이스(서울대방 precise_address / 광주전남 청년매입임대 — sigungu_nm은 "나주시"지만 실제 첫 건물은 광주 북구 / 세대정보 없는 일반공고 / housing_units fetch 네트워크 오류)로 4개 시나리오와 건물 재클릭 회귀까지 프로그래매틱 검증 완료. 전남광주통합특별시 케이스는 세대정보 있으면 시군구 지오코딩 자체를 안 하므로 카카오맵의 신설 행정구역 인식 여부와 무관하게 구조적으로 안전해짐(우연한 폴백 → 의도된 주경로) |
| 2026-07-02 | get_announcements_deduped() 지도 위치정보 회귀 수정 — 오늘 오전 대표행 소스 우선순위를 LH로 바꾼 부작용으로, LH 원본은 sigungu_nm을 채우지 않아 대표행이 LH로 바뀐 공고 상당수(439건 중 379건)에서 카드 상세 최초 지도가 시/도 단위로만 지오코딩돼 엉뚱한 위치(예: 부천 공고가 수원으로, 대전/부산 공고가 시청 위치로)에 표시되는 회귀 발생. 대표행 선정 로직(id/url/extras 매칭용, LH 우선 + id ASC 타이브레이커)은 그대로 두고, 위치정보(sido_nm/sigungu_nm/precise_address)만 같은 dedup_key 그룹 내에서 가장 정밀한 값(precise_address > sigungu_nm 있는 값 > 나머지)을 별도로 골라 채우도록 RPC를 CTE(base/best_location/winner) 구조로 재작성(apply_migration: fix_dedup_location_fields_group_best_value). 카드 총량 439건 불변, sigungu_nm null 379→287건(92건 개선), housing_units/announcement_extras 매칭 재확인 결과 회귀 없음(둘 다 unmatched 0건), 실제 문제 사례 3건(부천 취창업청년/대전 청년매입임대/부산 청년매입임대) 전부 정상 시군구로 채워짐 확인 |
| 2026-07-02 | 세대정보 아코디언 지도 자동 초기화 — 기존엔 toggleHousingGroup()(건물 클릭 시)에서만 initMapForHouse()가 호출돼, 카드 대표주소(sido+sigungu 등) 지오코딩이 실패하는 공고(세대정보는 있지만 지역 단위 주소가 부정확한 케이스)는 건물을 직접 클릭하기 전까지 지도가 "정보를 불러올 수 없어요" 상태로 방치됨. renderHousingGroupRows()에 huAutoMapTried 가드를 추가해, 지역 단위 지오코딩이 실패해 huMapState[id]가 비어있는 경우에 한해 첫 번째 건물 주소로 자동 폴백 지오코딩(목록 본문은 접힌 채 유지, 헤더만 강조). 지역 지오코딩이 이미 성공한 정상 케이스는 폴백이 스킵되어 회귀 없음. 지도 관련 두 곳의 안내 문구를 "지도 정보를 불러올 수 없어요" → "주소 위치를 찾을 수 없어요"로 변경(실제로는 지도 자체가 아니라 주소 인식 실패인 케이스를 정확히 설명). sw.js v25→v26. Playwright kakao.maps 모의 객체로 지역지오코딩 성공/실패 양쪽 시나리오와 이후 건물 클릭 시 마커 재사용(인스턴스 1개 유지) 회귀 없음을 프로그래매틱 검증 |
| 2026-07-02 | get_announcements_deduped() 대표행 비결정성 버그 근본 수정 — MYHOME 소스가 시군구별로 제목·공고일·소스·수집시각까지 완전 동일한 행을 여러 개 만드는데 ORDER BY에 최종 타이브레이커가 없어 pg_cron UPSERT마다 대표행이 바뀔 수 있었음(세대정보 아코디언 소실 원인). ORDER BY 소스우선순위를 MYHOME>LH에서 LH>MYHOME으로 역전하고 마지막에 `id ASC` 결정적 타이브레이커 추가(apply_migration: fix_dedup_rpc_deterministic_tiebreak_lh_priority). housing_units 17개 라벨 878건 전량 재매칭 확인, announcement_extras 355건 중 326건(9개 유효 id) 재매칭 성공·나머지 29건(5개 id)은 애초에 announcements에 존재하지 않는 orphaned 레거시 id로 이번 버그와 무관한 별개 이슈로 확인(미해결 상태 유지). announcement_policies 가짜 라벨 5건(2개 그룹, "3건"으로 알려졌던 것보다 많음) 확인 후 실제 announcement_id로 재매핑(extras 매칭 결과와 교차검증). 카드 총량 439건 불변 확인(그룹핑 안전). announcement_id=NULL인 policies 2건은 의도된 설계(불확실 시 NULL 유지 원칙)로 정상 |
| 2026-07-02 | initMapForHouse() 지오코딩 폴백 로직 개선 — 1차 지오코딩 실패 시 fallback을 h.addr.split(' ')[0](시/도만)에서 slice(0,2)(시/도+시군구 2단어)로 변경. precise_address에 다양한 형태의 주소가 들어와도 폴백 검색 범위가 과도하게 넓어지지 않도록 정밀화. sw.js v24→v25 |
| 2026-07-02 | announcements.precise_address 컬럼 프론트엔드 반영 — get_announcements_deduped() RPC에 precise_address 추가(DROP FUNCTION 후 재생성), 공고탭(loadNoticeData)·추천탭(matchHouses) 양쪽 카드에 data-precise-address 속성 추가. toggleDetail() 최초 지도 로딩 시 precise_address 유무만으로 분기(있으면 그 주소, 없으면 기존 sido+sigungu 방식) — 특정 공고 하드코딩 없이 앞으로 이 필드가 채워지는 모든 공고에 자동 적용되는 범용 로직. 세대별 정보 아코디언은 기존 housing_units 유무 판단 그대로 유지. sw.js v23→v24. Playwright kakao.maps 모의 객체로 precise_address 있음/없음 양쪽 지오코딩 호출 인자와 세대별 정보 섹션 미노출을 프로그래매틱 검증 |
| 2026-07-02 | housing_units.building_name 데이터 정제 — building_name에 "매입다가구(지역명)" 카테고리성 자리표시자가 잘못 들어간 241건을 address 원문을 직접 읽고 판단해 실제 단지명(아파트·빌라·오피스텔명) 또는 단지명이 없는 순수 다가구/다세대는 법정동명으로 교체(정규식 일괄처리 아닌 케이스별 수동 판단). 예: "매입다가구(대전서구)" → "더 프라임 시티"(단지명 있는 경우), "매입다가구(대전서구)" → "도마동"(지번만 있는 순수 다가구). 검증: building_name LIKE '매입다가구(%' 0건 확인, 총 행수(881행) 불변 확인 |
| 2026-07-02 | 세대별 정보 리스트를 건물 단위로 그룹핑 + 지도 연동 — housing_units를 building_name(없으면 address) 기준으로 묶어 "건물명 (N건)" 2단 아코디언으로 표시, 건물 그룹 클릭 시 기존 initMapForHouse()를 재사용해 지도 마커를 그 건물 위치로 이동. initMapForHouse가 카드당 지도/마커 인스턴스를 huMapState에 캐싱해 재호출 시 새로 생성하지 않고 setCenter/setPosition으로 위치만 갱신 → 여러 건물을 눌러도 마커 항상 1개만 유지. 현재 선택된 건물 행은 .hu-group-active 클래스로 강조, "더보기"로 목록을 다시 그려도 강조 상태 유지. 건물 그룹 목록도 기존 더보기 패턴(초기 5개+10개씩 증분) 적용. sw.js v22→v23. Playwright에 kakao.maps 모의 객체(addInitScript)를 주입해 지도 생성 호출 횟수·마커 좌표 이동·활성 강조 전환을 프로그래매틱하게 검증(실제 카카오맵 SDK도 이 세션에서는 egress 정책상 로드 불가하여 모킹) |
| 2026-07-02 | 공고 상세 아코디언에 housing_units 호별 세대정보 섹션 추가 — hcard에 data-announcement-id 속성 추가(공고탭·추천탭 카드 공통), toggleDetail()에 지도 지연로딩과 동일 패턴(dataset.unitsLoaded)으로 최초 펼침 시 1회 fetch, 0건이면 섹션 숨김·1건 이상이면 "🏠 세대별 정보 (N건)" 렌더링. 건물명/주소·전용면적·보증금·월임대료(0원↔"월세없음")·분양전환시점 표시, 기본 5건+더보기(10건씩 증분) 방식으로 100건 이상 공고(대구경북 132건 등)도 안전하게 렌더링. 다크모드 텍스트 가시성 규칙(.hu-title/.hu-addr/.hu-value → #e8e8e8, .hu-label → #9aa0aa, .hu-row 배경 다크 대응) 기존 패턴 재사용. sw.js v22 배포. Playwright route mocking으로 있음/없음 공고 양쪽, 더보기 확장, 다크모드 색상 프로그래매틱 검증 완료(egress 정책상 브라우저의 실제 Supabase 직접 호출은 세션에서 차단되어 mock으로 검증) |
| 2026-07-02 | collect-announcements Edge Function 수정 (v9→v10) — 2026.07.01 광주광역시+전라남도 행정통합("전남광주통합특별시") 반영, LH/MYHOME 원본 API의 과도기 sido_nm 값("광주광역시"/"전라남도")을 저장 직전 자동 치환하는 MERGED_SIDO_MAP 추가. 대전광역시/충청남도는 통합 미법제화 상태라 매핑 대상에서 제외. 기존 announcements 173건은 이미 정리됨(claude.ai 작업분), 이번 변경은 향후 신규 수집분에 적용 |
| 2026-07-02 | 3단계 세션 마무리 — 긴급 버그 5건 수정(pg_cron 수집 중단, 정정공고 중복 노출, 대전충남 신혼신생아Ⅱ 중복공고, 다크모드 가독성, 카카오맵 구청표시 보류), housing_units/scoring_criteria/eligibility_criteria/announcement_policies 데이터 정합성 정리(category값을 data_categories.category_name과 일치시킴, housing_type "신혼신생아Ⅰ"/"신혼신생아매입임대" 표기 통일). announcements 테이블에 operator_type/recruitment_zone/subscription_account_required/included_appliances 4개 컬럼 신규 추가. 최종 상태: housing_units 878행, scoring_criteria 44행(청년매입임대18/신혼신생아매입임대26), eligibility_criteria 35행, announcement_policies 21행(정책원문 6종), data_categories 31개 |
| 2026-07-01 | 1단계 공고 원문 전수조사 완료 — 20개 Drive 폴더 공고문·엑셀·QnA 분석, category_discovery_log batch_no=1 총 120건 적재 (신규 후보 20건, 기존 카테고리 매칭 100건) |
| 2026-07-01 | Notion 공고 분석 파이프라인 확정 — 작업 원칙 페이지에 6단계 파이프라인·data_categories 레지스트리·5배치 재검증 안전장치 추가; 공고 분석 로그 source of truth 주석 추가 |
| 2026-07-02 | 2단계 실데이터 대량 적재 최종 완료 — 미완료 8개 폴더 전량 처리(서울대방/광명1R/광명4R 행복주택, 광주전남 기숙사형·신혼신생아Ⅰ·Ⅱ전세형·청년매입임대, 대전충남_청년매입임대). housing_units 신규 274행(대전충남_청년매입임대 110, 광주전남_청년매입임대 49, 광주전남_신혼신생아Ⅰ 37, 광주전남_신혼신생아Ⅱ전세형 22, 광주전남_기숙사형 3, 대구경북_비분양전환형 누락분 4). eligibility_criteria 35행, scoring_criteria 44행, announcement_policies 21행 신규 적재. 대구경북_분양전환형 sigungu_nm 오염값("매입다가구(경북경주시)" 등) 정리(경주시/중구). housing_units 누적 총 974행 |
| 2026-07-02 | 2단계 housing_units 실데이터 대량 적재 — 대구경북_분양전환형(경주 해링턴플레이스 신경주역 101동·102동) 119행, 대구경북_비분양전환형(수성헤센더테라스·경산부영·달서구·달성군 20개 건물) 128행 삽입, 누적 총 653행 |
| 2026-07-01 | 다크모드 텍스트 가독성 버그 수정 — .logo/.setting-label/.panel-title/.hname/.mval 다크모드에서 color:#e8e8e8 지정, sw.js v21 |
| 2026-07-01 | announcement_extras 4순위 배치 완료 — 폴더 16~20 (대전충남 기숙사형/신혼신생아I/신혼신생아II전세형, 부산울산 기숙사형) 적재, 총 355건 |
| 2026-07-01 | loadNoticeData 매핑 누락 버그 수정 — mymy_applicable/supply_form/application_method/recruit_multiplier/pair_announcement_key/housing_change_allowed/source/announcement_id 8개 필드 추가, 뱃지·짝공고 경고 표시 정상화, sw.js v20 |
| 2026-06-30 | 자격진단 엔진 개편(2순위) + 신청편의도 뱃지 + 짝공고 경고(3순위) — eligibility_criteria DB 조회 전환, buildConvBadges(MyMy/공급형태/신청방법/모집배수), pair_announcement_key 경고 배너, 청약통장·최하층우선배정 입력 추가, sw.js v19 |
| 2026-06-30 | pg_cron timeout 60초→120초 상향 + 공고 수집 하루 2회(KST 09:00/15:00) — zipfit-collect-announcements-pm 잡 신규 생성 (jobid 3) |
| 2026-06-30 | 공고 탭 대상 계층 필터 칩 추가 — 청년/신혼·신생아/대학생/고령자/한부모가족/장애인, classifyDemographics 기반 클라이언트 필터링, sw.js v18 |
| 2026-06-30 | 인사이트 KPI 접수중 조건 공고탭 필터와 통일 — status_normalized 단일 조건으로 단순화, sw.js v17 |
| 2026-06-30 | 상세 패널 내부 클릭 버블링 차단 — detail div 4곳에 onclick stopPropagation 추가, sw.js v16 |
| 2026-06-29 | 관리 탭 버그 2종 수정 — 더보기 후 전체 저장됨 오표시(연산자 우선순위 버그), 드롭다운 이중 표기 제거, sw.js v15 |
| 2026-06-29 | 관리 탭 서류 체크리스트 범용화 — 저장 공고 기반 드롭다운, housing_type별 서류 매핑, D-Day·신청링크 동적화, 하드코딩 전부 제거, sw.js v14 |
| 2026-06-29 | 인사이트 탭 재고 세대수 합산 버그 수정 — Supabase max_rows 1,000행 제한이 원인, get_rental_stats_summary() RPC 신규 생성으로 서버 집계 전환, sw.js v13 |
| 2026-06-29 | 인사이트 탭 rental_housing_stats 기반 섹션 2개 추가 — 섹션A(재고 vs 공고 갭), 섹션B(유형별 평균 임대 조건), Promise.all 동시 호출, 기존 공고 기반 유형별 보증금 섹션 제거, sw.js v11~v12 |
| 2026-06-29 | collect-rental-stats v1~v9 — 공공임대 5종(영구/행복/장기전세/50년/국민) 수집 Edge Function 신규 개발, rental_housing_stats+history 테이블 생성, target별 선택 수집, 중복제거, BATCH 500, 총 6,894건 수집 완료 |
| 2026-06-25 | renderInsight() 5섹션 누락 코드 재적용 — 브랜치 전환 시 git checkout main --으로 덮어쓰인 신규 코드 main에 직접 재적용 |
| 2026-06-25 | 인사이트 탭 renderInsight() 전면 개편 — KPI 카드 3종·마감임박 타임라인·지역별 이중막대·유형별 보증금임대료·30일 추이, sw.js v11 |
| 2026-06-25 | 배지 디버그 로그 제거 + sw.js v10 |
| 2026-06-25 | isClosingSoon 마감일 23:59:59 보정 — 날짜만 있는 경우 당일 23:59:59로 보정, 당일 낮에 마감임박 배지 사라지는 문제 방지, sw.js v9 |
| 2026-06-25 | isNewNotice 기준 수정 — created_at(수집일시) 대신 announcement_date→apply_start→created_at 순 fallback. 오래된 모집공고에 NEW 배지 오표시 버그 수정, sw.js v8 |
| 2026-06-25 | parseNoticeDate ISO 8601 T 분기 처리 — T 포함 시 replace 없이 직접 파싱, 날짜 문자열만 . → - 치환, sw.js v7 |
| 2026-06-25 | parseNoticeDate 밀리초 정규화 — ISO 8601 소수점 초 6자리(Supabase 타임스탬프) → 3자리로 잘라 파싱 정상화, 배지 디버그 로그 parsed_created_at 추가, sw.js v6 |
| 2026-06-25 | 정렬·배지 버그 수정 3종 — 지역 정렬 sido_nm/sigungu_nm, date-desc created_at fallback, isNewNotice created_at 우선순위, 배지 디버그 로그(JSON.stringify), sw.js v4 |
| 2026-06-25 | sw.js CACHE_NAME v1→v2 갱신 — 인사이트 탭·저장 기능 변경사항 브라우저 캐시 강제 갱신. index.html 수정 시 버전 동시 올리기 원칙 수립 |
| 2026-06-25 | 인사이트 탭 기본 구현 — loadInsightData(), 지역별/유형별/상태별/30일 추이 CSS 차트 4종, 외부 라이브러리 없음 |
| 2026-06-25 | 관리 탭 저장한 공고 기능 완성 — localStorage 기반 toggleSaveNotice/renderSavedNotices, 공고·추천 탭 저장 버튼, 탭바 배지 |
| 2026-06-25 | 카카오맵 지도+POI 복구 — toggleDetail(id,card) 재구현, hcard에 data-sido/sigungu/region/title 저장, loadNoticeData 매핑에 sido_nm/sigungu_nm 추가, geocoder sido fallback, initMapForHouse 리팩토링 |
| 2026-06-25 | 접근성(a11y) 기본 보완 — 탭바 role=tablist/aria-selected, hcard role=button/aria-expanded/키보드Enter·Space, 칩 aria-pressed, notice-list aria-live=polite, 설정탭 label for 명시 연결 |
| 2026-06-25 | 공고 탭 더 보기 버튼 추가 — noticeVisibleCount=20 전역, 20건씩 추가(noticeShowMore), 필터/정렬 변경 시 초기화, more-btn 스타일 통일 |
| 2026-06-25 | 공고 공유 기능 추가 — shareNotice(btn,title,region,type,url), 모바일 navigator.share / PC 클립보드 복사+1.5초 텍스트 변경, 공고탭·추천탭 accordion 버튼 추가 |
| 2026-06-25 | PWA 기본 설정 추가 — manifest.json(start_url /zipfit/), sw.js(install 캐싱+오프라인 대응), icon-192/512.png(Pillow 생성), Apple 메타태그, SW 등록 스크립트 |
| 2026-06-25 | Supabase API 에러 처리 전면 보강 — initNoticeFilters/loadNoticeData/matchHouses/saveSettings 에러 UI·재시도 버튼·응답 body 검증 추가 |
| 2026-06-25 | 모바일 UX 개선 — .maintabs sticky top:0, .detail-grid @media 1열 전환, .hgrid @media 2열 전환, .hname 2줄 말줄임 |
| 2026-06-25 | 공고 탭 필터 UX 개선 — 필터 초기화 버튼, 필터 적용 중 버튼 텍스트 표시, 전체/필터 시 공고 수 문구 분기 |
| 2026-06-25 | 추천탭 매칭 카드 공고탭 수준 통일 — 배지(정정·NEW·마감임박·인구통계), accordion 상세펼침, 날짜 중복 개선, 버튼 클릭 시 matchHouses() 자동 호출 |
| 2026-06-25 | 자격진단 결과 메시지 전면 개선 — eligibleTypes 기반 신청가능 유형 표시, 하드코딩 신청기간 제거, HOUSING_CRITERIA 자산기준·targets 현실화 |
| 2026-06-25 | 공고 탭 UX 개선 — 필터 초기화 시 전체 공고 즉시 노출, 정렬 드롭다운 10종 추가, 날짜 중복 표시 개선 |
| 2026-06-25 | 공고 카드 accordion 상세 펼침 기능 추가 — 카드 클릭 토글, 2열 그리드 상세정보, 공고 원문 링크 |
| 2026-06-25 | collect-announcements v8 배포 — MYHOME announcement_id에 brtcNm+signguNm 추가, 지역별 중복 방지 |
| 2026-06-25 | MYHOME announcement_id 버그 이슈 등록 — pblancId+houseSn 중복 문제, v8 수정 필요 (실제 366건 → 현재 16건만 수집) |
| 2026-06-25 | collect-announcements v7 배포 — 마이홈포털(MYHOME) 수집 로직 추가 (fetchMyHome, mapMyHomeRow) |
| 2026-06-25 | 자격진단 필수 관문화 — Step2 초기 비활성, diagnose() 완료 시 활성화 + 유형칩 자동선택, eligibleTypes 필터 activeTypes로 수정 |
| 2026-06-25 | matchHouses p_status null 변경 + 접수마감 클라이언트 필터 추가 |
| 2026-06-25 | 추천탭 전면 개선 — HOUSES[] 제거, HOUSING_CRITERIA/MEDIAN_INCOME 추가, matchHouses→DB RPC, renderMatchResults→공고 카드, eligibleTypes 자격 필터 |
| 2026-06-25 | favicon 404 제거 — `<link rel="icon" href="data:,">` 추가, jsdom 정적 분석으로 ID/fetch/문법 이상 없음 확인 |
| 2026-06-25 | 공고 카드 필드 추가 — 면적(area_min/max), 세대수(total_units), 입주예정(move_in_date) 표시 |
| 2026-06-25 | 정정공고 배지 추가 — renderNoticeList()에 isAmended 감지 + 🔄 정정 배지 렌더링 |
| 2026-06-25 | 공고 탭 헤더 전국화, NEW/마감임박 배지 동적 구현 확인 |
| 2026-06-25 | 확성기 배너 동적화 — updateBannerFromDB() 추가, DB 최신/접수중 공고 자동 표시 |
| 2026-06-25 | 알림 설정 저장 버그 수정 — saveSettings() currentUser 알림 필드 누락 수정 |
| 2026-06-24 | CLAUDE.md 단일 세이브포인트 체계 + 슬래시 커맨드 도입 |
| 2026-06-23 | 맞춤추천 `currentUser` 타이밍 버그 수정 |
| 2026-06-23 | 지역 필터 전국화, Supabase RPC 전환, GitHub Pages 배포 전환 |
| 2026-06-22 | Google Sheets → Supabase 전환, Edge Function + pg_cron 도입 |
| 2026-06-22 | 사용자 프로필 Edge Function v5, 설정 탭 UI 추가 |

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

---

## 📋 작업 완료 후 — 반드시 `/done` 실행

`/done` 커맨드가 아래를 자동 처리:
1. 배포 URL 확인 안내
2. CLAUDE.md 버그 목록 업데이트 (완료 ✅, 날짜 갱신)
3. 작업 이력 추가
4. git add CLAUDE.md + commit + push

---

## 🔗 주요 링크

| 항목 | URL |
|---|---|
| 배포 | https://dauntown96.github.io/zipfit |
| GitHub | https://github.com/dauntown96/zipfit |
| Supabase | https://supabase.com/dashboard/project/khdpjjyspmlqtzperoqg |
| Notion (참고용) | https://www.notion.so/3878aaa7e1558102ae9bf39dbb9a2efe |
