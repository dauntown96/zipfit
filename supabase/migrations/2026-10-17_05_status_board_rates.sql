-- zipfit:function zipfit_ops.metric_analysis_rate() acl={postgres=X/postgres} secdef=false
-- zipfit:function zipfit_ops.metric_open_by_source() acl={postgres=X/postgres} secdef=false
-- zipfit:function ops_status_board() acl={postgres=X/postgres,authenticated=X/postgres} secdef=true
-- 관리자 상태판 칸 둘(2026-10-17 · 우편함 「코드·운영 — … 상태판 칸 …」 6 · 백로그 「관리자 페이지 (가)」 본문 후보 — DB 함수 쪽만 · 화면은 다음 회차).
--   ① zipfit_ops.metric_analysis_rate() — 분석률 정본(⑨ 6장 · 루틴 분모) 한 정의(supabase/metrics/analysis_rate.sql 첫 문장을 옮김 · 그 파일은 이 함수를 부른다).
--   ② zipfit_ops.metric_open_by_source() — 열린 카드 기준 출처별(LH · MYHOME 단독 · SH …).
--   ③ ops_status_board() — rates(①②) · recent_runs(최근 분석 회차 다섯) 칸을 더한다(종전 칸 그대로).
-- 되돌리기: git show <이 PR 앞 커밋>:supabase/rpc/ops_status_board.sql 로 create or replace 뒤
--   drop function zipfit_ops.metric_open_by_source(), zipfit_ops.metric_analysis_rate();
CREATE OR REPLACE FUNCTION zipfit_ops.metric_analysis_rate()
 RETURNS TABLE(phase text, denominator bigint, numerator bigint, not_done text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — … 상태판 칸 …」 6) — 분석률 정본(⑨ 6장 · 루틴 분모) 한 정의.
--   supabase/metrics/analysis_rate.sql 첫 문장을 여기로 옮겼다 — 그 파일과 관리자 상태판(ops_status_board)이 이 함수 하나를 부른다(산식 사본 없음).
--   분모 = 대표 ∧ 묶음 첨부 > 0 ∧ apply_end ≥ 오늘+3 · 국면(접수 전 apply_start > 오늘 · 접수 중 그 밖) · 분자 = 같은 묶음 키·같은 회차(같은 마감 · 링크) 완료 계열 분석.
--   🔴 분석 발송기 analysis_dispatch_tick 의 후보가 이 분모 ∧ 미분석과 같은 규칙이다 — 한쪽을 바꾸면 함께 바꾼다(예외 둘은 analysis_rate.sql 머리).
--   옮기며 묶음별 첨부 합(att)·완료 회차(fin)를 대표 키에 한해 한 번씩 모으는 꼴로 바꿨다 — 결과는 종전 문장과 같고(2026-10-17 대조 같음) 1.95초 → 0.35초.
with link_map as (
  select distinct on (l.linked_announcement_id)
    l.linked_announcement_id as aid, announcement_dedup_key(lh.title) as lh_key
  from public.announcement_post_links l
  join public.announcements lh on lh.announcement_id = l.lh_announcement_id
  where lh.title is not null and lh.hidden_from_listing is not true
  order by l.linked_announcement_id, l.lh_announcement_id
),
keyed as materialized (
  select a.announcement_id, a.apply_end, a.attachment_urls,
         coalesce(lm.lh_key, announcement_dedup_key(a.title)) as k,
         (lm.aid is not null) as linked
  from public.announcements a
  left join link_map lm on lm.aid = a.announcement_id
  where a.title is not null and a.hidden_from_listing is not true
),
reps as (
  select d.announcement_id, d.apply_start, d.apply_end, k.k,
         case when d.apply_start > current_date then '접수 전' else '접수 중' end as phase
  from get_announcements_deduped(null, null, null) d
  join keyed k on k.announcement_id = d.announcement_id
  where d.apply_end >= current_date + 3
),
att as materialized (
  select g.k, sum(jsonb_array_length(g.attachment_urls)) as attachments
  from keyed g where jsonb_typeof(g.attachment_urls) = 'array' and g.k in (select r.k from reps r) group by g.k
),
fin as materialized (
  select distinct g.k, g.apply_end, g.linked
  from keyed g join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
  where aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)') and g.k in (select r.k from reps r)
),
judged as (
  select r.*, coalesce(a.attachments, 0) as attachments,
    exists (select 1 from fin f where f.k = r.k and (f.apply_end = r.apply_end or f.linked)) as done
  from reps r left join att a on a.k = r.k
)
select phase, count(*) as denominator, count(*) filter (where done) as numerator,
       string_agg(announcement_id, ',' order by announcement_id) filter (where not done) as not_done
