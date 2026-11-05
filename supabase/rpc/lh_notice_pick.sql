CREATE OR REPLACE FUNCTION public.lh_notice_pick(p_targets jsonb, p_notices jsonb)
 RETURNS TABLE(announcement_id text, scope_text text, bbs_sn text, bbs_tl text, dep_nm text, posted_on date, link_url text, candidates integer)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- LH 공지사항(data.go.kr 15058222 dsList 행)에서 「이 창의 대상주택 공지」를 고른다(2026-11-05 · 우편함 「코드·운영 — 대상주택 공지 감지 구현 …」 1장 ·
-- 설계 = 우편함 「… 대상주택 공지 감지 설계 …」 1장 규칙 1~3 · 실례 …20737 · …20769 · …20875 셋 맞음).
-- 순수 함수다(표를 읽지 않는다) — 대상(p_targets: wave_notice_targets 의 due ∧ not has_warn 행 [{announcement_id, scope_text, post_on, region_office, title_dep}])과
-- 공지 목록(p_notices: API dsList 그대로)을 받아 맞은 짝을 돌려준다 · candidates = 그 (공고, scope) 에 맞은 공지 수(2 이상이면 루틴이 원문으로 고른다).
--   1. 유형 AIS_TP_CD_NM = '매입임대' ∧ 담당본부 DEP_NM = 세대 행 region_office(없으면 제목 「[…지역본부]」) ∧ 게시일 BBS_WOU_DTTM = post_on ± 1일
--   2. 제목 BBS_TL 에 (주택목록 · 대상주택 · 공급대상 · 가능주택) ∧ (게시 · 목록) ∧ 순위 낱말(1순위 (일반) · 2순위) ∧ (당첨자 · 선정결과 · 예비자 · 연기 · 접수마감) 없음
--   3. 0건이면 행 없음(다음 수집에 다시) · 여러 건이면 전부(자동으로 하나를 고르지 않는다)
-- 🔴 개인 식별 값은 이 원천에 없다(칸 11 — 2026-11-05 조사) · 저장은 맞은 칸만(lh_notice_ingest).
with t as (
  select x->>'announcement_id' aid, x->>'scope_text' sc, (x->>'post_on')::date post_on,
         nullif(x->>'region_office', '') ro, nullif(x->>'title_dep', '') tdep
  from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) x
  where x->>'announcement_id' is not null and x->>'scope_text' is not null and x->>'post_on' is not null
),
n as (
  select y->>'BBS_SN' sn, btrim(y->>'BBS_TL') tl, btrim(y->>'DEP_NM') dep, y->>'LINK_URL' url,
         to_date(substring(y->>'BBS_WOU_DTTM' from '^([0-9]{4}\.[0-9]{2}\.[0-9]{2})'), 'YYYY.MM.DD') pd
  from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) y
  where y->>'AIS_TP_CD_NM' = '매입임대' and coalesce(y->>'BBS_SN', '') <> '' and y->>'BBS_WOU_DTTM' ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}'
),
hit as (
  select distinct t.aid, t.sc, n.sn, n.tl, n.dep, n.pd, n.url
  from t join n on n.dep in (t.ro, t.tdep)
   and n.pd between t.post_on - 1 and t.post_on + 1
   and n.tl ~ '(주택목록|대상주택|공급대상|가능주택)' and n.tl ~ '(게시|목록)'
   and n.tl ~ '(1순위\s*\(?\s*일반|2순위)'
   and n.tl !~ '(당첨자|선정결과|예비자|연기|접수마감)'
)
select aid, sc, sn, tl, dep, pd, url, (count(*) over (partition by aid, sc))::integer from hit order by aid, sc, sn;
$function$
