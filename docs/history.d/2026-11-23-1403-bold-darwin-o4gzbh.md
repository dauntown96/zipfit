# 2026-11-23 — 코드·운영 — 아홉째 묶음: unit_sigungu 문턱 0 · backfill-kit 같은 공고 대상 밖 행 md5 · 지도 렌더 검증용 route 도우미

우편함 같은 이름 · 사용자에게 보이는 변경 0 · DB 쓰기·DDL 0.

- **unit_sigungu 문턱**: `.github/health/unit-sigungu.json` `warn_over` null → 0(claude.ai 판정 — 0 넘으면 ⚠️ · 안 멈춤 · health-ops-soft) · ops-check 이름·규칙 문구 · 시험 12/12(1이면 ⚠️ · null이면 ℹ️ · 정본 문턱 0).
- **backfill-kit `other_rows_same`**: 같은 묶음 칸(보통 `announcement_id`) 값을 가진 대상 밖 행 전체 md5가 반영 전후 같아야 한다. 시험 38/38(SQL 꼴) · 새 가짜 표 시험 `scripts/backfill-kit.pg-test.py` 7/7(컨테이너 PostgreSQL 16 임시 클러스터 — ① 그대로 통과·되돌림 ② 이웃 행을 바꾸는 트리거 → 「다른 행 가드 실패」·롤백 ③ 원문에 없는 값 → 원문 가드 ④ 닫힌 공고 → 열린 공고 가드 · 운영 0). 예시 계획에 `other_rows_same` 더함 · 실물 되돌리기 전용 시험 RESULT 21(쓰기 0).
- **route 도우미**: `scripts/render-kkokzip-route.mjs`는 11-22 다섯째 묶음에 이미 있음 — `--shot-map`(지도 상자와 출처 줄만) 더함 · 사용법에 「id는 목록 대표 id」. 실측: LH 대표 `2015122300021117` 지도 조각 9 · 주소정보 출처 줄 있음 · 콘솔 오류 0(MYHOME 묶음 구성원 id는 상세가 안 열림).
- `docs/ops-check-backlog.md` 3·39위 판정 칸 · 41위 줄.
