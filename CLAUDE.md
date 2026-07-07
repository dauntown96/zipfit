# ZipFit — Claude 작업 지침서

> **이 파일이 유일한 세이브포인트입니다.**
> Claude Code와 claude.ai 모두 이 파일을 기준으로 작업합니다.
> **마지막 업데이트**: 2026-07-07 (4차 배치 main 병합 완료 — GitHub Pages 실배포 반영)

## 🔜 다음 세션 작업 예정
- **🟡 announcement_extras 사진/PDF 오분류 재확인 필요**: `extra_type='photo'`로 분류됐지만 실제로는 다중 페이지 PDF인 파일들(예: 용인시 솔루나 — 실제 6페이지 PDF인데 사진 1건으로 분류돼 1페이지만 노출)이 464건 photo 중 일부 있는 것으로 추정. 다음 공고 원문 전수 재확인 단계에서 함께 재분류 필요(이번 배치엔 미포함, 다운님이 명시적으로 범위 제외 지정)
- **🟡 housing_type_family 백필 중 추론 반영분 확인 필요**: `10년임대`(7건)/`6년임대`(1건) — 다운님이 확정해주신 매핑표에는 명시되어 있지 않았으나, 임대의무기간 후 분양전환되는 공공임대 계열 표기로 판단해(5대 분류 중 다른 어디에도 해당 안 됨) `공공임대`로 함께 분류함. 실제로 공공임대가 맞는지 다운님 확인 후 다르면 재조정 필요
- **eligibility_criteria 신규 컬럼 실제 값 백필 필요**: `verification_requirements`(JSONB)/`eligibility_schema_type` 컬럼은 이번 세션엔 구조만 추가하고 기존 49행 전부 NULL 유지(지시대로 백필 안 함) — 전수 재확인(scoring_criteria 4단계) 완료 후 공공임대(분양전환형) 계열부터 실제 검증항목 값 채우는 작업 필요
- **🟡 [백로그] 다중블록 공고의 eligibility_criteria/announcement_policies 블록 분리 미구현 — 미래 교차오염 위험**: 이번 세션에 추가한 `get_announcement_group_ids()` 그룹조회는 `announcement_extras`/`eligibility_criteria`/`announcement_policies` 공통으로 "같은 제목(dedup_key)을 공유하는 모든 announcement_id"를 대표행 기준으로 합쳐서 보여줌(정정공고로 대표행이 바뀌어도 orphan 안 되게 하려는 목적). `announcement_extras`는 이미 블록 2개 이상이면 카드 전체 섹션 자체를 생략하고 블록별 섹션에서만 단건(`eq.`)으로 표시하는 보호 로직이 있어 김포마송류(다중블록) 공고에서도 안전하지만, `eligibility_criteria`/`announcement_policies`는 블록별로 분리해서 보여주는 UI 자체가 없어서 — 만약 앞으로 김포마송처럼 물리적으로 다른 블록(마송5/마송6 등)에 서로 다른 자격기준·정책 데이터가 각각 채워지는 경우가 생기면, 카드 최초 오픈 시 두 블록 데이터가 구분 없이 한 화면에 섞여 나올 수 있음. 실측 확인 결과 현재 김포마송 관련 6개 announcement_id 전부 eligibility_criteria/announcement_policies 데이터가 0건이라 지금 당장 화면에 영향은 없음(회귀 아님) — 다만 향후 이 두 테이블에 블록별 데이터를 백필할 계획이 생기면, extras처럼 블록 인식 UI를 먼저 만들거나 그룹조회에서 제외하는 등 사전 설계 필요
- **🟢 (해결됨) revised_at_source 안전장치 + 서울대방 수동 패치**: `announcements.revised_at_source`(TEXT, default `'auto'`) 컬럼 신설 — `'auto'`(트리거 자동기록) vs `'user_verified'`(다운님이 원문 확인 후 직접 입력) 구분. `set_revised_at()` 트리거 보강 도중 **실제 버그 발견 및 수정**: 최초 구현이 "상태 유지(계속 true/계속 false)" 분기에서 무조건 `NEW.revised_at/revised_at_source := OLD.값`으로 덮어써서, 다운님이 직접 넣으려는 `user_verified` 값 자체가 트리거에 의해 조용히 무시되는 문제를 실측으로 확인(서울대방 첫 UPDATE 시도 후 재조회했더니 값이 그대로 auto/기존시각으로 남아있어서 발견). `NEW.revised_at_source = 'user_verified'`로 명시적으로 들어오는 경우는 상태 전이 여부와 무관하게 그대로 반영하도록 분기 추가해 수정. 서울대방(id 18727) `revised_at='2026-07-03 00:00 KST'`/`revised_at_source='user_verified'` 반영 확인, 이후 다른 컬럼만 바뀌는 일반 UPDATE(자동 재수집 시뮬레이션)로 값이 그대로 보존되는지 재검증 완료. `get_announcements_deduped()` RETURNS TABLE·SELECT에 `revised_at_source` 반영(DROP 후 재생성), 카드 총량 462건 불변 확인. 코드 변경 없음(DB만, sw.js 버전 변경 없음)
- **🟢 (해결됨) 김포마송 사진/평면도 중복 표시 수정**: `announcement_extras`가 LH 대표행(id 2015122300020294/2015122300020259)에 마송6(B-3BL) 세트 전체(11건)가 잘못 붙어있어서, 카드 상세의 "카드 전체용 사진·평면도" 섹션(대표행 기준 11건)과 블록 아코디언 안 마송6 섹션(5건, floorplan 누락)이 동시에 표시되는 중복 버그 확인. 원문(Drive 파일명 B-3BL/B-5BL 라벨) 대조 결과 마송6(20690_3/20686_3)에 floorplan 6건이 통째로 누락돼있던 것도 함께 확인(마송5 20690_2/20686_2엔 정상적으로 6건 있었음) — 누락분 보강 삽입, LH 대표행에 붙어있던 중복 11건은 삭제(어차피 카드 레벨 대표행 announcement_id는 블록 중 하나(B-3BL)일 뿐이라 별도로 파일을 가질 이유가 없음). **프론트엔드**: 카드 전체용 "사진·평면도" 섹션 로드 순서를 `get_announcement_blocks()` 응답 이후로 미루도록 재구성 — 블록이 2개 이상이면 카드 전체 섹션 자체를 생략(블록별 섹션에서만 표시), 1개(대다수 일반 공고)면 기존과 동일하게 카드 전체 섹션 표시(회귀 없음). 마송5/마송6 각각 파일이 겹치지 않고 팜플렛도 블록별로 서로 다른 별도 파일(공통자료 없음)임을 원문 폴더 대조로 확인. sw.js v36→v37
- **🟢 (해결됨) 김포마송 2블록 표시 + 오탐 긴급수정**: `get_announcement_blocks(p_announcement_id)` RPC 신규 추가 — 같은 dedup_key(제목)를 공유하는 원본 행들을 블록 단위로 반환. **1차 배포 전 발견된 심각한 버그**: 최초 구현이 `COALESCE(precise_address, total_units::text, id::text)`로 그룹화해서, `precise_address`가 NULL인 공고에서 LH/MYHOME 소스별 `total_units` 집계 차이(예: 부천원종 LH=323 vs MYHOME=258, 고창무장 MYHOME 20 vs 10)를 "서로 다른 블록"으로 오인 — 전수 검증 결과 462건 중 **226개 그룹이 오탐**(배포됐다면 대규모로 잘못된 "여러 블록" 아코디언이 노출될 뻔함). 원인 확인 후 `precise_address`가 NOT NULL이고 서로 다른 값이 2개 이상 있을 때만 블록으로 분리하도록 수정(`total_units`는 더 이상 그룹 판정 신호로 사용 안 함) — 재검증 결과 오탐 226개→1개(김포마송만 남음, 마송5/B-5BL 277세대·마송6/B-3BL 199세대 정상 유지)로 정상화. 부천원종/고창무장/김제대검산 등 오탐 샘플 실측 확인 결과 전부 `precise_address=NULL`인데 소스별 total_units만 다른 동일 단지였음을 확인. **교훈(향후 유사 다중소스 비교 로직 설계 시 참고)**: 서로 다른 소스(LH/MYHOME)의 집계형 수치 필드(total_units 등)는 정의·집계 시점·범위가 소스마다 다를 수 있어 "동일성/차이" 판정 신호로 신뢰할 수 없음 — 반드시 주소처럼 명시적으로 채워진 식별 필드(그것도 NULL이 아닌 경우에만)만 판정 신호로 사용할 것. 2개 이상 블록이 있을 때만 상세 아코디언에 "🏘️ 이 공고에 포함된 블록" 섹션이 표시되고, 블록이 1개뿐인 일반 공고(461건)는 기존과 동일하게 동작(회귀 없음). 대표 카드(`get_announcements_deduped()`의 병합)는 그대로 유지 — dedup_key 로직 자체는 건드리지 않음
- **🟢 (해결됨) special_notes 백필**: 부천원종 지자체검증/인천계양A3·인천가정2A2 가산기준/하남풍산1단지 청약통장규칙은 `special_notes`(JSONB) 컬럼 신설 후 4건 백필 완료(아래 완료 이력 참고). 프론트엔드 노출은 미구현 상태(DB 반영까지만) — 노출 UI 설계는 다음 논의 필요
- **🟡 "정정 확인일" 표시 문구 — 실제 노출 지점 생기면 적용 필요**: 현재 `revised_at`을 화면에 직접 표시하는 곳이 없음(정렬 기준으로만 사용 중)을 확인 — 향후 UI에 정정 시각을 노출할 계획이 생기면 "정정일"이 아닌 "정정 확인일"(또는 툴팁 "ZipFit이 이 정정을 처음 확인한 시각이며 실제 게시일과 다를 수 있습니다")로 표기할 것
- **🔴 군포대야미 6년분양전환 청약통장 가입기간/납입횟수 원문 확인 필요**: 특별공급 8개 유형(사전청약당첨자/청년/기관추천/다자녀/신혼부부/생애최초/노부모부양/신생아우선공급) + 일반공급 3종 row는 `eligibility_criteria`에 만들어뒀지만, `subscription_months_required`/`subscription_payments_required` 값은 전부 NULL 상태 — Drive 원문 PDF가 너무 커서(1.5MB) 이번 세션 도구로는 해당 표가 있는 페이지까지 텍스트를 못 읽음(문서 앞부분 스니펫만 반환됨). 다운님이 해당 표(청약저축 가입기간·횟수, 공고문 4~5페이지 추정) 텍스트나 스크린샷을 직접 붙여넣어 주시면 바로 채울 수 있음
- **🔴 지오코딩 진단로그 실사용 확인 필요**: F12 콘솔에서 `[ZipFit geocode]` 로그를 여러 공고에서 직접 확인 — Lv1 실패→Lv2 성공 비율(정제 효과 입증), Lv1·Lv2 모두 실패→Lv3까지 가는 비율(높으면 정제 로직 추가 보완 필요). 확인 후 진단용 console.warn 제거 검토
- **프론트엔드에 나머지 신규 데이터 노출**: scoring_criteria(가점표), 완화모집/선착순 배지, eligibility_criteria의 `income_limit_exempt`/`asset_limit_exempt`("소득·자산 무관" 표시)(다운님과 UI 설계 논의 후 진행 — RPC 미반영 상태, DB 레벨만 완료)
- **1차+2차 배치 실사용 확인 필요**: 2차 배치 5건(경기남부 청년매입임대2차/기숙사형청년주택/여주역세권/양산물금2/충북음성 든든전세)을 다운님이 실제 사이트에서 열어 지도·세대정보·사진 썸네일이 정상 노출되는지 확인 필요(Playwright는 카카오 API 접근 불가로 검증 못함)
- **군포대야미 precise_address는 정밀주소 아님**: 공고문·팸플릿·토지이용계획도 모두 "경기도 군포시 대야미동·속달동·둔대동 일원 A-1블록" 수준의 지구 설명만 제공(사업지구 특성상 개별 지번/도로명 주소 자체가 아직 없는 것으로 추정) — 정밀 도로명 주소가 필요하면 다운님이 추가 자료 확인 필요
- **🔴 청년매입임대2차(228호) 공동거주형 건물 식별 불가**: 스프레드시트 비고란·공고문 3페이지 이후 전부 확인했으나 공동거주형 해당 건물을 특정할 수 있는 마커가 원문 어디에도 없음(공고문에는 공동거주형 관리비 분담 규칙 등 일반 정책 설명만 존재) — `unit_type`에 반영 못함, 임의 추정 안 함. 원문에 건물별 공동거주형 표시가 실제로 없는지, 아니면 다운님이 별도로 확인 가능한 자료가 있는지 필요

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
| 2026-07-07 | **4차 배치(인앱뷰어 버튼 스타일 통일·글자 중앙정렬, 세대정보 flex-wrap 개선) main 병합 완료**. 작업 브랜치(`claude/zipfit-inspection-fixes-o4f9fu`, 커밋 cc52616)를 `git log origin/main..origin/브랜치` / 역방향 diff로 확인한 결과 diverge 없는 순수 fast-forward 관계(main 쪽에 브랜치에 없는 새 커밋 0건) — `git merge --ff-only` 후 `git push origin main` 완료(ce85b29→cc52616). `git branch -a`로 잔여 미병합 브랜치 없음 확인. codeload.github.com tarball로 main에 실제 반영 재확인: `sw.js`=`zipfit-v41`, `.extras-modal-close`/`.extras-modal-nav` 스타일 통일(배경·테두리·그림자·flex center) 코드, `.hu-fields{display:flex;flex-wrap:wrap}`+`.hu-item{flex:0 0 auto}` 구조 전부 확인. 코드 변경 없음(병합·배포 확인 작업만) |
| 2026-07-07 | **4차 작업지시 반영 — 인앱뷰어 버튼 스타일 수정 + 세대정보 줄바꿈 가독성 개선**. **①닫기(X) 버튼 스타일 통일**: 지난 배치에서 화살표만 진한 배경(`rgba(0,0,0,0.45)`)+테두리로 고쳐지고 닫기 버튼은 옛 반투명 스타일(`rgba(255,255,255,0.15)`)로 남아있던 것을 확인 후 `.extras-modal-nav`와 동일한 배경·테두리·그림자로 통일. **②화살표/닫기 버튼 글자 중앙정렬**: 두 버튼 모두 `display:flex;align-items:center;justify-content:center` 누락으로 원형 버튼 안 글자(`‹`/`›`/`✕`)가 정중앙에 오지 않던 것을 수정. **③세대정보 줄바꿈 가독성**: 실사용 스크린샷에서 재현한 실제 버그 확인 — `.hu-item`에 `white-space:nowrap`만 추가했더니(1차 수정) 기존 `display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr))`의 균등 트랙 분배가 nowrap 콘텐츠의 실제 필요 폭을 못 따라가 옆 항목과 텍스트가 겹쳐 보이는 회귀를 Playwright 스크린샷(375px 폭)으로 직접 발견 — `.hu-fields`를 grid에서 `display:flex;flex-wrap:wrap`+각 `.hu-item{flex:0 0 auto}`로 재설계해 각 항목이 자기 내용 폭만큼만 차지하고 공간 부족 시 라벨+값 쌍 전체가 통째로 다음 줄로 넘어가도록 수정, 375px·320px 두 폭에서 재스크린샷으로 겹침 없음 확인. `renderExtraNoteHtml()`도 "공급형: 60~70㎡"/"방수: 3" 같은 단순 라벨:값 쌍을 뱃지+별도줄로 나누던 것을 뱃지 하나에 "라벨: 값"으로 합치도록 수정(보증금/월세처럼 값 자체가 복합 정보인 경우만 기존처럼 뱃지+별도줄 유지). **검증**: 실제 DB에서 가져온 3개 실사례(안단테 오피스�텔 "207호 (2층)", 한림에스타워 기숙사 "202동 622호 (6층)", 해링턴플레이스 아파트 "공급형: 80㎡이상; 방수: 3")로 렌더링 후 Playwright 스크린샷 확인 — 숫자+단위/동호수 값이 줄 중간에서 끊기지 않고, 라벨-값 쌍이 분리되지 않으며, 겹침 없이 정상 표시됨을 확인. sw.js v40→v41. git push 완료 |
| 2026-07-07 | **3차 배치(세대정보 승강기 정규화/맞춤추천 정렬/검색창 CSS버그/인앱뷰어 화질·UI) main 병합 완료**. 작업 브랜치(`claude/zipfit-inspection-fixes-o4f9fu`, 커밋 535faca)를 `git log origin/main..origin/브랜치` / 역방향 diff로 확인한 결과 diverge 없는 순수 fast-forward 관계(main 쪽에 브랜치에 없는 새 커밋 0건) — `git merge --ff-only` 후 `git push origin main` 완료(e5f6aeb→535faca). `git branch -a`로 잔여 미병합 브랜치 없음 확인. codeload.github.com tarball로 main에 실제 반영 재확인: `sw.js`=`zipfit-v40`, `has_elevator` 표시 코드, `matchSortSel`/`sortMatchRows`/`applyMatchSortAndRender`, `uc?export=view`+폴백, `#noticeSearchInput`/`#noticeSearchScopeSel` CSS 예외 규칙 전부 확인. 코드 변경 없음(병합·배포 확인 작업만) |
| 2026-07-07 | **3차 작업지시 반영 — 세대정보 정규화 + 맞춤추천 정렬 + 검색창 CSS버그 + 뷰어 화질/UI**. **①정렬 기준**: `first_seen_at` 유지 확정, 코드 변경 없음. **②세대별 정보 승강기 위치 통일**: `housing_units.has_elevator`(boolean) 신규 컬럼 추가 — `floor_info`(예: "4층(402호), 엘리베이터Y")/`extra_note`(예: "방3, 승강기유") 양쪽 다 정규식 `,\s*(엘리베이터|승강기)\s*[YyNn유무]\s*$`로 100% 일치함을 실측 확인(비정형 잔여 0건) 후 `has_elevator`로 추출·원본 필드에서 문구 제거(총 1,179건=floor_info 668+extra_note 511, 겹치는 행 0건). `renderHousingUnitRow()`에 승강기를 주택유형 옆 고정 위치로 표시(`.hu-fields` 그리드 내). **가독성 개선**: 세미콜론으로 이어붙은 특약 텍스트(예: "청년수급자:보증금1,000,000/월198,840; 청년일반:보증금2,000,000/월242,230")를 조건별로 분리해 조건명은 `.chip` 재사용 뱃지로, 금액은 "보증금 N원 · 월 N원" 형태의 별도 줄로 표시하는 `renderExtraNoteHtml()` 신규 작성 — 콜론 없는 순수 설명(예: "방3")은 뱃지만 표시. 검증: `housing_units` 총 1,738행 불변, `has_elevator` NULL 559/true 992/false 187, 두 필드 모두 엘리베이터 문구 잔존 0건. **③맞춤추천 탭 정렬**: 공고탭과 동일한 10종 옵션의 `matchSortSel` 드롭다운 신규 추가, `sortMatchRows(rows,sortVal)`가 RPC 원본 필드명(raw, noticeData의 한글 매핑과 별개) 기준으로 정렬 후 `applyMatchSortAndRender()`가 `renderMatchResults()` 호출 — `matchHouses()`가 결과를 받으면 바로 정렬 적용, "더보기"는 이미 정렬된 `lastFiltered` 재사용. Node 유닛테스트로 9개 정렬 옵션 전부 순서 검증. **④검색창 CSS버그**: 전역 `select,input[type=text]{width:100%}` 규칙과 검색창의 `flex:1` 레이아웃이 충돌해 입력창이 찌그러지던 버그를, 전역 규칙은 그대로 두고 `#noticeSearchInput`/`#noticeSearchScopeSel` 전용 규칙(`width:auto`+명시적 flex)으로만 예외 처리해 수정(ID 선택자가 항상 우선하므로 다른 곳 영향 없음). **⑤인앱뷰어 화질·UI**: 이미지 소스를 미리보기용 `thumbnail?sz=w1600`에서 원본 화질 `uc?export=view`로 변경, `onerror`로 1회만 기존 thumbnail URL로 자동 폴백. 화살표(prev/next 버튼)를 `.extras-modal-box`(캡션바 포함 전체) 자식에서 `.extras-modal-body`(이미지 영역) 자식으로 이동해 세로 중앙정렬이 실제 이미지 중앙과 일치하도록 구조 변경(콘텐츠 교체용 `#extrasModalContent`를 별도 하위 div로 분리해 nav 버튼이 렌더링마다 지워지지 않게 함), 화살표 배경을 `rgba(255,255,255,0.15)`→`rgba(0,0,0,0.45)`+테두리+그림자로 상향(밝은 사진 위 가시성 확보). jsdom으로 원본 URL 우선 로드/onerror 폴백/네비게이션 후에도 버튼 DOM 유지/화면 재구성 전부 검증. sw.js v39→v40. git push 완료 |
| 2026-07-07 | **2차 배치(정렬/building_name 파싱/동호수 표시/검색란/인앱뷰어/스키마) main 병합 완료**. 작업 브랜치(`claude/zipfit-inspection-fixes-o4f9fu`, 커밋 c60be63)를 `git log origin/main..origin/브랜치` / 역방향 diff로 확인한 결과 diverge 없는 순수 fast-forward 관계(main 쪽에 브랜치에 없는 새 커밋 0건) — `git merge --ff-only` 후 `git push origin main` 완료(d08ad58→c60be63). `git branch -a`로 잔여 미병합 브랜치 없음 확인. codeload.github.com tarball로 main에 실제 반영 재확인: `sw.js`=`zipfit-v39`, `first_seen_at` 정렬 키, `searchFilterNotices`/`applyNoticeFiltersAndRender`/검색창 UI, `extrasModalOverlay`/`openExtrasViewer`/`extrasViewerNav` 라이트박스, `floor_info`/`unit_type`/`extra_note` 표시 코드 전부 확인. 코드 변경 없음(병합·배포 확인 작업만) |
| 2026-07-07 | **2차 작업지시 반영 — 버그수정 4건 + 신규기능 2건 + 자격기준 스키마 구조설계**. **①date-desc 정렬 기준 변경**: `get_announcements_deduped()`에 그룹별 `min(created_at)`을 `first_seen_at`(이 공고를 우리 시스템이 최초로 수집한 시점)으로 추가(DROP 후 재생성, 카드 총량 464건 불변 확인). `date-desc` 정렬 키를 기존 `revised_at||announcement_date`에서 `first_seen_at||announcement_date||created_at`로 변경 — 실측: 대구광역시 행복주택(실제 공고일 2026-06-19, `revised_at`=오늘)이 `first_seen_at`=2026-06-23로 정렬돼 더 이상 오늘 진짜 신규 수집된 공고들보다 부당하게 위에 뜨지 않음을 확인. **②housing_units.building_name 파싱 전면 재작업**: 기존 "마지막 공백 이후 토큰만 자르기" 로직이 괄호 안 실제 단지명을 놓치거나(예: `50(권선동)`→도로명 숫자를 잘못 재사용), 동구분을 날려버려 서로 다른 동이 하나로 뭉개지는(예: `부영사랑으로2차`가 201/203/206동 전부 동일 이름) 문제를 실측 확인. `address` 원문을 balanced-paren 파서로 재분석하는 알고리즘 신규 작성 — 법정동/단지명/동구분/순수지번을 구분해 "단지명+동구분"은 보존하고 순수 유닛번호(호)·군더더기 괄호만 제거, 단지명이 없는 다가구/다세대는 법정동명(+지번)으로 대체. 973개 고유 주소 전수 검증(회귀 없는지 hangul 유실 여부까지 수작업 확인 후 규칙 2회 보정 — 202동 사례처럼 단지명이 통째로 날아가는 회귀를 발견해 dong-suffix 결합 로직 추가), 최종 572/973건 변경분 UPDATE 적용. **검증**: 전체 1,738행 불변, 괄호 불균형 0건, 순수숫자/동단독 잔존 0건, NULL 0건. `housing_units`는 자동 수집 스크립트가 없고 항상 수동 스프레드시트 백필이라 별도 Edge Function 수정은 불필요 — 파싱 규칙을 이 이력에 남겨 다음 백필 세션이 재사용하도록 함. **③renderHousingUnitRow 누락 필드 표시**: DB엔 있지만 화면에 안 그려지던 `floor_info`(동호수)/`unit_type`(주택유형)/`extra_note`(비고) 3개 필드 표시 추가(있을 때만, `escapeHtml` 이스케이프 적용). **④renderPersonalizedRecommendations 접수마감 판정**: 확인 결과 전날(1차 정기점검) 세션에서 이미 `처리상태정규화` 기준으로 수정 완료된 상태라 추가 변경 없음(재확인만). **⑤공고탭 검색 신규**: `searchFilterNotices(list,query,scope)` 순수함수 신규 작성(제목만/제목+지역/전체 3단계, 서버사이드 전환 대비 입출력 분리) + 검색창 UI 추가. 매 키 입력마다 RPC를 재호출하지 않도록 `loadNoticeData()`의 필터·정렬·렌더링 부분을 `applyNoticeFiltersAndRender()`로 분리해 검색/기존 필터 변경 시엔 이미 로드된 `noticeData`만 재처리하도록 리팩토링(네트워크 재호출 없음). Node 유닛테스트로 3단계 스코프 동작 확인. **⑥사진·평면도 인앱 뷰어(모달) 신규**: 클릭 시 Drive 외부 페이지로 나가던 것을 모달 라이트박스로 전환 — 이미지는 큰 썸네일(`sz=w1600`), PDF는 `drive.google.com/file/d/{id}/preview` iframe. 닫기·이전/다음(같은 그룹 내)·ESC 키·배경 클릭 닫기 지원, "Drive에서 보기" 링크는 보조 버튼으로 유지. 부수적으로 발견한 사실: `announcement_extras`가 이미 pamphlet(팸플릿, PDF) 9건을 갖고 있었는데 프론트엔드가 photo/floorplan만 필터링해 조용히 버리고 있어 화면에 전혀 안 뜨던 상태였음 — PDF 뷰어가 실제로 쓰일 데이터가 있어야 해서 팸플릿 그룹도 함께 렌더링하도록 반영(신규 RPC/쿼리 추가 없이 이미 fetch되던 데이터 활용). jsdom으로 모달 열기/이미지·PDF 분기/이전-다음-순환/ESC 닫기 전부 프로그래매틱 검증. **⑦housing_type_family + eligibility_criteria 스키마 확장(구조만, 데이터 백필 없음)**: `announcements.housing_type_family`(text+CHECK, 5대분류+비주거시설) 신규 컬럼 후 지시받은 매핑표대로 전량 백필(1,298건 전부 NULL 0건) — 단 `10년임대`(7)/`6년임대`(1)는 매핑표에 없어 임대의무기간 후 분양전환되는 공공임대 계열로 추론해 공공임대로 분류(다음 세션 확인 필요로 등록). `eligibility_criteria.verification_requirements`(JSONB)/`eligibility_schema_type`(text+CHECK) 신규 컬럼 추가는 지시대로 구조만, 기존 49행 전부 NULL 유지(백필 안 함) 확인. RPC/프론트엔드는 이번 단계에서 의도적으로 미반영. sw.js v38→v39. git push 완료 |
| 2026-07-07 | **1차 정기점검 수정 4건 main 병합 완료**. 전날 작업 브랜치(`claude/zipfit-inspection-fixes-o4f9fu`, 커밋 678ef3a)가 main에 병합되지 않아 GitHub Pages(main 기준 배포)에 전혀 반영되지 않은 상태였던 것을 확인(codeload.github.com tarball로 main의 sw.js가 여전히 v37임을 직접 대조). `git log origin/main..origin/브랜치` / 역방향 diff로 diverge 없는 순수 fast-forward 관계임을 확인 후(main 쪽에 브랜치에 없는 새 커밋 0건) `git merge --ff-only`로 병합, `git push origin main` 완료(eab15c1→678ef3a). 병합 후 codeload tarball을 다시 받아 main의 `sw.js` CACHE_NAME이 실제로 `zipfit-v38`인지, `index.html`에 `get_announcement_group_ids`/`resolveAnnouncementIds`/`처리상태정규화` 기준 통일 코드가 실제로 들어갔는지 raw.githubusercontent.com 캐시를 우회해 직접 재확인 완료. `git branch -a`로 잔여 미병합 브랜치 없음 확인(작업 브랜치는 이미 main에 fast-forward 포함되어 안전). 코드 변경 없음(병합·배포 확인 작업만) |
| 2026-07-06 | **1차 정기점검 발견사항 4건 반영**. **①정정공고 orphan 구조적 결함 수정**: 정정공고로 `get_announcements_deduped()`의 대표행(winner)이 바뀌면 옛 announcement_id에 붙어있던 `announcement_extras`/`eligibility_criteria`/`announcement_policies` 데이터가 화면에서 사라지는 문제(실측: 서울대방 신혼희망타운, 대표행이 20652→20694로 바뀌면서 extras 3건/eligibility 1건/policies 6건이 원본 id 20652_1_서울특별시_영등포구에 그대로 붙은 채 orphan). 신규 RPC `get_announcement_group_ids(p_announcement_id)` 추가 — `get_announcements_deduped()`/`get_announcement_blocks()`와 동일한 dedup_key 정규화(작은따옴표류 제거+공백 제거+연속마침표 정규화+정정공고 접두어 제거)로 같은 제목을 공유하는 모든 announcement_id를 반환. `index.html`의 `loadAnnouncementExtras()`/`loadAnnouncementPolicies()`/`loadPreciseEligibility()`에 `useGroup` 파라미터 추가(공통 헬퍼 `resolveAnnouncementIds()`/`idFilterFor()` 신규) — `toggleDetail()`(카드 최초 오픈, 대표행 기준 호출)에서는 `useGroup=true`로 그룹 전체를 `in.()` 조회, 김포마송처럼 블록별로 분리 표시하는 `toggleBlockGroup()` 경로는 `useGroup`을 넘기지 않아 기존처럼 해당 블록 단건(`eq.`)만 조회하도록 그대로 유지(블록 분리 기능 보존). **검증**: 서울대방 그룹조회 결과 extras 3/eligibility 1/policies 6 정확히 일치 확인, 김포마송(`get_announcement_blocks`)은 블록별 분리가 그대로 유지됨(블록 섹션이 있으면 카드 전체 extras 자체를 생략하는 기존 보호 로직 재확인, 김포마송 6개 announcement_id 전부 eligibility/policies 데이터 0건이라 그룹조회로 인한 교차오염 현재는 없음 확인 — 다만 향후 위험 소지가 있어 위 "다음 세션 작업 예정"에 별도 기록), 전체 462건 대비 그룹크기(dedup_key 공유 announcement_id 개수)가 1인 일반 공고는 `idFilterFor()`가 자동으로 기존과 동일한 `eq.` 조회로 폴백해 회귀 없음, DB 전체 orphan 재계산 결과 extras/eligibility/policies 3개 테이블 전부 0건(과거 세션에 이미 정리된 29건의 legacy orphan과도 무관하게 현재 0건) 확인. **②자격진단 결과 화면 사실오류 문구 수정**: `diagnose()`의 가점 결과 안내문이 2026-07-02에 이미 "전국 동일 5항목"으로 정정된 사실과 반대로 "경남/광주전남=6항목, 부산울산=4항목"이라는 틀린 숫자를 여전히 노출하고 있던 것을 확인, 지역차이를 숫자로 단정하지 않는 일반화된 문구("지역본부마다 가점 평가항목 구성이 다를 수 있어요. 청약저축 납입횟수·거주기간·장애인 항목 등을 공고문에서 확인하세요.")로 교체. **③접수마감 판정 로직 통일**: `renderPersonalizedRecommendations()`만 나머지 화면(`renderNoticeList()`/`renderMatchResults()`)과 다르게 raw `n['처리상태']` 필드로 마감 여부를 판정하고 있던 것을(실측 결과 `announcements.status` distinct 값은 접수마감/공고중/정정공고중/접수중 4종뿐, `'마감'`이라는 값 자체가 DB에 없어 dead code였음) 나머지 화면과 동일하게 `n['처리상태정규화']==='접수마감'` 기준으로 통일, 존재하지 않는 `'마감'` 문자열 비교 제거. **④scoring_criteria 중복 데이터 정리**: 완전히 동일한 22개 항목이 `region='광주전남'`/`region='전국'`으로 중복 저장돼있던 것(2026-07-02 지역차이 정정 작업 때 옛 지역별 행을 안 지운 잔재, 코드에서 조회하는 곳이 없어 화면 영향은 없는 죽은 데이터였음) 확인 후 `region='광주전남'` 22행 삭제, `region='전국'` 22행만 남음(`count(*)`=22 확인). **검증 요약**: get_announcements_deduped() 카드 총량 462건 불변, orphan 3개 테이블 전부 0건, scoring_criteria 22건. sw.js v37→v38(index.html 변경 반영). git push 완료 |
| 2026-07-06 | revised_at_source 안전장치 추가 + 서울대방(정정 실제 게시일 2026-07-03) 수동 반영 + 트리거 버그 발견/수정. **배경**: LH/MYHOME API에 실제 정정·게시일 필드가 없어(재확인됨), 뒤늦게 발견한 정정은 게시일을 알 수 없는 구조적 한계 — 다운님이 원문으로 직접 확인한 실제 날짜를 수동 입력하는 방식으로 보완하기로 함. **작업1**: `announcements.revised_at_source`(TEXT, default `'auto'`) 컬럼 신설, `get_announcements_deduped()` RETURNS TABLE·SELECT 반영(DROP 후 재생성). **작업2 트리거 보강 중 버그 실측 발견**: `set_revised_at()`의 "상태 유지"(계속 true/계속 false) 분기가 무조건 `NEW.revised_at/revised_at_source := OLD.값`으로 되돌려써서, 서울대방에 대한 첫 번째 `UPDATE ... revised_at_source='user_verified'` 시도가 트리거에 의해 조용히 무시되고 원래 auto 값 그대로 남는 것을 재조회로 확인 — `NEW.revised_at_source = 'user_verified'`로 명시 지정된 경우엔 상태 전이 여부와 무관하게 그대로 반영하도록 분기 추가해 재수정, 재적용 후 정상 반영 확인. **작업3**: 서울대방(id 18727) `revised_at='2026-07-03 00:00 KST'`(`2026-07-02 15:00 UTC`)/`revised_at_source='user_verified'` 반영 전 SELECT로 1건만 걸리는지 확인 후 진행. **검증**: 반영값 재조회 확인, 이후 `revised_at`/`revised_at_source`를 건드리지 않는 일반 UPDATE(자동 재수집 시뮬레이션)를 실행해도 값이 그대로 보존되는지 확인(트리거 방어 정상 작동), RPC(`get_announcements_deduped()`)에서 정상 반환 확인, 카드 총량 462건 불변 확인. **작업4 문서화**: CLAUDE.md 코딩 원칙에 "앞으로 revised_at/revised_at_source를 건드리는 모든 자동 정리·백필 스크립트는 `WHERE revised_at_source != 'user_verified'` 보호 조건 필수" 규칙과 "정정/신규 공고를 실제보다 늦게 발견한 것으로 의심되면 추측 대신 다운님께 보고 후 확인 요청" 루틴을 명시(코딩 원칙 10·11번). 코드 변경 없음(DB만, sw.js 버전 변경 없음) |
| 2026-07-06 | 김포마송 사진/평면도 중복·배치 오류 수정. **원인**: `announcement_extras`가 LH 대표행(id 2015122300020294/2015122300020259, 실제로는 마송6/B-3BL 소속)에 마송6 세트 전체(photo4+floorplan6+pamphlet1=11건)가 붙어있어서, 카드 상세의 "카드 전체용 사진·평면도" 섹션(대표행 기준 11건)과 블록 아코디언 안 마송6 블록 섹션(당시 5건, floorplan 0건)이 동시에 표시되는 중복이 실제 화면에서 확인됨. **원문 재대조**: Drive 폴더의 파일명 라벨(B-3BL/B-5BL, 마송5/마송6, 유닛타입 21A/21B/36A/36B/46A/46B=마송6 vs 16A/36A/36B/44A=마송5)로 각 파일의 소속 재확인 — 마송6(20690_3/20686_3)에 floorplan 6건이 통째로 누락되어 있었음(마송5 20690_2/20686_2엔 이미 6건 정상 존재)을 확인, 두 블록의 팜플렛은 서로 다른 개별 파일(김포마송5(B-5)팸플릿.pdf/김포마송6(B-3)팸플릿.pdf)로 공통자료가 아님을 확인. **수정**: 마송6(20690_3/20686_3)에 누락된 floorplan 6건 보강 삽입, LH 대표행(2015122300020294/2015122300020259)에 붙어있던 중복 11건은 삭제(카드 대표행은 블록 중 하나일 뿐이라 별도로 파일을 가질 이유가 없음 — DB 모델링 오류로 판단). **프론트엔드**: 카드 전체용 "사진·평면도" 섹션(`loadAnnouncementExtras`) 호출을 `get_announcement_blocks()` 응답 확인 이후로 순서 재구성 — 블록이 2개 이상이면 카드 전체 섹션을 생략(블록별 섹션에서만 노출), 1개(대다수 일반 공고, RPC 실패시 폴백 포함)면 기존과 동일하게 카드 전체 섹션 표시(회귀 없음). sw.js v36→v37, Node `new Function()` 파싱으로 문법 오류 없음 확인. **검증(데이터 레벨)**: 마송5(20690_2) photo3+floorplan6+pamphlet1=10건, 마송6(20690_3) photo4+floorplan6+pamphlet1=11건으로 완전해짐, LH 대표행 extras 0건(더 이상 카드 레벨에 중복 데이터 없음), `get_announcement_blocks()` 재호출 결과 블록 매핑(대표 announcement_id) 불변 확인. 다운님이 실제 사이트에서 마송5/마송6 각각 열어 사진·평면도 섹션이 하나만(블록별로만) 뜨는지, 일반 공고는 기존처럼 카드 전체 섹션이 정상 뜨는지 최종 확인 필요 |
| 2026-07-06 | **get_announcement_blocks 오탐 긴급 수정(배포 전 발견)**. 배포 전 재검증 과정에서 최초 구현(위 항목 참고)의 `DISTINCT ON (COALESCE(precise_address, total_units::text, id::text))` 그룹화 로직이 `precise_address`가 NULL인 공고에서 `total_units`를 블록 판정 신호로 잘못 사용하고 있음을 발견. **전수 검증**(462건 전체 dedup_key 그룹 대상): 수정 전 로직으로는 226개 그룹이 "2블록 이상"으로 오탐(부천원종 LH total_units=323 vs MYHOME=258, 고창무장 MYHOME 20 vs 10, 김제대검산 등 — 전부 실측 확인 결과 `precise_address=NULL`이고 소스별 집계 차이만 있는 동일 단지였음, 광주전남 38개/대구광역시 24개/서울청년매입임대 23개 그룹 등도 같은 원인으로 오탐 대상). **수정**: `precise_address`가 NOT NULL이고 서로 다른 값이 2개 이상 존재할 때만 블록으로 분리하도록 로직 변경(`total_units` 차이는 판정 신호에서 완전히 제외) — `group_rows`/`distinct_addr_count`/`multi_blocks`/`single_repr` CTE로 재작성. **재검증**: 오탐 226개→1개(김포마송만 남음, 마송5/B-5BL 277세대·마송6/B-3BL 199세대 정상 유지), 부천원종은 수정 후 1건만 반환되어 오탐 해소 확인. **교훈(CLAUDE.md에 남겨 향후 참고)**: LH/MYHOME처럼 서로 다른 소스의 집계형 수치 필드(세대수·면적 합계 등)는 정의·집계 범위·시점이 소스마다 달라 "동일/차이" 판정 신호로 신뢰할 수 없음 — 반드시 주소처럼 명시적으로 채워진 식별 필드(NULL이 아닌 값끼리만) 기준으로 판정할 것. RPC/DB만 수정, index.html·sw.js 코드 변경 없음(버전 갱신 불필요) |
| 2026-07-06 | 김포마송 2블록 아코디언 분리 표시 — `get_announcement_blocks(p_announcement_id text)` RPC 신규 추가(SECURITY DEFINER, anon/authenticated GRANT). 로직: `get_announcements_deduped()`와 동일한 dedup_key 정규화(정정공고 접두어 제거+따옴표류 제거+공백 제거+연속마침표 정규화)로 같은 제목을 공유하는 원본 행을 찾은 뒤, `precise_address`(없으면 `total_units`) 기준 DISTINCT ON으로 블록을 그룹화해 반환 — 그룹이 2개 이상일 때만 프론트엔드가 블록 섹션을 표시하도록 설계해 임의의 공고 제목·ID를 하드코딩하지 않음. 실측 검증: 김포마송(`2015122300020294`로 조회) → 2블록(마송5/B-5BL 277세대 율마로438번길51, 마송6/B-3BL 199세대 율마로450번길51) 정상 반환, 일반 단일블록 공고(부천원종/인천계양A3 등)는 1건만 반환되어 섹션 미표시 확인. **프론트엔드**: `toggleDetail()`의 고정 슬롯에 `blocks-slot-${id}`를 elig-slot과 hu-slot 사이에 추가, `loadAnnouncementBlocks()`가 RPC 호출 후 결과 2건 이상일 때만 "🏘️ 이 공고에 포함된 블록" 아코디언(기존 `.hu-group`/`.hu-group-head`/`.hu-group-body` 클래스·펼치기 인터랙션 패턴 그대로 재사용) 렌더링, 블록 클릭 시 `toggleBlockGroup()`이 해당 블록 고유 announcement_id로 기존 `loadHousingUnits()`/`loadAnnouncementExtras()`를 서브 슬롯 ID(`id+'-blk'+idx`)에 재호출해 그 블록만의 세대정보·사진/평면도를 lazy-load(지도는 서브 슬롯에 map 엘리먼트가 없어 자동 no-op, 카드 전체 지도는 기존 로직 그대로 유지되어 회귀 없음). sw.js v35→v36. Node `new Function()` 파싱으로 3개 인라인 스크립트 문법 오류 없음 확인. 다운님이 실제 사이트에서 김포마송 카드를 열어 블록 섹션·사진 매칭 최종 확인 필요(Playwright는 카카오 API 접근 불가로 검증 못함, 이번엔 지도 관련 없는 순수 DOM/fetch 로직이라 위험은 낮음) |
| 2026-07-06 | 김포마송 블록 분리 반영 + special_notes JSONB 컬럼 신설. **작업1 블록매핑**: LH 행(id 10398/10400)의 `area_min/area_max`(21.88~46.79㎡)가 원문 "주택단지개요"표의 마송6단지 유닛타입(21A/21B/36A/36B/46A/46B) 구성과 정확히 일치 → LH 2건=마송6=B-3BL(율마로450번길51) 확정. MYHOME 4건 중 199세대(id 18729/18734)=마송6/B-3BL, 277세대(id 18728/18733)=마송5/B-5BL(율마로438번길51) — 원문의 "예비자(283)"(마송5)/"(193)"(마송6) 표기와 방향 일치(정정 이후 수치 변동 가능성 인지). `precise_address` 블록별 백필 완료, Drive 파일명(B-3BL/B-5BL, 마송5/마송6 라벨) 기준으로 `announcement_extras` 블록별 분리 적재(B-3BL 계열 11건×4 announcement_id, B-5BL 계열 10건/6건×2 announcement_id). **중대 발견**: `get_announcements_deduped()`의 dedup_key가 제목 텍스트만으로 그룹핑하는데 두 블록의 공고 제목이 완전히 동일(본문에만 블록 구분 존재)해서 6개 raw row 전부가 대표행 1개(현재 id=10398, B-3BL)로 병합됨 — B-5BL(마송5)의 정확한 precise_address·extras가 DB엔 있지만 RPC/화면에는 노출 안 되는 구조적 한계 확인. dedup_key 로직 수정(예: 본문 블록마커 반영)은 전체 452건 병합에 영향을 줄 수 있어 이번엔 미시행, 다운님 확인 후 별도 작업 필요(백로그 등록). **작업2 special_notes**: `announcements.special_notes`(JSONB) 신규 컬럼 추가, `get_announcements_deduped()` RETURNS TABLE·SELECT 동반 수정(DROP 후 재생성). 부천원종(id 10399, 지자체검증)/인천계양A3(id 18731, 가산기준)/인천가정2A2(id 18732, 가산기준+판단기준일)/하남풍산1단지(id 16458, 청약통장규칙+접수일엄수) 4건 백필. **검증**: `jsonb_typeof`로 4건 전부 object 타입 확인, RPC 응답에서 4건 전부 special_notes 정상 반환 확인(김포마송 그룹은 special_notes 미부여라 null 정상), 김포마송 raw row별 precise_address 서로 다르게(B-3BL/B-5BL 분리) 채워짐 확인, 전체 카드 수 462건(기존 3차 배치 반영분 회귀 없음). 프론트엔드(index.html) 노출은 범위 밖 — DB 반영까지만, 코드 변경 없음(sw.js 버전 변경 없음) |
| 2026-07-06 | 3차 배치 5건 반영 — 인천계양A3(id 18731)/부천원종(id 10399)/인천가정2A2(id 18732)/김포마송B-3+B-5(id 10398 등 6건)/하남풍산1단지(id 16458). **작업1**: data_categories 2종 신규('일자리연계형 지원주택' first_found_in=부천원종, '국민임대주택' first_found_in=하남풍산1단지) 등록. **작업2**: 5개 Drive 폴더 전수 확인 결과 전부 개별 세대 주소 스프레드시트 없음(서울대방/광명1R·4R 전례와 동일) → 5건 전부 housing_units 미생성, precise_address만 백필(부천원종='경기도 부천시 오정구 원일로 28(원종동)', 하남풍산1단지='경기도 하남시 덕풍북로 70(덕풍동, 휴먼시아 꽃뫼마을1단지)', 인천가정2A2='인천광역시 서해구 행복2로 30(가정동)' — "서해구"는 공고문 원문 자체의 오탈자를 그대로 확인 후 반영, ZipFit 오류 아님, 인천계양A3는 개별 지번이 없는 지구단위 설명이라 군포대야미 전례대로 원문 그대로 저장). **작업3**: 김포마송 관련 기존 DB 행 6개(LH 10398/10400, MYHOME 18728/18729/18733/18734) 전부에 `is_relaxed_recruitment=true`/`selection_method='선계약후검증'`/`contract_before_verification=true`/`relaxation_detail`(소득·자산(자동차 4,542만원 이하)배제, 청약통장 가입 요건, 계약금 50만원, 2블록 통합공고임을 명시하는 원문 텍스트) 백필 — 계약금 전용 컬럼은 신설하지 않고 텍스트에 포함(판단대로 보류). **작업4**: 일자리연계형·청약통장·가산 기준 등 자유텍스트가 필요한 세부 eligibility_criteria는 스키마에 해당 컬럼이 없어 이번 세션엔 미반영(백로그 등록, 아래 참고). **작업5**: announcement_extras 25건 신규 적재(부천원종 11=photo4+floorplan6+pamphlet1, 인천계양A3 7=photo4+floorplan2+pamphlet1, 인천가정2A2 4=photo3+pamphlet1, 하남풍산1단지 3=photo3) — 전부 `pageSize=100+excludeContentSnippets=true`로 폴더 전량 조회 확인, 낱장 이미지 있어 팸플릿 페이지분할 불필요. 김포마송은 파일 자체는 B-3BL/B-5BL로 명확히 라벨링되어 있으나 어느 announcement_id(277세대 vs 199세대)가 어느 블록인지 확정 못해 extras 삽입 보류. **작업6 검증**: `get_announcements_deduped()`에서 4건(부천원종/하남풍산1단지/인천계양A3/인천가정2A2) 전부 id 매칭 확인, precise_address NOT NULL 확인, extras_count 실측치(11/3/7/4)가 삽입 건수와 정확히 일치 확인, 김포마송은 대표행(id 10398)에서 relaxation 필드 정상 반영 확인. 코드 변경 없음(DB만, sw.js 버전 변경 없음). **다운님 확인 필요 2건**(위 다음 세션 작업 예정 참고): (1)김포마송 블록별 세대수(277/199) 매칭, (2)부천원종 지자체검증 상태 및 세부 자격기준 텍스트를 위한 스키마 확장(신규 컬럼) 여부 |
| 2026-07-06 | 정정공고 처리 개선 3종(원본숨김 강화/배지 통일/표시문구 정직화) — collect-announcements v14→v15, sw.js v34→v35. **작업1 beforePblancId**: `net.http_get`으로 MYHOME API 원본 재조회해 실측한 결과, `beforePblancId`는 `sttusNm='정정공고'`인 모든 항목에서 100% 신뢰성 있게 채워짐을 확인(서울대방 20694→20652, 김포시 20690→20686, 파주시 20708→20700, 대구경북 든든전세 2건, 대구광역시 20709→20649→20576 2단계 체인, 군포송정, 연천전곡1단지 등 9개 사례 전부 확인). 다만 **이 필드가 실질적으로는 현재 중복 방지에 거의 기여하지 않음**도 함께 확인 — 대조 결과 이 체인들 전부 원본↔정정본 제목이 완전히 동일해서(정정 시 제목 자체가 안 바뀜) 기존 제목기반 dedup_key만으로 이미 100% 정확히 병합되고 있었음(9개 사례 전부 `get_announcements_deduped()`에서 count=1 확인). 과도한 엔지니어링을 피하기 위해 복잡한 재귀적 병합 로직 대신, `before_pblanc_id` 컬럼 신규 추가(Edge Function이 값 수집·저장, 실측 55건 채워짐 확인)와 RPC winner 선정에 "before_pblanc_id로 명시 지목된 pblancId는 대표행 후보에서 최우선 배제"하는 가벼운 보조 안전장치 1단계만 추가(현재 데이터엔 영향 없음, 향후 제목 자체가 바뀌는 정정 사례에 대비한 방어선). 전체 카드 수(452→454, 정상적인 신규 수집분 증가로 확인) 및 housing_units 매칭(unmatched 0건) 회귀 없음 확인. **작업2 배지 통일**: index.html 1026번째 줄(공고 탭 `renderNoticeList`)의 `isAmended`가 제목 접두어만 확인하던 것을 2281번째 줄(추천 탭 `renderMatchResults`)과 동일하게 `제목 접두어 OR is_revised`로 통일 — 서울대방(MYHOME 소스라 제목 접두어가 원래 안 붙는 케이스)이 공고 탭에서도 배지 노출되도록 수정. **작업3 표시문구+대구경북 재점검**: `revised_at`을 실제로 화면에 표시하는 곳이 현재 없음을 확인(정렬 기준으로만 쓰임) — 문구 변경 대상 자체가 없어 다음 세션 노출 시 적용하도록 백로그 등록. 대구경북 4건(id 16782~16785) 재점검: `apply_start`/`announcement_date`만으로는 신뢰 불가함을 대구광역시 사례(오래된 announcement_date=06-19인데도 진짜 신선한 정정)로 반증 확인 후, 대신 **LH PAN_ID 자체의 숫자 크기 비교**로 검증 — 진짜 신선한 건들(PAN_ID 020277~020316)과 달리 대구경북 4건은 020234~020238로 훨씬 낮은 번호이며 동시대(020230~020249)의 다른 확정적으로 오래된 공고들과 같은 구간에 위치함을 확인, "우리가 뒤늦게 발견한 오래된 정정"으로 결론 내리고 `revised_at`을 NULL로 리셋(옵션 a: apply_start 블렌딩은 반증된 신호라 채택 안 함, 옵션 b 채택). 최종 `revised_at IS NOT NULL` 24건→20건. **요구사항별 결과**: (1)원본숨김 — 완전해결은 아니나 실측 결과 현재 갭이 없어 사실상 해결, 보조 안전장치만 추가(부분해결, 재발 시 대비됨) (2)정정 확인일 표시 정직화 — 표시 지점 자체가 없어 적용 대상 없음(한계있음, 백로그 등록) (3)배지 통일 — 완전해결(양쪽 화면 동일 로직, 서울대방 확인). 코드 변경 있음(collect-announcements v15, index.html, sw.js v35) |
| 2026-07-06 | revised_at 근본 재설계(트리거 기반) + is_revised 반전버그 수정 — collect-announcements v13→v14. **원인 재확인**: 이전 세션의 `revised_at` 백필이 `updated_at`(재수집 때마다 갱신)을 그대로 복사한 것이었어서, 실제로는 "언제 이 행이 마지막으로 재수집됐는지"만 반영하고 "언제 진짜 정정됐는지"는 전혀 반영 못 하고 있었음(에지 함수 코드 자체에는 `revised_at`을 건드리는 로직이 아예 없었음 — 코드 재확인으로 확정). 동해유성(공고일 2026-02-02)/울산(2025-09-15) 등 수개월 전 공고가 매번 재수집될 때마다 "방금 정정됨"으로 보이는 문제 실측 확인. **트리거 설계**: `set_revised_at()` BEFORE INSERT/UPDATE 트리거 신규 생성 — `is_revised` false→true 전이 시에만 `now()` 기록, true→false 전이 시 NULL로 리셋, 상태 유지(계속 true/계속 false) 시 기존값 그대로 유지. INSERT 경로·일반 UPDATE 경로·`ON CONFLICT DO UPDATE`(실제 upsert가 쓰는 경로) 3가지 전부 개별 테스트로 검증 완료. **기존 오염 데이터 정리**: `is_revised=true` 129건 중 `created_at`이 24시간 이내인 15건(서울대방/김포시/파주시/군포송정/대구광역시 등 이번 세션에 실제로 새로 관측된 건)은 유지, 나머지 114건(생성된 지 오래됐는데 `revised_at`만 최근이던 행)은 NULL로 리셋 — "모르면 NULL이 안전하다" 원칙 적용, 실측 근거(`created_at`/`announcement_date` 나이) 확인 후 처리. **is_revised 반전버그 발견 및 수정**: 파주시 사례 실측 대조 결과 LH는 정정 전 원본 PAN_ID가 `status='정정공고중'`으로 계속 남고, 정정 후 새로 발급되는 PAN_ID(실제 정정본)는 `status='공고중'`으로 정상 복귀하며 제목에만 `[정정공고]` 접두어가 붙는 반전 패턴을 확인(MYHOME은 반대로 status 필드가 정확함). 전체 테이블에서 `title LIKE '[정정공고]%' AND is_revised=false` 143건 확인(광범위한 시스템적 문제로 확인, 파주시 1건이 아니었음) — 24시간 이내 생성 6건은 트리거 정상 발동(fresh revised_at), 나머지 137건은 트리거 일시 비활성화(`DISABLE/ENABLE TRIGGER`) 후 `is_revised`만 true로 보정(대량 재오염 방지, 검증 결과 0/138건 오염 확인). Edge Function `mapLHRow`/`mapMyHomeRow`에 `is_revised` 계산을 `status 텍스트 OR 제목 접두어`로 결합해 향후 재발 방지. RPC의 `status_normalized`/winner 선정 로직도 `w.is_revised`(보정된 컬럼) 기준으로 단순화해 "정정공고" 필터가 실제 정정본을 놓치지 않도록 수정(변경 전후 정정공고 필터 카운트 128건). **검증**: 파주시/김포시/대구광역시 사례 전부 정정공고 필터 정상 포함 + 대표행이 실제 정정본(더 새로운 PAN_ID) 정확히 가리킴 확인, 동해유성/울산은 `revised_at=null`로 최신순 최상단에 더 이상 부당하게 안 뜸 확인, 서울대방은 `revised_at` 유지되어 정상 노출 확인. v14 실배포 후 `net.http_post` 실사용 트리거(request_id 35) → HTTP 200, `errors=[]`, 약 900건 upsert 중 트리거가 실제로 `revised_at`을 새로 찍은 건 **3건**(연천전곡1단지 — 트리거 배포 직후 실제로 막 발생한 정정을 현장에서 포착, 우연한 실증 사례)뿐으로 mass-bump 재발 없음 확인. 코드 변경 있음(collect-announcements Edge Function v14) |
| 2026-07-06 | 정정공고 3건 점검 후속조치 — revision_note/revised_at 신설 + 최신순 정렬 버그 수정. **스키마**: `announcements`에 `revision_note`(text)/`revised_at`(timestamptz) 2개 컬럼 추가, `get_announcements_deduped()` RETURNS TABLE·SELECT 절 양쪽 반영(DROP 후 재생성). 서울대방 정정공고(id 18727) 1건에 정정사유 텍스트 백필(단일 행 확인 후 UPDATE, SELECT로 조건 사전검증 완료). `revised_at`은 `is_revised=true`인 129건에 한해 `updated_at` 값으로 초기 백필. **정렬 버그**: 기존 `date-desc` 정렬이 `announcement_date`(정정 후에도 불변) 기준이라 정정 반영이 화면에 안 보이던 문제 — `updated_at` 기준으로 단순 전환하면 매 cron 실행마다 변경 없는 공고까지 전부 `updated_at`이 갱신되는 실측 확인(최근 3시간 내 903건이 동일 1~2분 구간에 몰려있음, 정상적인 최신순을 무의미하게 만들 위험)되어 지시대로 채택하지 않고, `revised_at`(정정 감지 시에만 값이 채워지고 일반 재수집으로는 안 바뀌는 전용 컬럼) 방식으로 전환. `revised_at||announcement_date||created_at` 순 fallback으로 `loadNoticeData()` 정렬 로직 수정, RPC 응답에서 `revised_at`/`revision_note` 필드가 프론트 매핑 객체에 누락되어 있던 것도 함께 추가(안 그러면 정렬 자체가 항상 undefined로 동작할 뻔함). **검증**: SQL 프리뷰 + 실제 RPC 응답을 로컬 Node로 옮겨 index.html과 동일한 정렬 함수로 재현 — 서울대방이 최신순 1위로 정상 노출, 정정으로 실제 플래그된 129건 중 일부(동해유성·울산광역시)만 상단에 오르고 나머지 1100여 건은 기존처럼 announcement_date 기준으로 정상 정렬됨을 확인(mass-bump 부작용 없음 실측 확인). sw.js CACHE_NAME v33→v34. 발견된 별개 이슈(is_revised가 제목의 [정정공고] 접두어와 불일치하는 사례) 백로그 등록, 이번 작업 범위 밖으로 보류 |
| 2026-07-06 | get_announcements_deduped() 대표행 dedup_key 정규화 강화 — LH/MYHOME이 같은 공고를 작은따옴표 유무 등 사소한 표기 차이로 다르게 내려줄 때(예: `'26.07.02.` vs `26.07.02.`) 동일 공고가 중복 카드로 노출되던 버그 수정(실제 사례: 김포시 행복주택 완화모집[선계약후검증], id 10398 LH/18728 MYHOME). 기존 "정정공고 접두어 제거 + 공백 정규화"만 하던 로직에 (1)작은따옴표류(`'`/`'`/`'`/`"`/`"`/백틱/`″`) 전부 제거 (2)모든 공백 완전 제거(치환 아님) (3)연속 마침표(`..`→`.`) 정규화 3단계 추가 — 표시용 `title`은 원본 그대로 유지, `dedup_key` 계산에만 적용. 변경 전후 전체 dedup 그룹 수 459→452(7개 그룹 병합)로 급격한 과병합 없이 안전한 수준임을 확인, 병합된 7건 전부 실제로 같은 공고(작은따옴표·공백 차이만)임을 원문 대조로 확인(김포시/군산내흥7/김해시/밀양가곡/양산사송/익산인화/익산한스빌). 검증: 김포시 사례 `SELECT * FROM get_announcements_deduped() WHERE title ILIKE '%김포시%완화%선계약후검증%'` → 2건→1건으로 정상 병합 확인, `housing_units` 매칭 unmatched 0건(회귀 없음), `announcement_extras` 매칭 unmatched 3건은 기존에 이미 알려진 서울대방 3건(단지조감도/배치도/동호배치도, building_address 자체가 원천적으로 없음)과 동일해 회귀 아님 확인. apply_migration으로 DROP 후 재생성(RETURNS TABLE 그대로 유지), 프론트 코드(index.html) 변경 없음 |
| 2026-07-06 | MYHOME upsert 배치 전체 유실 버그 원인규명 + 수정 (collect-announcements v12→v13) — 직전 세션에서 발견된 `MYHOME upsert[0]: ON CONFLICT DO UPDATE command cannot affect row a second time` 에러를 실제 MYHOME API 원본 응답으로 조사. **원인(확인된 사실)**: MYHOME API가 다중 시군구에 걸친 공고(pblancId 20669=청년매입임대2차, 20670=기숙사형청년주택)를 시군구별 sub-row로 쪼개 반환하는데, 특정 시군구에 속하지 않는 잔여분 sub-row는 `signguNm`이 빈 문자열로 서로 동일해서 `announcement_id`(annId) 생성식이 이 sub-row들을 구분하지 못하고 충돌 — API 응답 자체에 이를 구분할 필드가 존재하지 않음(fullAdres/hsmpNm/rnCodeNm 등도 전부 공란). Postgres upsert가 배치(50건) 안에서 같은 conflict key를 두 번 이상 만나면 그 배치 전체를 통째로 거부하는 특성 때문에, 이 충돌이 하필 매 실행 첫 배치(가장 최신 공고 46개, pblancId 20667~20705 구간)에 위치해 **그 배치 전체가 매번 조용히 유실**되고 있었음(직전 세션에 신규 추가한 `collection_run_log`가 없었다면 계속 몰랐을 문제). `net.http_get`으로 MYHOME 원본 첫 페이지를 직접 받아 실제 중복 항목 2쌍(20669 4건, 20670 2건)을 원문 그대로 확인 후 결론. **수정**: `collect()` MYHOME 처리부에 배치 청크 이전 전역 `Map<annId, row>` 기반 dedup 추가(같은 키는 마지막 값으로 병합) — 병합 건수를 `myhome_dedup_merged`로 응답/로그에 명시적으로 노출(`collection_run_log`에 동명 컬럼 신규 추가). **검증**: `net.http_post` 수동 트리거(request_id 31) → `myhome_fetched=423, myhome_upserted=419, dedup_merged=4`로 423=419+4 정확히 일치, `errors=[]` 완전히 빈 배열 확인. 이전까지 매 실행마다 통째로 유실되던 첫 배치 공고 24건(20669/20670 계열 포함, 시군구별 row)이 이번 실행에서 처음으로 `announcements`에 저장됨을 `updated_at > now()-10min` 조건으로 확인(신규 저장 실측). Edge Function v13 배포, 프론트 코드(index.html) 변경 없음 |
| 2026-07-06 | 공고 수집 주기 2회→4회/일(09/12/15/18시 KST) 확대 + 실행결과 영구 로그 테이블 추가 — 07-04 15시/07-05 09시 cron이 "succeeded"인데 실제 `announcements.updated_at` 갱신 0건이었던 "조용한 실패" 문제 개선 목적. **cron**: 기존 job 3(과거 실패 이력)은 이미 존재하지 않음을 `SELECT jobid,command FROM cron.job` 조회로 확인(추가 정리 불필요), job 4/5의 실제 command를 그대로 복사해 job 6(`zipfit-collect-announcements-noon`, `0 3 * * *`=KST 12시)·job 7(`zipfit-collect-announcements-evening`, `0 9 * * *`=KST 18시) 신규 등록, 4개 전부 active=true 확인. **DB**: `collection_run_log`(lh_fetched/lh_detail_ok/lh_upserted/myhome_fetched/myhome_upserted/expired_marked/errors/duration_ms) 테이블 신규 생성. **Edge Function**: `collect-announcements` v10→v12 배포, `collect()` 함수에 시작~종료 duration 측정 + 종료 직전 `collection_run_log` INSERT 추가. v11 배포 직후 첫 테스트에서 로그가 안 보여 "insert가 조용히 실패하는 것 아닌가" 의심했으나(supabase-js `.insert()`는 DB 에러 시 throw가 아니라 `{error}` 반환이라 기존 try/catch로 못 잡을 뻔한 케이스), 재조회 결과 실제로는 단순 조회 타이밍 지연이었고 v11 insert 자체는 정상 성공(id=1) — 다만 방어적으로 v12에서 `.insert()`의 `error` 필드를 명시적으로 확인해 실패 시 응답 `errors` 배열에 노출하도록 보강. **검증**: `net.http_post`로 v11/v12 각각 수동 트리거(request_id 28/29) → 둘 다 HTTP 200, `collection_run_log`에 실제 행 2건 적재 확인(LH fetched 460/upserted 460, MYHOME fetched 423/upserted 373, duration 46~52초). 두 실행 모두 `MYHOME upsert[0]` 배치에서 동일한 conflict 에러 1건씩 재현되어 다음 세션 백로그에 등록(기능 자체는 정상, 원인 미규명). 코드 변경 있음(collect-announcements Edge Function) — git push 대상은 CLAUDE.md 문서 갱신만(index.html 등 프론트 코드 변경 없음) |
| 2026-07-06 | 2차 배치 마무리 — 브랜치 병합 + eligibility_criteria "무관" 플래그 추가. **브랜치 병합**: `claude/notion-zipfit-page-o3aje1`에만 있던 미병합 커밋(f53a642, 2차 배치 CLAUDE.md 기록)이 main과 diverge 없이 순수 fast-forward 관계임을 `git log origin/main..origin/claude/notion-zipfit-page-o3aje1` / 역방향 diff로 확인 후 main에 fast-forward merge, push. codeload.github.com tarball로 main의 CLAUDE.md 실제 반영 확인(캐시 지연 있는 raw.githubusercontent.com 대신 사용). `git branch -a`로 잔여 미병합 브랜치 없음 확인(작업 브랜치+main만 존재). **스키마**: `eligibility_criteria`에 `income_limit_exempt`/`asset_limit_exempt`(둘 다 boolean, default false) 2개 컬럼 추가 — `income_pct IS NULL`이 "미분석"과 "원래 무관"을 구분 못하던 문제 해결(규칙: `exempt=false`면 미분석, `exempt=true`면 분석완료·원래 제한없음). 든든전세(음성, `id=db72757b-7d5c-4133-846c-bd68ab93a640`) row에 두 필드 모두 `true`로 UPDATE, `count(*) WHERE income_limit_exempt=true`=1로 정확히 일치 확인. RPC(`get_announcements_deduped()`)는 프론트엔드 노출 계획 확정 전이라 의도적으로 미변경(다음 세션 UI 논의 후 결정). 공동거주형 미해결 항목은 원문에 마커가 없다는 판단 그대로 백로그 유지. 코드 변경 없음(DB만) |
| 2026-07-06 | 2차 배치 5건(경기남부 청년매입임대2차/기숙사형청년주택/여주역세권 행복주택/양산물금2 H-1BL 행복주택(17형)/충북음성 든든전세)스키마·백필·검증·사진 전체 반영. **스키마**: `announcements`에 `contract_before_verification`(bool)/`rent_exemption_until`(date)/`rent_exemption_note`(text) 3개 컬럼 신규 추가, `get_announcements_deduped()` RETURNS TABLE·SELECT 절 양쪽 동반 수정(DROP 후 재생성, 재조회로 컬럼 반환 확인 완료). `data_categories` 2건 신규 승인(선착순 방문신청/선계약후검증 방식, 임대료 한시면제 — first_found_in=양산물금2). **백필**: 양산물금2(`announcement_id=2015122300020266`)는 `is_relaxed_recruitment=true`/`selection_method='선착순방문'`/`contract_before_verification=true`/`rent_exemption_until=2027-08-31`/`relaxation_detail`(소득·자산 무관, 무주택요건 완화, 사회초년생 7년 조건 등 원문 그대로)/`precise_address`(공고문에서 확인된 주소) 전부 채움, housing_units는 배치-1 여주·서울대방 선례대로 0건(단일단지). 여주역세권(`2015122300020253`)은 `precise_address='경기도 여주시 교동로 60'`만 채우고 `is_relaxed_recruitment=false` 명시(배치-1 완화모집 3건과 다른 유형이라 혼동 방지), housing_units 0건. 충북음성 든든전세(`2015122300020267`)는 `mymy_applicable=true`. **housing_units 실데이터**: 청년매입임대2차 228행(Drive 스프레드시트 base64 CSV 파싱, 안양/성남/수원/시흥/안산/용인/이천/평택 등 건물별), 기숙사형청년주택 10행(한림에스타워/이클래스/스마트오피스텔, 성별분리 unit_type 반영), 든든전세 111행(음성동문디이스트 501~507동, 전세형이라 monthly_rent 전부 0) — count(*) 3건 전부 228/10/111 정확히 일치 확인. **announcement_extras**: 청년매입임대2차 86건(photo 83+floorplan 3, 건물별 PDF/사진/도면), 기숙사형 3건(건물별 PDF), 여주역세권 8건(photo 4+floorplan 4, 서류양식·공고문 제외), 양산물금2 4건(photo 3+floorplan 1), 든든전세 0건(폴더에 사진/도면 자체가 없음, 스프레드시트·QnA·공고문만 존재 확인) — 전부 count(*)로 재확인. **미해결 2건 등록**(다음 세션 예정에 반영): ①청년매입임대2차 공동거주형 해당 건물을 스프레드시트·공고문 어디서도 특정 불가(마커 없음, 임의 추정 안 함) ②든든전세 "소득·자산 무관" 표현을 위한 스키마 필드가 eligibility_criteria에 없어 NULL row로만 등록(미분석과 구분 안 됨, claude.ai 문의 필요). 코드 변경 없음(DB만, git push 없음) |
| 2026-07-05 | 1차 배치 5건 announcement_extras 페이지네이션 재확인 — 이전 세션에서 "폴더 1페이지만 확인해 완전하지 않을 수 있음"으로 등록해둔 항목을 `pageSize=100 + excludeContentSnippets=true`로 5개 폴더 전량 재조회(모든 폴더가 nextPageToken 없이 1회 호출로 전체 반환 — 5~11개 파일 규모라 애초에 페이지네이션 자체가 걸릴 상황이 아니었음 확인). 폴더 실제 파일수 대 DB 적재수 대조: 양산사송 7/7·군포송정 9/9·경기남부Ⅰ 8/8·경기남부Ⅱ 2/2 전부 정확히 일치, **군포대야미만 5개 중 4개만 적재되어 1건 누락**(`지역위치도(군포대야미A-1블록).jpg`, id `1VNJHkJ2F4t-hrTXSt3v8XdBTWNLSQ17M`) 확인 후 photo로 추가 INSERT. 최종 count(*): 양산사송 7/군포송정 9/군포대야미 5/경기남부Ⅰ 8/경기남부Ⅱ 2, 총 31건(기존 30건에서 +1). 개인정보동의서·위임장·QnA·공고문·주택목록 스프레드시트 등은 이번에도 사진/평면도가 아닌 원본 서류라 제외 대상 확인. 코드 변경 없음(DB만, git push 없음) |
| 2026-07-05 | 1차 배치 5건 프론트엔드 노출 작업 — 기존 20건이 쓰던 노출 파이프라인(자격기준/세대정보/사진평면도/지도)을 신규 5건에 반영. **Group A(precise_address만, housing_units 0행 유지)**: 양산사송 A-5BL 영구임대 `precise_address='경상남도 양산시 동면 노포사송로 400'`, 군포송정 A-1BL 행복주택 `'경기도 군포시 송부로49번길 10 (도마교동, 군포송정3단지)'` 둘 다 공고문 원문에서 확인된 정확한 주소로 채움. 군포대야미 6년분양전환은 공고문·팸플릿·토지이용계획도 3개 소스 전부 확인했으나 "대야미동·속달동·둔대동 일원 A-1블록" 수준의 지구 설명만 존재(사업지구 특성상 개별 지번 미부여 추정) — 임의 도로명 주소를 지어내지 않고 원문 그대로 저장, 다음 세션 확인 필요로 등록. **Group B(housing_units 표준 적재)**: 경기남부 신혼신생아Ⅰ·Ⅱ전세형 스프레드시트 2개를 Drive `download_file_content`(CSV export, base64)로 받아 Python으로 파싱 후 INSERT — Ⅰ 342행(안양시 성원상떼빌 오피스텔·평택시 490-3 연립주택·시흥시 힐스테이트 시흥대야역 A,B/C동·군포시 개성로니엘 5개 건물), Ⅱ전세형 169행(평택시 안단테·용인시 솔루나 2개 건물), 둘 다 실제 공급호수(342/169)와 정확히 일치 확인. `announcement_id`는 `get_announcements_deduped()` 결과(dedup id 7877/7874)와 대조 완료. **announcement_extras**: 5건 Drive 폴더에서 팸플릿·평면도·조감도·배치도 30건 적재(floorplan 16/photo 12/pamphlet 2) — 단, Drive 폴더 페이지네이션 한계로 1페이지분만 확인, 특히 경기남부 Ⅰ·Ⅱ(대규모 세대수)는 건물별 파일이 폴더에 더 있을 수 있어 완전하지 않을 수 있음(다음 세션 재확인 등록). 검증: 5건 전부 `get_announcements_deduped()` 매칭 성공(7877/7874/7565/7564/7567), Group A 3건 precise_address 전부 NULL 아님, Group B housing_units count(*) 342/169 정확히 일치. 코드 변경 없음(기존 `initMapForHouse()`/`loadHousingUnits()`/`loadAnnouncementExtras()` 파이프라인 재사용, DB만·git push 없음). 다운님이 실사이트에서 5건 지도·세대정보·사진 노출 확인 필요 |
| 2026-07-05 | 공고 분석 1차 배치(5건) 반영 — claude.ai가 분석한 양산사송 A-5BL 영구임대완화모집/군포송정 A-1블록 행복주택완화모집/군포대야미 A-1블록 6년분양전환공공임대/경기남부 신혼신생아Ⅰ·Ⅱ전세형 5건을 실제 DB에 반영. data_categories 신규 3종("예비입주자 완화모집"/"우선순위추첨 선정방식"/"6년 분양전환 청약형") status='승인됨'으로 등록. `announcements`에 `is_relaxed_recruitment`/`relaxation_detail`/`selection_method`/`subscription_months_required`/`subscription_payments_required` 5개 컬럼 신규 추가, `get_announcements_deduped()` RETURNS TABLE·SELECT 절 동반 수정(DROP 후 재생성). 양산사송·군포송정 2건은 원문 PDF에서 소득/자산/무주택요건 완화 내용을 그대로 옮겨 `relaxation_detail`에 저장, `selection_method`(우선순위추첨/추첨) 채움. 군포대야미는 `selection_method='청약저축순위제'` + `eligibility_criteria`에 특별공급 8종(사전청약당첨자/청년/기관추천/다자녀/신혼부부/생애최초/노부모부양/신생아우선공급)+일반공급 3종 row 신설(단, 청약통장 가입기간·납입횟수 원문 표는 PDF가 커서 이번 도구로 접근한 텍스트 범위를 벗어나 전부 NULL — 다음 세션 확인 필요, 임의 수치 기입 안 함). 경기남부 신혼신생아Ⅰ·Ⅱ전세형은 기존 검증된 기본기준 소득값(Ⅰ=100%/맞벌이90%, Ⅱ=130%/맞벌이200%)으로 `eligibility_criteria` 채움 + `pair_announcement_key='gyeongginambu_20260630_sinhonsingenga'`로 짝공고 매칭. 검증: `announcements` 신규컬럼 실값(relaxed 2건/relaxation_detail 2건/selection_method 3건), eligibility_criteria 신규 13행(11+1+1), 5건 전부 `get_announcements_deduped()` 매칭 성공(unmatched 0건). 코드 변경 없음(DB만, git push 없음) |
| 2026-07-03 | announcement_extras 건물명 캡션 백필(9개 공고, 246건) — building_address/dong_ho가 전부 NULL이던 9개 공고(대전충남 신혼신생아Ⅰ·Ⅱ/청년매입임대/기숙사형, 광주전남 청년매입임대/신혼신생아Ⅰ·Ⅱ전세형, 부산울산 기숙사형, 서울대방)의 Drive 폴더를 Google Drive API로 전수 조회(357개 파일), 파일명 패턴(주택사진_{건물명}.pdf/평면도({주소},{건물명})/공고별 관용 표기 등 9가지 관찰 패턴)을 Python 스크립트로 파싱해 `file_url` 기준 UPDATE 325건 생성·실행. 결과: 9개 공고 중 8개 100% 채움(28/28, 19/19, 3/3, 56/56, 53/53, 52/52, 14/14, 99/99), 서울대방 3건(단지조감도/단지배치도/동호배치도 — 공고 전체 이미지라 파일명에 건물 정보 자체가 없음)만 미채움으로 확인, 총 322/325건. 실 이름(화장실/거실/방 등)은 캡션에서 제거하고 건물명만 추출, 완벽 분리 불가능한 케이스(예: "2흑석동이지더원아파트105-406")는 무리하게 쪼개지 않고 원문 그대로 유지. 검증 과정에서 파일ID 수기 전사 오타 1건(`12i9y...WcAGr...` → 실제 `WcZGAr...`) 발견해 재수정. 프론트엔드 코드 변경 없음(기존 `loadAnnouncementExtras()`가 새 캡션 자동 노출) |
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
10. **`revised_at_source='user_verified'` 보호 규칙** — 앞으로 어떤 자동 정리·백필·리셋 스크립트를 작성하든 `announcements.revised_at`/`revised_at_source`를 건드리는 UPDATE에는 반드시 `WHERE revised_at_source != 'user_verified'` 조건(또는 동등한 보호)을 포함할 것. 다운님이 직접 원문을 확인해서 넣은 실제 게시일이 자동 로직에 의해 조용히 덮어써지면 안 됨
11. **정정/신규 공고를 실제보다 늦게 처음 발견한 것으로 의심되는 사례 발견 시** (예: PAN_ID/pblancId 번호대가 오래됐는데 오늘 처음 수집됨) — 추측으로 날짜를 채우거나 리셋하지 말고, 다운님께 보고 후 실제 게시일 확인을 요청할 것. 확인되면 `revised_at`/`revised_at_source='user_verified'`로 반영(서울대방 사례와 동일 절차)

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
