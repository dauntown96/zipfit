set statement_timeout = '110s';
set local lock_timeout = '5s';
-- 단지 키 소급 1차(2026-11-11 · 우편함 「코드·운영 — 단지 키 소급 1차 …」) — 자동 확정분만. hu 칸은 complex_id 하나만 쓴다.
do $$ begin
  if exists (select 1 from complexes) or exists (select 1 from complex_aliases) or exists (select 1 from announcement_complexes)
     or exists (select 1 from housing_units where complex_id is not null) then raise exception 'GUARD 단지 표가 비어 있지 않다 — 소급 1차는 빈 표에서만'; end if;
end $$;

-- ① 세대 행 재료
create temp table t_hu on commit drop as
select h.id, h.announcement_id, nullif(btrim(h.building_name), '') as bname,
       coalesce(h.sido_nm, a.sido_nm) as sido, coalesce(nullif(h.sigungu_nm, ''), a.sigungu_nm) as sgg,
       public.complex_road_key(h.address, coalesce(h.sido_nm, a.sido_nm)) as rk,
       a.supply_org,
       case when coalesce(a.housing_type, '') ~ '전세임대' then 'skip'
            when coalesce(a.housing_type_family, '') = '매입임대' or coalesce(a.housing_type, '') ~ '매입|집주인' then 'buy'
            else 'build' end as kind
  from housing_units h
  left join lateral (select a0.* from announcements a0 where a0.announcement_id = h.announcement_id order by a0.source limit 1) a on true;

-- ② 도로명 키 묶음 판정 — 사람 판정 대기(ⓐ 이름 번호 갈림 · 시군구 갈림 · kind 갈림)
create temp table t_grp on commit drop as
with g as (
  select rk, array_agg(distinct kind) kinds, count(distinct sgg) filter (where sgg is not null) n_sgg,
         array_agg(distinct sgg) filter (where sgg is not null) sggs,
         array_agg(distinct bname) filter (where bname is not null) names, count(*) n
    from t_hu where rk is not null and kind <> 'skip' group by rk),
nums as (
  select g.rk,
         (select count(distinct m[1]) from unnest(coalesce(g.names, '{}')) nm cross join lateral regexp_matches(nm, '([0-9]+)\s*(?:차|단지)', 'g') m) n_num,
         (select count(distinct upper(replace(m[1], '-', ''))) from unnest(coalesce(g.names, '{}')) nm cross join lateral regexp_matches(nm, '([A-Za-z]-?[0-9]+)\s*(?:블록|BL|bl)', 'g') m) n_blk
    from g)
select g.*, nums.n_num, nums.n_blk,
       case when cardinality(g.kinds) > 1 then 'kind 갈림'
            when g.n_sgg > 1 then '시군구 갈림'
            when nums.n_num > 1 then '이름 단지 번호 갈림'
            when nums.n_blk > 1 then '이름 블록 갈림'
       end as hold
  from g join nums using (rk);

-- ③ 단지 행(보류 아닌 키마다 하나) — 표시 이름 = 그 묶음에서 가장 많이 쓰인 원문 건물명
create temp table t_cx on commit drop as
select g.rk, g.kinds[1] as kind,
       (select sido from t_hu x where x.rk = g.rk and sido is not null group by sido order by count(*) desc, sido limit 1) sido,
       (select sgg from t_hu x where x.rk = g.rk and sgg is not null group by sgg order by count(*) desc, sgg limit 1) sgg,
       (select supply_org from t_hu x where x.rk = g.rk and supply_org is not null group by supply_org order by count(*) desc, supply_org limit 1) supplier,
       (select bname from t_hu x where x.rk = g.rk and bname is not null group by bname order by count(*) desc, bname limit 1) dname
  from t_grp g where g.hold is null;

insert into complexes (kind, supplier, sido_nm, sigungu_nm, road_key, display_name)
select kind, supplier, sido, sgg, rk, dname from t_cx order by rk;

insert into complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
select c.id, 'road', c.road_key, 'housing_units.address', 'complex_road_key(address, sido_nm) · 세대 행 ' || g.n || ' · 건물명 ' || coalesce(cardinality(g.names), 0), '소급 1차 2026-11-11', 'auto'
  from complexes c join t_grp g on g.rk = c.road_key;

-- ④ LH 단지 코드 — 공고 하나에 코드 하나 ∧ 그 공고 세대 행 도로명 키 하나 → 그 단지. 코드가 단지 둘 이상에 걸리면 보류.
create temp table t_code_ann on commit drop as
select announcement_id, min(code) code from (
  select announcement_id, sbd_lgo_no code from announcement_complex_images where sbd_lgo_no ~ '^[CD][0-9]{5}$'
  union select pan_id, sbd_lgo_no from lh_cutoff_scores where sbd_lgo_no ~ '^[CD][0-9]{5}$') s
 group by announcement_id having count(distinct code) = 1;
create temp table t_code on commit drop as
with ann_rk as (select h.announcement_id, min(h.rk) rk from t_hu h where h.rk is not null and h.kind = 'build' group by 1 having count(distinct h.rk) = 1),
cand as (select ca.code, c.id cid from t_code_ann ca join ann_rk r using (announcement_id) join complexes c on c.road_key = r.rk and c.kind = 'build')
select code, min(cid) cid, count(distinct cid) n from cand group by code;
create temp table t_code_hold on commit drop as select * from t_code where n > 1;
insert into complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
select cid, 'lh_code', code, 'announcement_complex_images · lh_cutoff_scores',
       '공고 하나에 코드 하나 ∧ 그 공고 세대 행 도로명 키 하나', '소급 1차 2026-11-11', 'auto'
  from t_code where n = 1;
