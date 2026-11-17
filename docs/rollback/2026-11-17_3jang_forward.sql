-- 3장 데이터 쓰기(2026-11-17 · 우편함 「코드·운영 — 3장 …」 0장 1·5 · 본 1 1·2) — 관리 API 한 트랜잭션. 되돌리기 = docs/rollback/2026-11-17_3jang_backward.sql.
DO $$ begin
  if not exists (select 1 from public.complexes where id = 8778 and sigungu_nm = '경산시' and road_key = '경북 봉황길 31') then raise exception 'GUARD 8778'; end if;
  if not exists (select 1 from public.complexes where id = 8772 and road_key = '대구 봉황길 31') then raise exception 'GUARD 8772'; end if;
  if exists (select 1 from public.complex_geo where complex_id = 8778) then raise exception 'GUARD 8778 geo'; end if;
  if (select count(*) from public.housing_units where complex_id = 8772) <> 2 then raise exception 'GUARD 8772 hu'; end if;
  if exists (select 1 from public.housing_units where complex_id = 8772 and address <> '경산북도 경산시 진량읍 봉황길 31') then raise exception 'GUARD 8772 addr'; end if;
  if exists (select 1 from public.complex_geo where matched_from = '경기도 광명시 광명1동 9-8번지 일원 302동') then raise exception 'GUARD 광명 geo exists'; end if;
  if (select lh_file_mode from public.analysis_dispatch_config where id = 1) <> 'essential' or (select lh_file_block_at from public.analysis_dispatch_config where id = 1) is not null then raise exception 'GUARD gate'; end if;
end $$;
-- 0장 1 광명 9-8 302동(claude.ai 판정 — 공고문 「1-1+1R+입주자+모집공고.pdf」 p.27 「3단지 301동, 302동은 복도식 구조로…」 · juso 결과 ③)
insert into public.complex_geo (matched_from, source, road_address, adm_cd, rn_mgt_sn, bd_mgt_sn, bd_nm, udrt_yn, buld_mnnm, buld_slno, ent_x, ent_y, lat, lng, source_url, note)
values ('경기도 광명시 광명1동 9-8번지 일원 302동', 'juso', '경기도 광명시 사성로103번길 26 (광명동, 광명자이더샵포레나 3단지)', '4121010100', '412104361155', '4121010100100090008000591', '광명자이더샵포레나 3단지', '0', 26, 0,
        943922.1707550667, 1943719.095635267, 37.49102081810927, 126.8656435239427,
        'https://business.juso.go.kr/addrlink/addrLinkApi.do · https://business.juso.go.kr/addrlink/addrCoordApi.do',
        'juso 정확 결과 3건 중 ③ — 사람 판정(claude.ai 2026-11-17 · 공고문 「1-1+1R+입주자+모집공고.pdf」 p.27 「3단지 301동, 302동은 복도식 구조로…」) · 좌표 juso_coord · pyproj(2026-11-17 KST)');
update public.complex_geo_attempts set outcome = 'picked', tries = tries + 1, tried_at = now(),
       note = left('사람 판정 끝(claude.ai 2026-11-17 · 공고문 p.27 「3단지 301동, 302동」) → juso ③ 「경기도 광명시 사성로103번길 26 (광명동, 광명자이더샵포레나 3단지)」 · complex_geo 에 한 행 · 앞 기록: ' || coalesce(note, ''), 500)
 where matched_from = '경기도 광명시 광명1동 9-8번지 일원 302동' and outcome = 'multi';
-- 본 1 1 — 경산 단지 시도(세대 주소가 가리키는 시도 · road_key 는 이미 경북)
update public.complexes set sido_nm = '경상북도', sigungu_nm = '경산시' where id in (6808, 8773) and sido_nm = '대구광역시';
-- 본 1 2 — 8772 → 8778 합침(claude.ai 판정 — 원문 「경산북도」는 도 이름 오탈자 · 도로명·번호·단지명 같음 · juso 하나)
update public.housing_units set complex_id = 8778 where complex_id = 8772;
insert into public.announcement_complexes (announcement_id, complex_id, source)
select announcement_id, 8778, source from public.announcement_complexes where complex_id = 8772 on conflict do nothing;
delete from public.announcement_complexes where complex_id = 8772;
update public.complex_aliases set complex_id = 8778,
       evidence = left(evidence || ' · 2026-11-17 8772 → 8778 합침(원문 「경산북도」 오탈자 · 공고 시도 「대구광역시」로 생긴 키 — 같은 원문이 다시 오면 8778 로 잇는다)', 500)
 where complex_id = 8772;
update public.complex_geo set complex_id = 8778 where id = 31 and complex_id = 8772;
delete from public.complexes where id = 8772;
-- 0장 5 — 문지기 사유 칸을 지금 모드와 맞게(모드 essential · 멈춤 표지 없음 → 사유 빈칸 · 지난 사유는 lh_file_fetch_log block_stop 행에 남아 있다)
update public.analysis_dispatch_config set lh_file_block_reason = null where id = 1 and lh_file_mode = 'essential' and lh_file_block_at is null;
select json_build_object('geo', (select count(*) from public.complex_geo), 'geo_cid', (select count(complex_id) from public.complex_geo),
  'c8772', (select count(*) from public.complexes where id = 8772), 'hu8778', (select count(*) from public.housing_units where complex_id = 8778),
  'ac8778', (select count(*) from public.announcement_complexes where complex_id = 8778),
  'ref8772', (select count(*) from public.complex_aliases where complex_id = 8772) + (select count(*) from public.announcement_complexes where complex_id = 8772)
            + (select count(*) from public.housing_units where complex_id = 8772) + (select count(*) from public.complex_geo where complex_id = 8772),
  'sido', (select json_agg(json_build_object('id', id, 's', sido_nm, 'g', sigungu_nm)) from public.complexes where id in (6808, 8773, 8778)),
  'reason', (select lh_file_block_reason is null from public.analysis_dispatch_config where id = 1),
  'addr_md5', (select md5(string_agg(id::text || '|' || coalesce(address, ''), E'\n' order by id)) from public.housing_units));
