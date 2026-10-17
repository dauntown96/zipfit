-- zipfit:function zipfit_ops.instance_metrics_record(jsonb) acl={postgres=X/postgres} secdef=false
-- zipfit:function zipfit_ops.secret_expiry_list() acl={postgres=X/postgres} secdef=false
-- zipfit:function ops_status_board() acl={postgres=X/postgres,authenticated=X/postgres} secdef=true
-- 인스턴스 지표 정기 기록 · Vault 밖 만료 표(2026-10-17 · 우편함 「코드·운영 — 인스턴스 지표 정기 기록(관리 API 지표 끝점 · health-ops) · Vault 밖 만료 표 · 비밀값 30일 전 ⚠️ · 이력 꼴 검사 메모」 1·2).
--   ① zipfit_ops.instance_metrics_log — health-ops(30분)가 관리 API GET /v1/projects/{ref}/analytics/endpoints/metrics(베타 · 기존 SUPABASE_ACCESS_TOKEN)에서
--      고른 숫자만(메모리·swap·commit·swap 들고 남·CPU 초·디스크 바이트 — 누적값은 원값) · 90일 · GRANT 0. 율은 뷰 zipfit_ops.instance_metrics_rates(이웃 행 차이).
--   ② zipfit_ops.secret_expiry_external — Vault 밖 만료(이름·만료일·근거) · 종전 ops_status_board 안 values 다섯 줄을 옮긴다(토큰을 갈면 이 표 한 줄).
--   ③ zipfit_ops.secret_expiry_list() — vault 설명칸 + ② · ops_status_board().secrets 와 health-ops secret_expiry 가 함께 읽는다.
--   ④ ops_status_board() — secrets 는 ③ 그대로 · instance(최근 값 + 24시간 swap 들고 남).
-- 되돌리기: git show <이 PR 앞 커밋>:supabase/rpc/ops_status_board.sql 로 create or replace 뒤
--   drop view zipfit_ops.instance_metrics_rates; drop function zipfit_ops.instance_metrics_record(jsonb), zipfit_ops.secret_expiry_list();
--   drop table zipfit_ops.instance_metrics_log, zipfit_ops.secret_expiry_external;
create table zipfit_ops.instance_metrics_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  scraped_at timestamptz not null,
  mem_total bigint,
  mem_available bigint,
  swap_total bigint,
  swap_free bigint,
  committed_as bigint,
  commit_limit bigint,
  pswpin bigint,
  pswpout bigint,
  cpu_user_s double precision,
  cpu_system_s double precision,
  cpu_iowait_s double precision,
  cpu_idle_s double precision,
  disk_root_read_b bigint,
  disk_root_written_b bigint,
  disk_data_read_b bigint,
  disk_data_written_b bigint
);
create index instance_metrics_log_scraped_at on zipfit_ops.instance_metrics_log (scraped_at);
comment on table zipfit_ops.instance_metrics_log is
  'DB 인스턴스 지표(2026-10-17) — health-ops 가 관리 API 지표 끝점(베타)에서 고른 숫자만 30분마다 zipfit_ops.instance_metrics_record() 로 넣는다 · 바이트·쪽(4 KB)·초(CPU 코어 합) · 누적값은 원값 · 90일 · GRANT 0. 디스크 root = nvme0n1 · data = nvme1n1.';
revoke all on table zipfit_ops.instance_metrics_log from public, anon, authenticated, service_role;

