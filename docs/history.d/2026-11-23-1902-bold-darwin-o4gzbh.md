# 2026-11-23 — 코드·운영 열다섯째 A장(둘째 PR) — user_profiles.marketing_alert 칸 DROP

- 마이그레이션 `2026-11-23_05_drop_marketing_alert.sql` — 칸 DROP(값 보관 없음 · ⑨ 4-1 파기). 순서: EF 가 키를 걷은 #1242 배포(run 45151473837 성공) 뒤. 다운님 확인 2026-11-23 「DROP 진행」.
- health-ops `privacy_match` — 옛 칸 대조에서 marketing_alert 걷음(칸이 없어 SQL 이 실패하지 않게 · 시험 19/19).
- 백업: zipfit-backup `schema_guard` 가 사라진 칼럼을 실패로 잡으므로 같은 날 `allow_removed` 승인 실행(다운님 확인 같은 날).
