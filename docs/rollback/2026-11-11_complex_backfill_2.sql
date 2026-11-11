-- 되돌리기 — 단지 키 소급 2차(2026-11-11 14:14 KST · 우편함 「코드·운영 — 단지 키 2차 …」 1·3).
-- 실행한 SQL: docs/rollback/2026-11-11_complex_backfill_2_forward.sql(관리 API 한 트랜잭션).
-- 2차가 만든 것: 별칭 added_by '소급 2차 2026-11-11'(road 6 · lh_code 1) · 그 road 별칭의 단지 6 · hu complex_id 18행 · 공고↔단지 행.
set statement_timeout = '60s';
set local lock_timeout = '5s';
create temp table r_cx on commit drop as
select distinct ca.complex_id from complex_aliases ca where ca.added_by = '소급 2차 2026-11-11' and ca.alias_type = 'road';
create temp table r_code on commit drop as
select complex_id, alias_value from complex_aliases where added_by = '소급 2차 2026-11-11' and alias_type = 'lh_code';
update complexes c set lh_sbd_lgo_no = null from r_code r where r.complex_id = c.id and c.lh_sbd_lgo_no = r.alias_value;
delete from announcement_complexes x using r_code r where x.complex_id = r.complex_id and x.source = 'lh_code';
-- 붙여 쓴 번호 18행: 2차 새 단지에 붙은 행 + 기존 단지에 붙은 행(주소가 붙여 쓴 꼴 · 종전 키 NULL)
update housing_units h set complex_id = null
 where h.complex_id is not null and h.address ~ '[가-힣0-9]+(로|길)[0-9]' and h.address !~ '[가-힣0-9]+(로|길) [0-9]';
delete from announcement_complexes x using r_cx r where x.complex_id = r.complex_id;
delete from complex_aliases where added_by = '소급 2차 2026-11-11';
delete from complexes c using r_cx r where r.complex_id = c.id;