create view zipfit_ops.instance_metrics_rates as
select id, scraped_at,
       extract(epoch from scraped_at - lag(scraped_at) over w) as dt_s,
       case when pswpin >= lag(pswpin) over w then pswpin - lag(pswpin) over w end as pswpin_d,
       case when pswpout >= lag(pswpout) over w then pswpout - lag(pswpout) over w end as pswpout_d,
       case when cpu_user_s >= lag(cpu_user_s) over w then cpu_user_s - lag(cpu_user_s) over w end as cpu_user_d,
       case when cpu_system_s >= lag(cpu_system_s) over w then cpu_system_s - lag(cpu_system_s) over w end as cpu_system_d,
       case when cpu_iowait_s >= lag(cpu_iowait_s) over w then cpu_iowait_s - lag(cpu_iowait_s) over w end as cpu_iowait_d,
       case when cpu_idle_s >= lag(cpu_idle_s) over w then cpu_idle_s - lag(cpu_idle_s) over w end as cpu_idle_d,
       case when disk_root_read_b >= lag(disk_root_read_b) over w then disk_root_read_b - lag(disk_root_read_b) over w end as disk_root_read_d,
       case when disk_root_written_b >= lag(disk_root_written_b) over w then disk_root_written_b - lag(disk_root_written_b) over w end as disk_root_written_d,
       case when disk_data_read_b >= lag(disk_data_read_b) over w then disk_data_read_b - lag(disk_data_read_b) over w end as disk_data_read_d,
       case when disk_data_written_b >= lag(disk_data_written_b) over w then disk_data_written_b - lag(disk_data_written_b) over w end as disk_data_written_d
  from zipfit_ops.instance_metrics_log
window w as (order by scraped_at);
comment on view zipfit_ops.instance_metrics_rates is
  '인스턴스 지표 이웃 행 차이(2026-10-17) — 누적값이 줄었으면(재시작) 그 차이는 NULL · CPU 비율은 차이끼리 나눈다(user+system+iowait+idle 합 기준). GRANT 0.';
revoke all on table zipfit_ops.instance_metrics_rates from public, anon, authenticated, service_role;

create table zipfit_ops.secret_expiry_external (
  name text primary key,
  expires date not null,
  basis text not null,
  updated_at timestamptz not null default now()
);
comment on table zipfit_ops.secret_expiry_external is
  'Vault 밖 비밀값 만료(2026-10-17) — zipfit_ops.secret_expiry_list() 가 읽는다(관리자 상태판 secrets · health-ops secret_expiry 30일 안 ⚠️). 토큰을 갈면 이 표 한 줄을 고친다. 값은 두지 않는다 — 이름·만료일·근거만. GRANT 0.';
revoke all on table zipfit_ops.secret_expiry_external from public, anon, authenticated, service_role;
insert into zipfit_ops.secret_expiry_external (name, expires, basis) values
  ('Supabase 개인 액세스 토큰 zipfit-claude-code(Claude Code 관리 API)', date '2026-12-27', '백로그 「자동화가 기대는 비밀값의 만료」 2026-10-11 다운님 확인 표(콘솔 화면)'),
  ('공공데이터포털 LH 공고·상세(개발 계정)', date '2028-06-19', '같은 표 — 공공데이터포털 화면 캡처(활용기간)'),
  ('공공데이터포털 마이홈 공공주택 모집공고(개발 계정)', date '2028-06-21', '같은 표 — 공공데이터포털 화면 캡처(활용기간)'),
  ('공공데이터포털 마이홈 단지정보·대기현황(개발 계정)', date '2028-06-23', '같은 표 — 공공데이터포털 화면 캡처(활용기간)'),
  ('공공데이터포털 아파트 전월세 실거래가(개발 계정)', date '2028-09-28', '같은 표 — 공공데이터포털 화면 캡처(활용기간)');

