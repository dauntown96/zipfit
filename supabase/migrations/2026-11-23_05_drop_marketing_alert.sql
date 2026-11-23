-- 마케팅 알림 칸 걷기(2026-11-23 · 우편함 「코드·운영 — 열다섯째 A장」 2 · 백로그 3fd8aaa7e15581c29d80 · ⑨ 4-1 「삭제면 기존 저장값 파기」).
--   토글은 PR #626(2026-10-18)에서 걷었고, EF save-user-profile 은 PR #1242(2026-11-23 · 배포 run 45151473837 성공)부터 이 칸을 읽지도 쓰지도 않는다.
--   값은 보관하지 않는다(파기가 목적). 이 칸을 읽는 DB 함수·뷰·정책 0(supabase/rpc 사본 grep · SQL 함수는 칸 의존을 기록하지 않아 사본으로 본다).
--   다운님 확인 2026-11-23 「DROP 진행」(원칙 13 칼럼 DROP).
--   백업: zipfit-backup schema_guard 가 사라진 칼럼으로 실패하므로 같은 날 allow_removed 승인 실행(다운님 확인 같은 날).
-- 되돌리기: 칸만 되돌릴 수 있다 — alter table public.user_profiles add column marketing_alert boolean default false(값은 돌아오지 않는다 · 파기).
alter table public.user_profiles drop column marketing_alert;
