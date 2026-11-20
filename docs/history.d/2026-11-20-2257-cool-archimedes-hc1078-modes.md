# 2026-11-20 — 코드·운영 — 서울 이전 ②′: 비교 ④ 함수 권한 순서 무관 · wipe · verify 갈래

우편함 「코드·운영 — 서울 이전 ②′ Actions 길」 검증 덧(claude.ai 22:5x) 1 · 이 PR 병합 자체는 DB 변경 0.

- run 3(44746799896)의 유일한 다름 = 함수 권한 md5 — `proacl::text` 배열 순서만 달랐다(claude.ai 순서 무관 대조 옛 = 새 `ddec44bc…` · 75개). `scripts/seoul-move-compare.sql` ④ 함수 권한을 `aclexplode`(NULL이면 `acldefault`) → 받는 이·권한·grant 가능 정렬 md5로.
- `wipe`(`scripts/seoul-move-wipe.sql` · 한 트랜잭션): `zipfit_ops` 스키마 · public 안 우리 객체(뷰·표·시퀀스·함수·형 — 확장 소속 빼고) · auth 사용자 두 표의 행. public 스키마 · `supabase_admin` 기본 권한 · 확장은 남김. 가드: 새 DB `project_self.ref` ≠ 새 ref ∧ 새 DB cron 잡 0.
- `verify`: 비교 SQL 옛 · 새 diff만(쓰기 0).
- 로컬 PostgreSQL 16 시험: wipe 뒤 우리 객체 0 · pgcrypto 함수 36 남음 · public 스키마 남음 · 앞 cascade로 지워진 함수 건너뜀 · 권한 순서만 다른 함수 둘이 같은 줄로 나옴.
