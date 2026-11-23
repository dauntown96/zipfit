# 2026-11-23 — 코드·운영 열다섯째 A장(작은 운영 일) — 첫 PR(EF·로더·점검·렌더 도구 · 칸 DROP 은 다음 PR)

우편함 같은 이름 · 사용자에게 보이는 변경 0(로더는 오늘 표 그대로 2026).

- **1 중위소득 로더**(`index.html` `loadMedianIncome`): 「가장 큰 standard_year」 → 「올해(KST) 이하 연도 중 1~8인 완비인 가장 큰 해」. 같은 표를 읽는 곳은 이 로더 하나(추천·진단 모두 `_medianIncome`). 도시근로자 로더는 그대로. 시험(대역 · 지금 DB 행 + 가짜 2027): 오늘 → 2026(4인 6,494,738 같음) · 2027-01-01 00:00 KST → 2027 · 하루 전 23:59:59 → 2026 · 2027 7인만 → 2026. `sw.js` v333.
- **2 marketing_alert(첫 절반)**: EF `save-user-profile` `PROFILE_COLUMNS`·`FIELD_MAP`에서 키 뺌(GET 이 칸을 읽어 DROP 전에 배포가 먼저). 칸 DROP 은 다음 PR(다운님 확인 2026-11-23 — 「DROP 진행」).
- **3 재생산 불가 표 30분 알림**: 마이그레이션 `2026-11-23_04_irreplaceable_drop.sql` — `zipfit_ops.irreplaceable_counts`(스냅숏 · 2일) · `zipfit_ops.irreplaceable_drop_record(jsonb)`(23표 count · 직전 스냅숏 대비 감소 · 그 사이 `intended_drops` 합 · 어긋난 표 수). health-ops `irreplaceable_drop`(⚠️ 안 멈춤) · `lib.mjs` `RECORD_FNS`에 한 줄.
- **4·5 health-ops**: `round_chain_unanalyzed` ℹ️ · `product_without_analysis` ℹ️ · `recheck_wait_max`(> 60분 ⚠️). 첫 값(로컬 읽기 4.9초): 0/11(열린 97) · 10 · 끝나지 않은 몫 0.
- **6 렌더 도구**: `scripts/render-kkokzip-route.mjs` — ESM import 실패 시 CJS 해석(NODE_PATH)으로 물러남 · 링크 없이 돎(…21063 390 · 지도 조각 2 · 콘솔 오류 0).
