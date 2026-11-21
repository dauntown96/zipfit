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
