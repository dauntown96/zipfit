-- zipfit:function zipfit_ops.net_purge_secret_responses() acl={postgres=X/postgres} secdef=false
-- zipfit:function zipfit_ops.list_rpc_probe() acl={postgres=X/postgres} secdef=false
-- 보안·감시 묶음 1·2(2026-10-17 · 우편함 「코드·운영 — pg_net 응답 표 권한(보안) · 목록 RPC 응답 감시 · …」).
--   ① pg_net 응답 표(net._http_response)의 권한은 supabase_admin 이 PUBLIC 에 준 것이라 postgres 가 회수할 수 없다(롤백 시험 — REVOKE 후에도
--      anon SELECT·USAGE·http_post EXECUTE 참). 바깥 길(REST Accept-Profile: net → 406 PGRST106 · GraphQL 꺼짐)은 닫혀 있다 —
--      그래서 토큰이 남는 자리를 줄인다: zipfit_ops.net_purge_secret_responses() 를 5분마다(cron zipfit-net-purge-secrets).
--   ② 공개 목록 RPC anon 실행 시간 기록: zipfit_ops.list_rpc_probe_log + zipfit_ops.list_rpc_probe() 를 10분마다(cron zipfit-list-rpc-probe · 매 시 5·15·…분).
-- 되돌리기: select cron.unschedule('zipfit-net-purge-secrets'); select cron.unschedule('zipfit-list-rpc-probe');
--   drop function zipfit_ops.list_rpc_probe(), zipfit_ops.net_purge_secret_responses(); drop table zipfit_ops.list_rpc_probe_log;
create table zipfit_ops.list_rpc_probe_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ms integer not null,
  rows integer,
  ok boolean not null,
  error text
);
comment on table zipfit_ops.list_rpc_probe_log is
  '공개 목록 RPC(get_announcements_deduped) anon 실행 시간 기록(2026-10-17) — zipfit_ops.list_rpc_probe() 가 10분마다 쓴다 · 90일 · health-ops list_rpc_time 이 읽는다. GRANT 0.';
revoke all on table zipfit_ops.list_rpc_probe_log from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION zipfit_ops.net_purge_secret_responses()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — pg_net 응답 표 권한(보안) …」 1 ④) — pg_net 응답 표에서 비밀값(OAuth 토큰) 응답 행을 지운다.
--   cron zipfit-net-purge-secrets 가 5분마다 부른다. 지운 행 수를 돌려준다.
--   까닭: net._http_response 는 pg_net 이 6시간(pg_net.ttl) 남기고, 그 표의 권한은 supabase_admin 이 PUBLIC 에 준 것이라
--   postgres 가 anon·authenticated 에서 회수할 수 없다(2026-10-17 롤백 시험 — REVOKE 가 아무것도 바꾸지 못함). REST·GraphQL 로는
--   net 스키마가 노출되지 않는다(PGRST106 · pg_graphql 꺼짐 — 같은 날 실측) — 그래도 토큰이 6시간 남는 자리 자체를 줄인다.
--   대상: 본문에 "access_token" · "refresh_token" · "id_token" · "client_secret" 키가 있는 응답(Google OAuth 토큰 응답 꼴 — 2026-10-16 1행 관측).
--   우리 함수는 그런 응답을 받지 않는다(Drive 토큰은 fetch-attachment 안에서만 받는다) — 손으로 net.http_post 를 부른 자리를 거둔다.
declare
  n integer;
begin
  delete from net._http_response r
   where r.content ~* '"(access_token|refresh_token|id_token|client_secret)"\s*:';
  get diagnostics n = row_count;
  return n;
end
$function$
;
revoke all on function zipfit_ops.net_purge_secret_responses() from public;

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
;
revoke all on function zipfit_ops.list_rpc_probe() from public;

select cron.schedule('zipfit-net-purge-secrets', '*/5 * * * *', $$select zipfit_ops.net_purge_secret_responses()$$);
select cron.schedule('zipfit-list-rpc-probe', '5-59/10 * * * *', $$select zipfit_ops.list_rpc_probe()$$);
