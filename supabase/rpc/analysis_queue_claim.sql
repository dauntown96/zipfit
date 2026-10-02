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
$function$
