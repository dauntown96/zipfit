-- zipfit:function zipfit_ops.usage_ua_daily_record(jsonb) acl={postgres=X/postgres} secdef=false
-- 이용 기록 UA 갈래 일일 셈(2026-11-09 · 우편함 「코드·운영 — 모드 정의 하나 … · 이용 기록 갈라 보이기 …」 3장 ② · 조사 「이용 기록 자동 세션 원인」 ⑦1 채택).
--   ① zipfit_ops.usage_ua_daily — KST 하루 한 행 · 그날 이용 기록 세션을 「운영 표지 · 봇 · 헤드리스 · 스크립트 · 그 밖(그중 열기 30회 이상)」 개수로만.
--      🔴 세션 id · 회원 id · props 값 · UA 원문은 받지도 남기지도 않는다(원칙 36) — 개수 칸뿐. 하루 한 행이라 보관 기간 정리 없음(edge_request_daily 와 같은 꼴).
--      로그 조회가 실패한 날은 ok=false · 개수 NULL · 다음 health-ops 실행이 다시 센다.
--   ② zipfit_ops.usage_ua_daily_record(jsonb) — health-ops 가 부른다(관리 API · postgres) · 맞대기는 이 함수 안(DB)에서만.
-- 되돌리기: drop function zipfit_ops.usage_ua_daily_record(jsonb); drop table zipfit_ops.usage_ua_daily;
create table zipfit_ops.usage_ua_daily (
  day date primary key,
  ok boolean not null,
  sessions integer,
  bot integer,
  headless integer,
  ops integer,
  script integer,
  other integer,
  other_heavy integer,
  events integer,
  matched integer,
  hits integer,
  note text,
  counted_at timestamptz not null default now(),
  tries integer not null default 1
);
comment on table zipfit_ops.usage_ua_daily is
  'KST 하루 이용 기록 세션 UA 갈래 셈(2026-11-09) — health-ops 가 엣지 로그 POST /rest/v1/usage_events(시각 + 갈래만)와 usage_events 를 ±2초로 맞대 넣는다 · 갈래 우선순위 운영 표지 > 봇 > 헤드리스 > 스크립트 > 그 밖 · other_heavy = 그 밖 중 열기 30회 이상 · events·matched = 그날 사건·로그와 맞은 사건 · hits = 로그 요청 수 · 개수만(세션 id·UA 값 0) · ok=false 는 못 셈 · GRANT 0.';
