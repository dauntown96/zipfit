# 2026-11-25 — 코드·운영 스물두째: 화면 점검 문구 차례 · 30분 감소 짝 판정식 · 정렬 위 10장 · 고리 밖 같은 단지 ℹ️ · ㎡당 표 신선도

우편함 「코드·운영 — 스물두째: 화면 점검 phrase 순서(#1283) · 30분 감소 짝 판정식 · 점검 셋 · 고리 밖 같은 단지 ℹ️ · ㎡당 표 신선도 · 마케팅 칸 걷기 · 자리 어긋남 셈(조사)」. 본 PR #1290(squash `330bffa` · 11:27 KST) — 이 이력 파일은 그 PR 에서 빠져 뒤 PR 로 따로 냄. 화면 0 · `index.html`·`sw.js` 0.

- 1 화면 점검 「카드 문구 ↔ DB 상태」 — 기대 식을 화면 zfFillSummarySlots 차례(분석 중 → 가격 요약)로: `.github/health/phrase-expect.mjs`(phraseCaseSql · anaPendingSql — 정본은 화면) · ⑦-1a2 「분석 전 카드」도 같은 식(가격 유무 조건 걷음). 시험 `phrase-expect.test.mjs` 8/8(가짜 가격 요약 행 · 옛 식은 …21054 꼴을 「요약」으로 — 재현). #1283 의 두 카드는 그 뒤 분석이 붙어 풀려 있었고, 병합 뒤 수동 dispatch run 45533329948 ✅ 가 11:33 KST 에 #1283 을 닫았다.
- 2 30분 감소 짝 `zipfit_ops.irreplaceable_drop_record` — `v_led <> drop` → `drop > v_led`(마이그레이션 `2026-11-25_02_irreplaceable_drop_gt.sql` · 사본) · health-ops 이름·기준 글. 시험 `scripts/irreplaceable-drop-ledger.test.sh`(되돌리기 전용 · zipfit-backup #48 과 같은 세 꼴) — 옛 함수 2/3((가) 장부 2 · 감소 1 → 경보 1) → 적용 뒤 3/3. apply run 45533066870 성공.
- 3 점검 셋 — ① 세대 시군구 낯선 이름은 이미 있음(열째 묶음 `unit_sigungu_unknown`) ② 「모르는 값을 없다고」는 10-22 조사가 낸 두 줄이 이미 있음(health-ops `elig_form_null` · `rent_null` — 둘 다 0) ③ 새로 — health-screen `sort_top`(보증금·월임대료·전용면적·㎡당 정렬 위 10장 값 줄 = DB 가격 요약으로 따로 줄 세운 값 줄 · `sort-top.mjs` · 시험 6/6 · simulate `sort_top` · PR 브랜치 실측 어긋남 0).
- 4 health-ops ℹ️ `round_gap_same_site`(`round-gap.mjs` · 예외 `round-gap.json` 4 · 시험 5/5) — 첫 값 대상 0 · 마감 임박 10 · 고리 안 0 · 예외 4 · 쌍 14(국면 C (라) 2판 기준선과 같음 · 3.2초).
- 5 health-ops ⚠️ `rent_sqm_fresh` — `zipfit_ops.rent_sqm_quartiles` 마지막 채움 ≤ 70분 ∧ 행 > 0(첫 값 2분 · 90행).
- 6 마케팅 칸 — 이미 끝남(2026-11-23 열다섯째 A장 2 · 마이그레이션 `2026-11-23_05` 적용 · 칸 0 · FIELD_MAP 에 없음) · 이 회차 변경 0.
- 7 「자리 어긋남」 — 이미 있음(health-ops ㊸ `analysis_row_misplaced` · 지금 0그룹) · 대표 축 변형 셈만(분석 행 없는 대표 658 중 같은 묶음 다른 행에 분석 행 10 · 같은 회차 8 · 열린 0) — 회신 제안.
