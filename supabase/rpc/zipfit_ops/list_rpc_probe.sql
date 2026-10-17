CREATE OR REPLACE FUNCTION zipfit_ops.list_rpc_probe()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — … 목록 RPC 응답 감시 …」 2) — 공개 목록 RPC 를 anon 역할로 한 번 돌려 걸린 시간을 남긴다.
--   cron zipfit-list-rpc-probe 가 10분마다(매 시 5·15·…분 — 수집 회차(0·10·…분) 사이) 부른다. 걸린 시간(ms)을 돌려준다.
--   화면과 같은 호출(인자 없음 · 전 칸 — 행을 text 로 바꿔 모든 칸을 계산하게 한다)을 anon 권한(RLS 포함)으로 잰다.
--   🔴 anon 의 statement_timeout(3초)은 여기서 걸리지 않는다(cron 은 postgres) — 끊지 않고 끝까지 재서 3초를 넘은 것을 「한도 넘음」으로 적는다.
--   기록 zipfit_ops.list_rpc_probe_log(90일) — health-ops list_rpc_time 이 읽는다(2초 ⚠️ · 3초·오류 ❌). 원인은 단정하지 않는다 — 기록이 쌓이면 판정.
declare
  t0 timestamptz;
  v_ms integer;
  v_rows integer;
  v_err text;
begin
  t0 := clock_timestamp();
  begin
    execute 'set local role anon';
    select count(*) into v_rows from public.get_announcements_deduped() x where octet_length(x::text) > 0;
    execute 'reset role';
  exception when others then
    v_err := left(sqlstate || ' ' || sqlerrm, 200);
  end;
  execute 'reset role';
  v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  insert into zipfit_ops.list_rpc_probe_log (ms, rows, ok, error)
  values (v_ms, v_rows, v_err is null and v_ms < 3000, v_err);
  delete from zipfit_ops.list_rpc_probe_log where at < now() - interval '90 days';
  return v_ms;
end
$function$