CREATE OR REPLACE FUNCTION zipfit_ops.instance_metrics_record(p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 인스턴스 지표 정기 기록 …」 1) — health-ops(30분)가 관리 API 지표 끝점(베타 · Prometheus 본문)에서 고른 숫자만 넘긴다.
--   p = {scraped_at, mem_total, mem_available, swap_total, swap_free, committed_as, commit_limit, pswpin, pswpout,
--        cpu_user_s, cpu_system_s, cpu_iowait_s, cpu_idle_s, disk_root_read_b, disk_root_written_b, disk_data_read_b, disk_data_written_b}
--   (바이트 · 쪽 · 초 — 누적값은 원값 그대로 · 율은 zipfit_ops.instance_metrics_rates 가 이웃 행 차이로). 없는 키는 NULL.
--   🔴 숫자 칸만 — 본문·계열 원문·Auth 경로별 집계는 받지도 남기지도 않는다. 90일 지난 행은 여기서 지운다. 넣은 행 id 를 돌려준다.
declare v_id bigint;
begin
  insert into zipfit_ops.instance_metrics_log (scraped_at, mem_total, mem_available, swap_total, swap_free, committed_as, commit_limit,
         pswpin, pswpout, cpu_user_s, cpu_system_s, cpu_iowait_s, cpu_idle_s,
         disk_root_read_b, disk_root_written_b, disk_data_read_b, disk_data_written_b)
  values (coalesce((p->>'scraped_at')::timestamptz, now()),
          (p->>'mem_total')::bigint, (p->>'mem_available')::bigint, (p->>'swap_total')::bigint, (p->>'swap_free')::bigint,
          (p->>'committed_as')::bigint, (p->>'commit_limit')::bigint, (p->>'pswpin')::bigint, (p->>'pswpout')::bigint,
          (p->>'cpu_user_s')::double precision, (p->>'cpu_system_s')::double precision,
          (p->>'cpu_iowait_s')::double precision, (p->>'cpu_idle_s')::double precision,
          (p->>'disk_root_read_b')::bigint, (p->>'disk_root_written_b')::bigint,
          (p->>'disk_data_read_b')::bigint, (p->>'disk_data_written_b')::bigint)
  returning id into v_id;
  delete from zipfit_ops.instance_metrics_log where scraped_at < now() - interval '90 days';
  return v_id;
end
$function$
;
revoke all on function zipfit_ops.instance_metrics_record(jsonb) from public;

CREATE OR REPLACE FUNCTION zipfit_ops.secret_expiry_list()
 RETURNS TABLE(source text, name text, state text, expires date, days_left integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 인스턴스 지표 정기 기록 · Vault 밖 만료 표 · 비밀값 30일 전 ⚠️ …」 2·3) — 비밀값 만료 한 정의.
--   ops_status_board().secrets 와 health-ops secret_expiry(30일 안 ⚠️ · 지나면 ❌)가 이 함수 하나를 읽는다.
--   vault 줄 = vault.secrets 의 이름·설명칸 머리 「expires=YYYY-MM-DD|none|unknown」만(🔴 secret 칸·decrypted_secrets 는 읽지 않는다 · 꼴이 없으면 missing)
--   · fixed 줄 = Vault 밖 만료 표 zipfit_ops.secret_expiry_external(토큰을 갈면 그 표 한 줄을 고친다).
--   days_left = KST 오늘부터 · 날짜 있는 것부터 남은 날 오름차순.
select s.source, s.name, s.state, s.expires, s.expires - (now() at time zone 'Asia/Seoul')::date
  from (select 'vault' as source, v.name,
               case when m.tok ~ '^\d{4}-\d{2}-\d{2}$' then 'date' when m.tok in ('none', 'unknown') then m.tok else 'missing' end as state,
               case when m.tok ~ '^\d{4}-\d{2}-\d{2}$' then m.tok::date end as expires
          from vault.secrets v
          cross join lateral (select lower(trim(substring(coalesce(v.description, '') from '^\s*expires=([^;]*)'))) as tok) m
        union all
        select 'fixed', e.name, 'date', e.expires
          from zipfit_ops.secret_expiry_external e) s
 order by s.expires nulls last, s.source desc, s.name;
