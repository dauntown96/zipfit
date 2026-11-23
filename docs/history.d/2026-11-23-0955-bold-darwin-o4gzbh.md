# 2026-11-23 — 코드·운영 — 서울 이전 마무리: 백업 덤프에서 juso 좌표 빼기 · 처리방침 옛 서버 삭제 날짜 · 비밀값 만료 표

우편함 같은 이름 · 다운님 결정 2026-11-23 09:44(좌표 (가) 「앞으로만 막는다」 · 옛 프로젝트 삭제 반영).

- **[zipfit-backup] 덤프 좌표 제외** — `scripts/data_excluded.py` `COORD_EXCLUDED = ("complex_geo",)` · `ALL_EXCLUDED`(개인정보 + 좌표)를 pg_dump `--exclude-table-data` · `--check` · 복원 리허설 0행 대조 · 생존 신호 전체 행 수 보정이 읽는다. pg_dump 커스텀 형식은 칸 단위 제외가 없어 표 데이터 통째(표 정의·정책·권한은 담김). 좌표 칸 재셈(셈만): `complex_geo` 넷 · `complexes.lat`·`lng` 채운 행 0 · `complex_geo_attempts.candidates` 키에 좌표 없음 · `complex_geo`를 참조하는 FK·뷰 0. 복구 = 시도 기록 `picked`·`multi` 비우고 채움 잡 재실행(README 「복구 절차」 8). 지난 덤프·git 이력은 그대로. zipfit-backup PR #45.
- **[zipfit] 처리방침** — 「2026. 11. 23.에 지울 예정이며 … (삭제 날짜는 실제 삭제 뒤 확정)」 → 「2026. 11. 23.에 지웠으며, 그 사업자 백업에서는 최대 7일 뒤에 지워집니다」 — `privacy.html`(11-29 판 · 바뀌는 내용 표 한 칸 + 본문 한 줄) · `docs/privacy/2026-11-21.html`(시행 중 판 · 같은 두 자리).
- **[zipfit] 비밀값 만료 표** — `2026-11-23_01_secret_expiry_none.sql`: `zipfit_ops.secret_expiry_external.expires` NOT NULL 걷음 · `zipfit_ops.secret_expiry_list()` fixed 줄 만료일 빈칸 = state `none` · 새 줄 `NOTION_TOKEN`(만료 없음). 폐기된 옛 토큰 줄은 표에 없었다(지울 것 0).
- **[zipfit] 문서** — `docs/supabase-seoul-move.md` 8장(마무리) · `docs/data-sources.md` juso 줄 「백업 덤프에 좌표 칸 없음」.