from judged
where attachments > 0
group by phase
order by phase desc
$function$
;
revoke all on function zipfit_ops.metric_analysis_rate() from public;

CREATE OR REPLACE FUNCTION zipfit_ops.metric_open_by_source()
 RETURNS TABLE(source_group text, denominator bigint, numerator bigint, with_attachments bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — … 상태판 칸 …」 6 · 다운님 결정 2026-10-02 「분석률 둘을 나란히」) — 열린 카드 기준 분석률(출처별).
--   분모 = 목록에 보이는 열린 대표(get_announcements_deduped · status ≠ 접수마감) 전부(첨부·마감 거리로 거르지 않는다 — 「사용자가 보는 카드」 중 비율).
--   갈래 = 대표 출처: LH · MYHOME 단독(대표가 MYHOME = 같은 묶음에 LH 행이 없다) · SH · 그 밖은 출처 이름 그대로.
--   분자·묶음 규칙(link_map · 같은 회차 = 같은 마감(둘 다 비면 같음) ∨ 링크)은 metric_analysis_rate 와 같다. with_attachments = 분모 중 묶음에 첨부가 있는 수.
with link_map as (
  select distinct on (l.linked_announcement_id)
    l.linked_announcement_id as aid, announcement_dedup_key(lh.title) as lh_key
  from public.announcement_post_links l
  join public.announcements lh on lh.announcement_id = l.lh_announcement_id
  where lh.title is not null and lh.hidden_from_listing is not true
  order by l.linked_announcement_id, l.lh_announcement_id
),
keyed as materialized (
  select a.announcement_id, a.apply_end, a.attachment_urls,
         coalesce(lm.lh_key, announcement_dedup_key(a.title)) as k,
         (lm.aid is not null) as linked
  from public.announcements a
  left join link_map lm on lm.aid = a.announcement_id
  where a.title is not null and a.hidden_from_listing is not true
),
reps as (
  select d.announcement_id, d.source, d.apply_end, k.k
  from get_announcements_deduped(null, null, null) d
  join keyed k on k.announcement_id = d.announcement_id
  where d.status <> '접수마감'
),
judged as (
  select r.*,
    (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0)
       from keyed g where g.k = r.k and jsonb_typeof(g.attachment_urls) = 'array') as attachments,
    exists (select 1 from keyed g
              join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
             where g.k = r.k
               and (g.apply_end is not distinct from r.apply_end or g.linked)
               and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')) as done
  from reps r
)
select case source when 'MYHOME' then 'MYHOME 단독' else source end as source_group,
       count(*) as denominator, count(*) filter (where done) as numerator,
       count(*) filter (where attachments > 0) as with_attachments
from judged
group by 1
order by 2 desc, 1;
$function$
;
revoke all on function zipfit_ops.metric_open_by_source() from public;

