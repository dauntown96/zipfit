-- 우편함 후속 처리 즉시 호출(2026-10-02 · 우편함 「협의 — 원문 키 사이클(분석 유예 0 · 블록 사후 옮기기 · panId 연결) + 후속 처리 즉시 호출」 1).
--   계기: 「운영 — 데이터 쓰기」 진행 요청 페이지는 루틴이 깨어날 때만 처리된다 — 분석 대기열이 비면 다음 예약(10:07 KST)까지 선다.
--   발송기는 Notion 을 볼 수 없다(새 비밀값 없이) → 페이지를 쓴 쪽이 analysis_followup_request(페이지) 를 부르고,
--   발송기가 분석 몫 없이 사유 followup 으로 루틴을 부른다. 루틴은 후속 처리를 먼저 하고 잡기에서 0행을 받는다 — 잡기가 그 회차를 닫는다.
--   followup 회차는 진전 판정(되돌림 · 이어 보내기 · 연속 0건 멈춤)에서 빠지고, 잠금 · 스위치 · 연속 3실패 멈춤은 그대로 따른다.
--   🔴 공개 역할(PUBLIC·anon·authenticated) 실행·접근 0 · service_role 만.
-- zipfit:function analysis_followup_request(text,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_dispatch_tick(boolean) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_queue_claim() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_queue_finish(bigint,text[],text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_run_release(bigint,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
create table public.analysis_followup_requests (
  id           bigint generated always as identity primary key,
  page_ref     text not null,
  note         text,
  requested_at timestamptz not null default now(),
  state        text not null default 'waiting' check (state in ('waiting', 'sent', 'done')),
  run_id       bigint references public.analysis_dispatch_runs (id),
  state_at     timestamptz not null default now()
);
create unique index analysis_followup_requests_waiting_uq on public.analysis_followup_requests (page_ref) where state = 'waiting';
alter table public.analysis_followup_requests enable row level security;
revoke all on table public.analysis_followup_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.analysis_followup_requests to service_role;
comment on table public.analysis_followup_requests is '우편함 후속 처리 요청 — analysis_followup_request() 가 넣고 analysis_dispatch_tick 이 루틴 회차에 싣는다(2026-10-02)';

alter table public.analysis_dispatch_runs drop constraint analysis_dispatch_runs_reason_check;
alter table public.analysis_dispatch_runs add constraint analysis_dispatch_runs_reason_check
  check (reason in ('grace', 'max_wait', 'returned', 'next', 'manual', 'followup'));

CREATE OR REPLACE FUNCTION public.analysis_followup_request(p_page_ref text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 우편함 「진행 요청」 후속 처리 페이지(「운영 — 데이터 쓰기 …」)를 루틴에 바로 맡긴다(2026-10-02 · 우편함 「협의 — 원문 키 사이클 …」 1).
-- 🔴 service_role(관리 API)·postgres 만 부른다 — 페이지를 쓴 쪽(claude.ai · Claude Code · 다운님)이 페이지를 만든 뒤 한 번 부른다.
-- 요청을 대기(waiting)로 남길 뿐 루틴을 직접 부르지 않는다 — 다음 발송 판정(cron zipfit-analysis-dispatch · 10분마다)이
-- 분석 몫이 없어도 사유 followup 으로 루틴을 부른다(도는 회차가 있으면 끝난 뒤 · 스위치·연속 3실패 멈춤은 그대로).
-- 같은 페이지의 대기 요청이 이미 있으면 새로 만들지 않고 그 요청을 돌려준다.
-- 루틴은 Notion 우편함에서 진행 요청 페이지를 스스로 찾는다 — p_page_ref 는 기록용(페이지 id 또는 제목)이다.
declare
  v_ref text := btrim(coalesce(p_page_ref, ''));
  v_id bigint;
begin
  if v_ref = '' then
    raise exception '우편함 페이지(p_page_ref)가 필요하다';
  end if;
  insert into public.analysis_followup_requests (page_ref, note) values (v_ref, p_note)
  on conflict (page_ref) where state = 'waiting' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.analysis_followup_requests where page_ref = v_ref and state = 'waiting';
    return jsonb_build_object('request', v_id, 'state', 'waiting', 'duplicate', true);
  end if;
  return jsonb_build_object('request', v_id, 'state', 'waiting', 'duplicate', false,
                            'next', '다음 발송 판정(10분마다 · 매시 6분부터)이 루틴을 부른다 — 도는 회차가 있으면 끝난 뒤');
end
$function$;

CREATE OR REPLACE FUNCTION public.analysis_dispatch_tick(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 공고 분석 감지 루틴 발송기 — cron zipfit-analysis-dispatch 가 10분마다 부른다(2026-10-01 운영 회차).
-- ① 보낸 요청의 응답을 정리한다 ② 새 후보를 대기열에 넣고 더는 후보가 아닌 대기를 뺀다 ③ 보낼지 판정해 루틴 API 를 한 번 부른다.
-- 후보 = ⑨ 5-2 분모(대표 ∧ 묶음 첨부 > 0 ∧ apply_end ≥ 오늘+3) ∧ 미분석(같은 회차 또는 링크로 붙은 구성원에 완료 계열 분석 없음).
--   🔴 supabase/metrics/analysis_rate.sql 과 같은 규칙이다 — 묶음 키(link_map)는 get_announcements_deduped · get_announcement_group_ids ·
--   get_reanalysis_queue 와 같다. 한쪽을 바꾸면 함께 바꾼다.
-- 보낼 때 = 스위치 켬 ∧ 도는 회차 없음 ∧ 실을 것(ready) 있음 ∧ (루틴이 되돌린 것 있음 ∨ 마지막 진입 뒤 grace 지남 ∨ 첫 ready 뒤 max_wait 지남).
--   「되돌린 것 있음」으로 바로 보내는 것은 직전에 끝난 회차가 공고를 1건 이상 끝냈을 때만이다(2026-10-01 진전 없는 되돌림).
--   직전 회차가 0건을 끝냈으면 되돌린 공고는 되돌린 때를 진입·ready 시각으로 보고 grace·max_wait 를 다시 따른다
--   (공통 원인 — 인증 · LH 장애 · 열린 이슈 — 으로 아무것도 못 끝낸 회차가 10분마다 다시 발송되지 않게).
--   p_force = true(수동 시험)는 스위치·유예를 건너뛰되 잠금·비밀값은 지킨다.
--   매입(LH 주거복지 - 매입임대)은 홍보물 목록 수집이 끝나야 ready — 밤 수집분은 다음 날 홍보물 수집(KST 09:05~) 뒤에 나간다.
--   연속 3번 실패하면 자동 발송을 멈춘다(수동 p_force 는 된다) — health-ops 가 알린다.
--   끝낸 공고 0건으로 끝난 회차가 연속 3번이어도 같은 취급으로 멈춘다(result stalled) — 회차가 끝낸 수 = 그 run_id 의 done 행 수.
-- 🔴 한 번에 싣는 것은 한 몫(config.batch_size · 기본 1건)뿐이다(2026-10-01 · run 39 — 9건을 한 회차로 보내자 루틴이 하나도 착수 못 했다).
--   몫 순서 = 분석 순서 산식: 접수 전 먼저 · 접수 시작 가까운 순 · (접수 중·상시는 마감 가까운 순) · 같으면 먼저 들어온 순.
--   가장 최근 발송 회차가 끝난(finished) 회차이고 1건 이상 끝냈으면, 그 회차 발송 때 이미 ready 였던 남은 공고를 유예 없이 이어서 보낸다(reason next).
--   가장 최근 회차가 실패(failed)면 이어 보내지 않는다 — 종전 갈래(유예·상한·3회 실패 멈춤)를 그대로 따른다.
--   그 뒤에 들어온 공고는 종전대로 grace·max_wait 를 따른다.
-- ① 응답 정리는 잡힌 뒤에도 한다(2026-10-01 · run 39 — 루틴의 잡기가 cron 정리보다 빨라 http_status·session_url 이 비었다):
--   firing·running·finished(하루 안) 중 http_status 가 빈 run 의 응답을 run 행에 남긴다 · firing·running 에 온 4xx·5xx 는 failed + 대기열 복귀
--   (running 의 상태 없는 응답 — pg_net 시간 초과 등 — 은 잡기가 발송 성공을 증명하므로 실패로 보지 않고 error 만 남긴다).
-- 🔵 후속 처리 요청(2026-10-02 · 우편함 「협의 — 원문 키 사이클 …」 1): analysis_followup_requests 의 대기(waiting)가 있으면
--   분석 몫이 보낼 때가 아니어도 유예 없이 사유 followup 으로 루틴을 부른다(이번 몫 0건 — 루틴은 우편함 진행 요청 후속 처리만 하고 잡기에서 닫힌다).
--   분석 몫을 보낼 때는 대기 요청을 그 회차에 함께 싣는다(루틴이 후속 처리를 먼저 한다 — 따로 부르지 않는다).
--   followup 회차는 「진전」 판정(되돌림 · 이어 보내기 · 연속 0건 멈춤)에서 빠진다 — 분석 몫이 없어서다. 연속 3실패 멈춤 · 스위치 · 잠금은 그대로 따른다.
--   잡기 없이 60분 넘게 도는 followup 회차는 닫는다(대기열 공고가 없어 이중 쓰기 위험이 없다).
-- 비밀값: Vault zipfit_routine_fire_url · zipfit_routine_fire_token(값은 표·반환에 싣지 않는다).
declare
  cfg public.analysis_dispatch_config%rowtype;
  rr record;
  resp record;
  n_new int := 0; n_drop int := 0; n_ready int := 0; n_resolved int := 0;
  w_last timestamptz; r_first timestamptz; any_ret boolean; last_done int; nx_at timestamptz; any_next boolean;
  n_sent int := 0; n_fu int := 0; n_fu_sent int := 0;
  v_reason text; v_url text; v_tok text; v_run bigint; v_rid bigint;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  select * into cfg from public.analysis_dispatch_config where id = 1;

  -- ① 응답 정리(잡힌 뒤 온 응답 포함)
  for rr in select * from public.analysis_dispatch_runs
             where net_request_id is not null and http_status is null
               and (state = 'firing' or (state in ('running', 'finished') and created_at > now() - interval '1 day')) loop
    select status_code, content, timed_out, error_msg into resp from net._http_response where id = rr.net_request_id;
    if found and resp.status_code between 200 and 299 then
      update public.analysis_dispatch_runs
         set state = case when state = 'firing' then 'running' else state end, http_status = resp.status_code,
             session_url = coalesce(session_url, (case when resp.content ~ '^\s*\{' then resp.content::jsonb end)->>'claude_code_session_url')
       where id = rr.id;
      n_resolved := n_resolved + 1;
    elsif (found and rr.state = 'firing') or (found and rr.state = 'running' and resp.status_code >= 400)
          or (not found and rr.state = 'firing' and rr.created_at < now() - interval '15 minutes') then
      update public.analysis_dispatch_runs
         set state = 'failed', http_status = resp.status_code, finished_at = now(),
             error = left(coalesce(resp.error_msg, resp.content, '응답 없음(15분)'), 500)
       where id = rr.id;
      update public.analysis_dispatch_queue
         set state = 'waiting', run_id = null, state_at = now(), note = '발송 실패 run ' || rr.id
       where run_id = rr.id and state in ('sent', 'claimed');
      update public.analysis_followup_requests
         set state = 'waiting', run_id = null, state_at = now(), note = '발송 실패 run ' || rr.id
       where run_id = rr.id and state = 'sent';
      n_resolved := n_resolved + 1;
    elsif found then
      -- 잡힌 뒤(running · 상태 없음)·끝난 뒤(finished · 2xx 아님) 온 응답은 기록만 한다 — 다음 판정이 다시 보지 않게 http_status 를 채운다(없으면 0).
      update public.analysis_dispatch_runs
         set http_status = coalesce(resp.status_code, 0), error = coalesce(error, left(coalesce(resp.error_msg, resp.content), 500))
       where id = rr.id;
      n_resolved := n_resolved + 1;
    end if;
  end loop;

  -- ①-2 잡기 없이 60분 넘은 followup 회차 닫기(후속 전용 — 대기열 공고 없음)
  for rr in select id from public.analysis_dispatch_runs
             where reason = 'followup' and state = 'running' and created_at < now() - interval '60 minutes' loop
    update public.analysis_dispatch_runs
       set state = 'finished', finished_at = now(), finish_note = '후속 전용 — 60분 안에 잡기 없음 · 자동으로 닫음'
     where id = rr.id;
    update public.analysis_followup_requests
       set state = 'done', state_at = now(), note = 'run ' || rr.id || ' 자동으로 닫음'
     where run_id = rr.id and state = 'sent';
    n_resolved := n_resolved + 1;
  end loop;

  -- ② 후보 → 대기열
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
           coalesce(lm.lh_key, announcement_dedup_key(a.title)) as k, (lm.aid is not null) as linked
    from public.announcements a
    left join link_map lm on lm.aid = a.announcement_id
    where a.title is not null and a.hidden_from_listing is not true
  ),
  reps as (
    select d.announcement_id, d.title, d.source, d.housing_type, d.apply_start, d.apply_end, k.k
    from get_announcements_deduped() d
    join keyed k on k.announcement_id = d.announcement_id
    where d.apply_end >= current_date + 3
  ),
  cand as (
    select r.* from reps r
    where (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0) from keyed g
            where g.k = r.k and jsonb_typeof(g.attachment_urls) = 'array') > 0
      and not exists (select 1 from keyed g
            join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
           where g.k = r.k and (g.apply_end = r.apply_end or g.linked)
             and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)'))
  ),
  ins as (
    insert into public.analysis_dispatch_queue (group_key, apply_end, announcement_id, title, apply_start, phase, needs_promo)
    select c.k, c.apply_end, c.announcement_id, c.title, c.apply_start,
           case when c.apply_start > current_date then '접수 전' else '접수 중' end,
           (c.source = 'LH' and c.housing_type = '주거복지 - 매입임대')
    from cand c
    on conflict (group_key, apply_end) do nothing
    returning 1
  ),
  drp as (
    update public.analysis_dispatch_queue q
       set state = 'dropped', state_at = now(), note = '더는 후보가 아님(분석됨 · 접수 창 밖 · 대표 바뀜)'
     where q.state = 'waiting'
       and not exists (select 1 from cand c where c.k = q.group_key and c.apply_end = q.apply_end)
    returning 1
  )
  select (select count(*) from ins), (select count(*) from drp) into n_new, n_drop;

  update public.analysis_dispatch_queue q
     set ready_at = now()
   where q.state = 'waiting' and q.ready_at is null
     and (not q.needs_promo
          or exists (select 1 from public.announcement_promo_fetch f where f.announcement_id = q.announcement_id and f.ok));

  -- ③ 보낼지
  if exists (select 1 from public.analysis_dispatch_runs where state in ('firing', 'running')) then
    return jsonb_build_object('result', 'locked', 'new', n_new, 'dropped', n_drop, 'resolved', n_resolved);
  end if;
  select (select count(*) from public.analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done')
    into last_done
    from public.analysis_dispatch_runs r where r.state = 'finished' and r.reason <> 'followup' order by r.id desc limit 1;
  select r.created_at into nx_at
    from public.analysis_dispatch_runs r
   where r.id = (select max(id) from public.analysis_dispatch_runs where reason <> 'followup') and r.state = 'finished'
     and exists (select 1 from public.analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done');
  select count(*) filter (where ready_at is not null),
         max(case when returned and last_done = 0 then greatest(enqueued_at, state_at) else enqueued_at end),
         min(case when returned and last_done = 0 then greatest(ready_at, state_at) else ready_at end),
         bool_or(returned and ready_at is not null and coalesce(last_done, 1) > 0),
         coalesce(bool_or(not returned and ready_at <= nx_at and state_at <= nx_at), false)
    into n_ready, w_last, r_first, any_ret, any_next
    from public.analysis_dispatch_queue where state = 'waiting';
  select count(*) into n_fu from public.analysis_followup_requests where state = 'waiting';
  if n_ready = 0 and n_fu = 0 then
    return jsonb_build_object('result', 'empty', 'new', n_new, 'dropped', n_drop, 'resolved', n_resolved);
  end if;
  if n_ready > 0 then
    v_reason := case when p_force then 'manual'
                     when any_ret then 'returned'
                     when any_next then 'next'
                     when now() - w_last >= cfg.grace then 'grace'
                     when now() - r_first >= cfg.max_wait then 'max_wait' end;
  end if;
  if v_reason is null and n_fu > 0 then
    v_reason := 'followup';
  end if;
  if v_reason is null then
    return jsonb_build_object('result', 'waiting', 'ready', n_ready, 'new', n_new, 'dropped', n_drop,
                              'grace_left_min', round(extract(epoch from cfg.grace - (now() - w_last)) / 60));
  end if;
  if not p_force and not cfg.enabled then
    return jsonb_build_object('result', 'disabled', 'would', v_reason, 'ready', n_ready, 'followups', n_fu, 'new', n_new, 'dropped', n_drop);
  end if;
  if not p_force and (select count(*) = 3 and bool_and(state = 'failed')
                        from (select state from public.analysis_dispatch_runs order by id desc limit 3) z) then
    return jsonb_build_object('result', 'failing', 'would', v_reason, 'ready', n_ready);
  end if;
  if not p_force and (select count(*) = 3 and bool_and(state = 'finished' and done = 0)
                        from (select r.state, (select count(*) from public.analysis_dispatch_queue q
                                                where q.run_id = r.id and q.state = 'done') as done
                                from public.analysis_dispatch_runs r where r.reason <> 'followup' order by r.id desc limit 3) z) then
    return jsonb_build_object('result', 'stalled', 'would', v_reason, 'ready', n_ready);
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'zipfit_routine_fire_url';
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'zipfit_routine_fire_token';
  if coalesce(v_url, '') = '' or coalesce(v_tok, '') = '' then
    return jsonb_build_object('result', 'no_secret', 'would', v_reason, 'ready', n_ready);
  end if;

  insert into public.analysis_dispatch_runs (reason, items) values (v_reason, 0) returning id into v_run;
  if v_reason <> 'followup' then
  with pick as (
    select q.group_key, q.apply_end
      from public.analysis_dispatch_queue q
     where q.state = 'waiting' and q.ready_at is not null
     order by (q.apply_start > current_date) desc nulls last,
              case when q.apply_start > current_date then q.apply_start end,
              q.apply_end, q.enqueued_at, q.announcement_id
     limit greatest(coalesce(cfg.batch_size, 1), 1)
  )
  update public.analysis_dispatch_queue q
     set state = 'sent', run_id = v_run, returned = false, state_at = now()
    from pick
   where q.group_key = pick.group_key and q.apply_end = pick.apply_end;
  get diagnostics n_sent = row_count;
  end if;
  update public.analysis_dispatch_runs set items = n_sent where id = v_run;
  update public.analysis_followup_requests
     set state = 'sent', run_id = v_run, state_at = now()
   where state = 'waiting';
  get diagnostics n_fu_sent = row_count;
  v_rid := net.http_post(
    url := v_url,
    body := jsonb_build_object('text', format('ZipFit 분석 발송 run %s · 이번 몫 %s건 · 남은 대기 %s건 · 사유 %s', v_run, n_sent, n_ready - n_sent, v_reason)
                                       || case when v_reason = 'followup' then format(' — 분석 몫 없음 · 우편함 후속 처리 요청 %s건만', n_fu_sent)
                                               when n_fu_sent > 0 then format(' · 우편함 후속 처리 요청 %s건(먼저)', n_fu_sent) else '' end),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok,
                                  'anthropic-beta', 'experimental-cc-routine-2026-04-01', 'anthropic-version', '2023-06-01'),
    timeout_milliseconds := 30000);
  update public.analysis_dispatch_runs set net_request_id = v_rid where id = v_run;
  return jsonb_build_object('result', 'fired', 'run', v_run, 'reason', v_reason, 'items', n_sent, 'left', n_ready - n_sent,
                            'followups', n_fu_sent, 'new', n_new, 'dropped', n_drop);
end
$function$;

CREATE OR REPLACE FUNCTION public.analysis_queue_claim()
 RETURNS TABLE(run_id bigint, announcement_id text, title text, group_key text, apply_start date, apply_end date, phase text, needs_promo boolean, enqueued_at timestamp with time zone, was_returned boolean)
 LANGUAGE plpgsql
AS $function$
-- 루틴이 착수 때 부른다 — 도는 발송(firing·running) 한 회차의 실린 공고를 「잡음」으로 바꾸고 돌려준다(2026-10-01 운영 회차).
-- 도는 발송이 없으면 0행이다(수동 발송 시험도 analysis_dispatch_tick(true) 로 발송을 먼저 만든다).
-- 같은 회차를 두 번 부르면 이미 잡은 것을 다시 돌려준다(세션이 다시 시작돼도 같은 목록).
-- 🔵 2026-10-02 — 후속 전용 회차(reason followup · 분석 몫 0)는 잡기에서 닫는다(finished) — 0행을 돌려주고 잠금을 푼다.
--   루틴은 후속 처리를 먼저 하고 잡기를 부르므로, 후속 처리가 도는 동안은 잠금이 서 있다(분석 회차와 겹치지 않는다).
#variable_conflict use_column
declare
  v_run bigint; v_reason text;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  select r.id, r.reason into v_run, v_reason from public.analysis_dispatch_runs r where r.state in ('firing', 'running') order by r.id limit 1;
  if v_run is null then
    return;
  end if;
  if v_reason = 'followup' then
    update public.analysis_dispatch_runs r
       set state = 'finished', claimed_at = coalesce(r.claimed_at, now()), finished_at = now(),
           finish_note = '후속 전용 — 잡기로 닫음(분석 몫 0)'
     where r.id = v_run;
    update public.analysis_followup_requests f
       set state = 'done', state_at = now(), note = 'run ' || v_run || ' 잡기로 닫음'
     where f.run_id = v_run and f.state = 'sent';
    return;
  end if;
  update public.analysis_dispatch_runs r
     set state = 'running', claimed_at = coalesce(r.claimed_at, now())
   where r.id = v_run;
  return query
  update public.analysis_dispatch_queue q
     set state = 'claimed', state_at = now()
   where q.run_id = v_run and q.state in ('sent', 'claimed')
  returning q.run_id, q.announcement_id, q.title, q.group_key, q.apply_start, q.apply_end, q.phase, q.needs_promo, q.enqueued_at,
            coalesce(q.note like '루틴 되돌림%', false) as was_returned;
end
$function$;

CREATE OR REPLACE FUNCTION public.analysis_queue_finish(p_run_id bigint, p_done text[], p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 루틴이 끝날 때 부른다(2026-10-01 운영 회차) — p_done(대표 announcement_id)은 「끝」, 나머지 잡은 공고는 대기열로 되돌린다
-- (returned — 이 회차가 1건 이상 끝냈으면 다음 발송 판정이 유예 없이 가져가고, 0건이면 되돌린 때부터 유예를 따른다). 회차를 끝내 잠금을 푼다.
-- 「끝」은 분석 상태와 무관하다(완료 · 보류 · 실패 모두) — 한 번 루틴이 맡아 결론을 낸 공고는 자동으로 다시 보내지 않는다.
-- 🔵 2026-10-02 — 실린 후속 처리 요청(analysis_followup_requests)도 「끝」으로 닫는다. 잡기로 이미 닫힌 후속 전용 회차(followup)를
--   다시 끝내려 하면 오류 대신 0건을 돌려준다(루틴이 호출 본문의 run 번호로 끝을 불러도 실패로 보이지 않게).
declare
  n_done int; n_back int;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  if exists (select 1 from public.analysis_dispatch_runs where id = p_run_id and reason = 'followup' and state = 'finished') then
    return jsonb_build_object('run', p_run_id, 'done', 0, 'returned', 0, 'note', '후속 전용 회차 — 이미 닫힘');
  end if;
  if not exists (select 1 from public.analysis_dispatch_runs where id = p_run_id and state in ('firing', 'running')) then
    raise exception '발송 회차 % 가 도는 중이 아니다', p_run_id;
  end if;
  update public.analysis_dispatch_queue
     set state = 'done', state_at = now(), note = coalesce(p_note, '루틴 끝')
   where run_id = p_run_id and state in ('sent', 'claimed') and announcement_id = any(coalesce(p_done, '{}'::text[]));
  get diagnostics n_done = row_count;
  update public.analysis_dispatch_queue
     set state = 'waiting', returned = true, run_id = null, state_at = now(), note = '루틴 되돌림 run ' || p_run_id
   where run_id = p_run_id and state in ('sent', 'claimed');
  get diagnostics n_back = row_count;
  update public.analysis_followup_requests
     set state = 'done', state_at = now(), note = 'run ' || p_run_id || ' 끝'
   where run_id = p_run_id and state = 'sent';
  update public.analysis_dispatch_runs
     set state = 'finished', finished_at = now(), finish_note = p_note
   where id = p_run_id;
  return jsonb_build_object('run', p_run_id, 'done', n_done, 'returned', n_back);
end
$function$;

CREATE OR REPLACE FUNCTION public.analysis_run_release(p_run_id bigint, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 끝나지 않는 발송 회차의 잠금을 사람이 푼다(2026-10-02 · 우편함 「코드 — … 잠금 감시 C·D」 3 D).
-- 🔴 service_role(관리 API)만 부른다. 풀기 전에 루틴 세션이 정말 멈췄는지 확인한다 — 절차는 Notion ⑥ 「발송 회차 잠금 풀기」.
-- 도는 회차(firing·running)를 released 로 옮긴다 — released 는 claim·finish·tick 어느 쪽도 다시 집지 않는다(다시 running 이 되지 않는다).
-- 그 회차가 잡고 있던 공고(sent·claimed)는 대기(waiting)로 되돌린다 — 다음 발송 판정이 평소 규칙(유예·상한)대로 다시 보낸다.
-- ⚠️ 멈췄던 세션이 나중에 재개하면 이미 쓴 분석 행과 새 회차의 쓰기가 겹칠 수 있다 — 쓰기 가드(권고 A) 전까지는 절차로만 막는다.
declare
  r_state text; n_back int;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  if coalesce(btrim(p_note), '') = '' then
    raise exception '풀기 사유(p_note)가 필요하다';
  end if;
  select state into r_state from public.analysis_dispatch_runs where id = p_run_id for update;
  if not found then
    raise exception '발송 회차 % 가 없다', p_run_id;
  end if;
  if r_state not in ('firing', 'running') then
    raise exception '발송 회차 % 는 도는 중이 아니다(%)', p_run_id, r_state;
  end if;
  update public.analysis_dispatch_queue
     set state = 'waiting', returned = false, run_id = null, state_at = now(), note = '잠금 풀기 run ' || p_run_id
   where run_id = p_run_id and state in ('sent', 'claimed');
  get diagnostics n_back = row_count;
  -- 🔵 2026-10-02 — 실린 후속 처리 요청도 대기로 되돌린다(다음 판정이 다시 부른다).
  update public.analysis_followup_requests
     set state = 'waiting', run_id = null, state_at = now(), note = '잠금 풀기 run ' || p_run_id
   where run_id = p_run_id and state = 'sent';
  update public.analysis_dispatch_runs
     set state = 'released', finished_at = now(), finish_note = '잠금 풀기: ' || p_note
   where id = p_run_id;
  return jsonb_build_object('run', p_run_id, 'was', r_state, 'returned', n_back);
end
$function$;

revoke execute on function public.analysis_followup_request(text, text) from public, anon, authenticated;
grant execute on function public.analysis_followup_request(text, text) to service_role;
