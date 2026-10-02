-- 루틴 잠금 감시 D — 끝나지 않는 발송 회차의 잠금을 사람이 푸는 함수(2026-10-02 · 우편함 「코드 — 아산 블록 세대 미표시 · … · 잠금 감시 C·D」 3).
--   계기: run 101(2026-10-01) — 루틴 세션이 잡은 직후 사용량 한도로 멈춰 3시간 53분 잠금이 풀리지 않았고 대기열 전체가 섰다.
--   🔴 잠금 만료(자동)는 아니다 — 사람이 세션이 멈췄는지 확인하고 부른다(절차는 Notion ⑥). 자동 만료·claim(p_run_id)·쓰기 가드는 권고 A(스킬과 함께).
--   상태 released 를 더한다 — claim(firing·running만 집음)·finish(firing·running만 받음)·tick(①단계 firing·running·finished만 정리) 어느 쪽도
--   released 를 다시 집지 않는다. 연속 실패(failed 3)·연속 0건(finished 3) 판정에서는 released 가 줄을 끊는다.
--   🔴 공개 역할(PUBLIC·anon·authenticated) 실행 0 · service_role 만.
-- zipfit:function analysis_run_release(bigint,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
alter table public.analysis_dispatch_runs drop constraint analysis_dispatch_runs_state_check;
alter table public.analysis_dispatch_runs add constraint analysis_dispatch_runs_state_check
  check (state in ('firing', 'running', 'finished', 'failed', 'released'));

CREATE OR REPLACE FUNCTION public.analysis_run_release(p_run_id bigint, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 끝나지 않는 발송 회차의 잠금을 사람이 푼다(2026-10-02 · 우편함 「코드 — … 잠금 감시 C·D」 3 D).
-- 🔴 service_role(관리 API)만 부른다. 풀기 전에 루틴 세션이 정말 멈췄는지 확인한다 — 절차는 Notion ⑥ 「발송 회차 잠금 풀기」.
-- 도는 회차(firing·running)를 released 로 옮긴다 — released 는 claim·finish·tick 어느 쪽도 다시 집지 않는다(다시 running 이 되지 않는다).
-- 그 회차가 잡고 있던 공고(sent·claimed)는 대기(waiting)로 되돌린다 — 다음 발송 판정이 평소 규칙(유예·상한)대로 다시 보낸다.
-- ⚠️ 멈췄던 세션이 나중에 재개하면 이미 쓴 분석 행과 새 회차의 쓰기가 겹칠 수 있다 — 쓰기 가드(권고 A) 전까지는 절차로만 막는다.
declare
  r_state text; n_back int;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  if coalesce(btrim(p_note), '') = '' then
    raise exception '풀기 사유(p_note)가 필요하다';
  end if;
  select state into r_state from public.analysis_dispatch_runs where id = p_run_id for update;
  if not found then
    raise exception '발송 회차 % 가 없다', p_run_id;
  end if;
  if r_state not in ('firing', 'running') then
    raise exception '발송 회차 % 는 도는 중이 아니다(%)', p_run_id, r_state;
  end if;
  update public.analysis_dispatch_queue
     set state = 'waiting', returned = false, run_id = null, state_at = now(), note = '잠금 풀기 run ' || p_run_id
   where run_id = p_run_id and state in ('sent', 'claimed');
  get diagnostics n_back = row_count;
  update public.analysis_dispatch_runs
     set state = 'released', finished_at = now(), finish_note = '잠금 풀기: ' || p_note
   where id = p_run_id;
  return jsonb_build_object('run', p_run_id, 'was', r_state, 'returned', n_back);
end
$function$
;

revoke execute on function public.analysis_run_release(bigint, text) from public, anon, authenticated;
grant execute on function public.analysis_run_release(bigint, text) to service_role;
comment on function public.analysis_run_release(bigint, text) is
  '발송 회차 잠금 풀기(사람이 부른다) — firing·running → released · 잡힌 공고는 waiting. 사유 필수. 정의 사본: supabase/rpc/analysis_run_release.sql';
comment on column public.analysis_dispatch_runs.state is 'firing → running → finished / failed / released(사람이 잠금을 풀었다 — analysis_run_release)';
