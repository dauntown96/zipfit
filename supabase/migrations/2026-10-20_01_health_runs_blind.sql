-- zipfit:function ops_health_record(jsonb) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 점검 불능 분리(2026-10-20 · 우편함 「코드·운영 — 미착수 회차(사용량 소진) 조사 · 점검 불능 분리 · G6 잡기 대기 칸 · dispatch 문구 · CLAUDE.md 배포 동결」 ⓓ ·
--   백로그 「점검 불능(blind)이 이슈로만 …」 ①).
--   ① ops_health_runs.blind text[] — 그 실행에서 재지 못한 항목 id(기본 '{}'). 기존 행은 '{}' 그대로(데이터 쓰기 0 · 뒤로 채우지 않는다).
--   ② ops_health_record(jsonb): 항목에 blind = true 가 붙은 경고·실패의 id 를 blind 에 남긴다. failed·warned·ok·n_* 는 종전 그대로 —
--      상태판(ops_status_board)·관문(gate.mjs)·결과 파일이 읽는 뜻을 바꾸지 않는다. 런칭 게이트 셈(docs/launch-gates.sql G1·G4)이 blind 를 빼고 센다.
--   붙이는 쪽(같은 PR): ops-check.mjs runner(관리 API 예외) · list_user_fail(로그 조회 실패) · health-screen.yml 배포 반영 기다림 초과(runner).
--      화면 점검이 돈 뒤의 runner 실패(배포본이 안 열림)는 점검 불능이 아니라 실패다 — blind 를 붙이지 않는다.
-- 되돌리기: 함수를 2026-10-18_04 정의로 CREATE OR REPLACE · alter table public.ops_health_runs drop column blind.
alter table public.ops_health_runs add column blind text[] not null default '{}';
comment on column public.ops_health_runs.blind is '점검 불능 항목 id(2026-10-20) — 그 실행에서 재지 못한 항목(health-ops runner·list_user_fail 로그 조회 실패 · health-screen 배포 반영 기다림 초과). failed·warned 에도 그대로 있다 — 게이트 셈은 이 칸을 빼고 센다.';

CREATE OR REPLACE FUNCTION public.ops_health_record(p_result jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- health-ops(.github/health/ops-check.mjs)가 점검 끝에 부른다(2026-10-06 · 우편함 「코드 — 1-B …」 6) — 점검 스크립트의 유일한 DB 쓰기.
-- p_result = {at, run_url, ref, checks:[{id, name, status, value}]} — status 가 warn·fail 인 항목만 ops_health_findings 에 1행씩 넣는다.
-- 🔵 2026-10-06(우편함 「코드 — 1-C …」 3) — 실행마다(통과 포함) ops_health_runs 에 요약 1행(통과·경고·실패·건너뜀 수 · 실패·경고 id · ref · run URL).
--   「발송(ops_dispatch_log)했는데 요약 없음 = 점검 불능(관리 API를 못 썼다)」이 SQL 로 잡힌다.
-- 🔵 2026-10-18(우편함 「코드·운영 — 게이트 재는 장치」 ①) — p_result.kind = 'ops'(기본 · health-ops) | 'screen'(health-screen · screen-check.mjs).
--   두 표의 kind 칸에 그대로 남긴다 — 운영 점검을 읽는 자리(상태판 · ops_gap)는 kind = 'ops' 만 본다 · 런칭 게이트 G1 화면은 kind = 'screen'.
-- 🔵 2026-10-20(우편함 「코드·운영 — 미착수 회차(사용량 소진) 조사 · 점검 불능 분리 …」 ⓓ) — 항목에 blind = true 가 붙으면(점검 불능 —
--   그 항목을 재지 못했다 · 화면·운영 「점검 실행」 runner 가 배포 기다림·관리 API 예외로 끊김 · list_user_fail 로그 조회 실패) ops_health_runs.blind 에 그 id 를 남긴다.
--   failed·warned·ok 는 종전 그대로(그 항목도 ❌·⚠️로 남는다 — 상태판·결과 파일과 같은 뜻) · 게이트 셈(docs/launch-gates.sql)이 blind 를 빼고 센다.
-- 넣기 전에 30일 넘은 행을 두 표에서 지운다(보관 30일 — 별도 cron 없음). 넣은 경고·실패 행 수를 돌려준다.
declare
  n int;
  v_at timestamptz := coalesce((p_result->>'at')::timestamptz, now());
  v_checks jsonb := coalesce(p_result->'checks', '[]'::jsonb);
  v_kind text := coalesce(nullif(p_result->>'kind', ''), 'ops');
begin
  if v_kind not in ('ops', 'screen') then
    raise exception 'ops_health_record: 모르는 kind %', v_kind;
  end if;
  delete from public.ops_health_findings where run_at < now() - interval '30 days';
  delete from public.ops_health_runs where run_at < now() - interval '30 days';
  insert into public.ops_health_findings (run_at, item, result, reason, run_url, kind)
  select v_at, c->>'id', c->>'status',
         left(regexp_replace(coalesce(c->>'name', '') || ' — ' || coalesce(c->>'value', ''), '\s+', ' ', 'g'), 300),
         p_result->>'run_url', v_kind
    from jsonb_array_elements(v_checks) c
   where c->>'status' in ('warn', 'fail');
  get diagnostics n = row_count;
  insert into public.ops_health_runs (run_at, ref, ok, n_pass, n_warn, n_fail, n_skip, failed, warned, run_url, kind, blind)
  select v_at, p_result->>'ref',
         count(*) filter (where c->>'status' = 'fail') = 0,
         count(*) filter (where c->>'status' = 'pass'), count(*) filter (where c->>'status' = 'warn'),
         count(*) filter (where c->>'status' = 'fail'), count(*) filter (where c->>'status' = 'skip'),
         coalesce(array_agg(c->>'id') filter (where c->>'status' = 'fail'), '{}'),
         coalesce(array_agg(c->>'id') filter (where c->>'status' = 'warn'), '{}'),
         p_result->>'run_url', v_kind,
         coalesce(array_agg(c->>'id') filter (where c->>'status' in ('warn', 'fail') and c->>'blind' = 'true'), '{}')
    from jsonb_array_elements(v_checks) c;
  return n;
end
$function$;
