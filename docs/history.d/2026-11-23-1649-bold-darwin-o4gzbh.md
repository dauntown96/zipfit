# 2026-11-23 — 코드·운영 열넷째 묶음(단독 · 원칙 29): 목록 RPC에 「정정 몫 대기 중」 칸

우편함 같은 이름 · 화면 변경 0(화면이 읽는 것은 다음 표시층 판 — 원칙 13).

- 마이그레이션 `2026-11-23_03_deduped_recheck_pending.sql`:
  - `listing_pending_rechecks()` 신설 — SECURITY DEFINER · 분석 대기열(`analysis_dispatch_queue` · anon·authenticated GRANT 0 그대로)에서 끝나지 않은(state ∉ done·dropped) 재확인 몫(group_key ` #정정 ` · ` #첨부 ` · ` #차수 `)의 (공고 id, 갈래)만 낸다 · 권한 = `listing_hidden_keys()`와 같게.
  - `get_announcements_deduped` 끝에 칸 `recheck_pending text` — 카드 묶음(dedup_key) 구성원 중 몫이 있는 공고가 있으면 갈래 글자(둘 이상이면 쉼표), 없으면 NULL. 행 집합·다른 칸 그대로 · 반환형이 바뀌어 drop 뒤 create(2026-10-16_02 꼴).
- 불변식 v3.31 — `allow_exec_funcs`에 `listing_pending_rechecks` 한 줄(그 밖 v3.30과 같음).
- 0장: 목록 RPC에 대기열 칸 없음 · 「분석 중」은 곁 RPC `get_announcement_price_summary.analysis_done`(완료 분석 유무) · 정정 배너는 상세 `get_revision_analysis_done`(정정본 분석 끝났나 — 대기열을 보지 않음). 갈래 셋(정정 · 첨부 · 차수)을 한 칸 글자로.
- 응답 크기 전(anon 공개 REST): 인자 없음 2,149,646B · 1,067행 / 서울특별시 232,344B · 126행.
