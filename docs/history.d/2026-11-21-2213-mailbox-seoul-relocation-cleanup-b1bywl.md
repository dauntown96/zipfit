# 2026-11-21 — 코드·운영 둘째 묶음 ① 운영 점검 예비 schedule 관문 · 지방공사 호스트 매일 관측

- `.github/workflows/health-ops.yml`: 새 job `gate` — schedule(예비 `40 */2`) 실행만 「40분 안에 workflow_dispatch 회차가 시작됐으면 건너뜀」(GitHub API · `actions: read`). dispatch·수동은 늘 돈다 · pg_cron 이 멈춘 날은 예비가 그대로 돈다. 계기: 12:40Z 예비가 12:57Z에 떠 12:55Z 발송 회차와 2분 차(run 44906244112 · 44906420669).
- 마이그레이션 `2026-11-21_03_host_probe_daily`: 표 `zipfit_ops.host_probe_log`(GRANT 0 · (run_date, host) 하나 · 90일) · 함수 `zipfit_ops.host_probe_tick()`(거두기 → 오늘 첫 호출이면 호스트마다 `fetch-attachment ?mode=host_probe` 한 번 · 상태·형식만 적음) · cron `zipfit-host-probe` '7,37 1 * * *'(KST 10:07·10:37). 하루 EF 호출 21 · 바깥 요청 ≤ 42 · 하루 21행.
- `docs/cron-jobs.sql` 사본 · `ops-check.mjs` `EXPECTED_JOBS` 에 `zipfit-host-probe` · `docs/ops-check-backlog.md` 13위 판정.
- 데이터 쓰기: `secret_expiry_external` Supabase 줄 → 「Supabase 관리 API 토큰(scoped · kkokzip · 2026-11-21)」 · 2027-11-20(0장).
- 우편함 「코드·운영 — 둘째 묶음」 0장 · A · B.