CREATE OR REPLACE FUNCTION public.ops_status_board()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-16(우편함 「코드 — 관리자 페이지 (가) 첫 판 …」 2 · 다운님 승인 2026-10-16) — 설정 탭 「운영」 구역의 상태판 한 덩이.
--   관리자(auth.uid() ∈ zipfit_ops.admins)가 아니면 예외(42501) — 빈 결과로 거부하지 않는다(「권한 없음」과 「0건」을 섞지 않는다).
--   칸 다섯: coverage(14일 접수분 커버율 — zipfit_ops.metric_coverage_14d 한 정의) · dispatch(분석 발송기 한 줄 · 「지금 무엇을 기다리나」 규칙은 여기)
--   · health(운영 점검 마지막 결과 · 점검 발송 기록 — 멈춤(HARD) 갈래는 .github/health/gate.mjs 한 곳이라 화면이 열린 이슈 라벨로 가른다)
--   · collected(get_last_collected_at 그대로) · followups_unreported(결과 칸 도입 — 2026-10-06_06 적용 — 뒤 요청 중 done ∧ result NULL).
--   덧: hides(지금 숨긴 묶음 — zipfit_ops.listing_hides).
-- 🔵 2026-10-17(우편함 「코드·운영 — … 상태판 칸 …」 6 · 백로그 「관리자 페이지 (가)」 본문 후보) — 칸 둘 더:
--   rates(분석률 두 셈 나란히 — routine = 정본 · 루틴 분모 zipfit_ops.metric_analysis_rate() · open_by_source = 열린 카드 출처별 zipfit_ops.metric_open_by_source())
--   · recent_runs(최근 분석 회차 다섯 — 잡기·끝·걸린 분·끝낸 대기열 행 수·끝 메모 앞 80자 · 💡 회차별 한 줄).
--   비밀값 D-day 는 넣지 않는다 — Vault 설명칸이 비어 있어 읽을 날짜가 없다(2026-10-17 조회) · 추이는 다음 판.
declare
  v_uid uuid := auth.uid();
  cfg public.analysis_dispatch_config%rowtype;
  v_cov jsonb; v_disp jsonb; v_health jsonb; v_col jsonb; v_fu jsonb; v_hides jsonb; v_rates jsonb; v_runs jsonb;
  v_run record; v_last record;
  n_wait int; n_ready int; n_promo int; n_sent int; n_fu_wait int; n_reclaim int; v_failing boolean; v_wait text;
  v_fu_since timestamptz;
