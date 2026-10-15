CREATE OR REPLACE FUNCTION public.analysis_run_heartbeat(p_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 루틴 회차의 심장박동(2026-10-15 · 우편함 「코드 — 루틴 자동 회수(안 A …)」 1 · 설계 PR #517 회신 ⓪(b)).
-- 🔴 service_role(관리 API)만 부른다 — 루틴이 잡기 직후와 단계 경계마다 부른다(원문 읽기 · 분석 · DB 쓰기 · 회신 사이).
-- 도는 회차(firing·running)면 heartbeat_at 을 지금으로 남기고 alive 참을 돌려준다 — 발송기 자동 회수(analysis_dispatch_tick ①-3)는
-- 마지막 심장박동(없으면 claimed_at)이 30분 넘게 조용하고 만든 지 90분 넘은 회차만 released 로 옮긴다.
-- 이미 회수된(released) · 끝난 회차면 아무것도 쓰지 않고 alive 거짓을 돌려준다 — 루틴은 그 자리에서 멈추고 「회수됨」만 회신한다.
-- 잠금: advisory 잠금을 잡지 않는다 — 회차 행 UPDATE 의 행 잠금이 자동 회수 UPDATE 와 줄을 세운다(먼저 커밋한 쪽을 다른 쪽이 다시 본다).
declare
  v_state text;
begin
  update public.analysis_dispatch_runs
     set heartbeat_at = now()
   where id = p_run_id and state in ('firing', 'running')
  returning state into v_state;
  if found then
    return jsonb_build_object('run', p_run_id, 'alive', true, 'state', v_state);
  end if;
  select state into v_state from public.analysis_dispatch_runs where id = p_run_id;
  return jsonb_build_object('run', p_run_id, 'alive', false, 'state', v_state,
                            'note', '도는 회차가 아니다 — 회수됨이면 멈추고 「회수됨」만 회신한다');
end
$function$