update complexes c set lh_sbd_lgo_no = x.code
  from (select cid, min(code) code from t_code where n = 1 group by cid having count(*) = 1) x where x.cid = c.id;

-- ⑤ 매입 건물코드 — 홍보물 주소의 도로명 키와 1:1 일 때만
create temp table t_bldg on commit drop as
with p as (select distinct apt_brnd_cd code, public.complex_road_key(dng_hs_adr) rk from announcement_promo_files where apt_brnd_cd is not null and dng_hs_adr is not null),
c1 as (select code, min(rk) rk from p where rk is not null group by code having count(distinct rk) = 1),
r1 as (select rk from p where rk is not null group by rk having count(distinct code) = 1)
select c1.code, c.id cid from c1 join r1 using (rk) join complexes c on c.road_key = c1.rk and c.kind = 'buy';
insert into complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
select cid, 'lh_bldg', code, 'announcement_promo_files.apt_brnd_cd', '홍보물 주소(dng_hs_adr) 도로명 키와 1:1', '소급 1차 2026-11-11', 'auto' from t_bldg;

-- ⑥ 세대 행 잇기 — 도로명 키 · 키 없는 건설형 행은 그 공고의 단일 코드 단지로
create temp table t_assign on commit drop as
select h.id, c.id cid, 'road' via from t_hu h join complexes c on c.road_key = h.rk and c.kind = h.kind where h.kind <> 'skip'
union all
select h.id, ca.complex_id, 'lh_code' from t_hu h join t_code_ann a using (announcement_id)
  join complex_aliases ca on ca.alias_type = 'lh_code' and ca.alias_value = a.code
 where h.rk is null and h.kind = 'build';
update housing_units u set complex_id = t.cid from t_assign t where t.id = u.id;

-- ⑦ 공고 ↔ 단지
insert into announcement_complexes (announcement_id, complex_id, source)
select distinct h.announcement_id, t.cid, 'housing_units' from t_assign t join t_hu h on h.id = t.id;
create temp table t_pa on commit drop as
select a.announcement_id, public.complex_road_key(a.precise_address, a.sido_nm) rk,
       case when coalesce(a.housing_type, '') ~ '전세임대' then 'skip'
            when coalesce(a.housing_type_family, '') = '매입임대' or coalesce(a.housing_type, '') ~ '매입|집주인' then 'buy' else 'build' end kind
  from announcements a where a.precise_address is not null;
insert into announcement_complexes (announcement_id, complex_id, source)
select distinct p.announcement_id, c.id, 'precise_address' from t_pa p join complexes c on c.road_key = p.rk and c.kind = p.kind
 where p.kind <> 'skip' on conflict do nothing;
insert into announcement_complexes (announcement_id, complex_id, source)
select distinct a.announcement_id, ca.complex_id, 'lh_code' from t_code_ann a
  join complex_aliases ca on ca.alias_type = 'lh_code' and ca.alias_value = a.code
 on conflict do nothing;

-- 요약
create temp table t_sum on commit drop as
select json_build_object(
 'complexes', (select count(*) from complexes), 'by_kind', (select json_object_agg(kind, n) from (select kind, count(*) n from complexes group by 1) k),
 'aliases', (select json_object_agg(alias_type, n) from (select alias_type, count(*) n from complex_aliases group by 1) k),
 'lh_sbd', (select count(*) from complexes where lh_sbd_lgo_no is not null),
 'hu', (select json_build_object('all', count(*), 'build', count(*) filter (where kind='build'), 'buy', count(*) filter (where kind='buy'), 'skip', count(*) filter (where kind='skip'),
          'keyed_build', count(*) filter (where kind='build' and rk is not null), 'keyed_buy', count(*) filter (where kind='buy' and rk is not null)) from t_hu),
 'filled', (select json_build_object('all', count(*), 'build', count(*) filter (where h.kind='build'), 'buy', count(*) filter (where h.kind='buy'), 'via_code', count(*) filter (where t.via='lh_code')) from t_assign t join t_hu h using (id)),
 'ac', (select json_object_agg(source, n) from (select source, count(*) n from announcement_complexes group by 1) k),
 'hold', (select json_object_agg(hold, json_build_object('groups', g, 'rows', r)) from (select hold, count(*) g, sum(n) r from t_grp where hold is not null group by 1) k),
 'code_hold', (select count(*) from t_code_hold),
 'null_rk', (select json_build_object('jibun', count(*) filter (where rk is null and sido is not null), 'no_sido', count(*) filter (where rk is null and sido is null)) from t_hu where kind <> 'skip'),
 'v25', (select json_build_object('a', (select count(*) from (select road_key from complexes where road_key is not null group by 1 having count(distinct sigungu_nm) > 1) z),
          'c', (select count(*) from complex_aliases where alias_type='lh_code' and alias_value !~ '^[CD][0-9]{5}$'))),
 'round_links', (select json_build_object('pairs', count(*), 'both_hu', count(*) filter (where a1 is not null and a2 is not null), 'same', count(*) filter (where a1 is not null and a1 = a2))
    from (select (select min(complex_id) from announcement_complexes x where x.announcement_id = l.earlier_announcement_id) a1,
                 (select min(complex_id) from announcement_complexes x where x.announcement_id = l.later_announcement_id) a2 from announcement_round_links l) z),
 'inje', (select json_agg(json_build_object('a', announcement_id, 'c', complex_id, 's', source)) from announcement_complexes where announcement_id in ('2015122300021032','2015122300021033'))
) j;
select j from t_sum;
