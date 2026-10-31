# 데이터 원천 — 무엇을 어디서 어떤 길로 받는가

> 2026-10-21 신설 (우편함 「코드·운영 — 문서만: docs/data-sources.md 신설 …」 · 근거 조사 「① 매칭이 없는 순위 기회 … ② 추가 API·연동·장치 조사 + 정기 조사 설계 …」 회신 ② · claude.ai 검증 채택 2026-10-21).
> 왜: 원천이 13줄을 넘어 Notion 행으로 나누면 대조가 어렵다. LH 공지 목록 API는 2026-10-14 허용 목록 표에 「LH 공지 API(곧)」로만 적혀 있었는데 2026-10-21에 지금 키로 바로 열렸다 — 「이미 있는 API를 모름」을 이 표 한 장과 정기 조사로 막는다.
> 🔴 **이 표가 원천의 정본이다.** 키는 **이름만** 적는다(값 0). 이용허락은 **포털 표시 그대로**, 표시가 없으면 「표시 없음」. 「마지막 확인」은 이 표의 그 줄을 실물(코드 · 포털 · 실호출)로 다시 본 날이다.
> 도메인이 열렸는지는 여기 적지 않는다 — [`network-allowlist.md`](network-allowlist.md)가 정본이다. 수집 시각·판정 조건 같은 구현 사실은 Notion ⑩이 정본이다.

> 🔴 **새 원천(호스트) 조사 순서 — robots가 첫 요청**(⑦ 3-2 사본 · 2026-10-26 claude.ai · GH 조사 — 어긋나면 ⑦이 이긴다)
> 1. 새 호스트를 조사·수집·점검으로 열 때는 ① `robots.txt` → ② 목록 → ③ 첨부 호스트 판별 순서다.
> 2. robots가 막는 경로는 자동 접근 0이다(Claude Code 세션 · 루틴 · EF · claude.ai Playwright 모두). 사람(다운님)의 브라우저 열람은 해당 없다.
> 3. 계기: GH 조사에서 조사 세션과 claude.ai가 둘 다 `www.gh.or.kr`(robots `Disallow: /`)을 robots보다 먼저 열었다. robots가 특정 봇(예: `Googlebot`)에만 규칙을 두면 우리 UA(`ZipFitBot`)에는 막는 경로가 없다 — 그 사실을 그 호스트 줄에 적는다(광주 `www.gmcc.co.kr` 2026-10-26).

## 지금 쓰는 원천

「받는 길」: API · HTML(긁기) · 바이트(첨부 받기) · 파일(빌드) · SDK(브라우저) · 손 입력. 「주기」는 pg_cron 잡 이름 — 시각은 `cron.job` 조회로 본다(UTC 등록).

