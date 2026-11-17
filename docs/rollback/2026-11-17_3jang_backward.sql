-- 되돌리기(2026-11-17 · 우편함 「코드·운영 — 3장 …」 0장 1·5 · 본 1 데이터 쓰기의 반대) — 쓰기 전 상태를 그대로 되살린다. 실행은 판정 뒤 관리 API 한 트랜잭션.
-- ① 광명 9-8 complex_geo 행 지우기 · 시도 기록 multi 로 ② 경산 6808 · 8773 시도 되돌림 ③ 8772 되살림(별칭 · 공고 연결 · 세대 2 · complex_geo 31) ④ 문지기 사유 칸 되돌림.
delete from public.complex_geo where matched_from = '경기도 광명시 광명1동 9-8번지 일원 302동';
update public.complex_geo_attempts t set outcome = x.outcome, note = x.note, candidates = x.candidates, tries = x.tries, tried_at = x.tried_at
  from jsonb_populate_record(null::public.complex_geo_attempts, '{"note": "juso 정확 결과 3건 · 원문 단지명·건축HUB(0)로 못 고름 — 사람 판정 · 키워드 「경기도 광명시 광명1동 9-8」", "tries": 1, "outcome": "multi", "tried_at": "2026-11-17T08:17:40.469093+00:00", "candidates": [{"bdNm": "광명자이더샵포레나 1단지", "roadAddr": "경기도 광명시 사성로75번길 1 (광명동, 광명자이더샵포레나 1단지)", "jibunAddr": "경기도 광명시 광명동 9-8 광명자이더샵포레나 1단지"}, {"bdNm": "광명자이더샵포레나 2단지", "roadAddr": "경기도 광명시 사성로75번길 34 (광명동, 광명자이더샵포레나 2단지)", "jibunAddr": "경기도 광명시 광명동 9-8 광명자이더샵포레나 2단지"}, {"bdNm": "광명자이더샵포레나 3단지", "roadAddr": "경기도 광명시 사성로103번길 26 (광명동, 광명자이더샵포레나 3단지)", "jibunAddr": "경기도 광명시 광명동 9-8 광명자이더샵포레나 3단지"}], "created_at": "2026-11-17T08:17:40.469093+00:00", "matched_from": "경기도 광명시 광명1동 9-8번지 일원 302동"}'::jsonb) x where t.matched_from = x.matched_from;
update public.complexes set sido_nm = '대구광역시', sigungu_nm = null where id = 6808;
update public.complexes set sido_nm = '대구광역시', sigungu_nm = null where id = 8773;
insert into public.complexes overriding system value select * from jsonb_populate_record(null::public.complexes, '{"id": 8772, "lat": null, "lng": null, "kind": "build", "sido_nm": "대구광역시", "road_key": "대구 봉황길 31", "supplier": "LH", "created_at": "2026-11-12T02:12:45.614481+00:00", "sigungu_nm": null, "display_name": "경산삼주봉황1", "lh_sbd_lgo_no": null}'::jsonb);
update public.complex_aliases set complex_id = 8772, evidence = '"complex_road_key(address, sido_nm) · 세대 행 · 공고 2015122300021018"'::jsonb #>> '{}' where id = 9756;
delete from public.announcement_complexes where complex_id = 8778 and announcement_id = '2015122300021018';
insert into public.announcement_complexes select * from jsonb_populate_recordset(null::public.announcement_complexes, '[{"source": "housing_units", "complex_id": 8772, "created_at": "2026-11-12T02:12:45.614481+00:00", "announcement_id": "2015122300021018"}]'::jsonb);
update public.housing_units set complex_id = 8772 where id in ('32e87a2b-b6ab-4ab8-acaa-c1fe97cd23ae','bcf05326-072e-4a09-bd3f-15324633b735');
update public.complex_geo set complex_id = 8772 where id = 31;
update public.analysis_dispatch_config set lh_file_block_reason = '"차단 감지 — 최근 3번 연속(conn_error: The signal has been aborted · conn_error: The signal has been aborted · conn_error: error sending request for url (https://apply.lh.) · 모드 normal → paused"'::jsonb #>> '{}' where id = 1;
