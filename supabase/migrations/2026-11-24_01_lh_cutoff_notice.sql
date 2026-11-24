-- 선순위 마감 공지 감지(2026-11-24 · 우편함 「코드·운영 — 열여섯째 묶음」 1 · 백로그 「매입 순위별 카드의 『선순위 마감 — 다음 순위 접수 없음』 LH 공지를 감지 장치가 못 찾는다」 ·
--   근거 = 우편 「운영 — …20972」 회신 ⑦ — 「[부산] 2026년 2차 일반 매입임대주택 입주자 모집 마감」(2026.11.16 · bbsSn 9102432518)을 lh_notice_pick 이 처음부터 못 봤다).
-- 🔴 대기열에 넣지 않는다 — 셈과 저장만(health-ops ℹ️ lh_cutoff_notice). 새 갈래(「#선순위마감」)는 루틴 지시 v2.24 · reverify v5.10 이 모른다
--    (v5.10 이 아는 키는 #정정 · #차수 · #첨부 셋 — #차수 로 보내면 「⚠️ 이번 차수 공급대상주택」 행을 쓰는 꼴이라 틀린다). 루틴·스킬 개정 뒤 발송기 갈래를 따로 연다.
-- ① wave_cutoff_targets(p_now) — wave_notice_targets() 의 둘째 이후 창 카드마다 「앞 창 끝 뒤 ~ 이 창 시작 전」 · 이미 ⚠️ 선순위 마감 행이 있으면 뺌.
-- ② lh_cutoff_notice_pick(대상, 공지 목록) — 순수 맞춤 함수(표를 읽지 않는다).
-- ③ 표 lh_cutoff_notice_matches(맞은 공지만) · lh_notice_run_log 칸 둘(cutoff_targets · cutoff_matched).
-- ④ lh_notice_ingest — 받은 같은 공지 목록으로 ② 도 맞춰 ③ 에 남긴다(종전 차수 맞춤은 그대로).
-- 되돌리기: lh_notice_ingest 를 supabase/rpc 이전 커밋 판으로 · drop function lh_cutoff_notice_pick(jsonb, jsonb), wave_cutoff_targets(timestamp without time zone);
--   drop table lh_cutoff_notice_matches; alter table lh_notice_run_log drop column cutoff_targets, drop column cutoff_matched;
-- zipfit:function wave_cutoff_targets(timestamp without time zone) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function lh_cutoff_notice_pick(jsonb,jsonb) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function lh_notice_ingest(jsonb,jsonb) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
DO $$ begin
  if to_regclass('public.lh_cutoff_notice_matches') is not null then raise exception 'GUARD lh_cutoff_notice_matches exists'; end if;
end $$;

create table public.lh_cutoff_notice_matches (
  announcement_id text        not null,
  bbs_sn          text        not null,
  bbs_tl          text        not null,
  dep_nm          text,
  posted_on       date        not null,
  link_url        text,
  prev_to         date,
  win_from        date,
  matched_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  primary key (announcement_id, bbs_sn)
);
comment on table public.lh_cutoff_notice_matches is
  'LH 공지사항(15058222) 중 매입 순위별 카드의 「선순위 마감 — 다음 순위 접수 없음」 공지로 맞은 것(lh_cutoff_notice_pick) — collect-lh-notices · 2026-11-24. 맞은 공지의 칸만 · 개인 식별 값 0 · 대기열에 넣지 않는다';
comment on column public.lh_cutoff_notice_matches.announcement_id is '카드 대표 공고 ID(wave_cutoff_targets.announcement_id)';
comment on column public.lh_cutoff_notice_matches.prev_to is '맞출 때 앞 창 끝(이 날 뒤 게시만 맞음)';
comment on column public.lh_cutoff_notice_matches.win_from is '맞출 때 이 창 시작(이 날 앞 게시만 맞음)';
alter table public.lh_cutoff_notice_matches enable row level security;
revoke all on table public.lh_cutoff_notice_matches from public, anon, authenticated;
grant select, insert, update on table public.lh_cutoff_notice_matches to service_role;

alter table public.lh_notice_run_log add column cutoff_targets integer, add column cutoff_matched integer;
comment on column public.lh_notice_run_log.cutoff_targets is '그 런의 선순위 마감 맞춤 대상 카드 수(wave_cutoff_targets · 2026-11-24 · 그 전 런은 NULL)';
comment on column public.lh_notice_run_log.cutoff_matched is '그 런에서 맞은 선순위 마감 공지 짝 수(lh_cutoff_notice_pick)';

CREATE OR REPLACE FUNCTION public.wave_cutoff_targets(p_now timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Seoul'::text))
 RETURNS TABLE(announcement_id text, win integer, prev_to date, win_from date, region_office text, title_dep text, title text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 선순위 마감 공지 맞춤 대상(2026-11-24 · 우편함 「코드·운영 — 열여섯째 묶음」 1) — 카드·창 정의는 wave_notice_targets() 그대로(한 정의 · 여기서 다시 짜지 않는다).
--   대상 = wave_notice_targets(p_now) 의 카드(둘째 이후 창 · scope 마다 여러 행이면 하나로) 중
--     prev_to(앞 창 끝) = 그 카드 창들 공고 id 경로 행 중 end_date < win_from 의 최댓값 — 창은 겹치지 않고 차례라 이것이 바로 앞 창의 끝이다
--     ∧ p_now 날짜 > prev_to(앞 창이 끝남) ∧ 그 id 들 정책 행에 분류 「⚠️」 ∧ 「선순위」 ∧ 「마감」 행 없음(이미 반영 — …20972 선례).
--   맞춤 기간 = (prev_to, win_from) — 앞 창 끝 다음 날부터 이 창 시작 전날까지 게시된 공지.
-- 부르는 곳: EF collect-lh-notices(받을 기간 정하기) · lh_notice_ingest(맞춤) · health-ops lh_cutoff_notice(대상 수).
with t as (select distinct on (w.announcement_id) w.announcement_id, w.win, w.win_from, w.region_office, w.title_dep, w.all_ids
             from public.wave_notice_targets(p_now) w order by w.announcement_id, w.scope_text nulls last),
p as (select t.*, (select max(x.end_date) from public.announcement_apply_routes x
                    where x.announcement_id = any(t.all_ids) and x.end_date < t.win_from) prev_to
        from t)
select p.announcement_id, p.win, p.prev_to, p.win_from, p.region_office, p.title_dep,
       (select a.title from public.announcements a where a.announcement_id = p.announcement_id)
  from p
 where p.prev_to is not null and p_now::date > p.prev_to
   and not exists (select 1 from public.announcement_policies q
                    where q.announcement_id = any(p.all_ids) and q.category like '⚠️%' and q.category like '%선순위%' and q.category like '%마감%')
 order by p.prev_to, p.announcement_id;
$function$;
revoke execute on function public.wave_cutoff_targets(timestamp without time zone) from public, anon, authenticated;
grant execute on function public.wave_cutoff_targets(timestamp without time zone) to service_role;

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
$function$;
revoke execute on function public.lh_cutoff_notice_pick(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.lh_cutoff_notice_pick(jsonb, jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.lh_notice_ingest(p_notices jsonb, p_run jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- EF collect-lh-notices 가 부른다(service_role) — 받은 공지 목록을 지금 대상(wave_notice_targets() 의 due ∧ not has_warn)과 맞춰(lh_notice_pick)
-- 맞은 짝만 lh_notice_matches 에 남기고(있으면 last_seen_at · candidates 만 갱신) 런 기록 한 행을 쓴다(2026-11-05 · 우편함 「코드·운영 — 대상주택 공지 감지 구현 …」).
-- 🔵 2026-11-24(우편함 「코드·운영 — 열여섯째 묶음」 1) — 같은 목록을 선순위 마감 대상(wave_cutoff_targets())과도 맞춰(lh_cutoff_notice_pick)
--   lh_cutoff_notice_matches 에 남긴다 · 런 기록 칸 cutoff_targets · cutoff_matched · 🔴 대기열에 넣지 않는다(셈만 — 루틴·스킬이 새 갈래를 모른다).
-- p_run = {targets, calls, ok_calls, errors[], duration_ms, window_from, window_to} — EF 가 잰 셈(키·URL 은 싣지 않는다).
-- 🔴 대기열에 넣지 않는다 — 대기열은 analysis_dispatch_tick #차수 갈래가 켜기 칸(analysis_dispatch_config.wave_notice_enabled)을 보고 넣는다.
declare
  v_tg jsonb; v_ct jsonb; v_new int := 0; v_hit int := 0; v_n int; v_chit int := 0; v_cnew int := 0;
begin
  select coalesce(jsonb_agg(jsonb_build_object('announcement_id', t.announcement_id, 'scope_text', t.scope_text, 'post_on', t.post_on,
                                               'region_office', t.region_office, 'title_dep', t.title_dep)), '[]'::jsonb)
    into v_tg from public.wave_notice_targets() t where t.due and not t.has_warn;
  select coalesce(jsonb_agg(jsonb_build_object('announcement_id', c.announcement_id, 'prev_to', c.prev_to, 'win_from', c.win_from,
                                               'region_office', c.region_office, 'title_dep', c.title_dep, 'title', c.title)), '[]'::jsonb)
    into v_ct from public.wave_cutoff_targets() c;
  v_n := jsonb_array_length(coalesce(p_notices, '[]'::jsonb));
  with p as (select * from public.lh_notice_pick(v_tg, p_notices)),
  up as (
    insert into public.lh_notice_matches as m (announcement_id, scope_text, bbs_sn, bbs_tl, dep_nm, posted_on, link_url, candidates)
    select p.announcement_id, p.scope_text, p.bbs_sn, p.bbs_tl, p.dep_nm, p.posted_on, p.link_url, p.candidates from p
    on conflict (announcement_id, scope_text, bbs_sn) do update
       set last_seen_at = now(), candidates = excluded.candidates, bbs_tl = excluded.bbs_tl, link_url = excluded.link_url
    returning (xmax = 0) as ins
  )
  select count(*), count(*) filter (where ins) into v_hit, v_new from up;
  with p as (select * from public.lh_cutoff_notice_pick(v_ct, p_notices)),
  up as (
    insert into public.lh_cutoff_notice_matches as m (announcement_id, bbs_sn, bbs_tl, dep_nm, posted_on, link_url, prev_to, win_from)
    select p.announcement_id, p.bbs_sn, p.bbs_tl, p.dep_nm, p.posted_on, p.link_url, p.prev_to, p.win_from from p
    on conflict (announcement_id, bbs_sn) do update
       set last_seen_at = now(), bbs_tl = excluded.bbs_tl, link_url = excluded.link_url, prev_to = excluded.prev_to, win_from = excluded.win_from
    returning (xmax = 0) as ins
  )
  select count(*), count(*) filter (where ins) into v_chit, v_cnew from up;
  insert into public.lh_notice_run_log (targets, calls, ok_calls, notices, matched, new_matches, window_from, window_to, duration_ms, errors, cutoff_targets, cutoff_matched)
  values (jsonb_array_length(v_tg), coalesce((p_run->>'calls')::int, 0), coalesce((p_run->>'ok_calls')::int, 0), v_n, v_hit, v_new,
          (p_run->>'window_from')::date, (p_run->>'window_to')::date, (p_run->>'duration_ms')::int,
          coalesce(p_run->'errors', '[]'::jsonb), jsonb_array_length(v_ct), v_chit);
  return jsonb_build_object('targets', jsonb_array_length(v_tg), 'notices', v_n, 'matched', v_hit, 'new', v_new,
                            'cutoff_targets', jsonb_array_length(v_ct), 'cutoff_matched', v_chit, 'cutoff_new', v_cnew);
end
$function$;

-- 시험(되돌리기 전용 check 안에서 돈다) — …20972 실물 공지 한 줄은 맞고 같은 토막 당첨자 발표 · 대상주택 게시 공지는 안 맞는다.
DO $$ declare v int; w int; begin
  select count(*), count(*) filter (where bbs_sn = '9102432518') into v, w from public.lh_cutoff_notice_pick(
    '[{"announcement_id":"2015122300020972","prev_to":"2026-11-12","win_from":"2026-12-07","region_office":"부산울산지역본부","title_dep":null,"title":"[부산] 2026년 2차 일반 매입임대주택 입주자 모집 공고"},
      {"announcement_id":"T-DG","prev_to":"2026-11-01","win_from":"2026-12-01","region_office":"대구경북지역본부","title_dep":null,"title":"[대구경북] 2026년 2차 일반 매입임대주택 입주자 모집 공고"},
      {"announcement_id":"T-GW","prev_to":"2026-10-29","win_from":"2026-11-23","region_office":"강원지역본부","title_dep":"강원지역본부","title":"[강원지역본부] 26년 2차 일반 매입임대주택 입주자 모집 공고"}]'::jsonb,
    '[{"AIS_TP_CD_NM":"매입임대","BBS_SN":"9102432518","BBS_TL":"[부산] 2026년 2차 일반 매입임대주택 입주자 모집 마감","DEP_NM":"부산울산지역본부","BBS_WOU_DTTM":"2026.11.16","LINK_URL":"x"},
      {"AIS_TP_CD_NM":"매입임대","BBS_SN":"D1","BBS_TL":"[당첨자발표] [대구경북] 2026년 2차 일반 매입임대주택 1순위(우선) 당첨자 및 예비","DEP_NM":"대구경북지역본부","BBS_WOU_DTTM":"2026.11.16","LINK_URL":"x"},
      {"AIS_TP_CD_NM":"매입임대","BBS_SN":"G1","BBS_TL":"[강원지역본부] 26년 2차 일반 매입임대주택 1순위(일반) 및 2순위 공급대상주택 게시","DEP_NM":"강원지역본부","BBS_WOU_DTTM":"2026.11.05","LINK_URL":"x"}]'::jsonb);
  if v <> 1 or w <> 1 then raise exception 'GUARD lh_cutoff_notice_pick 시험 — 맞음 % (그중 9102432518 %) · 기대 1 · 1', v, w; end if;
end $$;
