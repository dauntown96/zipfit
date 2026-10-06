-- 후속 처리가 실제로 일했는가(2026-10-06 · 우편함 「코드 — 1-B 후속 처리가 실제로 일했는가(요청 표 결과 칸 · followup 회차 잠금 유지 · health-ops 경고)」).
--   1 analysis_followup_requests 에 picked_at · result(처리 · 미착수 · 실패) · result_note · reported_at.
--   2 analysis_queue_claim() — 후속 전용 회차(reason followup)를 잡기에서 닫지 않는다: 0행 · running 유지 · 실린 요청 picked_at.
--   3 analysis_queue_finish(run, 끝 목록, 메모, p_followup_result default null) — 그 회차 요청에 result · result_note(= 메모) · reported_at.
--     인자 없이 불러도 닫힌다(result 빈 채) · 분석 회차는 종전과 같다(결과 인자를 주면 실린 요청에도 남는다).
--   6 public.ops_health_findings — health-ops 경고·실패를 실행 1회당 항목 1행 · 30일 보관(ops_health_record 가 넣을 때 30일 넘은 행을 지운다).
--   🔴 공개 역할(PUBLIC·anon·authenticated) 실행·읽기 0 · service_role 만. 기존 done 행은 소급하지 않는다(결과 칸 빈 채).
--   잠금: 후속 전용 회차는 발송기가 만든 지 60분에 닫는다(analysis_dispatch_tick ①-2 — 바꾸지 않는다) → 잡은 때 기준 90분 stale_lock 에 닿지 않는다.
--   되돌리기: 옛 정의(git show <이 파일 앞 커밋>:supabase/rpc/analysis_queue_claim.sql · analysis_queue_finish.sql)로 새 마이그레이션 ·
--             drop function public.ops_health_record(jsonb); drop table public.ops_health_findings; alter table … drop column 넷.
-- zipfit:function analysis_queue_claim() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_queue_finish(bigint,text[],text,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:dropped analysis_queue_finish(bigint,text[],text)
-- zipfit:function ops_health_record(jsonb) acl={postgres=X/postgres,service_role=X/postgres} secdef=false

-- 1 요청 표 결과 칸
ALTER TABLE public.analysis_followup_requests
  ADD COLUMN picked_at timestamptz,
  ADD COLUMN result text CHECK (result IN ('처리', '미착수', '실패')),
  ADD COLUMN result_note text,
  ADD COLUMN reported_at timestamptz;
COMMENT ON COLUMN public.analysis_followup_requests.picked_at IS '루틴이 이 요청을 실은 회차를 잡은 때(analysis_queue_claim) — 2026-10-06 1-B';
COMMENT ON COLUMN public.analysis_followup_requests.result IS '루틴이 끝에 남긴 결과 처리 · 미착수 · 실패(analysis_queue_finish 넷째 인자) — 빈 칸 = 보고 없음 · 2026-10-06 1-B 이전 행은 소급하지 않았다';
COMMENT ON COLUMN public.analysis_followup_requests.result_note IS '결과 한 줄(analysis_queue_finish 메모) — 미착수면 막은 이슈 번호';
COMMENT ON COLUMN public.analysis_followup_requests.reported_at IS '결과를 남긴 때';

-- 2 잡기 — 후속 전용 회차를 닫지 않는다
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
$function$;

-- 3 끝 — 넷째 인자 결과(옛 세 인자 함수를 지우고 새로 만든다 · 세 인자 호출은 기본값으로 그대로 맞는다)
DROP FUNCTION public.analysis_queue_finish(bigint, text[], text);

CREATE FUNCTION public.analysis_queue_finish(p_run_id bigint, p_done text[], p_note text DEFAULT NULL::text, p_followup_result text DEFAULT NULL::text)
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
$function$;

REVOKE EXECUTE ON FUNCTION public.analysis_queue_finish(bigint, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analysis_queue_finish(bigint, text[], text, text) TO service_role;

-- 6 health-ops 경고·실패 기록
CREATE TABLE public.ops_health_findings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL,
  item text NOT NULL,
  result text NOT NULL CHECK (result IN ('warn', 'fail')),
  reason text NOT NULL,
  run_url text
);
CREATE INDEX ops_health_findings_run_at_idx ON public.ops_health_findings (run_at);
ALTER TABLE public.ops_health_findings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_health_findings FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.ops_health_findings IS 'health-ops(GitHub Actions 운영 점검) 경고·실패 — 실행 1회당 항목 1행 · 30일 보관(ops_health_record 가 넣을 때 지운다) · 2026-10-06 1-B. 통과한 항목은 남기지 않는다.';
COMMENT ON COLUMN public.ops_health_findings.run_at IS '점검 실행 시각(스크립트 시작)';
COMMENT ON COLUMN public.ops_health_findings.item IS '점검 항목 id(ops-check.mjs add 의 첫 인자)';
COMMENT ON COLUMN public.ops_health_findings.result IS 'warn = ⚠️ 경고(이슈 없음) · fail = ❌ 실패(health-ops 이슈)';
COMMENT ON COLUMN public.ops_health_findings.reason IS '한 줄 사유 — 점검 이름 — 값(300자)';
COMMENT ON COLUMN public.ops_health_findings.run_url IS 'GitHub Actions 실행 URL';

CREATE OR REPLACE FUNCTION public.ops_health_record(p_result jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- health-ops(.github/health/ops-check.mjs)가 점검 끝에 부른다(2026-10-06 · 우편함 「코드 — 1-B …」 6) — 점검 스크립트의 유일한 DB 쓰기.
-- p_result = {at, run_url, checks:[{id, name, status, value}]} — status 가 warn·fail 인 항목만 ops_health_findings 에 1행씩 넣는다.
-- 넣기 전에 30일 넘은 행을 지운다(보관 30일 — 별도 cron 없음). 넣은 행 수를 돌려준다.
declare
  n int;
begin
  delete from public.ops_health_findings where run_at < now() - interval '30 days';
  insert into public.ops_health_findings (run_at, item, result, reason, run_url)
  select coalesce((p_result->>'at')::timestamptz, now()), c->>'id', c->>'status',
         left(regexp_replace(coalesce(c->>'name', '') || ' — ' || coalesce(c->>'value', ''), '\s+', ' ', 'g'), 300),
         p_result->>'run_url'
    from jsonb_array_elements(coalesce(p_result->'checks', '[]'::jsonb)) c
   where c->>'status' in ('warn', 'fail');
  get diagnostics n = row_count;
  return n;
end
$function$;

REVOKE EXECUTE ON FUNCTION public.ops_health_record(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_health_record(jsonb) TO service_role;
