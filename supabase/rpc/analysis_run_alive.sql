CREATE OR REPLACE FUNCTION public.analysis_run_alive(p_run_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 분석 DB 쓰기 앞 생존 가드(2026-10-15 · 우편함 「코드 — 루틴 자동 회수(안 A …)」 1).
-- 🔴 루틴은 분석 쓰기 트랜잭션(관리 API 요청 하나)의 맨 앞에서 부르고, 거짓이면 예외를 던져 그 트랜잭션을 통째로 롤백한다:
--   do $$ begin if not public.analysis_run_alive(N) then raise exception '회수됨 — run N'; end if; end $$;
-- 참이면 그 회차 행을 고쳐(heartbeat_at = 지금) 행 잠금을 쥔다 — 같은 트랜잭션이 커밋·롤백할 때까지 자동 회수(analysis_dispatch_tick ①-3)가
-- 그 행에서 기다리고, 커밋된 뒤에는 방금 찍힌 심장박동을 보고 회수하지 않는다(쓰기 도중에 몫이 다른 회차로 넘어가지 않는다).
-- 회수된(released) · 끝난 회차면 아무것도 쓰지 않고 거짓이다.
begin
  update public.analysis_dispatch_runs
     set heartbeat_at = now()
   where id = p_run_id and state in ('firing', 'running');
  return found;
end
$function$
