-- zipfit:function zipfit_ops.host_probe_tick() acl={postgres=X/postgres} secdef=false
-- 지방공사 호스트 매일 관측(2026-11-21 · 우편함 「코드·운영 — 둘째 묶음」 B · docs/ops-check-backlog.md 13위 · 코드·운영 17장 설계).
-- 뜻: 서울 이전(11-20)으로 DB 출구가 서울이 됐다 — DB 가 EF fetch-attachment ?mode=host_probe(이미 있는 읽기만 모드 · 서울 강제)를
--   호스트마다 하루 한 번 부르고, 응답의 상태·형식만 zipfit_ops.host_probe_log 에 남긴다. 판정은 health-ops host_probe ⚠️(안 멈춤).
-- 표: zipfit_ops.host_probe_log — GRANT 0(REST 밖) · (run_date, host) 하나 · 90일.
-- cron: zipfit-host-probe '7,37 1 * * *'(UTC) = KST 10:07(쏘기) · 10:37(거두기) — 다른 잡과 분이 겹치지 않음 · :20~24·:50~54 밖.
-- 부하(2026-11-21 셈): 하루 EF 호출 = announcements.url 의 LH·SH·마이홈 밖 호스트 수 21 · 바깥 요청 ≤ 42(상세 1 + 첨부 1) ·
--   관측 대상 밖 호스트는 EF 가 바로 400(바깥 요청 0) · 저장 하루 21행(상태·수만 · 수백 바이트) → 90일 약 1,900행.
-- 되돌리기: select cron.unschedule('zipfit-host-probe'); drop function zipfit_ops.host_probe_tick(); drop table zipfit_ops.host_probe_log;
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-host-probe') then raise exception 'GUARD zipfit-host-probe exists'; end if;
  if to_regprocedure('public.ops_project_url()') is null then raise exception 'GUARD ops_project_url missing'; end if;
end $$;

create table zipfit_ops.host_probe_log (
  id bigserial primary key,
  run_date date not null,
  host text not null,
  url text not null,
  request_id bigint,
  fired_at timestamptz not null default now(),
  harvested_at timestamptz,
  http_status integer,
  out_of_scope boolean,
  result jsonb,
  unique (run_date, host)
);
comment on table zipfit_ops.host_probe_log is '지방공사 호스트 매일 관측(fetch-attachment host_probe · 서울) — 상태·형식만 · 90일 · zipfit_ops.host_probe_tick() (2026-11-21)';
revoke all on table zipfit_ops.host_probe_log from public, anon, authenticated;
revoke all on sequence zipfit_ops.host_probe_log_id_seq from public, anon, authenticated;

CREATE OR REPLACE FUNCTION zipfit_ops.host_probe_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-21(우편함 「코드·운영 — 둘째 묶음」 B · 운영 점검 후보 묶음 13위) — 지방공사 호스트 매일 관측(읽기만 · 서울 실행).
--   cron zipfit-host-probe 가 KST 10:07·10:37 에 부른다. ① 거두기: 쏜 요청의 응답(net._http_response)에서 상태·형식만 골라 적는다
--   (본문·제목·주소 글은 적지 않는다 — 공개 게시판이라도 값은 상태 수·머리 8바이트뿐) · 6시간 넘게 응답이 없으면 lost 로 닫는다.
--   ② 오늘(KST) 첫 호출이면 쏜다: announcements.url 의 호스트마다(LH · SH · 마이홈 밖) 가장 최근 마감 공고 주소 하나로
--   EF fetch-attachment ?mode=host_probe 를 한 번씩. EF 가 관측 대상(_shared/board-hosts.ts probe)이 아닌 호스트는 400 으로 돌려준다(셈 밖).
--   ③ 90일 지난 기록은 지운다. 하루 EF 호출 = 호스트 수(2026-11-21 21) · 바깥 요청 ≤ 호스트 × 2(상세 1 + 첨부 1).
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  n_h int := 0; n_lost int := 0; n_f int := 0; n_del int := 0;
  r record; v_rid bigint; v_sec text;
begin
  with x as (
    select l.id, resp.status_code, resp.timed_out, resp.error_msg,
           case when resp.content is not null and left(ltrim(resp.content), 1) = '{' then resp.content::jsonb end as j
      from zipfit_ops.host_probe_log l
      join net._http_response resp on resp.id = l.request_id
     where l.harvested_at is null
  )
  update zipfit_ops.host_probe_log l
     set harvested_at = now(), http_status = x.status_code,
         result = jsonb_strip_nulls(jsonb_build_object(
           'timed_out', x.timed_out, 'net_error', left(x.error_msg, 120),
           'ok', x.j -> 'ok', 'error', left(x.j ->> 'error', 160), 'region', x.j ->> 'region', 'ca_client', x.j ->> 'ca_client',
           'detail_status', x.j #> '{detail,status}', 'detail_error', left(x.j #>> '{detail,error}', 160),
           'elapsed_ms', x.j #> '{detail,elapsed_ms}', 'login_hint', x.j #> '{detail,login_hint}',
           'file_status', x.j #> '{file,status}', 'file_error', left(x.j #>> '{file,error}', 160), 'file_head', x.j #>> '{file,head_hex}')),
         out_of_scope = (x.status_code = 400 and coalesce(x.j ->> 'error', '') like '관측 밖 호스트%')
    from x where x.id = l.id;
  get diagnostics n_h = row_count;
  update zipfit_ops.host_probe_log
     set harvested_at = now(), result = '{"lost": true}'::jsonb
   where harvested_at is null and fired_at < now() - interval '6 hours';
  get diagnostics n_lost = row_count;

  if not exists (select 1 from zipfit_ops.host_probe_log where run_date = v_today) then
    select decrypted_secret into v_sec from vault.decrypted_secrets where name = 'cron_secret_v2';
    if v_sec is null then raise exception 'Vault cron_secret_v2 없음'; end if;
    for r in
      select distinct on (s.h) s.h, s.url
        from (select substring(a.url from '^https?://([^/:?#]+)') as h, a.url, a.apply_end, a.updated_at
                from public.announcements a where a.url ~ '^https?://') s
       where s.h is not null and s.h not in ('apply.lh.or.kr', 'www.i-sh.co.kr', 'housing.seoul.go.kr', 'www.myhome.go.kr')
       order by s.h, s.apply_end desc nulls last, s.updated_at desc
    loop
      v_rid := net.http_post(
        url := public.ops_project_url() || '/functions/v1/fetch-attachment',
        params := jsonb_build_object('mode', 'host_probe', 'url', r.url),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_sec),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000);
      insert into zipfit_ops.host_probe_log (run_date, host, url, request_id) values (v_today, r.h, r.url, v_rid);
      n_f := n_f + 1;
    end loop;
  end if;

  delete from zipfit_ops.host_probe_log where run_date < v_today - 90;
  get diagnostics n_del = row_count;
  return jsonb_build_object('harvested', n_h, 'lost', n_lost, 'fired', n_f, 'purged', n_del, 'run_date', v_today);
end
$function$
;

revoke execute on function zipfit_ops.host_probe_tick() from public, anon, authenticated, service_role;

select cron.schedule('zipfit-host-probe', '7,37 1 * * *', $cmd$
  -- 지방공사 호스트 관측(읽기만) — 10:07 쏘기 · 10:37 거두기(같은 함수 · 오늘 첫 호출만 쏜다).
  SELECT zipfit_ops.host_probe_tick();
$cmd$);
