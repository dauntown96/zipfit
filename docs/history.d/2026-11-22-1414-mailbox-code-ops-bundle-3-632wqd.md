# 2026-11-22 — 코드: 첨부 변경 갈래 켜기(공통 판정 함수 · attachment_change_enabled 참)

- 우편함 「코드 — 첨부 변경 갈래 켜기: get_reanalysis_queue() 둘째 갈래에 sha 거름 · attachment_change_enabled 참」 · 전제 다운님 13:10 스킬·루틴 교체(analysis v11.9 · reverify v5.10 · 루틴 v2.24).
- 마이그레이션 `2026-11-22_05_attachment_change_enable.sql`: 공통 판정 함수 `attachment_change_pending(공고, 기준 시각)`(분석 뒤 이력 · 첫 채움 거름 · 「새 fileid · 내용 같음」 거름) — `attachment_change_candidates()` · `get_reanalysis_queue()` 둘째 갈래가 함께 부른다(종전 두 벌 조건). 둘째 갈래 apply_end 뜻 · 첫 갈래 · 열 꼴 · 정렬 그대로.
- 켜기: 같은 파일 끝 가드(켜기 직전 후보 > 0 이면 예외 · 켜지 않음) 뒤 `analysis_dispatch_config.attachment_change_enabled = true`.
- 되돌리기 전용 실측: 첫 갈래 2행 md5 같음 · 둘째 갈래 1행(…20959 · 닫힌 공고 · 새 fileid 둘 sha 없음 → 남음) 같음 · 정렬 같음 · 합성 「fileid만 바뀜」 같은 sha → 두 함수 모두 빠짐 · 다른 sha → 남음 · 후보 0 → 켜짐 · `get_reanalysis_queue()` 10.4초 → 11.2초.