begin
  if v_uid is null or not exists (select 1 from zipfit_ops.admins a where a.user_id = v_uid) then
    raise exception '관리자만 볼 수 있습니다' using errcode = '42501';
  end if;
  select * into cfg from public.analysis_dispatch_config where id = 1;

  select to_jsonb(c) into v_cov from zipfit_ops.metric_coverage_14d() c;

  select count(*) filter (where state = 'waiting'),
         count(*) filter (where state = 'waiting' and ready_at is not null),
         count(*) filter (where state = 'waiting' and ready_at is null and needs_promo),
         count(*) filter (where state in ('sent', 'claimed'))
    into n_wait, n_ready, n_promo, n_sent
    from public.analysis_dispatch_queue;
  select count(*) into n_fu_wait from public.analysis_followup_requests where state = 'waiting';
  select count(*) into n_reclaim from public.analysis_dispatch_runs
   where state = 'released' and finish_note like '자동 회수%' and finished_at > now() - interval '24 hours';
  select r.id, r.reason, r.state, r.created_at, r.claimed_at, r.heartbeat_at into v_run
    from public.analysis_dispatch_runs r where r.state in ('firing', 'running') order by r.id desc limit 1;
  select r.id, r.reason, r.finished_at,
         (select count(*) from public.analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done') as done
    into v_last
    from public.analysis_dispatch_runs r where r.state = 'finished' order by r.finished_at desc nulls last, r.id desc limit 1;
  select count(*) = 3 and bool_and(state = 'failed') into v_failing
    from (select state from public.analysis_dispatch_runs order by id desc limit 3) z;
  v_wait := case
    when cfg.enabled is not true then '자동 발송 꺼짐(스위치)'
    when v_failing then '연속 3회 발송 실패 — 자동 발송 멈춤'
    when v_run.id is not null and v_run.claimed_at is null then format('run %s 발송함 · 루틴이 잡기 전', v_run.id)
    when v_run.id is not null then format('run %s %s · 마지막 심장박동 %s', v_run.id,
                                         case when v_run.reason = 'followup' then '후속 처리 중' else '분석 중' end,
                                         coalesce(to_char(v_run.heartbeat_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') || ' KST', '없음'))
    when n_promo > 0 then format('매입 홍보물 목록 수집 기다림 %s건', n_promo)
    when n_ready > 0 then format('다음 발송 기다림 %s건', n_ready)
    when n_fu_wait > 0 then format('후속 요청 %s건 발송 기다림', n_fu_wait)
    else '기다리는 일 없음' end;
  v_disp := jsonb_build_object(
    'enabled', cfg.enabled, 'waiting', n_wait, 'ready', n_ready, 'needs_promo', n_promo, 'in_run', n_sent,
    'followups_waiting', n_fu_wait, 'reclaimed_24h', n_reclaim, 'waiting_for', v_wait,
    'running', case when v_run.id is null then null else jsonb_build_object('id', v_run.id, 'reason', v_run.reason, 'state', v_run.state,
               'created_at', v_run.created_at, 'claimed_at', v_run.claimed_at, 'heartbeat_at', v_run.heartbeat_at) end,
    'last_finished', case when v_last.id is null then null else jsonb_build_object('id', v_last.id, 'reason', v_last.reason,
               'finished_at', v_last.finished_at, 'done', v_last.done) end);

  select jsonb_build_object(
    'last_run', (select jsonb_build_object('run_at', h.run_at, 'ok', h.ok, 'n_fail', h.n_fail, 'n_warn', h.n_warn,
                                           'failed', to_jsonb(h.failed), 'warned', to_jsonb(h.warned), 'run_url', h.run_url)
                   from public.ops_health_runs h where h.ref = 'main' order by h.run_at desc limit 1),
    'dispatch_log', (select coalesce(jsonb_agg(jsonb_build_object('target', z.target, 'at', z.at, 'status_code', z.status_code) order by z.target), '[]'::jsonb)
                       from (select distinct on (l.target) l.target, l.at, l.status_code from public.ops_dispatch_log l
                              order by l.target, l.at desc) z),
    'backup_poll', (select jsonb_build_object('at', p.at, 'status_code', p.status_code, 'runs_seen', p.runs_seen, 'status_note', p.status_note)
                      from public.ops_backup_poll p order by p.at desc limit 1))
    into v_health;

  select coalesce(jsonb_agg(jsonb_build_object('source', c.source, 'at', c.last_collected_at) order by c.source), '[]'::jsonb)
    into v_col from public.get_last_collected_at() c;

  select m.applied_at into v_fu_since from zipfit_ops.schema_migrations m
   where m.filename = '2026-10-06_06_followup_result_health_findings.sql';
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'page_ref', left(f.page_ref, 120), 'run_id', f.run_id, 'state_at', f.state_at) order by f.id), '[]'::jsonb)
    into v_fu from public.analysis_followup_requests f
   where f.state = 'done' and f.result is null and f.requested_at > coalesce(v_fu_since, 'infinity'::timestamptz);

  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'group_key', h.group_key, 'announcement_id', h.announcement_id,
                                               'reason', h.reason, 'hidden_at', h.hidden_at) order by h.hidden_at desc), '[]'::jsonb)
    into v_hides from zipfit_ops.listing_hides h where h.released_at is null;

  v_rates := jsonb_build_object(
    'routine', (select coalesce(jsonb_agg(to_jsonb(r) order by r.phase desc), '[]'::jsonb) from zipfit_ops.metric_analysis_rate() r),
    'open_by_source', (select coalesce(jsonb_agg(to_jsonb(o) order by o.denominator desc, o.source_group), '[]'::jsonb) from zipfit_ops.metric_open_by_source() o));

  select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'reason', z.reason, 'state', z.state, 'created_at', z.created_at,
                                               'claimed_at', z.claimed_at, 'finished_at', z.finished_at,
                                               'minutes', round(extract(epoch from z.finished_at - coalesce(z.claimed_at, z.created_at)) / 60),
                                               'done', z.done, 'note', left(z.finish_note, 80)) order by z.id desc), '[]'::jsonb)
    into v_runs
    from (select r.id, r.reason, r.state, r.created_at, r.claimed_at, r.finished_at, r.finish_note,
                 (select count(*) from public.analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done') as done
            from public.analysis_dispatch_runs r order by r.id desc limit 5) z;

  return jsonb_build_object('now', now(), 'coverage', v_cov, 'dispatch', v_disp, 'health', v_health,
                            'collected', v_col, 'followups_unreported', v_fu, 'hides', v_hides,
                            'rates', v_rates, 'recent_runs', v_runs);
end
$function$
;
