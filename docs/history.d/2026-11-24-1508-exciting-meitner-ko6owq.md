# 2026-11-24 — 분석 묶음 — 국면 C 계속 11회차: 보조 누락 6공고 LH 단지 이미지 연결

우편함 「분석 묶음 — 국면 C 계속(조사 673 (라))」 「검증 10」 다음 회차(회신 11). 스킬 analysis v11.9 쓰기 직전 다시 불러옴.

- **조사(쓰기 0)**: `lh_file_gate`의 essential 분기(`supabase/rpc/lh_file_gate.sql` 81행 `v_kind <> 'attachment'` → 단지 이미지 막음 · 82행 닫힌 공고 첨부 막음)는 모드가 essential일 때만 탄다 — 운영 `analysis_dispatch_config.lh_file_mode` = normal(54~77행 · 간격 3초 · 10분 40 · 동시 1)이라 막지 않음.
- **문지기 받기 19장**(`fetch-attachment` `mode=upload` · 각 공고 `[임시]` 폴더 · 19/19 ok · uploaded 17 · reused_existing 2(…20163 지역조감도·단지조감도 — 같은 폴더에 같은 파일)): …19965 5 · …20163 7 · …20510 6 · …20174 1.
- **운영 DB 데이터 쓰기(관리 API · 15:07 KST · 한 트랜잭션 · 롤백 전용 시험 먼저 · 불변식 v3.31 0)** — `announcement_extras` 30행:
  - 받은 19행(캡션 = 파일 이름 · 평면도 6행 `unit_key` = 그 공고 `housing_units` 키 · `image_link`).
  - 받기 0으로 옮겨 붙인 11행: …19965 김제교동 2(29960014 · 29960015 = …21089 행 · `site_label` 김제교동) · …20147 4 · …20148 5(…21032 · …21033 같은 fileid 행의 Drive 파일·sha).
  - 6공고 모두 LH 이미지 목록 fileid 집합 = `source_url` fileid 집합(커밋 뒤 읽기로 대조).
- `announcement_analysis`: …19965 · …20163 · …20510 · …20174 「완료(보조 누락)」 → 「완료」(보조 자료 줄 바꿔 씀) · …20147 · …20148 「완료(보조 누락)」 유지 — 남은 보조 누락은 6월 팜플렛 pdf(67266842 · 67266916 — 11월 팜플렛과 다른 파일 · 받지 않음) 한 줄 덧붙임.
- 분석률 96/96 그대로(분자 불변).
- 되돌리기: 여섯 공고 `announcement_extras` 30행 삭제 · 네 공고 status 「완료(보조 누락)」와 국면C계속9 보조 자료 줄 복원 · 인제서화 둘 덧붙인 줄 걷기.
- 코드 0 · DDL 0 · `index.html` 0.
