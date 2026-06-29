# ZipFit — Claude 작업 지침서

> **이 파일이 유일한 세이브포인트입니다.**
> Claude Code와 claude.ai 모두 이 파일을 기준으로 작업합니다.
> **마지막 업데이트**: 2026-06-29 (collect-rental-stats v9 — 공공임대 5종 수집 완료, 중복제거 로직 추가)

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
| 데이터 수집 | Edge Function `collect-announcements` v3 + pg_cron (매일 KST 09:00) |
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
