CREATE OR REPLACE FUNCTION public.analysis_queue_finish(p_run_id bigint, p_done text[], p_note text DEFAULT NULL::text, p_followup_result text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 루틴이 끝날 때 부른다(2026-10-01 운영 회차) — p_done(대표 announcement_id)은 「끝」, 나머지 잡은 공고는 대기열로 되돌린다
-- (returned — 이 회차가 1건 이상 끝냈으면 다음 발송 판정이 유예 없이 가져가고, 0건이면 되돌린 때부터 유예를 따른다). 회차를 끝내 잠금을 푼다.
-- 「끝」은 분석 상태와 무관하다(완료 · 보류 · 실패 모두) — 한 번 루틴이 맡아 결론을 낸 공고는 자동으로 다시 보내지 않는다.
-- 🔵 2026-10-02 — 실린 후속 처리 요청(analysis_followup_requests)도 「끝」으로 닫는다.
-- 🔵 2026-10-06(우편함 「코드 — 1-B 후속 처리가 실제로 일했는가」 3) — 넷째 인자 p_followup_result(처리 · 미착수 · 실패)를 그 회차에 실린
--   후속 처리 요청에 result 로 남긴다(result_note = p_note · reported_at = 지금). 빼고 부르면 종전처럼 닫기만 한다(result 빈 채).
--   후속 전용 회차(followup)는 이제 잡기가 닫지 않으므로 이 함수가 닫는다. 이미 닫힌 후속 전용 회차(발송기 60분 자동 닫기 ·
--   2026-10-06 이전 잡기 닫기)를 끝내려 하면 오류 대신 0건을 돌려주고, 결과 인자가 있으면 결과 빈 요청에 결과만 늦게 남긴다.
declare
  n_done int; n_back int; n_fu int;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  if p_followup_result is not null and p_followup_result not in ('처리', '미착수', '실패') then
    raise exception '후속 처리 결과(p_followup_result)는 처리 · 미착수 · 실패 중 하나다(받은 값 %)', p_followup_result;
  end if;
  if exists (select 1 from public.analysis_dispatch_runs where id = p_run_id and reason = 'followup' and state = 'finished') then
    update public.analysis_followup_requests
       set result = p_followup_result, result_note = p_note, reported_at = now()
     where run_id = p_run_id and result is null and p_followup_result is not null;
    get diagnostics n_fu = row_count;
    return jsonb_build_object('run', p_run_id, 'done', 0, 'returned', 0, 'followups', n_fu,
                              'note', '후속 전용 회차 — 이미 닫힘' || case when n_fu > 0 then ' · 결과만 남김' else '' end);
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
     set state = 'done', state_at = now(), note = 'run ' || p_run_id || ' 끝',
         result = p_followup_result,
         result_note = case when p_followup_result is not null then p_note end,
         reported_at = case when p_followup_result is not null then now() end
   where run_id = p_run_id and state = 'sent';
  get diagnostics n_fu = row_count;
  update public.analysis_dispatch_runs
     set state = 'finished', finished_at = now(), finish_note = p_note
   where id = p_run_id;
  return jsonb_build_object('run', p_run_id, 'done', n_done, 'returned', n_back, 'followups', n_fu, 'followup_result', p_followup_result);
end
$function$