revoke all on table zipfit_ops.usage_ua_daily from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION zipfit_ops.usage_ua_daily_record(p jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-09(우편함 「코드·운영 — 모드 정의 하나 … · 이용 기록 갈라 보이기 …」 3장 ② · 조사 「이용 기록 자동 세션 원인」 ⑦1 채택) —
--   health-ops 가 하루 한 번(전날 KST · 못 센 날은 다시) 넘긴다. 이용 기록(public.usage_events)과 엣지 로그 요청(POST /rest/v1/usage_events)을
--   초 단위(±2초 · 가장 가까운 요청)로 맞대 그날 세션을 갈래 개수로만 남긴다.
--   p = {day: 'YYYY-MM-DD', ok: bool, hits: [{t: 'YYYY-MM-DD HH:MI:SS.mmm'(UTC), c: 'b'|'h'|'s'|'o'}], note}
--     c = 봇(UA 낱말 bot·crawler·spider 등) · 헤드리스(HeadlessChrome) · 스크립트 · 그 밖(브라우저) — 갈래는 로그 질의가 정하고 UA 원문은 오지 않는다.
--   세션 갈래(우선순위): 운영 표지(props ? 'ops' ∨ 운영자 계정) > 봇 > 헤드리스 > 스크립트 > 그 밖. 그 밖 중 열기 30회 이상은 other_heavy 로 따로 센다
--     (운영 브라우저 표지 누락 의심 — supabase/metrics/usage_weekly.sql heavy_sessions 와 같은 문턱).
--   🔴 개수만 남긴다 — 세션 id · 회원 id · props 값 · UA 를 표에 쓰지 않는다(원칙 36). 이미 ok 인 날은 실패로 덮지 않는다. 결과: 'ok' · 'fail' · 'kept'.
--   ⚠️ 하루 = KST 날짜의 사건 — 자정을 넘는 세션은 두 날에 한 번씩 센다(7일 합은 그만큼 세션이 많을 수 있다).
declare
  v_day date := (p->>'day')::date;
  v_ok boolean := coalesce((p->>'ok')::boolean, false);
  r record;
begin
  if v_ok then
    with h as (
      select ((x->>'t')::timestamp at time zone 'UTC') as t, x->>'c' as c
        from jsonb_array_elements(case when jsonb_typeof(p->'hits') = 'array' then p->'hits' else '[]'::jsonb end) x
    ),
    ev as (
      select u.session_id, u.occurred_at, u.event,
             (u.props ? 'ops' or u.user_id in (select a.user_id from zipfit_ops.admins a)) as opsm
        from public.usage_events u
       where u.occurred_at >= (v_day::timestamp at time zone 'Asia/Seoul')
         and u.occurred_at < ((v_day + 1)::timestamp at time zone 'Asia/Seoul')
    ),
    m as (
      select e.session_id, e.event, e.opsm,
             (select h.c from h where h.t between e.occurred_at - interval '2 seconds' and e.occurred_at + interval '2 seconds'
               order by abs(extract(epoch from h.t - e.occurred_at)) limit 1) as c
        from ev e
    ),
    s as (
      select session_id, bool_or(opsm) o, bool_or(c = 'b') b, bool_or(c = 'h') hh, bool_or(c = 's') sc,
             count(*) n, count(c) mt, count(*) filter (where event = 'notice_open') opens
        from m group by session_id
    ),
    k as (
      select case when o then 'ops' when b then 'bot' when hh then 'headless' when sc then 'script' else 'other' end as k, n, mt, opens from s
    )
    select count(*)::int sessions,
           count(*) filter (where k = 'bot')::int bot, count(*) filter (where k = 'headless')::int headless,
           count(*) filter (where k = 'ops')::int ops, count(*) filter (where k = 'script')::int script,
           count(*) filter (where k = 'other')::int other, count(*) filter (where k = 'other' and opens >= 30)::int other_heavy,
           coalesce(sum(n), 0)::int events, coalesce(sum(mt), 0)::int matched,
           (select count(*) from h)::int hits
      into r from k;
    insert into zipfit_ops.usage_ua_daily (day, ok, sessions, bot, headless, ops, script, other, other_heavy, events, matched, hits, note)
    values (v_day, true, r.sessions, r.bot, r.headless, r.ops, r.script, r.other, r.other_heavy, r.events, r.matched, r.hits, left(p->>'note', 200))
    on conflict (day) do update
       set ok = true, sessions = excluded.sessions, bot = excluded.bot, headless = excluded.headless, ops = excluded.ops,
           script = excluded.script, other = excluded.other, other_heavy = excluded.other_heavy, events = excluded.events,
           matched = excluded.matched, hits = excluded.hits, note = excluded.note, counted_at = now(), tries = zipfit_ops.usage_ua_daily.tries + 1;
    return 'ok';
  end if;
  insert into zipfit_ops.usage_ua_daily (day, ok, note)
  values (v_day, false, left(coalesce(p->>'note', '못 셈'), 200))
  on conflict (day) do update
     set note = excluded.note, counted_at = now(), tries = zipfit_ops.usage_ua_daily.tries + 1
   where not zipfit_ops.usage_ua_daily.ok;
  return case when exists (select 1 from zipfit_ops.usage_ua_daily where day = v_day and ok) then 'kept' else 'fail' end;
end
$function$;
revoke all on function zipfit_ops.usage_ua_daily_record(jsonb) from public, anon, authenticated, service_role;
