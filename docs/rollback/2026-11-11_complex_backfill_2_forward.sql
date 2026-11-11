set statement_timeout = '110s';
set local lock_timeout = '5s';
-- 단지 키 소급 2차(2026-11-11 · 우편함 「코드·운영 — 단지 키 2차 …」 1·3) — 붙여 쓴 번호 18행 + LH 코드 2차 규칙. hu 칸은 complex_id 하나만.
do $$ begin
  if not exists (select 1 from zipfit_ops.schema_migrations where filename = '2026-11-11_03_complex_keys_2.sql') then raise exception 'GUARD 2차 함수 미적용'; end if;
end $$;
create temp table b_sum0 on commit drop as select (select count(*) from complex_aliases where alias_type='lh_code') lh0, (select count(*) from complexes) cx0, (select count(*) from housing_units where complex_id is not null) hu0;

-- ① 키 없는 세대 행(새 함수로 키를 받는 것)
create temp table b_hu on commit drop as
select h.id, h.announcement_id, nullif(btrim(h.building_name), '') bname, coalesce(h.sido_nm, a.sido_nm) sido, coalesce(nullif(h.sigungu_nm, ''), a.sigungu_nm) sgg, a.supply_org,
       public.complex_road_key(h.address, coalesce(h.sido_nm, a.sido_nm)) rk,
       case when coalesce(a.housing_type, '') ~ '전세임대' then 'skip'
            when coalesce(a.housing_type_family, '') = '매입임대' or coalesce(a.housing_type, '') ~ '매입|집주인' then 'buy' else 'build' end kind
  from housing_units h left join lateral (select a0.* from announcements a0 where a0.announcement_id = h.announcement_id order by a0.source limit 1) a on true
 where h.complex_id is null;
delete from b_hu where rk is null or kind = 'skip';
create temp table b_grp on commit drop as
select b.rk, array_agg(distinct b.kind) kinds, count(distinct b.sgg) filter (where b.sgg is not null) n_sgg, array_agg(distinct b.bname) filter (where b.bname is not null) names, count(*) n,
       (select c.id from complex_aliases ca join complexes c on c.id = ca.complex_id where ca.alias_type = 'road' and ca.alias_value = b.rk) cid_exist,
       (select c.kind from complex_aliases ca join complexes c on c.id = ca.complex_id where ca.alias_type = 'road' and ca.alias_value = b.rk) kind_exist
  from b_hu b group by b.rk;
alter table b_grp add column hold text;
update b_grp g set hold = case when cardinality(kinds) > 1 then 'kind 갈림' when kind_exist is not null and kind_exist <> kinds[1] then '기존 단지 kind 다름'
  when n_sgg > 1 then '시군구 갈림'
  when (select count(distinct m[1]) from unnest(coalesce(names, '{}')) nm cross join lateral regexp_matches(nm, '([0-9]+)\s*(?:차|단지)', 'g') m) > 1 then '이름 단지 번호 갈림' end;
insert into complexes (kind, supplier, sido_nm, sigungu_nm, road_key, display_name)
select g.kinds[1],
       (select supply_org from b_hu x where x.rk = g.rk and supply_org is not null group by 1 order by count(*) desc, 1 limit 1),
       (select sido from b_hu x where x.rk = g.rk and sido is not null group by 1 order by count(*) desc, 1 limit 1),
       (select sgg from b_hu x where x.rk = g.rk and sgg is not null group by 1 order by count(*) desc, 1 limit 1),
       g.rk,
       (select bname from b_hu x where x.rk = g.rk and bname is not null group by 1 order by count(*) desc, 1 limit 1)
  from b_grp g where g.hold is null and g.cid_exist is null order by g.rk;
insert into complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
select c.id, 'road', c.road_key, 'housing_units.address', 'complex_road_key(address, sido_nm) 붙여 쓴 번호 · 세대 행 ' || g.n, '소급 2차 2026-11-11', 'auto'
  from b_grp g join complexes c on c.road_key = g.rk where g.hold is null and g.cid_exist is null
   and not exists (select 1 from complex_aliases ca where ca.alias_type = 'road' and ca.alias_value = g.rk);
create temp table b_assign on commit drop as
select b.id, b.announcement_id, ca.complex_id cid from b_hu b join b_grp g using (rk)
  join complex_aliases ca on ca.alias_type = 'road' and ca.alias_value = b.rk where g.hold is null;
