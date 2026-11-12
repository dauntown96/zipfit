# 데이터 원천 — 무엇을 어디서 어떤 길로 받는가

> 2026-10-21 신설 (우편함 「코드·운영 — 문서만: docs/data-sources.md 신설 …」 · 근거 조사 「① 매칭이 없는 순위 기회 … ② 추가 API·연동·장치 조사 + 정기 조사 설계 …」 회신 ② · claude.ai 검증 채택 2026-10-21).
> 왜: 원천이 13줄을 넘어 Notion 행으로 나누면 대조가 어렵다. LH 공지 목록 API는 2026-10-14 허용 목록 표에 「LH 공지 API(곧)」로만 적혀 있었는데 2026-10-21에 지금 키로 바로 열렸다 — 「이미 있는 API를 모름」을 이 표 한 장과 정기 조사로 막는다.
> 🔴 **이 표가 원천의 정본이다.** 키는 **이름만** 적는다(값 0). 이용허락은 **포털 표시 그대로**, 표시가 없으면 「표시 없음」. 「마지막 확인」은 이 표의 그 줄을 실물(코드 · 포털 · 실호출)로 다시 본 날이다.
> 도메인이 열렸는지는 여기 적지 않는다 — [`network-allowlist.md`](network-allowlist.md)가 정본이다. 수집 시각·판정 조건 같은 구현 사실은 Notion ⑩이 정본이다.

> 🔴 **새 원천(호스트) 조사 순서 — robots가 첫 요청**(⑦ 3-2 사본 · 2026-10-26 claude.ai · GH 조사 — 어긋나면 ⑦이 이긴다)
> 1. 새 호스트를 조사·수집·점검으로 열 때는 ① `robots.txt` → ② 목록 → ③ 첨부 호스트 판별 순서다.
> 2. robots가 막는 경로는 자동 접근 0이다(Claude Code 세션 · 루틴 · EF · claude.ai Playwright 모두). 사람(다운님)의 브라우저 열람은 해당 없다.
> 3. 계기: GH 조사에서 조사 세션과 claude.ai가 둘 다 `www.gh.or.kr`(robots `Disallow: /`)을 robots보다 먼저 열었다. robots가 특정 봇(예: `Googlebot`)에만 규칙을 두면 우리 UA(`ZipFitBot`)에는 막는 경로가 없다 — 그 사실을 그 호스트 줄에 적는다(광주 `www.gmcc.co.kr` 2026-10-26).
> 4. 쓰던 원천도 robots·약관을 주기적으로 다시 본다(⑧ 2026-11-05 — LH `lhFile.do` `Disallow`가 쓰는 중에 생겼다) — 주기는 아래 「정기 조사」 체크리스트 6(분기 1회 · 계기형 ①②에도).

## 지금 쓰는 원천

「받는 길」: API · HTML(긁기) · 바이트(첨부 받기) · 파일(빌드) · SDK(브라우저) · 손 입력. 「주기」는 pg_cron 잡 이름 — 시각은 `cron.job` 조회로 본다(UTC 등록).

