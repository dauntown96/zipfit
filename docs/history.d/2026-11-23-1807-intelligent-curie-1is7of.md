# 2026-11-23 — 분석 묶음 — 국면 C 계속(조사 673 (라)) 1회차: 충주연수2 …19453 + B 10건 판정 + C 조사

우편함 「분석 묶음 — 국면 C 계속(조사 673 (라)) … 25건 + 10건 판정」 · 스킬 착수 줄 analysis v11.9 · reverify v5.10(압축 뒤 첫 DB 쓰기 전 다시 읽음 — 본문 잘림 표식 있어 해당 절은 파일로 확인).

- **0장 목록(조사 673 2절 ② 규칙 다시 뽑음)**: 열린 카드 18 × 닫힌 미분석 24(LH 22 · MYHOME 2) · 고리 안에 이미 있던 것 0. 제외 3 — 음성맹동 행복주택 …20099(소재지 맹동산단1길 18 ↔ 열린 카드 국민임대 음성맹동 대동로 26 — 다른 단지) · 군산 MYHOME 18640_1 · 18636_1(LH 원문 행 없음 — 「MYHOME으로만 아는 LH 공고는 LH 행 생긴 뒤」). 남은 대상 21.
- **운영 DB 데이터 쓰기(관리 API · 18:04 KST 한 트랜잭션)** — …19453 충주연수2 영구임대 2026-03-25: 정책 34 · 세대 4(26.37형 201동~205동 955호 · 206동 239호 × 가군·나군 · 모집 예비자 200 병합 칸) · 자격 6 · 일정 4 · 경로 1(현장) · 분석 행 「완료」(batch `2026-11-23-국면C계속1`) · `apply_start_confirmed`/`apply_end_confirmed` 2026-04-15~04-30 · `announcement_round_links` 1(…19453 → …20974). 원문 = 문지기 경유 공고문 hwp·pdf(Drive `[임시] 2015122300019453`) · 다음 회차 …20974 행을 원문 diff로 바꿔 쓰고 행마다 3월 원문 대조 · ⚠️ 행 4 중 2(소재지 · 접수장소) 유지, 2(배점표 「000」 · 발표일) 3월 원문엔 해당 없음.
- 가드: 시작 산물 0 · 닫힌 공고 · 일정·경로 칸 = 근거 행 부분 문자열 · 주소 빈칸 0 · 불변식 v3.31 0(같은 트랜잭션) · 롤백 전용 시험 먼저 · plain-check v3 요점 32쌍 실패 0.
- B 10건: 쓰기 0 — (ㄷ) 6 · (ㄴ) 후보 4는 판정 요청(블록 ID에 산물이 있는 카드라 LH ID 재작성은 두 모양 섞임).
- C: 조사만(쓰기 0).
- 되돌리기: `delete from announcement_round_links where earlier_announcement_id='2015122300019453'` · 같은 id의 `announcement_schedule`·`announcement_apply_routes`·`eligibility_criteria`·`housing_units`·`announcement_policies`·`announcement_analysis` 삭제 · `update announcements set apply_start_confirmed=null, apply_end_confirmed=null where announcement_id='2015122300019453'`.
- 코드 변경 0 · DDL 0 · `index.html` 0.
