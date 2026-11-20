# 2026-11-20 — 코드·운영 — 서울 이전 ②′: 복원 첫 줄에 새 DB 기본 권한 비움(seoul-move-pre.sql)

우편함 「코드·운영 — 서울 이전 ②′ Actions 길」 · 이 PR 병합 자체는 DB 변경 0.

- dry 2회(#1180 뒤 사전 조사): 새 프로젝트 `postgres` 기본 권한(public)이 옛과 다르다 — 표 `anon`·`authenticated`·`service_role` = `Dxtm`(옛 = `anon`·`authenticated` `r` · `service_role` `arwdDxtm`) · 시퀀스·함수에 `service_role` 없음. `supabase_admin` 기본 권한은 같다.
- 그대로 복원하면 표마다 `anon`에 TRUNCATE·REFERENCES·TRIGGER·MAINTAIN이 남는다(pg_dump는 REVOKE를 싣지 않는다) → 비교 ④에서 run이 멈춘다.
- `scripts/seoul-move-pre.sql`: 같은 한 트랜잭션 첫 줄에서 새 `postgres` 기본 권한(public · 표·시퀀스·함수)을 owner만 남게 비운다 → 덤프 끝 `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` 8줄이 옛 값을 다시 만든다.