| # | 원천 | 받는 길 | 코드 위치 · 주기 | 키(이름) | 이용허락(포털 표시) | 활용가이드 날짜 | 마지막 확인 |
|---|---|---|---|---|---|---|---|
| 1 | LH 분양임대공고문 조회 — data.go.kr [15058530](https://www.data.go.kr/data/15058530/openapi.do) · `B552555/lhLeaseNoticeInfo1` | API | EF `collect-announcements` `fetchNoticeList` · 잡 `zipfit-collect-announcements`(+ `-warmup` · `-night`) | `LH_API_KEY`(EF 비밀값) | 이용허락범위 제한 없음 · 🔴 첨부 받기는 원천 6(robots `Disallow` · 문지기 — 2026-11-05) | 20260708(`OpenAPI활용가이드_…_분양임대공고조회_20260708.docx`) | 2026-10-21 |
| 2 | LH 분양임대공고별 상세정보 조회 — [15057999](https://www.data.go.kr/data/15057999/openapi.do) · `B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1` | API | 같은 EF(상세조회 캡 90) | `LH_API_KEY` | 이용허락범위 제한 없음 | 20260616 | 2026-10-21 |
| 3 | 국토교통부 마이홈포털 공공주택 모집공고 조회 — [15108420](https://www.data.go.kr/data/15108420/openapi.do) · `1613000/HWSPR02/rsdtRcritNtcList` | API | 같은 EF `fetchMyHome` | `LH_API_KEY`(같은 서비스키) | 이용허락범위 제한 없음(API) · 🔴 `www.myhome.go.kr` 사이트는 robots `Allow : /`이나 이용약관이 영리 이용·복제를 사전 승인으로 묶음(국토부·LH 공동 운영) — 승인 전 사이트에서 받는 길 없음(2026-11-05) | 페이지에서 가이드 파일명을 못 읽음(포털 수정일 2026-07-14) | 2026-10-21 |
| 4 | LH 마이홈포털 기존임대주택 목록 5종 — 영구임대 [15084928](https://www.data.go.kr/data/15084928/fileData.do) · 행복주택 [15084930](https://www.data.go.kr/data/15084930/fileData.do) · 장기전세 [15084929](https://www.data.go.kr/data/15084929/fileData.do) · 50년임대 [15084925](https://www.data.go.kr/data/15084925/fileData.do) · 국민임대 [15084926](https://www.data.go.kr/data/15084926/fileData.do) | API(파일데이터의 `api.odcloud.kr` 변환 API · `uddi:` 경로) | EF `collect-rental-stats` · 잡 `zipfit-collect-rental-stats`(주 1회) | `ODCLOUD_API_KEY` | 이용허락범위 제한 없음 | 파일데이터라 가이드 없음 · 포털 파일명 날짜 20260413(코드 상수 `SOURCE_UPDATED_AT` = 2026-05-14) | 2026-10-21 |
| 5 | 국토교통부 아파트 전월세 실거래가 — [15126474](https://www.data.go.kr/data/15126474/openapi.do) · `1613000/RTMSDataSvcAptRent` | API | 코드 없음 — 분석 회차가 컨테이너에서 손으로 부른다(`CLAUDE.md` 컨테이너 환경 메모) | `MOLIT_RENT_API_KEY`(컨테이너 환경변수) | 이용허락범위 제한 없음 | 날짜 없는 기술문서(`아파트 전월세 실거래가 자료 기술문서.hwp` · 포털 수정일 2026-07-29) | 2026-10-21 |
| 6 | LH 청약센터 공고 페이지 · 첨부 · 매입 홍보물 · 단지 이미지 탭 — `apply.lh.or.kr` | HTML · 바이트 | EF `check-source-pages`(잡 `zipfit-check-source-pages`) · `collect-lh-promo`(잡 `zipfit-collect-lh-promo`) · `collect-lh-images`(잡 `zipfit-collect-lh-images`) · `fetch-attachment`(허용 경로 `/lhapply/` · `/upload/Files/`) | 없음 | 표시 없음 · 🔴 첨부 `/lhapply/lhFile.do` · `/lhapply/apply/csvc/lhFile.do` robots `Disallow`(Wayback: 2025-09-02~10-22 사이 생김) · 2026-11-05부터 문지기 `lh_file_mode` essential(`lh_file_gate` — 열린 공고 첨부만 파일당 한 번 + 재시도 한 번) · LH 공식 문의 2026-11-05 접수 | — | 2026-11-05 |
| 7 | SH 서울주거포털 공고 목록 — `housing.seoul.go.kr` | HTML(robots 전면 허용 — 2026-08-19 확인) | EF `collect-sh-announcements`(잡 `zipfit-collect-sh-announcements`) · `check-source-pages` `parseShList`(잡 `zipfit-check-source-pages-new-sh`) · `fetch-attachment` | 없음 | 표시 없음 | — | 2026-10-21 |
| 8 | SH 게시판 후속 공지 — `www.i-sh.co.kr` | HTML · 바이트 | EF `check-source-pages` `parseShBoard` · `matchFollowups` · `fetch-attachment` | 없음 | 표시 없음 | — | 2026-10-21 |
| 9 | 지방공사 게시판 — 부산도시공사 `www.bmc.busan.kr` · 경북개발공사 · 경남개발공사 | HTML · 바이트 | 부산: EF `fetch-attachment` `SEOUL_ONLY`(서울 지역 실행) · 경북·경남: 분석 회차가 DB `net.http_get`으로 본문만(코드 없음) | 없음 | 표시 없음 | — | 2026-10-21 |
| 10 | 카카오 지도 SDK · 지오코더(`libraries=services`) | SDK(브라우저) | `index.html` 21행 · `kakao.maps.services.Geocoder` | 공개 JS 앱 키(`index.html`에 실림 · 도메인 제한 — 비밀값 아님) | 카카오 약관(포털 표시 해당 없음) | — | 2026-10-21 |
| 11 | 행정동 경계 — 국가데이터처 SGIS → `vuski/admdongkor` `ver20260701` | 파일(빌드) | `scripts/geo-build.py` → `geo/kr-2026-07.json` · 화면 캡션 `ZF3_GEO_SRC` | 없음 | 공공누리 1유형(SGIS) · CC BY 4.0(가공판) — 화면 캡션에 표시 | — | 2026-10-21 |
| 12 | 기준 중위소득(보건복지부 고시 제2025-135호 · 2026년) · 도시근로자 가구원수별 월평균소득(LH청약플러스 임대가이드 · 2025년) | 손 입력 | DB 표 `median_income_monthly`(2026 · 8행 · `checked_on` 2026-09-18) · `urban_worker_monthly_income`(2025 · 8행 · 2026-09-11) | 없음 | 고시·기준표(포털 표시 해당 없음) | — | 2026-10-21 |
| 13 | LH 청약센터 공지사항(후속 공지 — 후순위 접수 여부 · 공급대상주택 게시) | **받는 장치 없음**(🔵 매입 순위별 「공급대상주택 게시」 공지는 2026-11-05부터 원천 16이 감지 — 공지 첨부를 읽고 쓰는 것은 루틴 몫) | — | — | — | — | 2026-10-21 — 후보 1·2로 받을 길이 있다 |
| 14 | GH 주택청약·임대센터 공고 목록 — `apply.gh.or.kr`(`sr7150` 임대주택 · `sr7155` 매입임대) · 첨부 `apply-cdn.gh.or.kr` | HTML(robots `Allow: /*` — 2026-10-28 다시 확인 · 🔴 `www.gh.or.kr`은 `Disallow: /` — 자동 접근 0) · 바이트 | EF `collect-gh-announcements` · `fetch-attachment`(허용 경로 `/sr/sr7150/` · `/sr/sr7155/`) — 🔴 **브랜치에만**(켜기 · cron 등록은 런칭 뒤) | 없음 | 표시 없음(청약센터 HTML에 「공공누리」·「저작권」 0 — 2026-10-26) | — | 2026-10-28 |
| 15 | LH 건설임대 당첨 합격점수(커트라인) — data.go.kr [15160376](https://www.data.go.kr/data/15160376/openapi.do) · `B552555/lhCsrLsPwiPneScrInfo/getCsrLsPwiPneScrInfo` | API(시도명 `CNP_NM` 필수 × 모집공고일 창 최대 1년 · 쪽 넘김 없음 · 지난 5년) | EF `collect-lh-cutoff` → 표 `lh_cutoff_scores` · 잡 `zipfit-collect-lh-cutoff`(주 1회 · 최근 1년 창 16호출) · 🔴 커트라인 글자는 받는 자리에서 거름(동점 처리 개인 값 · 신청 5명 이하 — 원문 저장 0) · `CM_RT` 받지 않음 | `MOLIT_RENT_API_KEY`(EF 비밀값 · 컨테이너 환경변수 같은 이름) | 이용허락범위 제한 없음(claude.ai Playwright · 포털 15160376 상세 2026-11-05) | 데이터셋 전용 가이드 없음 — 「가이드 다운로드」는 포털 공통 Swagger 사용법 · 칸 설명은 상세 페이지의 Swagger 명세(2026-11-05 조사 회차) | 2026-11-05 |
| 16 | LH 청약센터 공지사항 목록 — data.go.kr [15058222](https://www.data.go.kr/data/15058222/openapi.do) · `B552555/lhNoticeInfo1/getNoticeInfo1` | API(`SCH_ST_DT`~`SCH_ED_DT` 창 · `PG_SZ` 100 · `PAGE` 쪽 넘김) | EF `collect-lh-notices` → 표 `lh_notice_matches`(맞은 공지만) · `lh_notice_run_log` · 잡 `zipfit-collect-lh-notices`(하루 4회 KST 10·13·16·19시 13분 · 대상 창(`wave_notice_targets()` due ∧ ⚠️ 차수 행 없음) 0이면 호출 0 · 창 오늘−3~오늘 · 최대 3쪽) · 맞춤 규칙 `lh_notice_pick` · 🔴 개인 식별 값 없음(칸 11) | `MOLIT_RENT_API_KEY`(EF 비밀값 · 컨테이너 환경변수 같은 이름) | 이용허락범위 제한 없음 | 포털 가이드 20210810 | 2026-11-05 |

### 원천이 아닌 바깥 연결 — 운반 · 저장(참고)

원천 표에 넣지 않는다. 데이터를 만들지 않고 옮기거나 둔다.

| 연결 | 쓰는 곳 | 키(이름) |
|---|---|---|
| Google Drive(분석 원문 보관 · 카드 썸네일) | EF `fetch-attachment` `mode=upload` · `index.html` `drive.google.com/thumbnail` | `GDRIVE_CLIENT_ID` · `GDRIVE_CLIENT_SECRET` · `GDRIVE_REFRESH_TOKEN` · `GDRIVE_ROOT_FOLDER_ID` |
| Supabase(DB · EF · Vault) | 전부 | `SUPABASE_SERVICE_ROLE_KEY` · Vault `cron_secret_v2` · `zipfit_routine_fire_url` · `zipfit_routine_fire_token` · `github_actions_dispatch_token` |
| GitHub Actions(점검 · 백업 · 배포) | `.github/workflows/` | Actions Secret `SUPABASE_ACCESS_TOKEN` 등 |

## 후보 — 쓸 시점이 정해진 것

조사 회신 ②(2026-10-21) 후보 표에서 옮겼다. 「재확인」 칸은 포털·실호출로 다시 본 것만 날짜와 함께 적는다. 한도는 포털 「개발계정」 일 트래픽.

> 🔴 **data.go.kr 키는 하나다**(2026-11-12 실측 — 우편함 「조사·운영 — 새로 활용신청한 API 실호출 …」): EF 비밀값 `LH_API_KEY` · `MOLIT_RENT_API_KEY` · `ODCLOUD_API_KEY`와 컨테이너 환경변수 `MOLIT_RENT_API_KEY`가 같은 값이다(관리 API 비밀값 목록의 digest = 컨테이너 값 sha256 — 값은 어디에도 찍지 않음). 그래서 「어느 키에 신청했나」가 아니라 「그 계정에 신청했나」다 — 신청 안 된 API는 HTTP 403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(서버 응답 · 허용 목록 403과 다름 — 신청 직후 1~2시간은 반영 대기라 다음 날 한 번 더).
> 🔴 **제공형태 LINK 꼴은 data.go.kr 키로 안 된다 — 원 사이트 키**: 포털 상세의 「제공형태」가 LINK면 호출 주소가 원 사이트(`juso.go.kr` · 브이월드 · `khug.or.kr` …)이고 키도 그 사이트 승인키다. 활용신청 전에 「제공형태」 줄을 본다(REST = 이 키 · LINK = 따로).
> 🔵 **같은 데이터셋이 두 주소를 갖는 것**: 마이홈 계열(15110581 · 15108378)은 상세에 `data.myhome.go.kr/…`와 `apis.data.go.kr/1613000/HWSPR04 · HWSPR03/…`이 함께 실린다 — 컨테이너는 `apis.data.go.kr` 쪽으로 200(2026-11-12) · `data.myhome.go.kr`은 CONNECT 403.

| 후보 | 받는 꼴 · 한도 · 인증 | 이용허락 | 잇는 일 | 쓸 시점 | 다운님 손 | 재확인(날짜는 칸 안) |
|---|---|---|---|---|---|---|
| 1. LH 청약센터 공지사항 목록 조회 — [15058222](https://www.data.go.kr/data/15058222/openapi.do) · `B552555/lhNoticeInfo1/getNoticeInfo1` | JSON — 유형 · 제목 · 담당본부 · 게시일 · 상세 URL · `BBS_SN` · 기간(`SCH_ST_DT`~`SCH_ED_DT`) · 10,000 · 서비스키 · 자동승인 | 이용허락범위 제한 없음 | 🔵 **지금 씀 — 대상주택 공지 감지**(2026-11-05 · 원천 16 · EF `collect-lh-notices`) · 후순위 접수 여부 · 공급대상주택 게시(원천 13) · LH 상태(`PAN_SS`)를 믿을지의 판단 재료 | S0(판단 재료) · 수집은 S1 | 없음(이미 됨) | 포털 가이드 20210810 · 컨테이너 `MOLIT_RENT_API_KEY`로 **HTTP 200**(10-14~21 창 `ALL_CNT` 28) |
| 2. LH 청약센터 공지사항별 상세정보 조회 — [15058449](https://www.data.go.kr/data/15058449/openapi.do) · `lhNoticeDtlInfo1/getNoticeDtlInfo1` | 상세 내용 · 첨부 목록 · 10,000 · 자동승인 · 대안: 목록의 상세 URL(HTML GET 200) | 이용허락범위 제한 없음 | 같음 — 공지 본문 · 첨부(공급대상주택 목록) | S1 | 없음(2026-11-12 신청 끝) | 포털 가이드 20210810 · 2026-10-21 403(신청 안 됨) → **2026-11-12 HTTP 200**: 인자 `BBS_SN` + `CCR_CNNT_SYS_DS_CD`(목록 행의 값 그대로 — 공지는 `02` · `03`을 주면 빈 응답) · 칸 `dsBbsInfo`(제목 · 본문 `BBS_DTL_CTS` · 게시일 · 담당) · `dsBbsAhflInfo`(`AHFL_URL` · `CMN_AHFL_NM`) · 🔴 첨부 주소는 `apply.lh.or.kr/lhapply/lhFile.do`(robots `Disallow` · 원천 6 문지기) — 이 API는 첨부 **목록**만 주고 받는 길은 그대로 막혀 있다(이 회차 첨부 받기 0) |
| 3. LH 분양임대공고별 공급정보 조회 — [15056765](https://www.data.go.kr/data/15056765/openapi.do) · `lhLeaseNoticeSplInfo1/getLeaseNoticeSplInfo1` | 주택형 · 필지 · 상가호 목록 · 10,000 · 인자 `PAN_ID` · `SPL_INF_TP_CD` · `CCR_CNNT_SYS_DS_CD` · `UPP_AIS_TP_CD` · `AIS_TP_CD`(공고 목록 행의 값 그대로) | 이용허락범위 제한 없음 | 세대 행 자동화 · 매입 공급대상주택 목록이 나오는지 미확인 | S1 | 없음 | 포털 가이드 20260202 · **2026-11-12 HTTP 200**(울산다운2 A-6 `…21060`): `dsList01` 칸 = 단지명 · 주택형 · 전용 · 공급면적 · 세대수 · 금회공급 세대수 · 임대보증금 · 월임대료(이 공고는 금액 「공고문 참조」) — 매입 공고는 안 봄 |
| 4. 한국부동산원 청약홈 분양정보 15098547 · 경쟁률 15098905 | 40,000 · 운영 심의승인 · `api.odcloud.kr` | 이용허락범위 제한 없음 | L1 「분양 보류」 | S4 | 활용신청(심의) | 2026-11-04 다시 봄(claude.ai 조사 · 우편함 「옛 주소 걷기·화면 빈칸 점검」 덧): 40,000 · 개발 자동 / 운영 심의 · 이용허락범위 제한 없음 · 포털 수정 2024-03-19 · 컨테이너에서 `api.odcloud.kr`·`www.applyhome.co.kr` CONNECT 403(허용 목록 축) |
| 5. 마이홈 예비입주자 대기현황 [15108378](https://www.data.go.kr/data/15108378/openapi.do) · `1613000/HWSPR03/moveWaitStsList`(또는 `data.myhome.go.kr/moveWaitStsList`) | 1,000 · 자동승인 · 인자 `brtcCode` · `signguCode`(+ `suplyTy` · `houseTy`) | 이용허락범위 제한 없음 | 매칭 「대기 순번」 | S4 | 없음(신청 끝) | **2026-11-12 HTTP 200**(`apis.data.go.kr` 경로 · 서울 종로 `totalCount` 14) · 칸: 기관 · 단지명 · 도로명 주소 `rnAdres` · 단지 번호 `hsmpSn` · 주택·공급 유형 · 형 · 추첨 단위 `drwtUnit` · 대기 수 `waitCo` · 해지 수 `trmnatCo` — 개인 값 없음 |
| 6a. 마이홈 공공임대 단지정보 [15110581](https://www.data.go.kr/data/15110581/openapi.do) · `1613000/HWSPR04/rentalHouseGwList`(또는 `data.myhome.go.kr/rentalHouseGwList`) | 단지 행(형별) · 1,000 · 인자 `brtcCode` · `signguCode` · 🔴 **시도 코드는 새 코드**(전남 담양 `46` → `resultCode` 03 · `12` → 200) | 이용허락범위 제한 없음 | 지도 핀 정확도 · 단지 정보 · 지번 → 도로명(`pnu` 19자리 = 법정동 10 + 산 1 + 번 4 + 지 4 · `rnAdres`) | S1 | 없음(신청 끝) | **2026-11-12 HTTP 200**(서울 종로 387행 · 과천 39 · 구리 131) · 칸: `hsmpSn` · 기관 · 시도·시군구 · 단지명 · `rnAdres` · `pnu` · 준공 `competDe` · 세대 `hshldCo` · 공급유형 · 형 · 전용·공용 · 주택유형 · 난방 · 건물 형태 · 승강기 · 주차 · 기본 보증금·월임대료·전환 한도 · 🔵 지번만 공고 4건의 대지 `pnu` 일치 0(새 단지라 아직 없음 — 아래 「지번 → 도로명 표본」) |
| 6b. LH 공공임대주택 단지정보 [15058476](https://www.data.go.kr/data/15058476/openapi.do) · `data.myhome.go.kr/rentalHouseList` | 1,000 · 인자 `brtcCode` · `signguCode` · 상세에 `apis.data.go.kr` 경로 없음 | 이용허락범위 제한 없음 | 6a와 같은 일(LH 단지만) | S1 | 허용 목록 `data.myhome.go.kr` | 2026-11-12 신청 끝 · 컨테이너 **CONNECT 403**(허용 목록 축 — 호출 0 · 키 반영 여부 미확인) |
| 7. 인천도시공사 분양임대 공고문 15149725 · 공급대상·실적 15168460 | 1,000 · 운영 심의승인 | 공고문 칸 미표시 · 실적 제한 없음 | 국면 B′ ③ 지방공사 | S1 | 활용신청 | 안 봄 |
| 8. 전북개발공사 임대아파트·보증금 15056567 · 주택분양 15062034 | 단지·보증금(공고 아님) · 10,000 | 이용허락범위 제한 없음 | 지방공사 단지 금액 | S4 | 활용신청 | 안 봄 |
| 9. 행정안전부 실시간 주소별 좌표정보 15056663 · 주소 검색 15057017(`business.juso.go.kr`) | juso 승인키(🔴 제공형태 **LINK** — data.go.kr 키로 안 됨 · 「1 시스템 1 승인키」) | 이용허락범위 제한 없음 | 지도 핀 정확도 · 세대 행 법정동 · 지번 → 도로명(건축물대장에 없는 새 단지 — 아래 표본) | S1 | 2026-11-12 「도로명주소 검색 API」 · 「좌표제공 검색 API」 신청(다운님) · 키 이름을 컨테이너 환경변수로 · 허용 목록 `business.juso.go.kr` | 2026-11-12 컨테이너에 juso 키 이름 없음 · `business.juso.go.kr` CONNECT 403 — 호출 0 |
| 10. HUG 든든전세 모집공고 — 파일 [15139525](https://www.data.go.kr/data/15139525/fileData.do) · 오픈API [15143827](https://www.data.go.kr/data/15143827/openapi.do) | 파일: CSV · **업데이트 주기 분기** · 포털 수정 2026-10-12 · 칸 15(모집공고일자 · 공고 시작 시간 · 지역구분명 · 지역상세구분코드명 · 주택형태 · 전용면적 · 임대보증금액 · 청약접수 시작·종료 일자·시간 · 서류제출대상자 발표 · 당첨 발표 · 계약 시작·종료) / 오픈API: JSON · **업데이트 주기 실시간** · 포털 수정 2026-09-23 · 🔴 제공형태 **LINK**(HUG 누리집 키 — data.go.kr 키로 안 됨) · 모집공고 기간에만 데이터가 나오고 마감되면 자동 삭제 · 모집 없을 때는 오류 꼴 응답(포털 설명) · 칸 「시군구 및 동」 | 둘 다 이용허락범위 제한 없음 | 든든전세(대구경북 …20923 꼴) 공고 목록 대조 · HUG 공급분 — 열린 공고 감지는 오픈API(실시간) · 지난 공고 대조는 파일(분기) | S1 | 키: 컨테이너 환경변수 `HUG_API_KEY`(2026-11-12 있음 · 36자) — EF 비밀값엔 없음 · 허용 목록 `www.khug.or.kr`(호출 호스트는 HUG 활용가이드로 확정 — 이 회차 못 읽음) | 2026-11-12: 컨테이너 `www.khug.or.kr` · `khug.or.kr` CONNECT 403 · 웹 열람도 해석 실패 → robots · 약관 · API 문서 · 실호출 **0**(robots가 첫 요청이라 그 뒤 단계로 안 감) · 포털 두 페이지만 읽음 |
| 11. 국토교통부 건축HUB 건축물대장정보 — [15134735](https://www.data.go.kr/data/15134735/openapi.do) · `1613000/BldRgstHubService/getBrTitleInfo`(표제부 · 그 밖에 총괄표제부 · 기본개요 · 층별 · 전유부 등) | JSON(`_type=json`) · 10,000 · 자동승인 · 인자 `sigunguCd`(5) · `bjdongCd`(5) · `platGbCd`(0 대지 · 1 산) · `bun` · `ji`(4자리) | 이용허락범위 제한 없음 | 지번 → 도로명(`newPlatPlc`) · 단지명 `bldNm` | S1 | 없음(신청 끝) | **2026-11-12 HTTP 200** · 지번 33주소(336행) 표본 → 도로명 15주소 · 115행 · 11공고(아래 「지번 → 도로명 표본」) · ⚠️ 2026-11-12 서버 503이 7/40회(몇 초 뒤 다시 부르면 200 — 받는 장치를 만들면 재시도 필수) |
| 12. 국토교통부 법정동코드 — 파일 [15123287](https://www.data.go.kr/data/15123287/fileData.do) | CSV(CP949) · 칸 법정동코드 10 · 법정동명 · 폐지여부 · 업데이트 주기 연간 · 포털 수정 2026-09-29(`…_20260929`) · 원천 = 행정표준코드관리시스템 법정동 목록 | 이용허락범위 제한 없음 | 건축HUB 호출의 `sigunguCd`·`bjdongCd` · 🔵 새 코드 반영(전북 `52` · 전남 `12` 「전남광주통합특별시」 · 인천 서해구) | S1 | 없음(파일 · 로그인 없이 받힘) | 2026-11-12 컨테이너에서 받음(`www.data.go.kr` `selectFileDataDownload.do` → `fileDownload.do` · 2.47MB) · 행정안전부 법정동코드 API(`1741000/StanReginCd`)는 이 키에 신청 안 됨(403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`) — 파일로 충분 · `www.code.go.kr` CONNECT 403 |
| 13. 국토교통부 오피스텔 전월세 실거래가 — [15126475](https://www.data.go.kr/data/15126475/openapi.do) · `1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent` | XML · 10,000 · 인자 `LAWD_CD` · `DEAL_YMD`(원천 5와 같은 꼴) | 이용허락범위 제한 없음 | 매입임대 오피스텔 주변 시세(원천 5는 아파트만) | S1 | 없음(신청 끝) | **2026-11-12 HTTP 200**(서울 종로 2026-10 `totalCount` 115) |
| 14. 국토교통부 단독/다가구 전월세 실거래가 — [15126472](https://www.data.go.kr/data/15126472/openapi.do) · `1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent` | XML · 10,000 · 원천 5와 같은 꼴 | 이용허락범위 제한 없음 | 매입임대 다가구 주변 시세 | S1 | 없음(신청 끝) | **2026-11-12 HTTP 200**(서울 종로 2026-10 `totalCount` 128) |
| 15. 국토교통부 공동주택 단지 목록 — [15057332](https://www.data.go.kr/data/15057332/openapi.do) · `1613000/AptListService4`(`getTotalAptList4` · `getSidoAptList4` · `getSigunguAptList4` · `getLegaldongAptList4` · `getRoadnameAptList4`) | JSON · **5,000** · 인자 `sigunguCode` · `bjdCode` · `roadCode` | 이용허락범위 제한 없음 | 단지 코드 `kaptCode` 찾기 → 16 | S4 | 없음 | **2026-11-12 HTTP 200**(서울 종로 `totalCount` 39) |
| 16. 국토교통부 공동주택 기본 정보 — [15058453](https://www.data.go.kr/data/15058453/openapi.do) · `1613000/AptBasisInfoServiceV5/getAphusBassInfoV5`(+ `getAphusDtlInfoV5`) | JSON · **5,000** · 인자 `kaptCode` | 이용허락범위 제한 없음 | 단지 동수 · 세대 · 사용승인일 · 도로명 `doroJuso` · 법정동 `bjdCode`(공동주택관리 대상 단지만) | S4 | 없음 | **2026-11-12 HTTP 200**(포털 예시 단지) |
| 17. LH 임대주택단지 조회 — [15059475](https://www.data.go.kr/data/15059475/openapi.do) · `B552555/lhLeaseInfo1/lhLeaseInfo1` | JSON · 10,000 · 인자 `CNP_CD`(시도) · `SPL_TP_CD`(공급유형) · `PG_SZ` · `PAGE` | 이용허락범위 제한 없음 | LH 단지 목록 — 단지명 `SBD_LGO_NM` · 지역 `ARA_NM` · 전용 · 세대 · 보증금 · 월임대료 · 입주 예정 `MVIN_XPC_YM`(주소 칸 없음) | S4 | 없음 | **2026-11-12 HTTP 200**(서울 · 유형 07 `ALL_CNT` 19) |

### 지번 → 도로명 표본(2026-11-12 · 쓰기 0)

세대 행 `housing_units.address`가 지번 꼴(「로·길 + 숫자」 없음 ∧ 번지 숫자 있음)인 **336행 · 28공고 · 서로 다른 주소 33**을 전부 불렀다(표본 = 전수). 법정동코드는 원천 후보 12 파일(존재 행) · 이름 끝 맞추기(「충북」→충청북도 · 같은 낱말 되풀이 한 번만 · 행정동 「광명1동」→법정동 「광명동」).

| 갈래 | 주소 | 행 | 공고 |
|---|---|---|---|
| 법정동코드 찾음 | 33/33 | 336 | 28 |
| 건축HUB 표제부 `newPlatPlc` 나옴 | 15 | 115 | 11 |
| 표제부 0행(대장 없음) | 18 | 221 | 17 |
| 열린 카드 4공고(…20905 담양삼만 · …20960 과천 S12 · …20936 구리갈매 A-1 · 21477_1 제천 영천동) | 4 중 1(제천 → 「충청북도 제천시 청풍호로2다길 8」) | 59 중 7 | 4 중 1 |

- 0행 18주소는 짓는 중이거나 갓 지은 택지 단지(담양 삼만리 1241 · 과천 갈현동 581-1 · 구리 갈매동 10 등)와 「○○번지 일원」 대표 지번이다 — 총괄표제부 · 기본개요도 0(담양 · 과천 · 구리 각 1회), 마이홈 단지정보(6a) `pnu` 일치도 0.
- 그래서 **건축HUB만으로는 안 된다** — 이미 사용승인된 매입·기존 단지(김포 양곡 · 구미 · 경산 · 제천 등)는 되고, 열린 카드의 새 건설임대 단지는 안 된다. 새 단지는 juso 「도로명주소 검색 API」(후보 9 · 부여 예정 도로명까지 담는지는 키가 온 뒤 같은 33주소로 확인)를 함께 본다.

### 없음 — 찾은 축과 함께

🔴 한 번 검색 실패는 부재가 아니다. 축(어디서 · 무엇으로 · 언제)을 함께 둔다.

| 찾은 것 | 결과 | 축 | 잇는 일 |
|---|---|---|---|
| 지방공사 「공고」 API — GH · SH · 부산 · 대구 · 경북 · 경남 · 충남 · 광주 · 대전 · 강원 · 충북 · 울산 · 제주 | 없음 | data.go.kr 목록 검색 · 기관명 키워드 · 「주택·임대·공고」 낱말(2026-10-21) — 대전·부산은 「임대현황」만 · SH는 웹검색에서 청년안심주택 공급계획·주택관리현황 파일만. ⚠️ 경기데이터드림 · 서울 열린데이터광장은 찾지 않았다(「찾지 않음」이지 「없음」이 아니다) | 국면 B′ ③ |
| 기준 중위소득 API | 없음 — 고시 문서뿐 | data.go.kr API 검색 「기준 중위소득」 → 아이돌봄 소득기준 등만 · 웹검색(2026-10-21). 2027년 값은 2026-07-28 결정 보도 | 원천 12 — 12월에 2027 넣기(점검 「해마다 바뀌는 밑값」이 1/1부터 ⚠️) · S1 |
| data.go.kr 키로 부를 수 있는 주소·좌표 API(지번 → 도로명) | 없음 — 행정안전부 주소 API(실시간 주소정보 15057017 · 영문주소 15057413 · 지도제공 15096716) · 브이월드 15140372 · HUG 든든전세 오픈API 15143827은 전부 제공형태 **LINK**(원 사이트 키) · data.go.kr REST로 되는 길은 건축HUB 15134735 표제부 `newPlatPlc`(후보 11) · 마이홈 단지정보 `pnu`·`rnAdres`(후보 6a) | data.go.kr 상세 페이지 「제공형태」 줄(claude.ai 2026-11-12 · Claude Code 같은 날 15143827 · 15134735 다시 봄) · 낱말 「주소」 · 「도로명」 · 「좌표」 · 「든든전세」 | 후보 9(juso) · 11 · 6a |
| 찾지 않은 것 | — | 도시근로자 월평균소득 API · 국토부·LH 보도자료 · 경기데이터드림 · 서울 열린데이터광장 | 다음 정기 조사 |

## 정기 조사

- **주기**: 분기 1회 + 계기형 넷 — ① 새 원천을 붙일 때 ② 수집 실패(점검 이슈 · 응답 꼴 바뀜) ③ S단계를 열 때 ④ 공고문이 우리가 안 읽는 곳을 가리킬 때(예: 2026-10-21 전북 매입 공고문 「후순위 공급대상주택 목록 … 공지사항 - 매입임대에 게시」 → 원천 13).
- **다음 조사일**: **2027-01-21**(💡 외부 도구 행 「다음 재검토」와 같은 날).
- **체크리스트** — 결과는 이 파일의 표를 고쳐 쓰고 「마지막 확인」을 그날로 바꾼다.
  1. data.go.kr 기관별 API 목록 — LH(`B552555`) · 국토교통부(`1613000`) · 한국부동산원 · 지방공사: 새 API · 수정일.
  2. 지금 쓰는 API의 활용가이드 날짜(위 표 「활용가이드 날짜」와 대조 — 달라졌으면 가이드를 열어 바뀐 칸을 본다).
  3. 서비스키 활용신청 목록 · 만료(data.go.kr 키는 하나 — 후보 표 머리 · 신청 안 된 API는 403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` · LINK 꼴은 원 사이트 키라 따로 본다: juso · HUG).
  4. [`network-allowlist.md`](network-allowlist.md) — 후보가 쓰는 도메인이 「예정」 줄에 있는가.
  5. 해마다 고시 — 기준 중위소득(7~8월 결정 · 12월 넣기) · 도시근로자 월평균소득 기준표 · 공급 규칙 개정.
  6. 지금 쓰는 호스트(원천 6 · 7 · 14 · `fetch-attachment` 허용 호스트)의 `robots.txt` · 이용약관 — 받는 경로가 새로 `Disallow`됐거나 약관이 영리 이용을 묶었는지(2026-11-05 LH `lhFile.do` 계기 · 바뀌었으면 그 경로 자동 접근을 멈추고 회신 ②).
- **비용 가늠**: 2026-10-21 조사 회차 — data.go.kr 페이지 약 35 · API 시험 6호출 · 반나절 이하.

## 고칠 때

- 🔴 **새 원천 조사 순서**(2026-10-28 — GH 조사 검증 ⑦-1 채택 · 2026-10-26 GH 조사가 robots보다 페이지를 먼저 받았고 첨부 호스트가 따로인 것을 늦게 알았다):
  1. 그 호스트의 `robots.txt`를 **첫 요청**으로 — 막는 경로는 받지 않는다(받았으면 내용을 읽지 않고 지우고 회신 ②).
  2. 목록 — 식별자가 게시글 ID인지 페이지 안 행 번호인지 실물 HTML로(SH seq · GH `data-pbancNo` 선례).
  3. 첨부 호스트 판별 — 목록·상세와 다른 호스트면 그 호스트의 robots와 허용 목록([`network-allowlist.md`](network-allowlist.md))을 따로 본다.
- 원천을 더하거나 빼는 PR은 이 표를 같은 PR에서 고친다(줄 번호는 다시 매긴다).
- 키를 바꾸면(이름 · 신청 API) 「키」 칸과 체크리스트 3을 함께 본다. 값은 어디에도 적지 않는다.
- 포털 표시가 바뀌면(이용허락 · 가이드 날짜) 그 칸만 고치고 「마지막 확인」을 그날로.
