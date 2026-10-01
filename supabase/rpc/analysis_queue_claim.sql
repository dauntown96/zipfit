CREATE OR REPLACE FUNCTION public.analysis_queue_claim()
 RETURNS TABLE(run_id bigint, announcement_id text, title text, group_key text, apply_start date, apply_end date, phase text, needs_promo boolean, enqueued_at timestamp with time zone, was_returned boolean)
 LANGUAGE plpgsql
AS $function$
-- 루틴이 착수 때 부른다 — 도는 발송(firing·running) 한 회차의 실린 공고를 「잡음」으로 바꾸고 돌려준다(2026-10-01 운영 회차).
-- 도는 발송이 없으면 0행이다(수동 발송 시험도 analysis_dispatch_tick(true) 로 발송을 먼저 만든다).
-- 같은 회차를 두 번 부르면 이미 잡은 것을 다시 돌려준다(세션이 다시 시작돼도 같은 목록).
#variable_conflict use_column
declare
  v_run bigint;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  select r.id into v_run from public.analysis_dispatch_runs r where r.state in ('firing', 'running') order by r.id limit 1;
  if v_run is null then
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
