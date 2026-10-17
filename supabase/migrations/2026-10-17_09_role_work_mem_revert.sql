-- 긴급 되돌리기(2026-10-17 · 우편함 「코드·운영 — 목록 RPC 가볍게 …」 2) — 2026-10-17_08_role_work_mem 을 되돌린다.
--   사고: 08 적용(11:37:29 UTC) 뒤 PostgREST 가 역할 설정 work_mem=4MB 를 소문자 「4mb」로 set_config 해 anon(·authenticated) REST 요청 전부가
--   400(22023 invalid value for parameter "work_mem": "4mb")으로 실패했다 — 목록 RPC · announcements 표 읽기 모두. PR check(되돌리기 전용 · set role)는
--   PostgREST 를 거치지 않아 잡지 못했다.
--   11:38 UTC 관리 API 로 같은 SQL(reset) + notify pgrst 를 먼저 보내 복구(11:39:20 UTC anon REST 200 · 950행) — 원칙 32 긴급 되돌리기 뒤 같은 SQL 을 이 파일로 올린다.
--   🔴 역할 단위 설정 값은 단위 대소문자가 PostgREST 에서 바뀔 수 있다 — 다시 시도하려면 단위 없는 정수(kB 기준, 예 4096)로 · 그리고 PostgREST 를 거치는 anon REST 로 먼저 확인한다.
-- 되돌리기: 없음(설정 없는 상태가 종전).
alter role anon reset work_mem;
alter role authenticated reset work_mem;
notify pgrst, 'reload config';
