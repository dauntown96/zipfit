# ZipFit — Claude 작업 지침서

> 이 파일은 Claude Code가 매 세션 시작 시 자동으로 읽는 컨텍스트 파일입니다.
> 작업 완료 후 반드시 이 파일과 Notion 코드 스냅샷 페이지를 함께 업데이트하세요.
> **Notion 세이브포인트**: https://www.notion.so/3888aaa7e15581a792fbffd7f2d01125

---

## 📍 프로젝트 개요

- **서비스명**: ZipFit — 전국 공공임대·분양 공고 맞춤 매칭 서비스
- **배포 URL**: https://dauntown96.github.io/zipfit (GitHub Pages, 무료)
- **GitHub**: https://github.com/dauntown96/zipfit (public, main 브랜치 push → 자동 배포)
- **구조**: 단일 파일 (`index.html`, 약 1450줄) — 빌드 없음, 정적 배포
- **대상**: 한국 공공주택 청약·임대 신청자, 모바일 우선 (max-width: 720px)

---

## 🛠 기술 스택

| 영역 | 내용 |
|---|---|
| 프론트엔드 | HTML/CSS/JS 단일 파일 (index.html) |
| 공고 데이터 | Supabase RPC `get_announcements_deduped()` POST |
| 데이터 수집 | Supabase Edge Function `collect-announcements` v3 + pg_cron (매일 KST 09:00) |
| 사용자 프로필 | Edge Function `save-user-profile` v5 (GET/POST, CORS 완료) |
| 알림·트리거 | Make.com Free 플랜 (알림·이메일 전용) |
| 외부 API | LH 분양임대공고 API, 마이홈포털 API, 카카오맵 API |
| DB | Supabase PostgreSQL (프로젝트 ID: `khdpjjyspmlqtzperoqg`, 싱가포르) |
| 인증 | 이메일+쿠키 기반 (추후 Supabase Auth 마이그레이션 예정) |

### Supabase 설정
- **URL**: `https://khdpjjyspmlqtzperoqg.supabase.co`
- **anon key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs`
- **RPC**: `get_announcements_deduped(p_region, p_type, p_status)` — 파라미터 null 시 전체 반환, `region_top` / `status_normalized` 컬럼 포함
- **쿠키명**: `zipfit_email`

---

## 🗂 탭 구조

| 탭 | ID | 설명 | 상태 |
|---|---|---|---|
| 추천 | main1 | 자격진단(Step1) + 주택매칭(Step2) | ✅ 완성 |
| 공고 | main2 | 실시간 DB 공고 목록 + 필터 | ✅ 완성 |
| 인사이트 | main3 | AI 인사이트 | 🚧 미구현 |
| 관리 | main4 | 서류체크(Step3) + 저장공고(Step5) | 🚧 일부 |
| 설정 | main5 | 이메일 로그인 + 환경설정 | ✅ 완성 |

---

## 🔑 핵심 전역 변수

```js
SUPABASE_URL        // https://khdpjjyspmlqtzperoqg.supabase.co
SUPABASE_ANON_KEY   // index.html 내 하드코딩
noticeData[]        // Supabase에서 불러온 공고 배열
noticeLoaded        // 필터 칩 초기 로드 여부
activeNoticeRegion  // 단일 선택 필터값 (null = 전체)
activeNoticeType
activeNoticeStatus
noticeFilterOptions // { regions, types, statuses }
currentUser         // 로그인된 사용자 객체 {email, marital, regions, types, ...}
HOUSES[]            // 경기북부 2차 공고 29개 하드코딩 주택 (추후 DB 연동 예정)
selectedRegions     // 추천탭 필터용 Set
selectedTypes
settingsRegions     // 설정탭 칩 Set
settingsTypes
allRegions[]        // Supabase DB에서 동적으로 가져온 전국 지역 목록
ZF_COOKIE           // 'zipfit_email'
```

---

## 🔧 주요 함수 목록

```js
// 공고 데이터
initNoticeFilters()           // 전체 데이터 1회 로드 → 필터 칩 구성
loadNoticeData()              // 필터 변경 시 RPC 재호출 (서버사이드 필터링)
buildNoticeFilterChips()      // 필터 칩 단일선택 구조 빌드
renderNoticeList(filtered, total)

