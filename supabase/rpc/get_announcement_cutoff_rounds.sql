CREATE OR REPLACE FUNCTION public.get_announcement_cutoff_rounds(p_ids text[])
 RETURNS TABLE(announcement_id text, complex_name text, unit_types text[], rcr_pan_dt date, ltst_nm text, rqs_tp_nm text, spl_tp_nm text, spl_rmno integer, rqpr_cnt integer, competition_ratio numeric, cutoff_text text, cutoff_state text, via text, history jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 🔵 2026-11-05(우편함 「표시층 — 커트라인 시안 A」) — 카드 「지난 회차」 줄·상세 표의 재료.
  --   lh_cutoff_scores 는 RLS 켬 · 정책 0 · anon 권한 0 그대로 둔다 — 이 함수가 화면에 필요한 칸만 돌려준다
  --   (gmy_stnd_desc · rfe_stnd_desc · pan_nm · 수집 시각은 내보내지 않는다). cutoff_text 는 수집기가 거른 글(표 CHECK 셋)뿐이다.
  -- 🔵 2026-11-05(우편함 「표시층 — 「얼마·될까」 상세 묶음」 1·2) — 길 둘의 합 + 같은 주택형 지난 신청 수 추이.
  --   via 'name'  = 이 공고 묶음(title_dedup_key)의 세대 행 단지명 ↔ sbd_lgo_nm(공백 무시 · 같음) ∧ 세대 행 시군구 ↔ sgg_nm(공백 무시 · 같음).
  --   via 'chain' = 회차 사슬(get_announcement_round_chain_ids 와 같은 규칙 — 묶음 키 = 같은 게시물 링크면 LH 제목 키 · 아니면 title_dedup_key ·
  --                 회차 링크를 방향 없이 6단계까지)로 이은 다른 묶음(hop ≥ 1)의 pan_id 행 중 이 카드 단지와 같은 단지만 —
  --                 🔴 그 함수를 카드마다 부르지 않고 집합으로 한 번 편다(카드마다 부르면 열린 카드 125개가 anon 3초를 넘었다 · 2026-11-05 실측).
  --                 같은 단지 =
  --                 단지 키 = 공백·「-」를 빼고 「블럭」→「블록」 · 한쪽이 다른 쪽과 같거나 그 앞머리이고 바로 뒤가 숫자가 아님
  --                 (「화성동탄2A82블록」 ↔ 「화성동탄2A82블록(28단지)(행복)」 · 「A5」 ↔ 「A53」은 다름) ∧ 시군구는 둘 다 있을 때만 한쪽이 다른 쪽 앞머리.
  --   두 길 공통: 카드 유형(housing_type)이 spl_tp_nm 을 품음 ∧ 이 공고의 회차 날짜(first_announcement_date, 없으면 announcement_date)보다 앞선 rcr_pan_dt.
  --   카드 단지마다 두 길의 후보 중 가장 최근 한 회차(rcr_pan_dt → pan_id → sbd_lgo_no 큰 쪽) — 두 길이 같은 회차면 via 'name'.
  --   history = 같은 단지 번호(sbd_lgo_no) · 같은 주택형(ltst_nm 글자 그대로) · 같은 신청유형의 고른 회차까지(포함) 회차별 신청 수
  --             [{d: rcr_pan_dt, n: rqpr_cnt}] 오래된 것부터 — 같은 날 행이 여럿(pan_id 다름)이면 pan_id 큰 한 행(합하지 않는다 · 정정 겹셈 방지).
  --   주택형 맞춤·대표 고르기는 화면(zfCutoff*)이 unit_types 로 한다.
  -- 배열 상한 2000 — get_announcement_price_summary 와 같은 꼴(SQL 함수라 cast 로 넘을 때만 실패시킨다).
  with recursive guard as (
    select case when coalesce(cardinality(p_ids), 0) > 2000
                then cast('p_ids ' || cardinality(p_ids) || '개 — 2000개 초과 · 나눠 부른다' as integer) end as over
  ),
  ids as (
    select distinct x as aid from unnest(p_ids) x, guard where x is not null and guard.over is null
  ),
  ann as (
    select i.aid, a.housing_type, a.title_dedup_key, coalesce(a.first_announcement_date, a.announcement_date) as adate
    from ids i join public.announcements a on a.announcement_id = i.aid
    where a.housing_type is not null and coalesce(a.first_announcement_date, a.announcement_date) is not null
  ),
  units as (
    select an.aid, h.building_name, coalesce(h.sigungu_nm, '') as sgg, h.unit_type, h.seq
    from ann an
    join public.announcements s on s.title_dedup_key = an.title_dedup_key and s.hidden_from_listing is not true
    join public.housing_units h on h.announcement_id = s.announcement_id
    where coalesce(h.building_name, '') <> ''
  ),
  cx as (
    select aid,
           regexp_replace(building_name, '\s', '', 'g') as bkey,
           replace(regexp_replace(building_name, '[\s-]', '', 'g'), '블럭', '블록') as ckey,
           max(regexp_replace(sgg, '\s', '', 'g')) as skey,
           array_remove(array_agg(unit_type order by seq), null) as unit_types
    from units group by 1, 2, 3
  ),
  by_name as (
    select an.aid, cx.bkey, cx.unit_types, c.*, 'name'::text as via
    from ann an
    join cx on cx.aid = an.aid and cx.skey <> ''
    join public.lh_cutoff_scores c
      on regexp_replace(c.sbd_lgo_nm, '\s', '', 'g') = cx.bkey
     and regexp_replace(coalesce(c.sgg_nm, ''), '\s', '', 'g') = cx.skey
     and position(c.spl_tp_nm in an.housing_type) > 0
     and c.rcr_pan_dt < an.adate
  ),
  link_map as materialized (
    select distinct on (l.linked_announcement_id) l.linked_announcement_id as lid, lh.title_dedup_key as lh_key
    from public.announcement_post_links l
    join public.announcements lh on lh.announcement_id = l.lh_announcement_id
    where lh.title is not null and lh.hidden_from_listing is not true
    order by l.linked_announcement_id, l.lh_announcement_id
  ),
  keyed as materialized (
    select a.announcement_id as kid, (a.title is not null and a.hidden_from_listing is not true) as member,
           coalesce(lm.lh_key, a.title_dedup_key) as gkey
    from public.announcements a left join link_map lm on lm.lid = a.announcement_id
  ),
  walk(aid, gkey, hop) as (
    select an.aid, k.gkey, 0 from ann an join keyed k on k.kid = an.aid
    union
    select w.aid, k2.gkey, w.hop + 1
    from walk w
    join keyed k1 on k1.gkey = w.gkey and k1.member
    join public.announcement_round_links l on k1.kid in (l.earlier_announcement_id, l.later_announcement_id)
    join keyed k2 on k2.kid = case when l.earlier_announcement_id = k1.kid then l.later_announcement_id else l.earlier_announcement_id end
    where w.hop < 6
  ),
  chain as (
    select distinct w.aid, k.kid as pid
    from walk w join keyed k on k.gkey = w.gkey and k.member
    where w.hop >= 1 and not exists (select 1 from walk w0 where w0.aid = w.aid and w0.hop = 0 and w0.gkey = w.gkey)
  ),
  by_chain as (
    select an.aid, cx.bkey, cx.unit_types, c.*, 'chain'::text as via
    from ann an
    join chain on chain.aid = an.aid
    join public.lh_cutoff_scores c on c.pan_id = chain.pid
    join cx on cx.aid = an.aid
    cross join lateral (select replace(regexp_replace(c.sbd_lgo_nm, '[\s-]', '', 'g'), '블럭', '블록') as k,
                               regexp_replace(coalesce(c.sgg_nm, ''), '\s', '', 'g') as s) n
    where position(c.spl_tp_nm in an.housing_type) > 0
      and c.rcr_pan_dt < an.adate
      and (n.k = cx.ckey
           or (n.k like cx.ckey || '%' and substr(n.k, length(cx.ckey) + 1, 1) !~ '[0-9]')
           or (cx.ckey like n.k || '%' and substr(cx.ckey, length(n.k) + 1, 1) !~ '[0-9]'))
      and (n.s = '' or cx.skey = '' or n.s like cx.skey || '%' or cx.skey like n.s || '%')
  ),
  cand as (
    select * from by_name
    union all
    select b.* from by_chain b
    where not exists (select 1 from by_name x where x.aid = b.aid and x.bkey = b.bkey and x.pan_id = b.pan_id and x.sbd_lgo_no = b.sbd_lgo_no
                        and x.ltst_nm = b.ltst_nm and x.rqs_tp_nm = b.rqs_tp_nm)
  ),
  m as (
    select cand.*, dense_rank() over (partition by cand.aid, cand.bkey order by cand.rcr_pan_dt desc, cand.pan_id desc, cand.sbd_lgo_no desc) as rk
    from cand
  ),
  pick as (select * from m where m.rk = 1),
  hist as (
    select p.aid, p.bkey, p.ltst_nm, p.rqs_tp_nm,
           jsonb_agg(jsonb_build_object('d', h.rcr_pan_dt, 'n', h.rqpr_cnt) order by h.rcr_pan_dt) as history
    from (select distinct aid, bkey, sbd_lgo_no, ltst_nm, rqs_tp_nm, rcr_pan_dt from pick) p
    join (
      -- 한 번 훑어 단지·주택형·신청유형·날짜마다 pan_id 큰 한 행(표에 sbd_lgo_no 색인이 없어 행마다 찾으면 표를 행 수만큼 훑는다)
      select distinct on (s.sbd_lgo_no, s.ltst_nm, s.rqs_tp_nm, s.rcr_pan_dt) s.sbd_lgo_no, s.ltst_nm, s.rqs_tp_nm, s.rcr_pan_dt, s.rqpr_cnt
      from public.lh_cutoff_scores s
      where s.sbd_lgo_no in (select pk.sbd_lgo_no from pick pk)
      order by s.sbd_lgo_no, s.ltst_nm, s.rqs_tp_nm, s.rcr_pan_dt, s.pan_id desc
    ) h on h.sbd_lgo_no = p.sbd_lgo_no and h.ltst_nm = p.ltst_nm and h.rqs_tp_nm = p.rqs_tp_nm and h.rcr_pan_dt <= p.rcr_pan_dt
    group by 1, 2, 3, 4
  )
  select p.aid, p.sbd_lgo_nm, p.unit_types, p.rcr_pan_dt, p.ltst_nm, p.rqs_tp_nm, p.spl_tp_nm, p.spl_rmno, p.rqpr_cnt,
         p.competition_ratio, p.cutoff_text, p.cutoff_state, p.via, hist.history
  from pick p
  left join hist on hist.aid = p.aid and hist.bkey = p.bkey and hist.ltst_nm = p.ltst_nm and hist.rqs_tp_nm = p.rqs_tp_nm
  order by p.aid, p.sbd_lgo_nm, p.ltst_nm, p.rqs_tp_nm
$function$
