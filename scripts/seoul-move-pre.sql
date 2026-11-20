-- 서울 이전 복원 첫 줄(새 DB · 복원과 같은 한 트랜잭션 · run 만) — 2026-11-20 dry 2회 실측:
-- 새 프로젝트 postgres 기본 권한(public)이 옛과 다르다 — 표 anon·authenticated·service_role = Dxtm(옛 = anon·authenticated r · service_role arwdDxtm)
-- · 시퀀스·함수 service_role 없음(옛 = 있음). 복원으로 만들어지는 표가 이 기본값을 먼저 받으면 덤프의 권한 줄이 덜어내지 못한다(pg_dump 는 REVOKE 를 싣지 않는다).
-- 그래서 owner 만 남게 비운 뒤, 덤프 schema.sql 끝의 「ALTER DEFAULT PRIVILEGES FOR ROLE postgres」 8줄이 옛 값을 그대로 다시 만든다.
-- supabase_admin 기본 권한은 옛·새 같다(dry 2회) — 건드리지 않는다.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
