CREATE OR REPLACE FUNCTION zipfit_ops.edge_request_daily_record(p jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
