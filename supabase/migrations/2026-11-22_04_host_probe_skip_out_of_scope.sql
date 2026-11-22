-- zipfit:function zipfit_ops.host_probe_tick() acl={postgres=X/postgres} secdef=false
-- host_probe 관측 밖 호스트 하루 헛 호출 줄이기(2026-11-22 · 우편함 「코드·운영 — 넷째 묶음」 B 2 · 둘째 묶음 회신 ⑦).
-- 왜: apply.gh.or.kr · www.cbdc.co.kr · www.kohom.or.kr 는 EF fetch-attachment 관측 대상(_shared/board-hosts.ts probe)이 아니라 매일 400(out_of_scope) — 하루 3번 헛 호출.
-- 바꾸는 것: 쏘기 목록에서 「그 호스트의 마지막 거둔 관측이 out_of_scope ∧ 7일 안」이면 뺀다 → 주 1번만 다시 본다(관측 대상에 더해지면 스스로 돌아옴). 몸의 나머지는 그대로.
-- 되돌리기: 사본 git show <앞 커밋>:supabase/rpc/zipfit_ops/host_probe_tick.sql 로 새 마이그레이션.
set local lock_timeout = '5s';

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
         -- 🔵 2026-11-22(우편함 「코드·운영 — 넷째 묶음」 B 2) — 그 호스트의 마지막 관측이 「관측 밖」(EF 400 · _shared/board-hosts.ts probe 아님)이고
         --   7일 안이면 부르지 않는다(GH · 충북 · 나라키움 하루 3번 헛 호출 → 주 1번). 관측 대상에 더해지면 7일 안에 스스로 다시 부른다.
         and not exists (select 1 from (select l.out_of_scope, l.run_date from zipfit_ops.host_probe_log l
                                         where l.host = s.h and l.harvested_at is not null order by l.run_date desc limit 1) z
                          where z.out_of_scope and z.run_date > v_today - 7)
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
$function$;
