# 2026-11-25 — 코드·운영 스무째: ㎡당 월세 시·도×유형 사분위(스냅숏 표 + 30분 cron · 읽기 RPC)

우편함 「코드·운영 — 스무째: ㎡당 월세 시·도×유형 사분위 RPC 하나(열린 + 닫힌 분석 1년 · 표본 n)」. 화면 0 · `index.html`·`sw.js` 0 · `get_announcements_deduped()` 변경 0 · 데이터 쓰기 0.

- 0장 실측(2026-11-25 · 관리 API 읽기): 그 자리에서 셈하면 목록 함수 360ms + 가격 요약(1,003건) 864ms ≈ 1.25초 → 「함수 하나」로는 목표(판 E 멈춤 1.4초의 1/10)에 못 닿고 화면을 열 때마다 서버 CPU 가 그만큼 더 든다 → 다운님 판정(같은 날) 「스냅숏 표 + 30분 cron」.
- 마이그레이션 `2026-11-25_01_rent_sqm_quartiles.sql`: 표 `zipfit_ops.rent_sqm_quartiles`(GRANT 0) · 채움 `zipfit_ops.rent_sqm_quartiles_refresh()`(목록 대표 · 마감 1년 안 · 취소공고 뺌 · 열림 = G2 식 · 닫힘 = 가격 요약 analysis_done · 값 = 가격 요약 rent_per_sqm_med 그대로(round_state current) · 유형 = housing_type_map std · 시·도 = ZF_SIDO_ALIASES 거울 · percentile_cont · 전국 행 = sido_nm NULL) · 읽기 `public.get_rent_per_sqm_quartiles()`(anon · 정의자 · 인자 없음) · cron `zipfit-rent-sqm-quartiles` '19,49 * * * *' · 첫 채움 한 번.
- 셈(같은 날 · 같은 정의 읽기 SQL): 묶음 89행 · 표본 382(열린 93 · 닫힌 289) · n ≥ 5 묶음 39 · JSON 약 12.5KB. 같은 시·도 비교로 서는 열린 카드 40(열린만 — 판 E 셈과 같음) → 77(닫힌 포함 · 판 E 75는 하루 앞 셈).
- 장치: `docs/cron-jobs.sql` 블록 · `ops-check.mjs` EXPECTED_JOBS · 보안 권고 허용 목록 두 줄(anon · authenticated) · 불변식 v3.32(allow_exec_funcs 에 get_rent_per_sqm_quartiles — 첫 check 가 V2 위반 0 → 1 로 빨강) · 시험 `scripts/rent-sqm-sido-sync.test.mjs`(SQL 시·도 바꿈 = 화면 ZF_SIDO_ALIASES).
