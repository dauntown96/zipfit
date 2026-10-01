-- 운영 — 공고 분석 감지 루틴 발송기(2026-10-01 · 우편함 「운영 — 공고 분석 감지 루틴 발송기(대기열 · 60분 유예 · 겹침 잠금)」 1)
--   대기열(analysis_dispatch_queue) · 발송 기록(analysis_dispatch_runs) · 스위치(analysis_dispatch_config) 세 표와
--   함수 셋 — analysis_dispatch_tick(cron 10분) · analysis_queue_claim · analysis_queue_finish(루틴 세션이 관리 API SQL로 부른다).
--   🔴 스위치는 꺼진 채 배포한다(enabled=false) · 비밀값은 Vault 이름으로만 읽는다(값을 표·로그에 남기지 않는다).
--   🔴 공개 역할(anon·authenticated·PUBLIC)에 표·함수 권한 0 · RLS 켬 · 정책 0 — 화면은 이 표를 읽지 않는다.
-- zipfit:function analysis_dispatch_tick(boolean) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_queue_claim() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_queue_finish(bigint,text[],text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false

create table public.analysis_dispatch_config (
  id         smallint primary key default 1 check (id = 1),
  enabled    boolean  not null default false,
  grace      interval not null default interval '60 minutes',
  max_wait   interval not null default interval '3 hours',
  updated_at timestamptz not null default now(),
  note       text
);
comment on table public.analysis_dispatch_config is
  '공고 분석 루틴 발송 스위치(한 행) — enabled=false 면 대기열은 채우되 루틴을 부르지 않는다. grace = 마지막 진입 뒤 유예 · max_wait = 첫 대기 뒤 상한. 켜고 끄기는 데이터 쓰기(관리 API)';
insert into public.analysis_dispatch_config (id, enabled, note) values (1, false, '2026-10-01 꺼진 채 배포 — 토큰 저장 · 대기열 확인 · 수동 발송 시험 · 검증 뒤 켠다');

create table public.analysis_dispatch_runs (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  reason         text not null check (reason in ('grace', 'max_wait', 'returned', 'manual')),
  state          text not null default 'firing' check (state in ('firing', 'running', 'finished', 'failed')),
  items          integer not null default 0,
  net_request_id bigint,
  http_status    integer,
  session_url    text,
  error          text,
  claimed_at     timestamptz,
  finished_at    timestamptz,
  finish_note    text
);
comment on table public.analysis_dispatch_runs is
  '루틴 발송 한 번 = 한 행. firing(요청 보냄) → running(응답 2xx 또는 루틴이 잡음) → finished(루틴이 끝 표시) / failed(응답 오류·무응답 — 잡힌 공고는 대기로 돌아간다). firing·running 이 있으면 새로 부르지 않는다(겹침 잠금)';

create table public.analysis_dispatch_queue (
  group_key       text not null,
  apply_end       date not null,
  announcement_id text not null,
  title           text,
  apply_start     date,
  phase           text,
  needs_promo     boolean not null default false,
  enqueued_at     timestamptz not null default now(),
  ready_at        timestamptz,
  state           text not null default 'waiting' check (state in ('waiting', 'sent', 'claimed', 'done', 'dropped')),
  returned        boolean not null default false,
  run_id          bigint references public.analysis_dispatch_runs(id),
  state_at        timestamptz not null default now(),
  note            text,
  primary key (group_key, apply_end)
);
comment on table public.analysis_dispatch_queue is
  '분석 대상 새 공고 대기열 — 키 = (묶음 키 = 제목 키 ∪ 같은 게시물 링크, 회차 = apply_end). 한 번 들어온 키는 다시 들어오지 않는다(미발송의 정의). waiting → sent(발송에 실림) → claimed(루틴이 잡음) → done(루틴 끝) / 루틴이 되돌리면 waiting·returned. 더는 후보가 아니면 dropped';
comment on column public.analysis_dispatch_queue.needs_promo is 'LH 매입(주거복지 - 매입임대) — 홍보물 목록 수집(announcement_promo_fetch ok)이 끝나야 ready';
comment on column public.analysis_dispatch_queue.ready_at is '발송에 실을 수 있게 된 때 — 매입은 홍보물 목록 수집 뒤, 그 밖은 진입 때';

alter table public.analysis_dispatch_config enable row level security;
alter table public.analysis_dispatch_runs   enable row level security;
alter table public.analysis_dispatch_queue  enable row level security;
revoke all on table public.analysis_dispatch_config, public.analysis_dispatch_runs, public.analysis_dispatch_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.analysis_dispatch_config, public.analysis_dispatch_runs, public.analysis_dispatch_queue to service_role;

CREATE OR REPLACE FUNCTION public.analysis_dispatch_tick(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 공고 분석 감지 루틴 발송기 — cron zipfit-analysis-dispatch 가 10분마다 부른다(2026-10-01 운영 회차).
-- ① 보낸 요청의 응답을 정리한다 ② 새 후보를 대기열에 넣고 더는 후보가 아닌 대기를 뺀다 ③ 보낼지 판정해 루틴 API 를 한 번 부른다.
-- 후보 = ⑨ 5-2 분모(대표 ∧ 묶음 첨부 > 0 ∧ apply_end ≥ 오늘+3) ∧ 미분석(같은 회차 또는 링크로 붙은 구성원에 완료 계열 분석 없음).
--   🔴 supabase/metrics/analysis_rate.sql 과 같은 규칙이다 — 묶음 키(link_map)는 get_announcements_deduped · get_announcement_group_ids ·
--   get_reanalysis_queue 와 같다. 한쪽을 바꾸면 함께 바꾼다.
-- 보낼 때 = 스위치 켬 ∧ 도는 회차 없음 ∧ 실을 것(ready) 있음 ∧ (루틴이 되돌린 것 있음 ∨ 마지막 진입 뒤 grace 지남 ∨ 첫 ready 뒤 max_wait 지남).
--   p_force = true(수동 시험)는 스위치·유예를 건너뛰되 잠금·비밀값은 지킨다.
--   매입(LH 주거복지 - 매입임대)은 홍보물 목록 수집이 끝나야 ready — 밤 수집분은 다음 날 홍보물 수집(KST 09:05~) 뒤에 나간다.
--   연속 3번 실패하면 자동 발송을 멈춘다(수동 p_force 는 된다) — health-ops 가 알린다.
-- 비밀값: Vault zipfit_routine_fire_url · zipfit_routine_fire_token(값은 표·반환에 싣지 않는다).
declare
  cfg public.analysis_dispatch_config%rowtype;
  rr record;
  resp record;
  n_new int := 0; n_drop int := 0; n_ready int := 0; n_resolved int := 0;
  w_last timestamptz; r_first timestamptz; any_ret boolean;
  v_reason text; v_url text; v_tok text; v_run bigint; v_rid bigint;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  select * into cfg from public.analysis_dispatch_config where id = 1;

  -- ① 응답 정리
  for rr in select * from public.analysis_dispatch_runs where state = 'firing' and net_request_id is not null loop
    select status_code, content, timed_out, error_msg into resp from net._http_response where id = rr.net_request_id;
    if found and resp.status_code between 200 and 299 then
      update public.analysis_dispatch_runs
         set state = 'running', http_status = resp.status_code,
             session_url = coalesce(session_url, (case when resp.content ~ '^\s*\{' then resp.content::jsonb end)->>'claude_code_session_url')
       where id = rr.id;
      n_resolved := n_resolved + 1;
    elsif found or rr.created_at < now() - interval '15 minutes' then
      update public.analysis_dispatch_runs
         set state = 'failed', http_status = resp.status_code, finished_at = now(),
             error = left(coalesce(resp.error_msg, resp.content, '응답 없음(15분)'), 500)
       where id = rr.id;
      update public.analysis_dispatch_queue
         set state = 'waiting', run_id = null, state_at = now(), note = '발송 실패 run ' || rr.id
       where run_id = rr.id and state in ('sent', 'claimed');
      n_resolved := n_resolved + 1;
    end if;
  end loop;

  -- ② 후보 → 대기열
  with link_map as (
    select distinct on (l.linked_announcement_id)
      l.linked_announcement_id as aid, announcement_dedup_key(lh.title) as lh_key
    from public.announcement_post_links l
    join public.announcements lh on lh.announcement_id = l.lh_announcement_id
    where lh.title is not null and lh.hidden_from_listing is not true
    order by l.linked_announcement_id, l.lh_announcement_id
  ),
  keyed as materialized (
    select a.announcement_id, a.apply_end, a.attachment_urls,
           coalesce(lm.lh_key, announcement_dedup_key(a.title)) as k, (lm.aid is not null) as linked
    from public.announcements a
    left join link_map lm on lm.aid = a.announcement_id
    where a.title is not null and a.hidden_from_listing is not true
  ),
  reps as (
    select d.announcement_id, d.title, d.source, d.housing_type, d.apply_start, d.apply_end, k.k
    from get_announcements_deduped() d
    join keyed k on k.announcement_id = d.announcement_id
    where d.apply_end >= current_date + 3
  ),
  cand as (
    select r.* from reps r
    where (select coalesce(sum(jsonb_array_length(g.attachment_urls)), 0) from keyed g
            where g.k = r.k and jsonb_typeof(g.attachment_urls) = 'array') > 0
      and not exists (select 1 from keyed g
            join public.announcement_analysis aa on aa.announcement_id = g.announcement_id
           where g.k = r.k and (g.apply_end = r.apply_end or g.linked)
             and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)'))
  ),
  ins as (
    insert into public.analysis_dispatch_queue (group_key, apply_end, announcement_id, title, apply_start, phase, needs_promo)
    select c.k, c.apply_end, c.announcement_id, c.title, c.apply_start,
           case when c.apply_start > current_date then '접수 전' else '접수 중' end,
           (c.source = 'LH' and c.housing_type = '주거복지 - 매입임대')
    from cand c
    on conflict (group_key, apply_end) do nothing
    returning 1
  ),
  drp as (
    update public.analysis_dispatch_queue q
       set state = 'dropped', state_at = now(), note = '더는 후보가 아님(분석됨 · 접수 창 밖 · 대표 바뀜)'
     where q.state = 'waiting'
       and not exists (select 1 from cand c where c.k = q.group_key and c.apply_end = q.apply_end)
    returning 1
  )
  select (select count(*) from ins), (select count(*) from drp) into n_new, n_drop;

  update public.analysis_dispatch_queue q
     set ready_at = now()
   where q.state = 'waiting' and q.ready_at is null
     and (not q.needs_promo
          or exists (select 1 from public.announcement_promo_fetch f where f.announcement_id = q.announcement_id and f.ok));

  -- ③ 보낼지
  if exists (select 1 from public.analysis_dispatch_runs where state in ('firing', 'running')) then
    return jsonb_build_object('result', 'locked', 'new', n_new, 'dropped', n_drop, 'resolved', n_resolved);
  end if;
  select count(*) filter (where ready_at is not null), max(enqueued_at),
         min(ready_at), bool_or(returned and ready_at is not null)
    into n_ready, w_last, r_first, any_ret
    from public.analysis_dispatch_queue where state = 'waiting';
  if n_ready = 0 then
    return jsonb_build_object('result', 'empty', 'new', n_new, 'dropped', n_drop, 'resolved', n_resolved);
  end if;
  v_reason := case when p_force then 'manual'
                   when any_ret then 'returned'
                   when now() - w_last >= cfg.grace then 'grace'
                   when now() - r_first >= cfg.max_wait then 'max_wait' end;
  if v_reason is null then
    return jsonb_build_object('result', 'waiting', 'ready', n_ready, 'new', n_new, 'dropped', n_drop,
                              'grace_left_min', round(extract(epoch from cfg.grace - (now() - w_last)) / 60));
  end if;
  if not p_force and not cfg.enabled then
    return jsonb_build_object('result', 'disabled', 'would', v_reason, 'ready', n_ready, 'new', n_new, 'dropped', n_drop);
  end if;
  if not p_force and (select count(*) = 3 and bool_and(state = 'failed')
                        from (select state from public.analysis_dispatch_runs order by id desc limit 3) z) then
    return jsonb_build_object('result', 'failing', 'would', v_reason, 'ready', n_ready);
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'zipfit_routine_fire_url';
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'zipfit_routine_fire_token';
  if coalesce(v_url, '') = '' or coalesce(v_tok, '') = '' then
    return jsonb_build_object('result', 'no_secret', 'would', v_reason, 'ready', n_ready);
  end if;

  insert into public.analysis_dispatch_runs (reason, items) values (v_reason, n_ready) returning id into v_run;
  update public.analysis_dispatch_queue
     set state = 'sent', run_id = v_run, returned = false, state_at = now()
   where state = 'waiting' and ready_at is not null;
  v_rid := net.http_post(
    url := v_url,
    body := jsonb_build_object('text', format('ZipFit 분석 발송 run %s · 대기열 %s건 · 사유 %s', v_run, n_ready, v_reason)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok,
                                  'anthropic-beta', 'experimental-cc-routine-2026-04-01', 'anthropic-version', '2023-06-01'),
    timeout_milliseconds := 30000);
  update public.analysis_dispatch_runs set net_request_id = v_rid where id = v_run;
  return jsonb_build_object('result', 'fired', 'run', v_run, 'reason', v_reason, 'items', n_ready, 'new', n_new, 'dropped', n_drop);
end
$function$;

CREATE OR REPLACE FUNCTION public.analysis_queue_claim()
 RETURNS TABLE(run_id bigint, announcement_id text, title text, group_key text, apply_start date, apply_end date, phase text, needs_promo boolean, enqueued_at timestamptz, was_returned boolean)
 LANGUAGE plpgsql
AS $function$
-- 루틴이 착수 때 부른다 — 도는 발송(firing·running) 한 회차의 실린 공고를 「잡음」으로 바꾸고 돌려준다(2026-10-01 운영 회차).
-- 도는 발송이 없으면 0행이다(수동 발송 시험도 analysis_dispatch_tick(true) 로 발송을 먼저 만든다).
-- 같은 회차를 두 번 부르면 이미 잡은 것을 다시 돌려준다(세션이 다시 시작돼도 같은 목록).
#variable_conflict use_column
declare
  v_run bigint;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
  select r.id into v_run from public.analysis_dispatch_runs r where r.state in ('firing', 'running') order by r.id limit 1;
  if v_run is null then
    return;
  end if;
  update public.analysis_dispatch_runs r
     set state = 'running', claimed_at = coalesce(r.claimed_at, now())
   where r.id = v_run;
  return query
  update public.analysis_dispatch_queue q
     set state = 'claimed', state_at = now()
   where q.run_id = v_run and q.state in ('sent', 'claimed')
  returning q.run_id, q.announcement_id, q.title, q.group_key, q.apply_start, q.apply_end, q.phase, q.needs_promo, q.enqueued_at,
            coalesce(q.note like '루틴 되돌림%', false) as was_returned;
end
$function$;

CREATE OR REPLACE FUNCTION public.analysis_queue_finish(p_run_id bigint, p_done text[], p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- 루틴이 끝날 때 부른다(2026-10-01 운영 회차) — p_done(대표 announcement_id)은 「끝」, 나머지 잡은 공고는 대기열로 되돌린다
-- (returned — 도는 회차가 없으면 다음 발송 판정이 유예 없이 가져간다). 회차를 끝내 잠금을 푼다.
-- 「끝」은 분석 상태와 무관하다(완료 · 보류 · 실패 모두) — 한 번 루틴이 맡아 결론을 낸 공고는 자동으로 다시 보내지 않는다.
declare
  n_done int; n_back int;
begin
  perform pg_advisory_xact_lock(hashtext('zipfit_analysis_dispatch'));
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
  update public.analysis_dispatch_runs
     set state = 'finished', finished_at = now(), finish_note = p_note
   where id = p_run_id;
  return jsonb_build_object('run', p_run_id, 'done', n_done, 'returned', n_back);
end
$function$;

revoke execute on function public.analysis_dispatch_tick(boolean) from public, anon, authenticated;
revoke execute on function public.analysis_queue_claim() from public, anon, authenticated;
revoke execute on function public.analysis_queue_finish(bigint, text[], text) from public, anon, authenticated;
comment on function public.analysis_dispatch_tick(boolean) is
  '공고 분석 루틴 발송기 — 대기열 채움·정리 + 60분 유예·3시간 상한·겹침 잠금·되돌림 즉시 발송. cron zipfit-analysis-dispatch 10분. 정의 사본: supabase/rpc/analysis_dispatch_tick.sql';
comment on function public.analysis_queue_claim() is '루틴 착수 — 도는 발송 회차의 공고를 잡는다. 정의 사본: supabase/rpc/analysis_queue_claim.sql';
comment on function public.analysis_queue_finish(bigint, text[], text) is '루틴 끝 — 끝낸 공고 표시 · 나머지 되돌림 · 잠금 풀기. 정의 사본: supabase/rpc/analysis_queue_finish.sql';

-- 수집(0·10·20…분) 6분 뒤 · 링크 갱신(3·13…분) 3분 뒤 — 밤에도 돈다(저녁 수집분의 60분 유예가 밤에 끝난다).
select cron.schedule('zipfit-analysis-dispatch', '6-59/10 * * * *', $$select public.analysis_dispatch_tick()$$);
-- 처음 채우기(스위치 꺼짐 — 대기열만 채우고 부르지 않는다)
select public.analysis_dispatch_tick();
