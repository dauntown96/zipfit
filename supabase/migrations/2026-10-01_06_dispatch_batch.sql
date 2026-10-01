-- 운영 — 발송 한 회차 몫 상한 · 잡힌 뒤 응답 정리(2026-10-01 · 우편함 「코드 — 발송 한 회차 몫 상한 · 잡힌 뒤 응답 정리 · 목록 RPC 동시 호출 · 청년 매입 자녀 가점」 1·2)
--   1 config.batch_size(기본 1) — 한 발송에 한 몫만 싣는다 · 순서 = 접수 전 먼저 · 접수 시작 가까운 순 · 마감 가까운 순 · 먼저 들어온 순.
--     가장 최근 회차가 끝난 회차이고 1건 이상 끝냈으면 그 회차 발송 때 이미 ready 였던 남은 공고를 다음 판정에서 곧바로 보낸다(reason next — 제약에 더한다 ·
--     가장 최근 회차가 실패면 이어 보내지 않는다).
--   2 응답 정리를 firing 밖(running · finished 하루 안)으로 넓힌다 — run 행 http_status·session_url · 잡힌 뒤 온 4xx·5xx 는 failed + 대기열 복귀.
-- zipfit:function analysis_dispatch_tick(boolean) acl={postgres=X/postgres,service_role=X/postgres} secdef=false

alter table public.analysis_dispatch_config
  add column batch_size integer not null default 1 check (batch_size >= 1);
comment on column public.analysis_dispatch_config.batch_size is
  '한 발송에 싣는 공고 수(몫) — 기본 1. 순서는 analysis_dispatch_tick 머리 주석(분석 순서 산식)';

alter table public.analysis_dispatch_runs drop constraint analysis_dispatch_runs_reason_check;
alter table public.analysis_dispatch_runs
  add constraint analysis_dispatch_runs_reason_check check (reason in ('grace', 'max_wait', 'returned', 'next', 'manual'));

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
-- 비밀값: Vault zipfit_routine_fire_url · zipfit_routine_fire_token(값은 표·반환에 싣지 않는다).
declare
  cfg public.analysis_dispatch_config%rowtype;
  rr record;
  resp record;
  n_new int := 0; n_drop int := 0; n_ready int := 0; n_resolved int := 0;
  w_last timestamptz; r_first timestamptz; any_ret boolean; last_done int; nx_at timestamptz; any_next boolean;
  n_sent int := 0;
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
      n_resolved := n_resolved + 1;
    elsif found then
      -- 잡힌 뒤(running · 상태 없음)·끝난 뒤(finished · 2xx 아님) 온 응답은 기록만 한다 — 다음 판정이 다시 보지 않게 http_status 를 채운다(없으면 0).
      update public.analysis_dispatch_runs
         set http_status = coalesce(resp.status_code, 0), error = coalesce(error, left(coalesce(resp.error_msg, resp.content), 500))
       where id = rr.id;
      n_resolved := n_resolved + 1;
    end if;
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
    from public.analysis_dispatch_runs r where r.state = 'finished' order by r.id desc limit 1;
  select r.created_at into nx_at
    from public.analysis_dispatch_runs r
   where r.id = (select max(id) from public.analysis_dispatch_runs) and r.state = 'finished'
     and exists (select 1 from public.analysis_dispatch_queue q where q.run_id = r.id and q.state = 'done');
  select count(*) filter (where ready_at is not null),
         max(case when returned and last_done = 0 then greatest(enqueued_at, state_at) else enqueued_at end),
         min(case when returned and last_done = 0 then greatest(ready_at, state_at) else ready_at end),
         bool_or(returned and ready_at is not null and coalesce(last_done, 1) > 0),
         coalesce(bool_or(not returned and ready_at <= nx_at and state_at <= nx_at), false)
    into n_ready, w_last, r_first, any_ret, any_next
    from public.analysis_dispatch_queue where state = 'waiting';
  if n_ready = 0 then
    return jsonb_build_object('result', 'empty', 'new', n_new, 'dropped', n_drop, 'resolved', n_resolved);
  end if;
  v_reason := case when p_force then 'manual'
                   when any_ret then 'returned'
                   when any_next then 'next'
                   when now() - w_last >= cfg.grace then 'grace'
                   when now() - r_first >= cfg.max_wait then 'max_wait' end;
  if v_reason is null then
    return jsonb_build_object('result', 'waiting', 'ready', n_ready, 'new', n_new, 'dropped', n_drop,
                              'grace_left_min', round(extract(epoch from cfg.grace - (now() - w_last)) / 60));
  end if;
  if not p_force and not cfg.enabled then
    return jsonb_build_object('result', 'disabled', 'would', v_reason, 'ready', n_ready, 'new', n_new, 'dropped', n_drop);
  end if;
  if not p_force and (select count(*) = 3 and bool_and(state = 'failed')
                        from (select state from public.analysis_dispatch_runs order by id desc limit 3) z) then
    return jsonb_build_object('result', 'failing', 'would', v_reason, 'ready', n_ready);
  end if;
  if not p_force and (select count(*) = 3 and bool_and(state = 'finished' and done = 0)
                        from (select r.state, (select count(*) from public.analysis_dispatch_queue q
                                                where q.run_id = r.id and q.state = 'done') as done
                                from public.analysis_dispatch_runs r order by r.id desc limit 3) z) then
    return jsonb_build_object('result', 'stalled', 'would', v_reason, 'ready', n_ready);
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'zipfit_routine_fire_url';
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'zipfit_routine_fire_token';
  if coalesce(v_url, '') = '' or coalesce(v_tok, '') = '' then
    return jsonb_build_object('result', 'no_secret', 'would', v_reason, 'ready', n_ready);
  end if;

  insert into public.analysis_dispatch_runs (reason, items) values (v_reason, 0) returning id into v_run;
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
  update public.analysis_dispatch_runs set items = n_sent where id = v_run;
  v_rid := net.http_post(
    url := v_url,
    body := jsonb_build_object('text', format('ZipFit 분석 발송 run %s · 이번 몫 %s건 · 남은 대기 %s건 · 사유 %s', v_run, n_sent, n_ready - n_sent, v_reason)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok,
                                  'anthropic-beta', 'experimental-cc-routine-2026-04-01', 'anthropic-version', '2023-06-01'),
    timeout_milliseconds := 30000);
  update public.analysis_dispatch_runs set net_request_id = v_rid where id = v_run;
  return jsonb_build_object('result', 'fired', 'run', v_run, 'reason', v_reason, 'items', n_sent, 'left', n_ready - n_sent, 'new', n_new, 'dropped', n_drop);
end
$function$;
