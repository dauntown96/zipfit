CREATE OR REPLACE FUNCTION public.lh_cutoff_notice_pick(p_targets jsonb, p_notices jsonb)
 RETURNS TABLE(announcement_id text, bbs_sn text, bbs_tl text, dep_nm text, posted_on date, link_url text, prev_to date, win_from date)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- LH 공지사항(data.go.kr 15058222 dsList 행)에서 「선순위 마감 — 다음 순위 접수 없음」 공지를 고른다(2026-11-24 · 우편함 「코드·운영 — 열여섯째 묶음」 1).
-- 순수 함수다(표를 읽지 않는다) — 대상(p_targets: wave_cutoff_targets 행 [{announcement_id, prev_to, win_from, region_office, title_dep, title}])과 공지 목록(API dsList 그대로).
--   1. 유형 AIS_TP_CD_NM = '매입임대' ∧ 담당본부 DEP_NM = region_office 또는 제목 「[…지역본부]」 ∧ prev_to < 게시일 < win_from
--   2. 이름 토막 — 카드 제목(공백 뺌)의 「(20)YY년N차」(또는 「YY-N차」)가 공지 제목에도 있고(연도 두 자리로 맞춤) · 그 뒤 유형 낱말(일반 · 청년 …)이 있으면 그것도
--   3. 제목 BBS_TL 에 「모집」 ∧ (마감 · 받지 · 접수하지) ∧ (당첨자 · 선정결과 · 결과 · 청약률 · 신청현황 · 선착순 · 대상주택 · 주택목록 · 공급대상 · 가능주택 · 연기) 없음
-- 시험(2026-11-24 · 공지 API 10-24~11-24 142건 실물): …20972 → bbsSn 9102432518 맞음 · 같은 토막 「[당첨자발표] [대구경북] 2026년 2차 일반 …」 ·
--   「[강원지역본부] 26년 2차 일반 … 공급대상주택 게시」 · 인천 「… 연기 안내」 · 경기북부 「선착순 … 접수마감 안내」 안 맞음 · 열린 카드(…20882) 새로 맞음 0.
-- 🔴 개인 식별 값은 이 원천에 없다(lh_notice_pick 과 같은 원천 · 2026-11-05 조사).
with t as (
  select x->>'announcement_id' aid, (x->>'prev_to')::date p0, (x->>'win_from')::date w0,
         nullif(x->>'region_office', '') ro, nullif(x->>'title_dep', '') tdep,
         regexp_replace(regexp_replace(coalesce(x->>'title', ''), '\s', '', 'g'), '(?:20)?([0-9]{2})-([0-9]+)차', '\1년\2차', 'g') tz
  from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) x
  where x->>'announcement_id' is not null and x->>'prev_to' is not null and x->>'win_from' is not null
),
tk as (
  select t.*, substring(t.tz from '(?:20)?([0-9]{2})년[0-9]+차') yy, substring(t.tz from '(?:20)?[0-9]{2}년([0-9]+)차') ch,
         nullif(regexp_replace(coalesce(substring(t.tz from '(?:20)?[0-9]{2}년[0-9]+차([가-힣·ㆍⅠⅡ]+)'), ''), '(매입|임대|주택).*$', ''), '') kw
  from t
),
n as (
  select y->>'BBS_SN' sn, btrim(y->>'BBS_TL') tl, btrim(y->>'DEP_NM') dep, y->>'LINK_URL' url,
         regexp_replace(regexp_replace(coalesce(y->>'BBS_TL', ''), '\s', '', 'g'), '(?:20)?([0-9]{2})-([0-9]+)차', '\1년\2차', 'g') tz,
         to_date(substring(y->>'BBS_WOU_DTTM' from '^([0-9]{4}\.[0-9]{2}\.[0-9]{2})'), 'YYYY.MM.DD') pd
  from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) y
  where y->>'AIS_TP_CD_NM' = '매입임대' and coalesce(y->>'BBS_SN', '') <> '' and y->>'BBS_WOU_DTTM' ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}'
)
select distinct tk.aid, n.sn, n.tl, n.dep, n.pd, n.url, tk.p0, tk.w0
  from tk join n on n.dep in (tk.ro, tk.tdep)
   and n.pd > tk.p0 and n.pd < tk.w0
   and tk.yy is not null and tk.ch is not null
   and n.tz ~ ('(^|[^0-9])(20)?' || tk.yy || '년' || tk.ch || '차')
   and (tk.kw is null or position(tk.kw in n.tz) > 0)
   and n.tl ~ '모집' and n.tl ~ '(마감|받지|접수하지)'
   and n.tl !~ '(당첨자|선정결과|결과|청약률|신청현황|선착순|대상주택|주택목록|공급대상|가능주택|연기)'
 order by 1, 2;
$function$
