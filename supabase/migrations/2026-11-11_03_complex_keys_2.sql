-- zipfit:function complex_road_key(text,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function complex_link_announcements(text[]) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 단지 키 2차(2026-11-11 · 우편함 「코드·운영 — 단지 키 2차: 도로명 키 붙여쓰기 · 수집이 새 공고 확정분 채움 · LH 코드 2차 규칙」 · 다운님 승인 2026-11-11).
-- ① complex_road_key — 띄어 쓴 꼴(종전 규칙)이 안 맞을 때만 붙여 쓴 번호(「주공길24」)를 읽는다. 종전 키 변화 0(hu·공고·홍보물 주소 11,890 대조) · 새로 키를 받는 행 18.
-- ② complex_link_announcements(공고 id 배열) — 수집 EF 가 쓰기 뒤에 부른다(collect-announcements · collect-lh-images). 함수 머리 주석이 규칙의 정본.
-- 쓰기 권한은 service_role 만(EF). 되돌리기: complex_road_key 는 git show 222ba89:supabase/rpc/complex_road_key.sql 로 · complex_link_announcements 는 drop.

create or replace function public.complex_road_key(p_address text, p_sido text default null)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'public', 'pg_temp'
as $function$
  -- 단지 키의 도로명 별칭(2026-11-11 · 우편함 「코드·운영 — 단지 키 DDL …」 5 · 조사 「단지 키 설계」 권장안).
  -- 「<시도> <도로명><번길> <건물번호>」 — 시도만 짧은 이름으로 맞추고 시군구 글자는 넣지 않는다(시도 없음 · 행정 재편 표기 차이에 흔들리지 않게).
  --   시도 = 주소 첫 토큰이 시도면 그것, 아니면 p_sido(housing_units.sido_nm · announcements.sido_nm). 둘 다 못 정하면 NULL.
  --   광주·전남은 「전남광주」 하나로 둔다(전남광주통합특별시 — 옛 표기 행과 새 표기 행이 같은 키가 되게).
  --   「광주시」 첫 토큰은 경기 광주시와 겹쳐 시도로 읽지 않는다(p_sido 로 정한다).
  -- 도로명 = 「…로」·「…길」(+ 「N번길」) 다음 칸의 건물번호(N 또는 N-N). 지번 주소(「…동 295-1」)는 도로명이 없어 NULL.
  -- 소급 채움 · 수집 · 불변식이 같은 함수를 쓴다. 2026-11-11 hu 9,812행 중 9,448행 키 · 서로 다른 키 2,893 · 같은 키 다른 시군구 0.
  with a as (select regexp_replace(btrim(coalesce(p_address, '')), '\s+', ' ', 'g') as s),
  n as (select a.s,
               case when x.t in ('서울특별시', '서울시', '서울') then '서울'
                    when x.t in ('부산광역시', '부산시', '부산') then '부산'
                    when x.t in ('대구광역시', '대구시', '대구') then '대구'
                    when x.t in ('인천광역시', '인천시', '인천') then '인천'
                    when x.t in ('광주광역시', '광주', '전라남도', '전남', '전남광주통합특별시', '전남광주') then '전남광주'
                    when x.t in ('대전광역시', '대전시', '대전') then '대전'
                    when x.t in ('울산광역시', '울산시', '울산') then '울산'
                    when x.t in ('세종특별자치시', '세종시', '세종') then '세종'
                    when x.t in ('경기도', '경기') then '경기'
                    when x.t in ('강원특별자치도', '강원도', '강원') then '강원'
                    when x.t in ('충청북도', '충북') then '충북'
                    when x.t in ('충청남도', '충남') then '충남'
                    when x.t in ('전북특별자치도', '전라북도', '전북') then '전북'
                    when x.t in ('경상북도', '경북') then '경북'
                    when x.t in ('경상남도', '경남') then '경남'
                    when x.t in ('제주특별자치도', '제주도', '제주') then '제주'
               end as sido, x.k
          from a cross join lateral (values (split_part(a.s, ' ', 1), 1), (btrim(coalesce(p_sido, '')), 2)) x(t, k)),
  sd as (select (select n.sido from n where n.sido is not null order by n.k limit 1) as sido),
  -- 🔵 2026-11-11(단지 키 2차 1) — 띄어 쓴 꼴(종전 규칙 · 그대로 먼저)이 안 맞을 때만 붙여 쓴 꼴(「주공길24」·「올림픽로79길36」)을 본다.
  --    붙여 쓴 꼴은 번호 뒤에 한글이 오면 받지 않는다(「을지로3가」 같은 동 이름을 번호로 읽지 않게). 종전 키는 한 행도 바뀌지 않는다(hu·공고·홍보물 주소 11,890 대조).
  rd as (select coalesce(regexp_match((select s from a), '([가-힣A-Za-z0-9]+(?:로|길))\s?((?:[0-9]+번?(?:길|로))?)\s([0-9]+(?:-[0-9]+)?)(?:[^0-9-]|$)'),
                        regexp_match((select s from a), '([가-힣A-Za-z0-9]+(?:로|길))((?:[0-9]+번?(?:길|로))?)([0-9]+(?:-[0-9]+)?)(?:[^0-9가-힣-]|$)')) as m)
  select case when rd.m is null or sd.sido is null then null
              else sd.sido || ' ' || rd.m[1] || rd.m[2] || ' ' || rd.m[3] end
    from sd, rd
$function$;

create function public.complex_link_announcements(p_ids text[])
 returns jsonb
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
-- 단지 잇기(2026-11-11 · 우편함 「코드·운영 — 단지 키 2차 …」 2) — 수집이 새 공고 확정분을 채운다. 부르는 곳: EF collect-announcements(LH 상세 upsert 뒤 · precise_address)
--   · EF collect-lh-images(단지 그림 upsert 뒤 · sbd_lgo_no). 원문 값만 쓴다(원칙 30) — 표시 이름(display_name)은 비워 둔다(세대 행이 생기면 분석·소급이 채운다).
-- ① 도로명: complex_road_key(precise_address, sido_nm) 가 있으면 그 road 별칭의 단지에 잇는다 · 없으면 단지를 새로 만들고 road 별칭(added_by collect) ·
--    같은 키의 단지가 다른 kind(매입 ↔ 건설)면 잇지 않는다(보류 수만 센다). 전세임대는 단지를 만들지 않는다.
-- ② LH 코드: 건설형 공고에서 코드(단지 그림 · 커트라인 pan_id)가 하나이고 아직 별칭이 없으며 그 공고 도로명 키(건설형 세대 행 · 없으면 precise_address)가
--    하나일 때만 lh_code 별칭(1차 규칙). 이름으로는 잇지 않는다.
-- 동시 호출은 권고 잠금으로 한 줄로 세운다. 반환: {ids, link, new_complex, code, hold}
declare
  r record; v_kind text; v_rk text; v_cid bigint; v_ckind text; v_codes text[]; v_keys text[];
  n_link int := 0; n_new int := 0; n_code int := 0; n_hold int := 0; n int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('ids', 0); end if;
  if cardinality(p_ids) > 2000 then p_ids := p_ids[1:2000]; end if;
  perform pg_advisory_xact_lock(hashtext('zipfit.complex_link'));
  for r in select distinct on (a.announcement_id) a.announcement_id, a.precise_address, a.sido_nm, a.sigungu_nm, a.supply_org, a.housing_type, a.housing_type_family
             from public.announcements a where a.announcement_id = any(p_ids) order by a.announcement_id, a.source loop
    v_kind := case when coalesce(r.housing_type, '') ~ '전세임대' then null
                   when coalesce(r.housing_type_family, '') = '매입임대' or coalesce(r.housing_type, '') ~ '매입|집주인' then 'buy'
                   else 'build' end;
    continue when v_kind is null;
    v_rk := public.complex_road_key(r.precise_address, r.sido_nm);
    if v_rk is not null then
      v_cid := null;
      select c.id, c.kind into v_cid, v_ckind from public.complex_aliases ca join public.complexes c on c.id = ca.complex_id
       where ca.alias_type = 'road' and ca.alias_value = v_rk;
      if v_cid is not null and v_ckind <> v_kind then
        n_hold := n_hold + 1; v_cid := null;
      elsif v_cid is null then
        insert into public.complexes (kind, supplier, sido_nm, sigungu_nm, road_key) values (v_kind, r.supply_org, r.sido_nm, r.sigungu_nm, v_rk) returning id into v_cid;
        insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
        values (v_cid, 'road', v_rk, 'announcements.precise_address', 'complex_road_key(precise_address, sido_nm) · 공고 ' || r.announcement_id, 'collect', 'auto');
        n_new := n_new + 1;
      end if;
      if v_cid is not null then
        insert into public.announcement_complexes (announcement_id, complex_id, source) values (r.announcement_id, v_cid, 'precise_address') on conflict do nothing;
        get diagnostics n = row_count; n_link := n_link + n;
      end if;
    end if;
    if v_kind = 'build' then
      select array_agg(distinct x.code) into v_codes from (
        select i.sbd_lgo_no as code from public.announcement_complex_images i where i.announcement_id = r.announcement_id
        union select s.sbd_lgo_no from public.lh_cutoff_scores s where s.pan_id = r.announcement_id) x
       where x.code ~ '^[CD][0-9]{5}$';
      if cardinality(v_codes) = 1 and not exists (select 1 from public.complex_aliases ca where ca.alias_type = 'lh_code' and ca.alias_value = v_codes[1]) then
        v_keys := array(select distinct k from (select public.complex_road_key(h.address, coalesce(h.sido_nm, r.sido_nm)) as k from public.housing_units h
                                                where h.announcement_id = r.announcement_id) q where k is not null);
        if cardinality(v_keys) = 0 and v_rk is not null then v_keys := array[v_rk]; end if;
        if cardinality(v_keys) = 1 then
          v_cid := null;
          select c.id into v_cid from public.complex_aliases ca join public.complexes c on c.id = ca.complex_id
           where ca.alias_type = 'road' and ca.alias_value = v_keys[1] and c.kind = 'build';
          if v_cid is not null then
            insert into public.complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
            values (v_cid, 'lh_code', v_codes[1], 'announcement_complex_images · lh_cutoff_scores', '공고 하나에 코드 하나 ∧ 그 공고 도로명 키 하나 · 공고 ' || r.announcement_id, 'collect', 'auto')
            on conflict do nothing;
            get diagnostics n = row_count;
            if n > 0 then
              n_code := n_code + 1;
              update public.complexes set lh_sbd_lgo_no = v_codes[1] where id = v_cid and lh_sbd_lgo_no is null;
              insert into public.announcement_complexes (announcement_id, complex_id, source) values (r.announcement_id, v_cid, 'lh_code') on conflict do nothing;
            end if;
          end if;
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ids', cardinality(p_ids), 'link', n_link, 'new_complex', n_new, 'code', n_code, 'hold', n_hold);
end
$function$;
revoke execute on function public.complex_link_announcements(text[]) from public, anon, authenticated;
grant execute on function public.complex_link_announcements(text[]) to service_role;
