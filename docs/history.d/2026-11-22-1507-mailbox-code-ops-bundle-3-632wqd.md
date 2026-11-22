# 2026-11-22 — 코드·운영 다섯째 묶음 ②: 지도 렌더 route 도우미

- 우편함 「코드·운영 — 다섯째 묶음」 3 · #1200 회신 ② 방법(카카오 SDK 등록 도메인 밖 렌더).
- `scripts/render-kkokzip-route.mjs` `routeKkokzip(page)`: `https://kkokzip.com` 같은 출처 요청 → 저장소 파일(없으면 404 · 배포본으로 안 나감) · `usage_events` 201 · `submit-feedback`·`save-user-profile`·`delete-account` 403. 명령 줄 `--id` 로 상세 지도 조각 수 · 주소 좌표 출처 줄 · 콘솔 오류를 한 줄 JSON.
- 실측(컨테이너 · 가지 = main 5757e4a): …20357(390) 지도 조각 9 · 출처 줄 보임 · 오류 0 / …21089(1280) 조각 9 · 줄 없음 · 오류 0 · 같은 출처 놓침 0 · 운영 쓰기 0.
- 사용법 한 줄: `CLAUDE.md` 원칙 26.
