# 2026-11-23 — 코드·운영 열넷째 묶음 뒤정리: 보안 권고 허용 목록에 listing_pending_rechecks 두 줄

- 병합(#1235) 뒤 health-ops 08:25 UTC 회차에 `sec_advisor` ⚠️(허용 목록 밖 새 지적) — 새 SECURITY DEFINER `listing_pending_rechecks()`를 anon·authenticated가 실행할 수 있다는 지적 둘(`anon_…` · `authenticated_security_definer_function_executable_public_listing_pending_rechecks_`). 의도(목록 RPC가 부름 · 공고 id·갈래만 · search_path 고정 — `listing_hidden_keys`와 같은 꼴)를 적어 `.github/health/security-allowlist.json`에 넣음. 관리 API로 다시 대조 — 지적 52 · 목록 밖 0.
- 원칙 15 「새 정의자 함수가 생기면 의도를 확인해 허용 목록에」를 #1235 같은 PR에서 하지 않아 생긴 ⚠️ 한 번이다.
