# 2026-11-20 — 코드·운영 — 서울 이전 ②′: seoul-move.yml 갈래 self · cron · 사전 조사 기본 권한

우편함 「코드·운영 — 서울 이전 ②′ Actions 길」 · 이 PR 병합 자체는 DB·cron·화면 변경 0 · 가지 `claude/cool-archimedes-hc1078-modes`(다운님 허용 22:3x — 세션 가지에는 초안 전환 PR #1179).

- 까닭: 이 세션의 관리 API 토큰이 새 프로젝트(`neuaeexdxfkkcvyzsicb`)에 403(SQL · API 키 둘 다 — 21:3x 실측) → 요청서 6의 `project_self` 갱신과 `docs/cron-jobs.sql` 실행을 관리 API로 할 수 없다.
- `self`: main의 `config.toml` `project_id`가 새 ref이고 `public-anon-key.txt`가 새 프로젝트 anon 키일 때만(키 속 ref·role 확인) 새 DB `project_self` 한 행을 고친다.
- `cron`: 새 DB `project_self.ref` = 새 ref ∧ 옛 cron active 0일 때만 `docs/cron-jobs.sql` → 옛·새 jobname · schedule · command md5 diff(다르면 새 잡을 끄고 실패).
- 사전 조사에 public 기본 권한(옛·새) — 비교 ④가 「supabase_admin 줄은 새 프로젝트 것」에 기대므로 run 전에 본다.
