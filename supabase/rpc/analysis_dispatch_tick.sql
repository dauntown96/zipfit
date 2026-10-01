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
--   p_force = true(수동 시험)는 스위치·유예를 건너뛰되 잠금·비밀값은 지킨다.
--   매입(LH 주거복지 - 매입임대)은 홍보물 목록 수집이 끝나야 ready — 밤 수집분은 다음 날 홍보물 수집(KST 09:05~) 뒤에 나간다.
--   연속 3번 실패하면 자동 발송을 멈춘다(수동 p_force 는 된다) — health-ops 가 알린다.
-- 비밀값: Vault zipfit_routine_fire_url · zipfit_routine_fire_token(값은 표·반환에 싣지 않는다).
declare
  cfg public.analysis_dispatch_config%rowtype;
  rr record;
  resp record;
  n_new int := 0; n_drop int := 0; n_ready int := 0; n_resolved int := 0;
  w_last timestamptz; r_first timestamptz; any_ret boolean;
  v_reason text; v_url text; v_tok text; v_run bigint; v_rid bigint;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  select * into cfg from public.analysis_dispatch_config where id = 1;

  -- ① 응답 정리
  for rr in select * from public.analysis_dispatch_runs where state = 'firing' and net_request_id is not null loop
    select status_code, content, timed_out, error_msg into resp from net._http_response where id = rr.net_request_id;
    if found and resp.status_code between 200 and 299 then
      update public.analysis_dispatch_runs
         set state = 'running', http_status = resp.status_code,
             session_url = coalesce(session_url, (case when resp.content ~ '^\s*\{' then resp.content::jsonb end)->>'claude_code_session_url')
       where id = rr.id;
      n_resolved := n_resolved + 1;
    elsif found or rr.created_at < now() - interval '15 minutes' then
      update public.analysis_dispatch_runs
         set state = 'failed', http_status = resp.status_code, finished_at = now(),
             error = left(coalesce(resp.error_msg, resp.content, '응답 없음(15분)'), 500)
       where id = rr.id;
      update public.analysis_dispatch_queue
         set state = 'waiting', run_id = null, state_at = now(), note = '발송 실패 run ' || rr.id
       where run_id = rr.id and state in ('sent', 'claimed');
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
  select count(*) filter (where ready_at is not null), max(enqueued_at),
         min(ready_at), bool_or(returned and ready_at is not null)
    into n_ready, w_last, r_first, any_ret
    from public.analysis_dispatch_queue where state = 'waiting';
  if n_ready = 0 then
    return jsonb_build_object('result', 'empty', 'new', n_new, 'dropped', n_drop, 'resolved', n_resolved);
  end if;
  v_reason := case when p_force then 'manual'
                   when any_ret then 'returned'
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
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'zipfit_routine_fire_url';
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'zipfit_routine_fire_token';
  if coalesce(v_url, '') = '' or coalesce(v_tok, '') = '' then
    return jsonb_build_object('result', 'no_secret', 'would', v_reason, 'ready', n_ready);
  end if;

  insert into public.analysis_dispatch_runs (reason, items) values (v_reason, n_ready) returning id into v_run;
  update public.analysis_dispatch_queue
     set state = 'sent', run_id = v_run, returned = false, state_at = now()
   where state = 'waiting' and ready_at is not null;
  v_rid := net.http_post(
    url := v_url,
    body := jsonb_build_object('text', format('ZipFit 분석 발송 run %s · 대기열 %s건 · 사유 %s', v_run, n_ready, v_reason)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok,
                                  'anthropic-beta', 'experimental-cc-routine-2026-04-01', 'anthropic-version', '2023-06-01'),
    timeout_milliseconds := 30000);
  update public.analysis_dispatch_runs set net_request_id = v_rid where id = v_run;
  return jsonb_build_object('result', 'fired', 'run', v_run, 'reason', v_reason, 'items', n_ready, 'new', n_new, 'dropped', n_drop);
end
$function$
