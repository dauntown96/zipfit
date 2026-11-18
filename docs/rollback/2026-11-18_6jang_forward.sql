-- 6장 데이터 쓰기(2026-11-18 · 우편함 「코드·운영 — 6장 …」 1·2·6) — 관리 API 한 트랜잭션. 되돌리기 = docs/rollback/2026-11-18_6jang_backward.sql.
DO $$ begin
  if not exists (select 1 from public.complexes where id = 5839 and road_key = '강원 문예1길 13' and lh_sbd_lgo_no = 'D00011') then raise exception 'GUARD 5839'; end if;
  if not exists (select 1 from public.complexes where id = 8715 and road_key = '강원 문예1길 33' and lh_sbd_lgo_no is null) then raise exception 'GUARD 8715'; end if;
  if (select count(*) from public.complex_aliases where complex_id = 8715) <> 1 then raise exception 'GUARD 8715 alias'; end if;
  if (select count(*) from public.announcement_complexes where complex_id = 8715) <> 1 then raise exception 'GUARD 8715 ac'; end if;
  if exists (select 1 from public.housing_units where complex_id = 8715) or exists (select 1 from public.complex_geo where complex_id = 8715) then raise exception 'GUARD 8715 hu/geo'; end if;
  if (select count(*) from public.complexes where id in (7244, 7296, 8559) and sigungu_nm is null) <> 3 then raise exception 'GUARD sigungu'; end if;
  if exists (select 1 from public.announcement_extras where announcement_id = 'GH_850') then raise exception 'GUARD GH_850 extras'; end if;
  if (select status from public.announcement_analysis where announcement_id = 'GH_850') <> '완료(보조 누락)' then raise exception 'GUARD GH_850 status'; end if;
  if (select count(*) from public.housing_units where announcement_id = 'GH_850' and building_name = '다산메트로3단지' and unit_group is null and unit_type in ('32B','34A','41A','51A')) <> 4 then raise exception 'GUARD GH_850 hu'; end if;
end $$;
-- ① 태백궁전 8715 → 5839 합침(근거: 공고문 …19307 p.3 「문예1길 13」 ↔ LH 공고 페이지 「문예1길 33」 · juso 13·33 = 같은 궁전아파트 두 동 · MYHOME 19574_1 과 LH …19307 은 같은 제목의 같은 공고)
insert into public.announcement_complexes (announcement_id, complex_id, source)
select announcement_id, 5839, source from public.announcement_complexes where complex_id = 8715 on conflict do nothing;
delete from public.announcement_complexes where complex_id = 8715;
update public.complex_aliases set complex_id = 5839,
       evidence = left(evidence || ' · 2026-11-18 8715 → 5839 합침(공고문 …19307 「문예1길 13」 ↔ LH 공고 페이지 「문예1길 33」 · juso 같은 궁전아파트 두 동 — 같은 원문이 다시 오면 5839 로 잇는다)', 500)
 where complex_id = 8715;
