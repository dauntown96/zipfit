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
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 안정화 …」 3) — 한 회차에 두 번 잰다: ms = 새 연결 첫 실행(cron 은 회차마다 새 연결 — 사용자가 겪는 쪽 · 판정은 이것)
--   · ms2 = 같은 연결 둘째 실행(함수 자체 속도). 첫 실행만 간헐로 느린 꼴(2026-10-17 조사 E)을 기록만으로 가른다.
--   error = 오류면 SQLSTATE·메시지 앞부분 · 오류 없이 3초를 넘으면 「57014 상당」(anon 이면 그 자리에서 끊겼을 것) · 둘째만 오류면 「둘째: …」.
declare
  t0 timestamptz;
  v_ms integer;
  v_ms2 integer;
  v_rows integer;
  v_rows2 integer;
  v_err text;
  v_err2 text;
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
  t0 := clock_timestamp();
  begin
    execute 'set local role anon';
    select count(*) into v_rows2 from public.get_announcements_deduped() x where octet_length(x::text) > 0;
    execute 'reset role';
  exception when others then
    v_err2 := left(sqlstate || ' ' || sqlerrm, 200);
  end;
  execute 'reset role';
  v_ms2 := round(extract(epoch from clock_timestamp() - t0) * 1000);
  if v_err is null and v_ms >= 3000 then
    v_err := '57014 상당 — anon 한도 3초 넘음(탐침은 끊지 않고 끝까지 잰다)';
  end if;
  insert into zipfit_ops.list_rpc_probe_log (ms, ms2, rows, ok, error)
  values (v_ms, v_ms2, coalesce(v_rows, v_rows2), v_err is null,
          nullif(concat_ws(' · ', v_err, '둘째: ' || v_err2), ''));
  delete from zipfit_ops.list_rpc_probe_log where at < now() - interval '90 days';
  return v_ms;
end
$function$
