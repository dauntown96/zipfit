# 2026-11-24 — 코드·운영 열여섯째 묶음: 선순위 마감 공지 감지 · A장 저장 경로 시험 · health-ops ℹ️ 셋 · 「금회 한정 순위」 조사 · ② 표 · 주거 사전 재계산

- 우편함: 「코드·운영 — 열여섯째 묶음: 선순위 마감 공지 감지 · A장 저장 경로 시험 · health-ops ℹ️ 둘 · 「금회 한정 순위」 조사 · ② 표 두 줄 · 주거 사전 재계산 — 병합까지(index.html 0)」.
- 1 선순위 마감 공지 감지(마이그레이션 `2026-11-24_01_lh_cutoff_notice`): `wave_cutoff_targets()`(카드·창은 `wave_notice_targets()` 그대로 · 앞 창 끝 = 그 카드 경로 행 중 이 창 시작 전 끝의 최댓값 · ⚠️ 선순위 마감 행 있으면 뺌) · 순수 맞춤 `lh_cutoff_notice_pick()`(매입임대 ∧ 같은 본부 ∧ 앞 창 끝 < 게시일 < 이 창 시작 ∧ 제목 「YY년N차」·유형 낱말 토막 ∧ 「모집」 ∧ 마감·받지·접수하지 ∧ 당첨자·결과·대상주택·연기 등 없음) · 표 `lh_cutoff_notice_matches` · `lh_notice_run_log` 칸 `cutoff_targets`·`cutoff_matched` · `lh_notice_ingest`가 같은 공지 목록으로 함께 맞춤. EF `collect-lh-notices`는 대상이 있으면 받는 창을 앞 창 끝 다음 날(오늘−35 하한)부터로 넓힘 · 최대 5쪽. 🔴 대기열 0 — 새 갈래를 루틴 v2.24 · reverify v5.10이 모른다(아는 키 #정정 · #차수 · #첨부) · health-ops ℹ️ `lh_cutoff_notice`.
  - 시험: 공지 API 10-24~11-24 142건(매입임대 13) — …20972 bbsSn 9102432518만 맞음 · 같은 토막 대구경북 당첨자 발표 · 강원 공급대상주택 게시 · 인천 연기 · 경기북부 선착순 접수마감 안 맞음 · 지금 열린 차수 카드 …20882 새로 맞음 0.
- 2 A장 저장 경로: 시험 계정으로 배포본 저장 두 번(P1 → P2) — `save-user-profile` POST 200 ×2 · GET 되읽기 14칸 같음(md5 같음) · `marketing_alert` 칸 없음 · EF 로그 09:59~10:05 KST GET 200 11 · POST 200 6 · OPTIONS 200 3 · 오류 0 · 시험 계정 0(세 번 실행 모두 정리).
- 3 health-ops ℹ️: `analysis_row_misplaced`(첫 값 1그룹 …20331 — 기준선 2 중 …20365는 같은 날 분석 묶음이 풀음) · `income_pct_pair`(`.github/health/income-pct.mjs` · 시험 9 · 첫 값 1 = 20750 경북 5인 · 비율 줄 둘 이상 행 13).
- 4 「금회 한정 순위」 조사(쓰기 0) — 확정 한정 5공고(…21098 열림 · …20366 · …20625 · …20786 · …20874 닫힘) · 조건부(1순위 초과 시) 5 · 사후 공지 1(…20972) · 「예를 들면 … 접수하지 않고」 거짓 걸림 다수. …20874는 「금회모집은 1순위에 한합니다」인데 2순위 자격 행 3.
- 5 ② 「테이블별 역할」 — 실물 79(public 63 · zipfit_ops 16 — 뷰 넷 포함) 이름 대조 · 빠진 것 `intended_drops` · `irreplaceable_counts` 둘 + 이 PR 새 표 하나(Notion 쓰기는 병합 뒤).
- 6 주거 사전 재계산(10:05~10:09 KST · 기준선 11-18 10:29) — 49파일: 값·결론이 바뀜 5(conversion-rate-lh · income-baseline · permanent-group-ga-na · permanent-vacancy-wait · rent-per-sqm) · 같음 6 · 수만 늘어남 35 · 줄어듦 3(move-in-date · relaxed-recruitment · renewal-eligibility) · 기준선은 고치지 않음.
- `index.html`·`sw.js` 0 · DB 데이터 쓰기 0.