$function$
;
revoke all on function zipfit_ops.secret_expiry_list() from public;

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
--   추이는 다음 판.
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 안정화 …」 2) — health.list_user_fail: 마지막 운영 점검(main)의 「목록 RPC 사용자 실패 24시간」 항목
--   (health-ops list_user_fail — 관리 API 로그에서 센 값이라 DB 에는 그 점검의 경고 기록만 있다) · warned = 그 실행에서 ⚠️였나 · value = ⚠️일 때 그 기록 문구.
-- 🔵 2026-10-17(우편함 「코드·운영 — DB 반영 뒤 공개 REST 자동 확인 · … · 상태판 DB 칸」 3 · 백로그 「관리자 페이지 (가)」 ②③):
--   recent_runs.minutes_from — minutes 를 어디서부터 셌나: claimed(루틴이 잡은 시각) · sent(잡은 시각이 비어 발송 시각부터 — 대기 포함 · run 252 꼴).
--   secrets — 비밀값 만료 한 줄 = source(vault|fixed) · name · state(date|none|unknown|missing) · expires · days_left(KST 오늘부터) — 날짜 있는 것부터 남은 날 오름차순.
-- 🔵 2026-10-17(우편함 「코드·운영 — 인스턴스 지표 정기 기록 · Vault 밖 만료 표 · 비밀값 30일 전 ⚠️ …」 1·2):
--   secrets 는 zipfit_ops.secret_expiry_list() 그대로(Vault 밖 만료는 표 zipfit_ops.secret_expiry_external — 종전 이 함수 안 values 다섯 줄을 옮겼다 · health-ops 와 한 정의).
--   instance — 인스턴스 지표 최근 행(zipfit_ops.instance_metrics_log · health-ops 30분) · swap 사용 = SwapTotal − SwapFree · 24시간 swap 들고 남(쪽 · 4 KB)
--   = zipfit_ops.instance_metrics_rates 의 이웃 행 차이 합(누적값이 줄면 그 차이는 빼고 센다 — 재시작). 기록이 없으면 null.
declare
  v_uid uuid := auth.uid();
  cfg public.analysis_dispatch_config%rowtype;
  v_cov jsonb; v_disp jsonb; v_health jsonb; v_col jsonb; v_fu jsonb; v_hides jsonb; v_rates jsonb; v_runs jsonb; v_secrets jsonb; v_inst jsonb;
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
                                               'minutes_from', case when z.claimed_at is not null then 'claimed' else 'sent' end,
                                               'done', z.done, 'note', left(z.finish_note, 80)) order by z.id desc), '[]'::jsonb)
    into v_runs
    from (select r.id, r.reason, r.state, r.created_at, r.claimed_at, r.finished_at, r.finish_note,
                 (select count(*) from public.analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done') as done
            from public.analysis_dispatch_runs r order by r.id desc limit 5) z;

  select coalesce(jsonb_agg(jsonb_build_object('source', s.source, 'name', s.name, 'state', s.state, 'expires', s.expires,
                                               'days_left', s.days_left) order by s.o), '[]'::jsonb)
    into v_secrets
    from zipfit_ops.secret_expiry_list() with ordinality s(source, name, state, expires, days_left, o);

  select jsonb_build_object('scraped_at', l.scraped_at, 'mem_total', l.mem_total, 'mem_available', l.mem_available,
                            'swap_total', l.swap_total, 'swap_used', l.swap_total - l.swap_free,
                            'committed_as', l.committed_as, 'commit_limit', l.commit_limit,
                            'swapin_24h_pages', (select sum(r.pswpin_d) from zipfit_ops.instance_metrics_rates r where r.scraped_at > now() - interval '24 hours'),
                            'swapout_24h_pages', (select sum(r.pswpout_d) from zipfit_ops.instance_metrics_rates r where r.scraped_at > now() - interval '24 hours'),
                            'rows_24h', (select count(*) from zipfit_ops.instance_metrics_log x where x.scraped_at > now() - interval '24 hours'))
    into v_inst
    from zipfit_ops.instance_metrics_log l order by l.scraped_at desc limit 1;

  return jsonb_build_object('now', now(), 'coverage', v_cov, 'dispatch', v_disp, 'health', v_health,
                            'collected', v_col, 'followups_unreported', v_fu, 'hides', v_hides,
                            'rates', v_rates, 'recent_runs', v_runs, 'secrets', v_secrets, 'instance', v_inst);
end
$function$

;
