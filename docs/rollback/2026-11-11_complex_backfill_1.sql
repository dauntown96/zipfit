-- 되돌리기 — 단지 키 소급 1차(2026-11-11 10:55 KST · 우편함 「코드·운영 — 단지 키 소급 1차 …」).
-- 실행한 SQL: docs/rollback/2026-11-11_complex_backfill_1_forward.sql(관리 API 한 트랜잭션 · 19초).
-- 🔴 사람 판정 별칭(confirmed = 'human')이나 소급 1차 밖 행이 생긴 뒤에는 이 파일을 그대로 쓰지 않는다 — 가드가 막는다.
set statement_timeout = '110s';
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from complex_aliases where added_by is distinct from '소급 1차 2026-11-11') then
    raise exception 'GUARD 소급 1차 밖 별칭이 있다 — 손으로 가른다';
  end if;
end $$;
update housing_units set complex_id = null where complex_id is not null;
delete from announcement_complexes;
delete from complex_aliases;
delete from complexes;
