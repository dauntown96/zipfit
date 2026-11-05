-- 카드 「지난 회차」 줄·상세 표 재료 — LH 합격점수(lh_cutoff_scores)를 화면이 읽는 길(2026-11-05 · 우편함 「표시층 — 커트라인 시안 A」).
-- 🔴 표는 그대로 닫아 둔다(RLS 켬 · 정책 0 · anon·authenticated 권한 0) — SELECT 정책·뷰 대신 정의자 함수를 고른 까닭:
--   ① 화면에 필요한 칸만 내보낸다(gmy_stnd_desc · rfe_stnd_desc · pan_nm · 수집 시각 · 런 기록은 밖) — 정책을 열면 표 전 칸·전 행이 REST 로 열린다.
--   ② 맞춤(묶음 세대 행 단지명·시군구 ↔ 합격점수 · 유형 · 앞선 회차 중 최근)을 한 번에 집합으로 한다 — 화면이 카드마다 표를 훑지 않는다.
--   ③ 배열 상한 2000(가격 요약 RPC 와 같은 꼴) — 익명이 부를 수 있는 정의자 함수의 CPU 상한.
-- 개인 값: cutoff_text 는 수집기(collect-lh-cutoff)가 거른 글이고 표 CHECK 셋(꼴 · 금지 낱말 · 신청 5명 이하 비움)이 DB 에서 다시 막는다 — 이 함수는 그 칸을 그대로 옮길 뿐 새 글을 만들지 않는다.
-- 되돌리기: drop function public.get_announcement_cutoff_rounds(text[]);
-- zipfit:function get_announcement_cutoff_rounds(text[]) acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=true
-- zipfit:anon select count(*) from get_announcement_cutoff_rounds((select array_agg(announcement_id) from (select announcement_id from get_announcements_deduped(null,null,null) limit 50) x))
CREATE OR REPLACE FUNCTION public.get_announcement_cutoff_rounds(p_ids text[])
 RETURNS TABLE(announcement_id text, complex_name text, unit_types text[], rcr_pan_dt date, ltst_nm text, rqs_tp_nm text, spl_tp_nm text, spl_rmno integer, rqpr_cnt integer, competition_ratio numeric, cutoff_text text, cutoff_state text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 🔵 2026-11-05(우편함 「표시층 — 커트라인 시안 A」) — 카드 「지난 회차」 줄·상세 표의 재료.
  --   lh_cutoff_scores 는 RLS 켬 · 정책 0 · anon 권한 0 그대로 둔다 — 이 함수가 화면에 필요한 칸만 돌려준다
  --   (gmy_stnd_desc · rfe_stnd_desc · pan_nm · 수집 시각은 내보내지 않는다). cutoff_text 는 수집기가 거른 글(표 CHECK 셋)뿐이다.
  -- 고르는 행(승인본 규칙 4): 이 공고 묶음(title_dedup_key)의 세대 행 단지명 ↔ sbd_lgo_nm(공백 무시)
  --   ∧ 세대 행 시군구 ↔ sgg_nm(공백 무시) ∧ 카드 유형(housing_type)이 spl_tp_nm 을 품음
  --   ∧ 이 공고의 회차 날짜(first_announcement_date, 없으면 announcement_date)보다 앞선 rcr_pan_dt 중 가장 최근 한 회차(같은 날이면 pan_id 큰 쪽).
  --   주택형 맞춤·대표 고르기는 화면(zfCutoff*)이 unit_types 로 한다.
  -- 배열 상한 2000 — get_announcement_price_summary 와 같은 꼴(SQL 함수라 cast 로 넘을 때만 실패시킨다).
  with guard as (
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
    select an.aid, regexp_replace(h.building_name, '\s', '', 'g') as bkey, regexp_replace(coalesce(h.sigungu_nm, ''), '\s', '', 'g') as skey,
           h.unit_type, h.seq
    from ann an
    join public.announcements s on s.title_dedup_key = an.title_dedup_key and s.hidden_from_listing is not true
    join public.housing_units h on h.announcement_id = s.announcement_id
    where coalesce(h.building_name, '') <> '' and coalesce(h.sigungu_nm, '') <> ''
  ),
  cx as (
    select aid, bkey, skey, array_remove(array_agg(unit_type order by seq), null) as unit_types
    from units group by aid, bkey, skey
  ),
  m as (
    select an.aid, c.*, cx.unit_types,
           dense_rank() over (partition by an.aid, cx.bkey order by c.rcr_pan_dt desc, c.pan_id desc) as rk
    from ann an
    join cx on cx.aid = an.aid
    join public.lh_cutoff_scores c
      on regexp_replace(c.sbd_lgo_nm, '\s', '', 'g') = cx.bkey
     and regexp_replace(coalesce(c.sgg_nm, ''), '\s', '', 'g') = cx.skey
     and position(c.spl_tp_nm in an.housing_type) > 0
     and c.rcr_pan_dt < an.adate
  )
  select m.aid, m.sbd_lgo_nm, m.unit_types, m.rcr_pan_dt, m.ltst_nm, m.rqs_tp_nm, m.spl_tp_nm, m.spl_rmno, m.rqpr_cnt,
         m.competition_ratio, m.cutoff_text, m.cutoff_state
  from m where m.rk = 1
  order by m.aid, m.sbd_lgo_nm, m.ltst_nm, m.rqs_tp_nm
$function$
;
revoke all on function public.get_announcement_cutoff_rounds(text[]) from public, anon, authenticated;
grant execute on function public.get_announcement_cutoff_rounds(text[]) to service_role;
grant execute on function public.get_announcement_cutoff_rounds(text[]) to anon;
grant execute on function public.get_announcement_cutoff_rounds(text[]) to authenticated;
comment on function public.get_announcement_cutoff_rounds(text[]) is
  '카드 「지난 회차」(LH 합격점수) 재료 — 묶음 세대 행 단지명·시군구 ↔ lh_cutoff_scores · 유형 · 이 공고보다 앞선 가장 최근 회차 행 · 화면 필요 칸만 · 2026-11-05';
