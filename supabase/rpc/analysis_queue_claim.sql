CREATE OR REPLACE FUNCTION public.analysis_queue_claim()
 RETURNS TABLE(run_id bigint, announcement_id text, title text, group_key text, apply_start date, apply_end date, phase text, needs_promo boolean, enqueued_at timestamp with time zone, was_returned boolean)
 LANGUAGE plpgsql
AS $function$
-- 루틴이 착수 때 부른다 — 도는 발송(firing·running) 한 회차의 실린 공고를 「잡음」으로 바꾸고 돌려준다(2026-10-01 운영 회차).
-- 도는 발송이 없으면 0행이다(수동 발송 시험도 analysis_dispatch_tick(true) 로 발송을 먼저 만든다).
-- 같은 회차를 두 번 부르면 이미 잡은 것을 다시 돌려준다(세션이 다시 시작돼도 같은 목록).
-- 🔵 2026-10-06(우편함 「코드 — 1-B 후속 처리가 실제로 일했는가」 2) — 후속 전용 회차(reason followup · 분석 몫 0)도 잡기에서 닫지 않는다
--   (2026-10-02 ~ 10-06 은 잡기로 닫았다). 0행을 돌려주고 running 으로 둔다 — 루틴이 후속 처리를 마치고
--   analysis_queue_finish(run, '{}', 메모, 결과)로 닫는다(결과 처리 · 미착수 · 실패가 요청 표에 남는다). 그동안 잠금이 서 있어 분석 발송이 없다.
--   finish 를 부르지 않으면 발송기가 만든 지 60분에 닫는다(analysis_dispatch_tick ①-2 · 결과 빈 채 → health-ops followup_unreported ⚠️).
--   잡은 회차에 실린 후속 처리 요청(분석 회차에 함께 실린 것 포함)에 picked_at 을 남긴다 — 잠금 풀기로 되돌아와 다른 회차에 다시 실리면 그 회차가 다시 쓴다.
#variable_conflict use_column
declare
  v_run bigint; v_reason text; v_created timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  select r.id, r.reason, r.created_at into v_run, v_reason, v_created
    from public.analysis_dispatch_runs r where r.state in ('firing', 'running') order by r.id limit 1;
  if v_run is null then
    return;
  end if;
  update public.analysis_dispatch_runs r
     set state = 'running', claimed_at = coalesce(r.claimed_at, now())
   where r.id = v_run;
  update public.analysis_followup_requests f
     set picked_at = now()
   where f.run_id = v_run and f.state = 'sent' and (f.picked_at is null or f.picked_at < v_created);
  if v_reason = 'followup' then
    return;
  end if;
  return query
  update public.analysis_dispatch_queue q
     set state = 'claimed', state_at = now()
   where q.run_id = v_run and q.state in ('sent', 'claimed')
  returning q.run_id, q.announcement_id, q.title, q.group_key, q.apply_start, q.apply_end, q.phase, q.needs_promo, q.enqueued_at,
            coalesce(q.note like '루틴 되돌림%', false) as was_returned;
end
$function$
