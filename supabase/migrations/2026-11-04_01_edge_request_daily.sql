-- zipfit:function zipfit_ops.edge_request_daily_record(jsonb) acl={postgres=X/postgres} secdef=false
-- 엣지 요청 일일 셈(2026-11-04 · 우편함 「코드·운영 — swap 처방 …」 5 · 조사 「DB 인스턴스 swap 증가」 ⑦1 채택).
--   ① zipfit_ops.edge_request_daily — KST 하루 한 행 · 관리 API 로그(edge_logs)의 요청 수를 「전체 · 헤드리스 · 스크립트 · 나머지」 개수로만.
--      🔴 UA·IP·경로 값은 받지도 남기지도 않는다(원칙 36) — 개수 칸뿐. 하루 한 행이라 보관 기간 정리 없음(1년 약 365행 · 행당 100바이트 안팎).
--      로그 조회가 실패(429 등)한 날은 ok=false · 개수 NULL(0으로 적지 않는다) · 다음 health-ops 실행이 다시 센다.
--   ② zipfit_ops.edge_request_daily_record(jsonb) — health-ops 가 부른다 · 이미 ok 인 날을 실패로 덮지 않는다.
-- 되돌리기: drop function zipfit_ops.edge_request_daily_record(jsonb); drop table zipfit_ops.edge_request_daily;
create table zipfit_ops.edge_request_daily (
  day date primary key,
  ok boolean not null,
  total integer,
  headless integer,
  script integer,
  other integer,
  note text,
  counted_at timestamptz not null default now(),
  tries integer not null default 1
);
comment on table zipfit_ops.edge_request_daily is
  'KST 하루 엣지 요청 수(2026-11-04) — health-ops 가 관리 API 로그 edge_logs 를 세어 넣는다 · 헤드리스 = UA HeadlessChrome · 스크립트 = curl·python·Deno·pg_net·node 등 · 나머지 = 전체 − 둘 · 개수만(UA·IP 값 0) · ok=false 는 못 셈(개수 NULL) · GRANT 0.';
revoke all on table zipfit_ops.edge_request_daily from public, anon, authenticated, service_role;

create or replace function zipfit_ops.edge_request_daily_record(p jsonb)
 returns text
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
-- 🔵 2026-11-04(우편함 「코드·운영 — swap 처방 …」 5) — health-ops 가 하루 한 번(전날 KST · 못 센 날은 다시) 넘긴다.
--   p = {day: 'YYYY-MM-DD', ok: bool, total, headless, script, note} · other = total − headless − script(ok 일 때만).
--   🔴 개수만 — UA·IP·경로 값은 받지 않는다. 이미 ok 인 날은 실패로 덮지 않는다(셈을 잃지 않게). 결과: 'ok' · 'fail' · 'kept'.
declare v_ok boolean := coalesce((p->>'ok')::boolean, false);
begin
  if v_ok then
    insert into zipfit_ops.edge_request_daily (day, ok, total, headless, script, other, note)
    values ((p->>'day')::date, true, (p->>'total')::int, (p->>'headless')::int, (p->>'script')::int,
            (p->>'total')::int - (p->>'headless')::int - (p->>'script')::int, left(p->>'note', 200))
    on conflict (day) do update
       set ok = true, total = excluded.total, headless = excluded.headless, script = excluded.script, other = excluded.other,
           note = excluded.note, counted_at = now(), tries = zipfit_ops.edge_request_daily.tries + 1;
    return 'ok';
  end if;
  insert into zipfit_ops.edge_request_daily (day, ok, note)
  values ((p->>'day')::date, false, left(coalesce(p->>'note', '못 셈'), 200))
  on conflict (day) do update
     set note = excluded.note, counted_at = now(), tries = zipfit_ops.edge_request_daily.tries + 1
   where not zipfit_ops.edge_request_daily.ok;
  return case when exists (select 1 from zipfit_ops.edge_request_daily where day = (p->>'day')::date and ok) then 'kept' else 'fail' end;
end
$function$;
revoke all on function zipfit_ops.edge_request_daily_record(jsonb) from public, anon, authenticated, service_role;
