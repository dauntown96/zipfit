CREATE OR REPLACE FUNCTION public.lh_file_gate_done(p_log_id bigint, p_outcome text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lh_file_gate 가 허락한 받기의 결과를 같은 기록 행에 적는다(2026-11-05) — EF fetch-attachment 가 응답을 돌려주기 직전에 부른다.
-- p_outcome = 'ok'(받음 · 올림) 또는 실패 사유(fail · truncated · html_response · upstream_403 · upstream_429 · conn_error …) — 실패 행은 「재시도 한 번까지」 셈에 든다.
-- 🔵 2026-11-10(우편함 「코드·운영 — LH 첨부 문지기 복원 …」 3) 차단 감지 — 결과가 적힌 최근 허락 행 block_streak(기본 3)개가 모두 차단 꼴이면 그 자리에서 멈춘다:
--   analysis_dispatch_config.lh_file_mode = 'paused' · lh_file_block_at · lh_file_block_reason · 기록 행 kind 'block_stop' 한 줄.
--   🔴 다시 켜기는 사람 판단(데이터 쓰기 — lh_file_mode = 'normal' · lh_file_block_at = null). health-ops lh_file_block 이 안 멈춤 실패로 알린다(이슈).
-- 🔵 2026-11-17(우편함 「코드·운영 — 운영 장치 넷 …」 1) — 차단 꼴을 둘로 가른다:
--   단단한 꼴(upstream_403 · upstream_429 · html_response) 만이면 서로 다른 파일 둘 이상에서 멈춘다(종전 그대로).
--   무른 꼴(conn_error · aborted — 시간 초과·연결 오류)이 섞이면 서로 다른 파일 block_streak 개일 때만 멈춘다
--   (11-17 1352~1354 — 파일 둘의 느린 응답 세 번에 멈췄다 · 같은 파일 되풀이는 「재시도 한 번까지」가 그 파일에서 끝낸다).
declare
  v_n int; v_rows int; v_hard int; v_soft int; v_files int; v_mode text; v_list text;
begin
  update public.lh_file_fetch_log
     set outcome = left(coalesce(p_outcome, 'fail'), 60), outcome_at = now()
   where id = p_log_id and allowed and outcome is null;
  select coalesce(c.lh_file_block_streak, 3), c.lh_file_mode into v_n, v_mode from public.analysis_dispatch_config c where c.id = 1;
  if v_mode is null or v_mode = 'paused' or coalesce(v_n, 0) < 1 then return; end if;
  select count(*),
         count(*) filter (where x.outcome ~ '^(upstream_(403|429)|html_response)'),
         count(*) filter (where x.outcome !~ '^(upstream_(403|429)|html_response)' and x.outcome ~ '^(conn_error|aborted)'),
         count(distinct x.file_id),
         string_agg(x.outcome, ' · ' order by x.outcome_at desc)
    into v_rows, v_hard, v_soft, v_files, v_list
    from (select l.outcome, l.file_id, l.outcome_at from public.lh_file_fetch_log l
           where l.allowed and l.outcome is not null order by l.outcome_at desc, l.id desc limit v_n) x;
  if v_rows = v_n and v_hard + v_soft = v_n
     and ((v_soft = 0 and v_files >= least(2, v_n)) or (v_soft > 0 and v_files >= v_n)) then
    update public.analysis_dispatch_config
       set lh_file_mode = 'paused', lh_file_block_at = now(),
           lh_file_block_reason = left('차단 감지 — 최근 ' || v_n || '번 연속(' || v_list || ') · 파일 ' || v_files || ' · 모드 ' || v_mode || ' → paused', 300)
     where id = 1;
    insert into public.lh_file_fetch_log (file_id, kind, announcement_id, mode, purpose, allowed, reason)
    values (null, 'block_stop', null, 'paused', 'block', false, left('차단 감지 — 최근 ' || v_n || '번 연속 · 파일 ' || v_files || ' · ' || v_list || ' · 그 자리에서 paused(다시 켜기는 사람)', 300));
  end if;
end
$function$
