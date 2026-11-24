# 2026-11-24 — 코드·운영 열아홉째: 공개 이슈 토큰 지우기·가림 + 점검 route_cur 기대값

- 우편함: 「코드·운영 — 열아홉째: 공개 이슈에 찍힌 로그인 토큰 지우기·가림(보안 먼저) + 점검 route_cur 창 끝 시각 구멍 — PR까지」.
- 1 보안: 공개 저장소 이슈 검색(열림·닫힘) — 본문에 토큰 꼴 값 2(#1277 · #1184 — 로그인 흐름 page.goto 시간 초과 오류문의 1회용 로그인 확인 주소 `token=`) → 두 본문 편집(「토큰 가림」) · 댓글 75개 토큰 꼴 0 · PR 본문 0. 시험 계정은 실행마다 지워져 지금 0 · 세션 0 · 1회용 토큰 0 · 매직 링크 만료 1시간 → 값은 죽음. Actions 로그(실행 45351848234) 1줄 · DB `ops_health_findings.reason` 2행 같은 값 → DB 2행 가림(관리 API · 행 수 가드).
  - 막음: `.github/health/redact.mjs`(token=·access_token=·refresh_token=·apikey= · 「Bearer 」 뒤 토큰 글자 12자 이상 → `***`) — `lib.mjs` `report()`(결과 파일·요약·로그·작업 요약) · `recordFindings`(DB) · `screen-finish.mjs`(로그인 오류) · `issue.sh`(이슈 글 마지막 문 · python 같은 식) · `scripts/test-login.mjs` page.goto 오류문에서 링크를 「[가림]」으로. 시험 15 통과 · 실제 로그 다시 돌림: 화면 점검 419줄 중 바뀐 줄 1(토큰 줄) · 운영 점검 341줄 0.
- 2 route_cur: 원인은 창 끝 시각이 아니라 화면 `zfRouteGap` 규칙 — 첫 창 안 ∧ 창 둘 이상 ∧ LH ∧ 상태 「…마감」이면 다음 창(LH 가 첫 창 끝 16:00 직후 …21022 를 「접수마감」으로 바꿈). 기대값 SQL(route_cur · route_gap)에 같은 규칙(`ROUTE_LHC_SQL`) · `SIMULATE=route_cur_lh` 종전. 재현(20:2x KST 운영 데이터 · 배포본 화면): 종전 ❌ …21022(「다음 접수 11-25」 ↔ 기대 「이번 차수 오늘 마감」) → 고친 뒤 ✅ · route_gap 1 → 2장(…21022 더함) 어긋남 0.
- `index.html`·`sw.js` 0 · DDL 0.
