# 2026-11-22 — 코드·운영 넷째 묶음: 화면 점검 메모리 조사 · 첨부 sha 표 · 점검 고침 둘 · 순위 17·19

- 우편함 「코드·운영 — 넷째 묶음: 0장 화면 점검 메모리 조사 · 첨부 (공고, fileid) 내용 sha 표 · 점검 작은 고침 둘 · 순위 17·19」.
- 0장(조사만): 화면 점검 한 회차 ≈ 5분 · REST 1,377~2,027건(usage.api-counts) · 페이지 12번 열기 × 약 45호출 · 목록 RPC 응답 2.0MB(1,000행 상한 → offset 이어 받기 한 번 더). 메모리 바닥 여섯 번 모두 회차 창 안 · 처방 셋은 표시층 파일이라 제안만(회신).
- A: 표 `public.attachment_content_sha`(공고, LH fileid, sha256, bytes) · RPC `attachment_sha_put`(EF `fetch-attachment`가 문지기 허락 받기 ok 뒤 부름) · `attachment_change_candidates()`가 「새 fileid · 내용 같음」을 뺌 · 갤러리 기록에서 2,634짝 소급(새로 받기 0) · 켜기 칸 거짓 그대로. 마이그레이션 `2026-11-22_03_attachment_content_sha.sql`.
- B: `income_table_rows` 한 행 안 표 둘을 머리 줄에서 끊어 셈(SH_313610 ⚠️ → ℹ️) · `host_probe_tick` 관측 밖 호스트 7일에 한 번만(21 → 18) — 마이그레이션 `2026-11-22_04_host_probe_skip_out_of_scope.sql`.
- C: health-ops `privacy_match` ⚠️(`.github/health/privacy-match.mjs` — 이벤트 키 · 칸 · 호스트 ↔ 처리방침 · 시행일 전 v2 키) · 첫 값 0.
- D: 「오늘」 날짜 축 전수(서울 DB TimeZone UTC) — 불변식 v3.30(V10c·V16 KST) · 페르소나 점검 `timezoneId: 'Asia/Seoul'`.
