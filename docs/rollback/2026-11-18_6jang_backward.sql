-- 되돌리기(2026-11-18 · 우편함 「코드·운영 — 6장 …」 1·2·6 데이터 쓰기의 반대) — 쓰기 전 상태를 그대로 되살린다. 실행은 판정 뒤 관리 API 한 트랜잭션.
-- ① 8715 되살림(단지 · 별칭 9668 · 공고 연결 19574_1) ② 시군구 셋 빈칸으로 ③ GH_850 이미지 7행 지움 · 분석 상태 「완료(보조 누락)」 · pending_fields 끝 줄 지움
--   (Drive 파일 7개는 지우지 않는다 — 참조 0인 파일만 지운다는 규칙 · 지울 때는 파일 id 목록 = forward 파일 file_url).
insert into public.complexes overriding system value select * from jsonb_populate_record(null::public.complexes, '{"id": 8715, "lat": null, "lng": null, "kind": "build", "sido_nm": "강원특별자치도", "road_key": "강원 문예1길 33", "supplier": "LH", "created_at": "2026-11-11T05:40:45.779585+00:00", "sigungu_nm": "태백시", "display_name": "태백궁전", "lh_sbd_lgo_no": null}'::jsonb);
update public.complex_aliases set complex_id = 8715, evidence = 'complex_road_key(precise_address, sido_nm) · 공고 19574_1_강원특별자치도_태백시' where id = 9668;
delete from public.announcement_complexes where complex_id = 5839 and announcement_id = '19574_1_강원특별자치도_태백시';
insert into public.announcement_complexes select * from jsonb_populate_recordset(null::public.announcement_complexes, '[{"source": "precise_address", "complex_id": 8715, "created_at": "2026-11-11T05:40:45.779585+00:00", "announcement_id": "19574_1_강원특별자치도_태백시"}]'::jsonb);
update public.complexes set sigungu_nm = null where id in (7244, 7296, 8559);
delete from public.announcement_extras where announcement_id = 'GH_850' and source_url like 'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=129759%'
   or announcement_id = 'GH_850' and source_url like 'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=129751%';
update public.announcement_analysis set status = '완료(보조 누락)', pending_fields = pending_fields[1:cardinality(pending_fields) - 1]
 where announcement_id = 'GH_850' and pending_fields[cardinality(pending_fields)] like '2026-11-18 코드·운영 6장 —%';