| # | 원천 | 받는 길 | 코드 위치 · 주기 | 키(이름) | 이용허락(포털 표시) | 활용가이드 날짜 | 마지막 확인 |
|---|---|---|---|---|---|---|---|
| 1 | LH 분양임대공고문 조회 — data.go.kr [15058530](https://www.data.go.kr/data/15058530/openapi.do) · `B552555/lhLeaseNoticeInfo1` | API | EF `collect-announcements` `fetchNoticeList` · 잡 `zipfit-collect-announcements`(+ `-warmup` · `-night`) | `LH_API_KEY`(EF 비밀값) | 이용허락범위 제한 없음 | 20260708(`OpenAPI활용가이드_…_분양임대공고조회_20260708.docx`) | 2026-10-21 |
| 2 | LH 분양임대공고별 상세정보 조회 — [15057999](https://www.data.go.kr/data/15057999/openapi.do) · `B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1` | API | 같은 EF(상세조회 캡 90) | `LH_API_KEY` | 이용허락범위 제한 없음 | 20260616 | 2026-10-21 |
| 3 | 국토교통부 마이홈포털 공공주택 모집공고 조회 — [15108420](https://www.data.go.kr/data/15108420/openapi.do) · `1613000/HWSPR02/rsdtRcritNtcList` | API | 같은 EF `fetchMyHome` | `LH_API_KEY`(같은 서비스키) | 이용허락범위 제한 없음 | 페이지에서 가이드 파일명을 못 읽음(포털 수정일 2026-07-14) | 2026-10-21 |
| 4 | LH 마이홈포털 기존임대주택 목록 5종 — 영구임대 [15084928](https://www.data.go.kr/data/15084928/fileData.do) · 행복주택 [15084930](https://www.data.go.kr/data/15084930/fileData.do) · 장기전세 [15084929](https://www.data.go.kr/data/15084929/fileData.do) · 50년임대 [15084925](https://www.data.go.kr/data/15084925/fileData.do) · 국민임대 [15084926](https://www.data.go.kr/data/15084926/fileData.do) | API(파일데이터의 `api.odcloud.kr` 변환 API · `uddi:` 경로) | EF `collect-rental-stats` · 잡 `zipfit-collect-rental-stats`(주 1회) | `ODCLOUD_API_KEY` | 이용허락범위 제한 없음 | 파일데이터라 가이드 없음 · 포털 파일명 날짜 20260413(코드 상수 `SOURCE_UPDATED_AT` = 2026-05-14) | 2026-10-21 |
| 5 | 국토교통부 아파트 전월세 실거래가 — [15126474](https://www.data.go.kr/data/15126474/openapi.do) · `1613000/RTMSDataSvcAptRent` | API | 코드 없음 — 분석 회차가 컨테이너에서 손으로 부른다(`CLAUDE.md` 컨테이너 환경 메모) | `MOLIT_RENT_API_KEY`(컨테이너 환경변수) | 이용허락범위 제한 없음 | 날짜 없는 기술문서(`아파트 전월세 실거래가 자료 기술문서.hwp` · 포털 수정일 2026-07-29) | 2026-10-21 |
| 6 | LH 청약센터 공고 페이지 · 첨부 · 매입 홍보물 · 단지 이미지 탭 — `apply.lh.or.kr` | HTML · 바이트 | EF `check-source-pages`(잡 `zipfit-check-source-pages`) · `collect-lh-promo`(잡 `zipfit-collect-lh-promo`) · `collect-lh-images`(잡 `zipfit-collect-lh-images`) · `fetch-attachment`(허용 경로 `/lhapply/` · `/upload/Files/`) | 없음 | 표시 없음 | — | 2026-10-21 |
| 7 | SH 서울주거포털 공고 목록 — `housing.seoul.go.kr` | HTML(robots 전면 허용 — 2026-08-19 확인) | EF `collect-sh-announcements`(잡 `zipfit-collect-sh-announcements`) · `check-source-pages` `parseShList`(잡 `zipfit-check-source-pages-new-sh`) · `fetch-attachment` | 없음 | 표시 없음 | — | 2026-10-21 |
| 8 | SH 게시판 후속 공지 — `www.i-sh.co.kr` | HTML · 바이트 | EF `check-source-pages` `parseShBoard` · `matchFollowups` · `fetch-attachment` | 없음 | 표시 없음 | — | 2026-10-21 |
| 9 | 지방공사 게시판 — 부산도시공사 `www.bmc.busan.kr` · 경북개발공사 · 경남개발공사 | HTML · 바이트 | 부산: EF `fetch-attachment` `SEOUL_ONLY`(서울 지역 실행) · 경북·경남: 분석 회차가 DB `net.http_get`으로 본문만(코드 없음) | 없음 | 표시 없음 | — | 2026-10-21 |
| 10 | 카카오 지도 SDK · 지오코더(`libraries=services`) | SDK(브라우저) | `index.html` 21행 · `kakao.maps.services.Geocoder` | 공개 JS 앱 키(`index.html`에 실림 · 도메인 제한 — 비밀값 아님) | 카카오 약관(포털 표시 해당 없음) | — | 2026-10-21 |
| 11 | 행정동 경계 — 국가데이터처 SGIS → `vuski/admdongkor` `ver20260701` | 파일(빌드) | `scripts/geo-build.py` → `geo/kr-2026-07.json` · 화면 캡션 `ZF3_GEO_SRC` | 없음 | 공공누리 1유형(SGIS) · CC BY 4.0(가공판) — 화면 캡션에 표시 | — | 2026-10-21 |
| 12 | 기준 중위소득(보건복지부 고시 제2025-135호 · 2026년) · 도시근로자 가구원수별 월평균소득(LH청약플러스 임대가이드 · 2025년) | 손 입력 | DB 표 `median_income_monthly`(2026 · 8행 · `checked_on` 2026-09-18) · `urban_worker_monthly_income`(2025 · 8행 · 2026-09-11) | 없음 | 고시·기준표(포털 표시 해당 없음) | — | 2026-10-21 |
| 13 | LH 청약센터 공지사항(후속 공지 — 후순위 접수 여부 · 공급대상주택 게시) | **받는 장치 없음** | — | — | — | — | 2026-10-21 — 후보 1·2로 받을 길이 있다 |

### 원천이 아닌 바깥 연결 — 운반 · 저장(참고)

원천 표에 넣지 않는다. 데이터를 만들지 않고 옮기거나 둔다.

| 연결 | 쓰는 곳 | 키(이름) |
|---|---|---|
| Google Drive(분석 원문 보관 · 카드 썸네일) | EF `fetch-attachment` `mode=upload` · `index.html` `drive.google.com/thumbnail` | `GDRIVE_CLIENT_ID` · `GDRIVE_CLIENT_SECRET` · `GDRIVE_REFRESH_TOKEN` · `GDRIVE_ROOT_FOLDER_ID` |
| Supabase(DB · EF · Vault) | 전부 | `SUPABASE_SERVICE_ROLE_KEY` · Vault `cron_secret_v2` · `zipfit_routine_fire_url` · `zipfit_routine_fire_token` · `github_actions_dispatch_token` |
| GitHub Actions(점검 · 백업 · 배포) | `.github/workflows/` | Actions Secret `SUPABASE_ACCESS_TOKEN` 등 |

## 후보 — 쓸 시점이 정해진 것

조사 회신 ②(2026-10-21) 후보 표에서 옮겼다. 「이 회차 재확인」 칸은 이 표를 만들며 포털·실호출로 다시 본 것만 적는다 — 나머지는 조사 회신의 확인(2026-10-21)이다. 한도는 포털 「개발계정」 일 트래픽.

| 후보 | 받는 꼴 · 한도 · 인증 | 이용허락 | 잇는 일 | 쓸 시점 | 다운님 손 | 이 회차 재확인(2026-10-21) |
|---|---|---|---|---|---|---|
| 1. LH 청약센터 공지사항 목록 조회 — [15058222](https://www.data.go.kr/data/15058222/openapi.do) · `B552555/lhNoticeInfo1/getNoticeInfo1` | JSON — 유형 · 제목 · 담당본부 · 게시일 · 상세 URL · `BBS_SN` · 기간(`SCH_ST_DT`~`SCH_ED_DT`) · 10,000 · 서비스키 · 자동승인 | 이용허락범위 제한 없음 | 후순위 접수 여부 · 공급대상주택 게시(원천 13) · LH 상태(`PAN_SS`)를 믿을지의 판단 재료 | S0(판단 재료) · 수집은 S1 | 없음(이미 됨) | 포털 가이드 20210810 · 컨테이너 `MOLIT_RENT_API_KEY`로 **HTTP 200**(10-14~21 창 `ALL_CNT` 28) |
| 2. LH 청약센터 공지사항별 상세정보 조회 — [15058449](https://www.data.go.kr/data/15058449/openapi.do) · `lhNoticeDtlInfo1/getNoticeDtlInfo1` | 상세 내용 · 첨부 목록 · 10,000 · 자동승인 · 대안: 목록의 상세 URL(HTML GET 200) | 이용허락범위 제한 없음 | 같음 — 공지 본문 · 첨부(공급대상주택 목록) | S1 | 활용신청 1회(자동승인) | 포털 가이드 20210810 · 같은 키 **HTTP 403** `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(활용신청 안 됨) |
| 3. LH 분양임대공고별 공급정보 조회 — [15056765](https://www.data.go.kr/data/15056765/openapi.do) · `lhLeaseNoticeSplInfo1` | 주택형 · 필지 · 상가호 목록 · 10,000 · 코드값(`SPL_INF_TP_CD`)은 가이드로 맞춰야 함 | 이용허락범위 제한 없음 | 세대 행 자동화 · 매입 공급대상주택 목록이 나오는지 미확인 | S1 | 없음 | 포털 가이드 20260202 |
| 4. 한국부동산원 청약홈 분양정보 15098547 · 경쟁률 15098905 | 40,000 · 운영 심의승인 · `api.odcloud.kr` | 이용허락범위 제한 없음 | L1 「분양 보류」 | S4 | 활용신청(심의) | 안 봄 |
| 5. 마이홈 예비입주자 대기현황 15108378 | 1,000 · 자동승인 | 이용허락범위 제한 없음 | 매칭 「대기 순번」 | S4 | 활용신청 | 안 봄 |
| 6. 마이홈 공공임대 단지정보 15110581 · LH 공공임대 단지정보 15058476(`data.myhome.go.kr` `rentalHouseList`) | 단지명 · 주소 · 준공 · 세대수 · 공급유형 · 기본 금액 · 1,000 | 이용허락범위 제한 없음 | 지도 핀 정확도 · 단지 정보 | S1 | 활용신청 · 허용 목록 | 안 봄 |
| 7. 인천도시공사 분양임대 공고문 15149725 · 공급대상·실적 15168460 | 1,000 · 운영 심의승인 | 공고문 칸 미표시 · 실적 제한 없음 | 국면 B′ ③ 지방공사 | S1 | 활용신청 | 안 봄 |
| 8. 전북개발공사 임대아파트·보증금 15056567 · 주택분양 15062034 | 단지·보증금(공고 아님) · 10,000 | 이용허락범위 제한 없음 | 지방공사 단지 금액 | S4 | 활용신청 | 안 봄 |
| 9. 행정안전부 실시간 주소별 좌표정보 15056663 · 주소 검색 15057017(`business.juso.go.kr`) | juso 승인키 | 이용허락범위 제한 없음 | 지도 핀 정확도 · 세대 행 법정동 | S1 | juso 키 신청 · 허용 목록 | 안 봄 |

### 없음 — 찾은 축과 함께

🔴 한 번 검색 실패는 부재가 아니다. 축(어디서 · 무엇으로 · 언제)을 함께 둔다.

| 찾은 것 | 결과 | 축 | 잇는 일 |
|---|---|---|---|
| 지방공사 「공고」 API — GH · SH · 부산 · 대구 · 경북 · 경남 · 충남 · 광주 · 대전 · 강원 · 충북 · 울산 · 제주 | 없음 | data.go.kr 목록 검색 · 기관명 키워드 · 「주택·임대·공고」 낱말(2026-10-21) — 대전·부산은 「임대현황」만 · SH는 웹검색에서 청년안심주택 공급계획·주택관리현황 파일만. ⚠️ 경기데이터드림 · 서울 열린데이터광장은 찾지 않았다(「찾지 않음」이지 「없음」이 아니다) | 국면 B′ ③ |
| 기준 중위소득 API | 없음 — 고시 문서뿐 | data.go.kr API 검색 「기준 중위소득」 → 아이돌봄 소득기준 등만 · 웹검색(2026-10-21). 2027년 값은 2026-07-28 결정 보도 | 원천 12 — 12월에 2027 넣기(점검 「해마다 바뀌는 밑값」이 1/1부터 ⚠️) · S1 |
| 찾지 않은 것 | — | 도시근로자 월평균소득 API · 국토부·LH 보도자료 · 경기데이터드림 · 서울 열린데이터광장 | 다음 정기 조사 |

## 정기 조사

- **주기**: 분기 1회 + 계기형 넷 — ① 새 원천을 붙일 때 ② 수집 실패(점검 이슈 · 응답 꼴 바뀜) ③ S단계를 열 때 ④ 공고문이 우리가 안 읽는 곳을 가리킬 때(예: 2026-10-21 전북 매입 공고문 「후순위 공급대상주택 목록 … 공지사항 - 매입임대에 게시」 → 원천 13).
- **다음 조사일**: **2027-01-21**(💡 외부 도구 행 「다음 재검토」와 같은 날).
- **체크리스트** — 결과는 이 파일의 표를 고쳐 쓰고 「마지막 확인」을 그날로 바꾼다.
  1. data.go.kr 기관별 API 목록 — LH(`B552555`) · 국토교통부(`1613000`) · 한국부동산원 · 지방공사: 새 API · 수정일.
  2. 지금 쓰는 API의 활용가이드 날짜(위 표 「활용가이드 날짜」와 대조 — 달라졌으면 가이드를 열어 바뀐 칸을 본다).
  3. 서비스키 활용신청 목록 · 만료(키마다 어느 API에 신청돼 있나 — 후보 2처럼 신청 안 된 API는 403).
  4. [`network-allowlist.md`](network-allowlist.md) — 후보가 쓰는 도메인이 「예정」 줄에 있는가.
  5. 해마다 고시 — 기준 중위소득(7~8월 결정 · 12월 넣기) · 도시근로자 월평균소득 기준표 · 공급 규칙 개정.
- **비용 가늠**: 2026-10-21 조사 회차 — data.go.kr 페이지 약 35 · API 시험 6호출 · 반나절 이하.

## 고칠 때

- 원천을 더하거나 빼는 PR은 이 표를 같은 PR에서 고친다(줄 번호는 다시 매긴다).
- 키를 바꾸면(이름 · 신청 API) 「키」 칸과 체크리스트 3을 함께 본다. 값은 어디에도 적지 않는다.
- 포털 표시가 바뀌면(이용허락 · 가이드 날짜) 그 칸만 고치고 「마지막 확인」을 그날로.
