# 2026-11-23 — 코드·운영 — 열째 묶음: 세대 시군구 점검 둘을 하나로 · 같은 물음 점검 중복 검사

우편함 같은 이름 · 사용자에게 보이는 변경 0 · DB 쓰기·DDL 0.

- **세대 시군구 점검 하나로**: 여덟째 묶음(#1222)이 이미 있던 `unit_sigungu_unknown`(2026-11-04)과 같은 물음의 `unit_sigungu`를 또 만들었다 — `unit_sigungu` 걷음(health-ops 항목 88 → 87). 기존 항목으로 옮긴 것: 예외 정본 `.github/health/unit-sigungu.json`(코드 상수 `UNIT_SG_EXCEPT` 걷음 · 양산 …19919 · 세종 · 까닭 한 줄씩) · 경계 대조를 세대 행 시·도별로(옛 시·도 이름은 `index.html` `ZF_SIDO_ALIASES`를 읽음 — 사본 0) · 판정 `unit-sigungu.mjs` `judgeUnitUnknown`. 단위 (공고, 이름) · ⚠️ 그대로. 전후 같은 DB 값으로 같은 결과(공고 행 이름에 없는 후보 8 · 경계에도 없는 것 1 = 양산 예외 · 그 밖 0). 시험 11/11.
- **같은 물음 중복 검사**: `scripts/ops-name-overlap.mjs`(+ 시험 8/8) — base에 없던 `ops-check.mjs` 새 항목 이름이 기존 이름과 핵심 낱말 넷 이상 ∧ 비율(자카드) ≥ 0.8이면 ⚠️(경고만). PR check 「문서 검사」(`scripts/doc-check.sh` ⑤)가 부른다. 「넷 이상」만이면 지금 main 쌍 13이 걸려(일부러 나란히 둔 LH/MYHOME · 홍보물/이미지 · simulate 짝 — 비율 최대 0.75) 비율 조건을 더했다. #1222 재현 = 7낱말 · 0.88로 잡힘 · 지금 main 거짓 경보 0.
- `docs/ops-check-backlog.md` 39위 판정 칸 · 42위 줄.
