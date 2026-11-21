# 2026-11-21 — 코드·운영 첫 묶음 ① 분석 뒤 첨부 변경 발송기 후보 · [정정N] 업로드 · 현장 경로 target_text 칸

- 마이그레이션 `2026-11-21_01_attachment_change_dispatch`: `analysis_dispatch_config.attachment_change_enabled`(기본 거짓) · 새 함수 `attachment_change_candidates()`(get_reanalysis_queue 「분석 뒤 첨부 변경」 조건 + apply_end ≥ 오늘 KST · 키 `묶음 키 #첨부 마지막 변경 시각`) · `analysis_dispatch_tick` 다섯째 후보 acand(켜기 칸 참일 때만 · 일반·정정본·차수 후보가 먼저).
- 마이그레이션 `2026-11-21_02_apply_routes_target_text`: `announcement_apply_routes.target_text text`(칸만 · 쓰기 0 · 권한·정책 그대로).
- EF `fetch-attachment` upload: `on_dupe` 기본 `revise` — 같은 이름 · 다른 내용이면 `[정정N] 원래이름`으로 올림(분할 경로는 올린 파일 이름을 바꿈) · 같은 내용의 `[정정k]` 가 있으면 새로 안 올림 · `skip`·`replace`는 종전.
- 되돌리기 전용 시험(관리 API): 지금 열린 후보 0 · 닫힌 사례 …20959 apply_end 를 오늘+5 로 두면 후보 1(키 `… #첨부 2026-10-27 15:01`) · 켜기 칸 참 + 발송 스위치 끔으로 tick → 대기열 #첨부 1행 · 발송 0.
- `docs/ops-check-backlog.md` 37(고정본 열쇠 호스트 빼기) · 38(상태판 「마지막 자리」 칸).
- 데이터 쓰기: `secret_expiry_external` Supabase 토큰 줄 `expires` 2026-11-27 · basis(덧 2).
- 우편함 「코드·운영 — 첫 묶음」 A 1·3 · B · C2 · 덧 2.
