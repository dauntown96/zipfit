# 2026-11-22 — 코드·운영 셋째 묶음 덧: 단지 좌표 대상 함수 SECURITY DEFINER

- 우편함 「코드·운영 — 셋째 묶음」 A — PR #1199 병합 뒤 첫 런(10:28 KST)이 `targets: permission denied for schema zipfit_ops`(바깥 호출 0 · 쓰기 0).
- 원인: `complex_geo_complex_targets`가 메모리 가용(`zipfit_ops.instance_metrics_log`)을 읽는데 부르는 역할 service_role에 `zipfit_ops` USAGE가 없다 — 되돌리기 전용 시험을 postgres로만 돌려 못 봤다.
- 고침: 마이그레이션 `2026-11-22_02_complex_geo_targets_definer.sql` — 그 함수만 SECURITY DEFINER(스키마 권한은 넓히지 않음 · 실행 권한 service_role 만 그대로) · 되돌리기 전용으로 `set local role service_role` 호출 확인(메모리 정상 · 다시 채움 20).
