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
$function$