// 지역
loadRegionsFromSupabase()     // 전국 지역 동적 로드 → buildChipOptions() 호출
extractRegionTop(regionText)  // 시/도 단위 추출 (클라이언트 fallback용)

// 추천
diagnose()                    // 자격 진단 로직
matchHouses()                 // HOUSES 배열 필터링
renderMatchResults(lvl)
renderPersonalizedRecommendations()  // 맞춤 추천 패널 — currentUser 의존

// 사용자
loginWithEmail(email)         // 이메일 로그인 + 프로필 불러오기
saveUserProfile(lvl)          // Edge Function으로 사용자 저장
saveSettings()                // 설정 저장
applySettingsToUI(p)          // 저장된 설정 UI 반영
onSettingChange()             // 토글 변경 시 자동 저장

// 탭/UI
goMain(n) / goStep(n)         // 탭/스텝 전환
toggleDetail(id)              // 주택 상세정보 토글 (카카오맵+POI)
initMapForHouse(h, id)
buildPoiTabs(id, coords) / searchPoi()
toggleNoticeFilter()          // 필터 패널 접기/펼치기

// 유틸
classifyNoticeType(typeText, nameText)
classifyDemographics(typeText, nameText)
isNewNotice(row) / isClosingSoon(row)
setTheme(theme) / setFontSize(size)
```

---

## 🚨 현재 버그 목록 (우선순위순)

### 🔴 즉시 수정 필요
1. ✅ **맞춤추천 `currentUser` 타이밍 버그** (완료 2026-06-23)
   - 증상: 설정에서 조건 저장했는데 추천 탭에서 "저장된 조건 없음"으로 표시됨
   - 수정: `loginWithEmail()` 완료 후 `renderPersonalizedRecommendations()` 재호출 추가

2. **알림 설정 저장 버그**
   - 증상: 전체알림·신규공고알림·마케팅알림 토글 값이 저장 안 됨
   - 원인: `onSettingChange()` 호출 시 `currentUser` 일부 필드 누락으로 덮어쓰기 발생

3. **확성기 배너 동적화**
   - 증상: `.badge` 안 공고 텍스트 하드코딩 ("2026년 경기북부 2차 공고")
   - 수정 방향: DB에서 최신 공고 기준으로 자동 업데이트

### 🟡 기능 개선
- NEW 배지 동적 계산 (`created_at` 기준 48시간)
- 마감임박 배지 (`apply_end` 기준 3일 이내)
- 정정공고 처리 (`[정정공고]` 감지 → 기존 공고 숨김)
- 공고 탭 헤더 텍스트 수정: "실시간 LH 공고 전체 목록" → "전국 공공임대·분양 공고 전체 목록"
- 공고 카드에 `area_min/max`, `total_units`, `move_in_date` 표시 (DB에는 있음)

### 🟢 중장기
- SH·GH 등 추가 공공기관 API 연동
- 공고별 동적 자격 진단 시스템
- 커스텀 도메인 연결 (zipfit.kr 등)
- Supabase Auth 마이그레이션
- HOUSES[] 하드코딩 → DB 연동

---

## ✅ 완료된 작업 이력

| 날짜 | 내용 |
|---|---|
| 2026-06-23 | 맞춤추천 currentUser 타이밍 버그 수정 — loginWithEmail 완료 후 renderPersonalizedRecommendations 재호출 |
| 2026-06-23 | GitHub Pages 배포 전환 (Netlify 크레딧 초과) |
| 2026-06-23 | Supabase RPC 전환 — `get_announcements_deduped()`, 134건 정상 로드 |
| 2026-06-23 | 지역 필터 전국화 — 17개 시/도 동적 표시 |
| 2026-06-23 | 헤드카피 전국화 |
| 2026-06-22 | Google Sheets → Supabase PostgreSQL 전환 |
| 2026-06-22 | 데이터 수집 Make → Supabase Edge Function + pg_cron 전환 |
| 2026-06-22 | 사용자 프로필 Edge Function v5 (CORS 완료) |
| 2026-06-22 | 설정 탭 조건 설정 UI 추가 |

---

## 🚫 코딩 원칙 (반드시 준수)

### 절대 원칙
1. **단일 파일 구조 유지** — `index.html` 하나. 별도 JS/CSS 파일 분리 금지
2. **수정 최소화** — 요청된 버그/기능만 건드릴 것. 관련 없는 코드 리팩토링 금지
3. **장기 확장성 우선** — 하드코딩 대신 동적 처리, DB 기반 설계
4. **모바일 우선** — max-width: 720px 기준, 터치 친화적 UI 유지
5. **한국어 서비스** — 모든 UI 텍스트는 한국어

### 작업 방식
- 수정 전 반드시 관련 함수의 현재 코드를 확인하고 시작
- 함수 전체를 교체하지 말고 **최소 변경**으로 버그 수정
- `currentUser` 관련 수정 시 null 체크 항상 포함
- Supabase 호출은 기존 패턴(fetch + anon key 헤더) 유지
- 에러 핸들링 빠뜨리지 말 것

### 하지 말 것
- 프레임워크 도입 (React, Vue 등) 금지
- npm/번들러 도입 금지
- 기존 CSS 클래스명/ID 변경 금지 (다른 함수에서 참조 중)
- Make.com 시나리오 건드리지 말 것 (데이터 수집은 Cron으로 이관 완료)

---

## 📋 작업 완료 후 체크리스트

버그 수정 또는 기능 추가 완료 후 **반드시 아래 순서대로 실행**할 것.
건너뛰지 말 것. 이 프로젝트는 세이브포인트 기반으로 관리됨.

### 1. 배포 확인
- main 브랜치에 push 후 https://dauntown96.github.io/zipfit 에서 직접 동작 확인

### 2. 이 파일(CLAUDE.md) 업데이트 — Claude Code가 직접 수정
- 완료된 버그는 버그 목록에서 ✅ 표시 후 항목 설명에 `(완료 YYYY-MM-DD)` 추가
- 새로 발견된 버그가 있으면 목록에 추가
- 완료된 작업을 `✅ 완료된 작업 이력` 테이블에 한 줄 추가

### 3. Notion 세이브포인트 업데이트 — 다운님이 claude.ai 채팅에서 요청
- Claude Code는 Notion MCP가 없으므로 Notion 업데이트는 직접 하지 말 것
- 작업 완료 후 다운님께 "세이브포인트 업데이트해줘" 라고 안내할 것
- 다운님이 claude.ai 채팅에서 요청하면 claude.ai의 Claude가 아래 항목을 반영함:
  - 완료된 버그 ~~취소선~~ 처리
  - 작업 이력 테이블에 추가
  - 최종 업데이트 날짜 갱신
  - Notion URL: https://www.notion.so/3888aaa7e15581a792fbffd7f2d01125

---

## 🔗 주요 링크

| 항목 | URL |
|---|---|
| 배포 | https://dauntown96.github.io/zipfit |
| GitHub | https://github.com/dauntown96/zipfit |
| Supabase 대시보드 | https://supabase.com/dashboard/project/khdpjjyspmlqtzperoqg |
| Notion 프로젝트 | https://www.notion.so/3878aaa7e1558102ae9bf39dbb9a2efe |
| Notion 코드 스냅샷 | https://www.notion.so/3888aaa7e15581a792fbffd7f2d01125 |
