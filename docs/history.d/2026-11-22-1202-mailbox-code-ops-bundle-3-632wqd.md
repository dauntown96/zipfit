# 2026-11-22 — 코드·운영 넷째 묶음 덧: 점검 ⚠️ 둘 바로잡기(cron 이름 집합 · 보안 권고 허용 목록)

- 우편함 「코드·운영 — 넷째 묶음」 — #1202 병합 뒤 11:55 KST health-ops 회차의 ⚠️ 둘이 이 세션 변경에서 나왔다.
- `cron_names`: 셋째 묶음(#1199)이 만든 `zipfit-complex-geo-fill-complex`가 `EXPECTED_JOBS`(ops-check.mjs)·`docs/cron-jobs.sql` 사본에 없었다 → 둘에 더함(명령 md5 60e7706a… = DB).
- `sec_advisor`: `rls_enabled_no_policy_public_attachment_content_sha`(#1202 새 표 — RLS 켜고 정책 0이 의도) → `security-allowlist.json` intended.
