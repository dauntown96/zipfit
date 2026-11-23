# 2026-11-23 — 코드·운영 — 여섯째 묶음: 처리방침 7절 백업 문장 사실대로 · 넓은 조회 ⚠️ · 막힌 좌표 채움 ℹ️ · 운영 점검 20·31위

우편함 같은 이름 · 사용자에게 보이는 변경 — 다운님 승인 2026-11-23 10:38(처리방침 7절 (가) 「사실대로 고치기」).

- **처리방침 7절 「서비스가 만드는 백업」** — `privacy.html`(11-29 판) · `docs/privacy/2026-11-21.html`(현행) 같은 자리: 「그 전 백업과 지금 백업의 운영 기록에는 운영자 본인의 정보만」 → 「그 전(2026년 10월 10일까지)의 백업에서 회원 정보 · 찜은 운영자 본인의 것뿐이지만, 그때까지의 서비스 이용 기록(세션 식별자 기준 · 이름이나 연락처는 없음)이 들어 있으며 비공개 저장소의 지난 기록으로 남아 있습니다」 + 보관 기간 문장. 두 판 「바뀌는 내용」 표에 한 줄씩. 0장 셈(zipfit-backup git 이력의 10-10 덤프 · `pgdumplib` · 값 출력 0): `usage_events` 4,521행 · 칸 7(`id`·`event`·`occurred_at`·`session_id`·`user_id`·`announcement_id`·`props`) · `props` 키 넷 `nav`·`tab`·`from`·`q`(검색어 원문 275행 · 최대 13자 · 이메일·전화·URL·6자리 넘는 숫자 꼴 0) · 세션 359 · `user_id` 찬 행 280 = 한 id(덤프 안 `user_profiles` 1행과 같음 · 운영자) · `saved_announcements` 0.
- **넓은 조회 ⚠️** — `.github/health/wide-fetch.mjs`(+ 시험 11/11) · health-ops `wide_fetch`: 쪽 나눔 없이 통째로 받는 자리 여섯(`zfLoadTierTags` 셋 · `zfEnsurePriceSummaries` · `zfLoadWinSched` · screen-check objRender) 행 수 ≥ max_rows × 0.8 → ⚠️(안 멈춤). max_rows = 관리 API `GET …/postgrest`(못 읽으면 상수 2000) · 함수 본문에 `offset=`이 들어간 자리는 저절로 대상 밖(표시층 회차와 병합 순서 무관). 지금 값 1,325 · 1,199 · 10 · 1,066 · 558 · 1,241 / 문턱 1,600 → 통과 · 문턱 0.6 시험에서 둘 뜸.
- **막힌 좌표 채움 ℹ️** — health-ops `geo_fill_blocked`: `complex_geo`에 없는데 시도 기록이 `picked`·`multi`인 주소 수 · 지금 0.
- **운영 점검 20·31위** — 둘 다 이 묶음에 넣지 않음(20 EF 넷 재배포 · 31 DB 함수 PR → 화면 PR 두 단계) · `docs/ops-check-backlog.md` 20위 판정 칸 한 줄.
- **덧(L0 ⑦)** — Notion ② 「테이블별 역할」: 실물 77(public 표 61 + 뷰 2 · `zipfit_ops` 표 12 + 뷰 2)과 이름 대조 → `attachment_content_sha` · `zipfit_ops.host_probe_log` 두 줄 더함 · 근거 머리 숫자 고침(표 이름 77 = 실물 77).
