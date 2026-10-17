-- zipfit:function zipfit_ops.list_rpc_probe() acl={postgres=X/postgres} secdef=false
-- zipfit:function ops_status_board() acl={postgres=X/postgres,authenticated=X/postgres} secdef=true
-- 목록 RPC 안정화 회차 2·3(2026-10-17 · 우편함 「코드·운영 — 목록 RPC 안정화(사용자 500 하루 14건 — 안 먼저 보고) · 사용자 500 감시 · 탐침 두 값·error 칸 …」).
--   ① zipfit_ops.list_rpc_probe_log.ms2 — 같은 연결 둘째 실행(ms 는 그대로 새 연결 첫 실행 · 판정은 ms).
--   ② zipfit_ops.list_rpc_probe() — 한 회차에 두 번 재고, 한도를 넘거나 오류면 error 에 사유(SQLSTATE·메시지 앞부분 · 「57014 상당」).
--   ③ ops_status_board() — health.list_user_fail(마지막 운영 점검의 「목록 RPC 사용자 실패 24시간」 · 종전 칸 그대로).
-- 되돌리기: git show <이 PR 앞 커밋>:supabase/rpc/zipfit_ops/list_rpc_probe.sql · supabase/rpc/ops_status_board.sql 로 create or replace 뒤
--   alter table zipfit_ops.list_rpc_probe_log drop column ms2;
alter table zipfit_ops.list_rpc_probe_log add column ms2 integer;
comment on column zipfit_ops.list_rpc_probe_log.ms is '새 연결 첫 실행(ms) — cron 은 회차마다 새 연결 · 사용자가 겪는 쪽 · health-ops list_rpc_time 판정(2026-10-17)';
comment on column zipfit_ops.list_rpc_probe_log.ms2 is '같은 연결 둘째 실행(ms) — 함수 자체 속도(2026-10-17 · 이 칸 전 행은 NULL)';

CREATE OR REPLACE FUNCTION zipfit_ops.list_rpc_probe()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — … 목록 RPC 응답 감시 …」 2) — 공개 목록 RPC 를 anon 역할로 한 번 돌려 걸린 시간을 남긴다.
--   cron zipfit-list-rpc-probe 가 10분마다(매 시 5·15·…분 — 수집 회차(0·10·…분) 사이) 부른다. 걸린 시간(ms)을 돌려준다.
--   화면과 같은 호출(인자 없음 · 전 칸 — 행을 text 로 바꿔 모든 칸을 계산하게 한다)을 anon 권한(RLS 포함)으로 잰다.
--   🔴 anon 의 statement_timeout(3초)은 여기서 걸리지 않는다(cron 은 postgres) — 끊지 않고 끝까지 재서 3초를 넘은 것을 「한도 넘음」으로 적는다.
--   기록 zipfit_ops.list_rpc_probe_log(90일) — health-ops list_rpc_time 이 읽는다(2초 ⚠️ · 3초·오류 ❌). 원인은 단정하지 않는다 — 기록이 쌓이면 판정.
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 안정화 …」 3) — 한 회차에 두 번 잰다: ms = 새 연결 첫 실행(cron 은 회차마다 새 연결 — 사용자가 겪는 쪽 · 판정은 이것)
--   · ms2 = 같은 연결 둘째 실행(함수 자체 속도). 첫 실행만 간헐로 느린 꼴(2026-10-17 조사 E)을 기록만으로 가른다.
--   error = 오류면 SQLSTATE·메시지 앞부분 · 오류 없이 3초를 넘으면 「57014 상당」(anon 이면 그 자리에서 끊겼을 것) · 둘째만 오류면 「둘째: …」.
declare
  t0 timestamptz;
  v_ms integer;
  v_ms2 integer;
  v_rows integer;
  v_rows2 integer;
  v_err text;
  v_err2 text;
begin
  t0 := clock_timestamp();
  begin
    execute 'set local role anon';
    select count(*) into v_rows from public.get_announcements_deduped() x where octet_length(x::text) > 0;
    execute 'reset role';
  exception when others then
    v_err := left(sqlstate || ' ' || sqlerrm, 200);
  end;
  execute 'reset role';
  v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  begin
    execute 'set local role anon';
    select count(*) into v_rows2 from public.get_announcements_deduped() x where octet_length(x::text) > 0;
    execute 'reset role';
  exception when others then
    v_err2 := left(sqlstate || ' ' || sqlerrm, 200);
  end;
  execute 'reset role';
  v_ms2 := round(extract(epoch from clock_timestamp() - t0) * 1000);
  if v_err is null and v_ms >= 3000 then
    v_err := '57014 상당 — anon 한도 3초 넘음(탐침은 끊지 않고 끝까지 잰다)';
  end if;
  insert into zipfit_ops.list_rpc_probe_log (ms, ms2, rows, ok, error)
  values (v_ms, v_ms2, coalesce(v_rows, v_rows2), v_err is null,
          nullif(concat_ws(' · ', v_err, '둘째: ' || v_err2), ''));
  delete from zipfit_ops.list_rpc_probe_log where at < now() - interval '90 days';
  return v_ms;
end
$function$
;

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
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 안정화 …」 2) — health.list_user_fail: 마지막 운영 점검(main)의 「목록 RPC 사용자 실패 24시간」 항목
--   (health-ops list_user_fail — 관리 API 로그에서 센 값이라 DB 에는 그 점검의 경고 기록만 있다) · warned = 그 실행에서 ⚠️였나 · value = ⚠️일 때 그 기록 문구.
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
                      from public.ops_backup_poll p order by p.at desc limit 1),
    'list_user_fail', (select jsonb_build_object('run_at', h.run_at, 'warned', 'list_user_fail' = any(h.warned),
                                                 'value', (select f.reason from public.ops_health_findings f
                                                            where f.run_at = h.run_at and f.item = 'list_user_fail' limit 1))
                         from public.ops_health_runs h where h.ref = 'main' order by h.run_at desc limit 1))
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
