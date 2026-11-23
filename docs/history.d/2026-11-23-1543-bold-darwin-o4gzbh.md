# 2026-11-23 — 코드·운영 열두째 묶음: 백업 경보 「의도된 감소」 장부 · 부정 표지 밖 글자 주간 ℹ️

- A [zipfit] 장부 표 `zipfit_ops.intended_drops`(마이그레이션 `2026-11-23_02_intended_drops.sql` — 표 · 예상 감소 수 · 회차 · 메모 · 권한 0) + 쓰는 법 `docs/intended-drops.md`(정리 SQL 과 같은 요청에서 한 줄). 생존 신호 판정은 `zipfit-backup` `scripts/heartbeat_report.py`(감소 = 직전 신호 뒤 장부 합 → 🟡 · 다르거나 없음 → 🔴 · 재생산 불가 assert 그대로).
- B [zipfit] health-ops `neg_tail`(ℹ️ · 안 멈춤 · KST 월 10시대 앞 회차만) — 정책 원문 「못」·「안」 뒤 첫 글자 중 요점 검사기 부정 표지(`scripts/plain-check.mjs` `NEG_MARKERS` — 사본 0으로 내보냄)·기준선(`.github/health/neg-tail.json` · 2026-11-23 실측)에 없는 글자를 값 칸에. 「잘못」 뒤는 거름. 첫 값(로컬 실측) 기준선 밖 0 · 표지에 걸림 못 1,447 · 안 3 · 「잘못」 거름 326. 시험 `.github/health/neg-tail.test.mjs` 10/10.
- 우편함 「코드·운영 — 열두째 묶음: 백업 경보 「의도된 감소」 장부 · 부정 표지 밖 글자 주간 ℹ️」.