update housing_units u set complex_id = t.cid from b_assign t where t.id = u.id and u.complex_id is null;
insert into announcement_complexes (announcement_id, complex_id, source) select distinct announcement_id, cid, 'housing_units' from b_assign on conflict do nothing;

-- ② LH 코드 2차 — 코드 하나당 그 코드가 나온 공고들(세대 행 도로명 키가 있는 공고)의 건설형 키 교집합이 정확히 하나
create temp table b_code_ann on commit drop as
select distinct code, announcement_id from (
  select sbd_lgo_no code, announcement_id from announcement_complex_images where sbd_lgo_no ~ '^[CD][0-9]{5}$'
  union select sbd_lgo_no, pan_id from lh_cutoff_scores where sbd_lgo_no ~ '^[CD][0-9]{5}$') s
 where not exists (select 1 from complex_aliases ca where ca.alias_type = 'lh_code' and ca.alias_value = s.code);
create temp table b_ann_key on commit drop as
select distinct h.announcement_id, ca.alias_value rk, c.id cid, c.sigungu_nm
  from housing_units h join complexes c on c.id = h.complex_id and c.kind = 'build'
  join complex_aliases ca on ca.complex_id = c.id and ca.alias_type = 'road'
 where h.announcement_id in (select announcement_id from b_code_ann);
create temp table b_code on commit drop as
with ca as (select a.code, count(distinct a.announcement_id) n_ann from b_code_ann a where exists (select 1 from b_ann_key k where k.announcement_id = a.announcement_id) group by a.code),
kc as (select a.code, k.rk, k.cid, k.sigungu_nm, count(distinct a.announcement_id) n from b_code_ann a join b_ann_key k using (announcement_id) group by 1,2,3,4),
inter as (select kc.* from kc join ca using (code) where kc.n = ca.n_ann)
select ca.code, ca.n_ann, (select count(*) from inter i where i.code = ca.code) n_inter, (select min(cid) from inter i where i.code = ca.code) cid,
       (select count(distinct sigungu_nm) from inter i where i.code = ca.code) n_sgg
  from ca;
insert into complex_aliases (complex_id, alias_type, alias_value, source, evidence, added_by, confirmed)
select cid, 'lh_code', code, 'announcement_complex_images · lh_cutoff_scores',
       '2차 규칙: 그 코드가 나온 공고 ' || n_ann || '곳의 건설형 세대 행 도로명 키 교집합이 하나', '소급 2차 2026-11-11', 'auto'
  from b_code where n_inter = 1 on conflict do nothing;
update complexes c set lh_sbd_lgo_no = x.code
  from (select cid, min(code) code from b_code where n_inter = 1 group by cid having count(*) = 1) x
 where x.cid = c.id and c.lh_sbd_lgo_no is null;
insert into announcement_complexes (announcement_id, complex_id, source)
select distinct a.announcement_id, b.cid, 'lh_code' from b_code b join b_code_ann a using (code) where b.n_inter = 1 on conflict do nothing;

create temp table b_sum on commit drop as
select json_build_object(
 'hu_new_key', (select count(*) from b_hu), 'groups', (select count(*) from b_grp), 'hold', (select json_object_agg(coalesce(hold,'ok'), n) from (select hold, count(*) n from b_grp group by 1) z),
 'attached_existing', (select count(*) from b_grp where hold is null and cid_exist is not null), 'new_cx', (select count(*) from complexes) - (select cx0 from b_sum0),
 'hu_filled', (select count(*) from housing_units where complex_id is not null) - (select hu0 from b_sum0),
 'codes', (select json_build_object('cand', count(*), 'inter1', count(*) filter (where n_inter = 1), 'inter0', count(*) filter (where n_inter = 0), 'inter2plus', count(*) filter (where n_inter > 1)) from b_code),
 'lh_code_total', (select count(*) from complex_aliases where alias_type='lh_code'), 'lh0', (select lh0 from b_sum0),
 'dict9', (select json_agg(c.id || ':' || coalesce(c.lh_sbd_lgo_no, '-') || ':' || (select string_agg(alias_value, '/') from complex_aliases x where x.complex_id = c.id and x.alias_type = 'lh_code')) from complexes c where c.id in (6066,6216,6217,6510,6511,6512,8206,8291)),
 'v25a', (select count(*) from (select road_key from complexes where road_key is not null group by 1 having count(distinct sigungu_nm) > 1) z),
 'code_multi_sgg', (select count(*) from b_code where n_inter = 1 and n_sgg > 1)) j;
select j from b_sum;