delete from public.complexes where id = 8715;
-- ② 단지 시군구 빈칸 셋(원천: 행정안전부 도로명주소 검색 juso — seoul-api juso_search · 2026-11-18 10:2x KST)
--   7244 「부산광역시 영도구 동삼북로 2」 → sggNm 영도구 · 7296 「부산광역시 영도구 상리로 1」 → 영도구(세대 주소 원문에도 「영도구」)
--   8559 「충청남도 홍성읍 남장중로 34」 → juso 「남장중로」 21건 전부 「충청남도 홍성군 홍성읍」 → 홍성군. 세종 7768·7769 는 빈칸 유지(세종 단지 2 · 공고 16 · 세대 11 모두 시군구 빈칸 — 같은 규칙).
update public.complexes set sigungu_nm = '영도구' where id in (7244, 7296) and sigungu_nm is null and sido_nm = '부산광역시';
update public.complexes set sigungu_nm = '홍성군' where id = 8559 and sigungu_nm is null and sido_nm = '충청남도';
-- ⑥ GH_850 GH 공고 페이지 「단지 관련 이미지 정보」 7장(fetch-attachment upload · 2026-11-18 · 원본 받기 selectCtlgFileDown) — 탭 표기 = 세대 unit_type 글자 그대로.
insert into public.announcement_extras (announcement_id, extra_type, building_address, file_url, unit_key, unit_key_source, site_label, source_url, content_sha256) values
 ('GH_850','floorplan','진건A1 32.pdf_page_1(1)','https://drive.google.com/file/d/1rAVq4OXzdfX3cVk0buL108Xu4xhpq9TX/view?usp=drivesdk','다산메트로3단지::32B','image_link',null,'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=1297511&ver=20241122094909&atchFileDtlSn=1','922f2c491551a1aa2a4516607c144e626269ebe55c12bfae61aa54ecf8e8a09c'),
 ('GH_850','floorplan','진건A1 34.pdf_page_1','https://drive.google.com/file/d/1t7vMuKd-M4H3tJh_eLC-OpWICLJIe9dj/view?usp=drivesdk','다산메트로3단지::34A','image_link',null,'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=1297512&ver=20241122095704&atchFileDtlSn=1','70e78aa096318c89b74b1ca742528ec24a680e09d0d4620c032869364cb36c5d'),
 ('GH_850','floorplan','진건A1 41.pdf_page_1','https://drive.google.com/file/d/19jKggJr7xgw2fqPiqNQ6REyTaGVD8jCe/view?usp=drivesdk','다산메트로3단지::41A','image_link',null,'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=1297513&ver=20241122095713&atchFileDtlSn=1','93a6df0511298cbfdd7e58f2eda4aa027a37f14ecc89ac75bf91f0de0ef6d49a'),
 ('GH_850','floorplan','진건A1 51.pdf_page_1','https://drive.google.com/file/d/1xr0fb8FA4neymHuL2_OdU2FNkylSXNtG/view?usp=drivesdk','다산메트로3단지::51A','image_link',null,'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=1297514&ver=20241122095721&atchFileDtlSn=1','2e380e0349460d6860160c2b5e11a7c25b069811660253d5f2f03b99a7bcd0fd'),
 ('GH_850','photo','진건지구A1 조감도_0921','https://drive.google.com/file/d/1Mv4HtFuun61q-fx3jsmdUT_T0KDqDWFC/view?usp=drivesdk',null,null,null,'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=1297591&ver=20241122130904&atchFileDtlSn=1','1d94ef84df87e7bce1e286cf01f2558c5c8ea17c19f53453114560497d9dc153'),
 ('GH_850','photo','다산 진건 A1 단지배치도','https://drive.google.com/file/d/1Yvc3_8_9hTHfJm1HW_oUee-bpAa8pitp/view?usp=drivesdk',null,null,null,'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=1297592&ver=20241122130920&atchFileDtlSn=1','b892469a9744a71dbadd2c569973cda546afe9255801491fbd8fda8266ee2b07'),
 ('GH_850','photo','입면도.pdf_page_1','https://drive.google.com/file/d/1u7LPa9eP8NT68dCTfRSTIX6JrnXoglYJ/view?usp=drivesdk',null,null,null,'https://apply-cdn.gh.or.kr/sr/sr7150/selectCtlgFileDown.do?bizCd=2011001&atchFileSn=1297593&ver=20241122130931&atchFileDtlSn=1','e24f8766019d6c9a2174ac66fb1d7b7bd269a2d86689b80609958d4fc6c7367e');
update public.announcement_analysis set status = '완료',
       pending_fields = array_append(pending_fields, '2026-11-18 코드·운영 6장 — GH 공고 페이지 「단지 관련 이미지 정보」 7장 연결(평면도 4 · 탭 표기 32B·34A·41A·51A = 세대 unit_type · 조감도·단지배치도·입면도 photo 3 · 원본 받기 selectCtlgFileDown · 이미지 등록 2024-11-22 — GH 공고 페이지가 이번 공고에 보이는 것) → 완료(보조 누락) → 완료')
 where announcement_id = 'GH_850' and status = '완료(보조 누락)';
select json_build_object(
  'c8715', (select count(*) from public.complexes where id = 8715),
  'ref8715', (select count(*) from public.complex_aliases where complex_id = 8715) + (select count(*) from public.announcement_complexes where complex_id = 8715)
            + (select count(*) from public.housing_units where complex_id = 8715) + (select count(*) from public.complex_geo where complex_id = 8715),
  'al5839', (select json_agg(alias_type || '=' || alias_value order by id) from public.complex_aliases where complex_id = 5839),
  'ac5839', (select json_agg(announcement_id order by announcement_id) from public.announcement_complexes where complex_id = 5839),
  'road5839', (select road_key from public.complexes where id = 5839),
  'sgg', (select json_agg(json_build_object('id', id, 'g', sigungu_nm) order by id) from public.complexes where id in (7244, 7296, 8559, 7768, 7769)),
  'build_sgg_null', (select count(*) from public.complexes where kind = 'build' and sigungu_nm is null),
  'gh850', (select json_build_object('ex', (select count(*) from public.announcement_extras where announcement_id = 'GH_850'), 'st', status) from public.announcement_analysis where announcement_id = 'GH_850'),
  'addr_md5', (select md5(string_agg(id::text || '|' || coalesce(address, ''), E'\n' order by id)) from public.housing_units));
