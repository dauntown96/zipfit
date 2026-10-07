-- #372 처방 — 발송 응답을 ops_dispatch_log 에 옮겨 적고 health-ops 는 그 칸으로 판정한다(2026-10-07 · 우편함 「코드 — Z-2 …」 10).
--   1) ops_dispatch_log 에 status_code · error_msg · response_at · status_note 칸을 더한다.
--   2) ops_dispatch_log_fill() 신설 — net._http_response 에서 응답을 옮긴다(발송 시각 −1분~+10분 응답만 · 요청 번호 재사용 대비).
--      공개 역할 실행 0 · service_role 만(발송 함수와 같다).
--   3) ops_health_dispatch() · ops_screen_dispatch() 가 발송 전에 ops_dispatch_log_fill() 을 부른다(25·55분).
--   4) 지금 남은 응답을 한 번 옮기고, 응답 행이 이미 사라진 23:50Z 화면 점검 발송(id 210)은 GitHub 실행 기록으로 보강한다
--      (health-screen workflow_dispatch 실행 37548703923 · 2026-10-06T23:50:01Z 생성 · 성공 — GitHub 는 받아들인 발송에만 실행을 만든다 → 204).
--   되돌리기: 두 발송 함수 이전 정의로 되돌리는 새 마이그레이션 + drop function ops_dispatch_log_fill() + 칸 4개 drop.
-- zipfit:function ops_dispatch_log_fill() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function ops_health_dispatch() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function ops_screen_dispatch() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
alter table public.ops_dispatch_log
  add column status_code integer,
  add column error_msg text,
  add column response_at timestamptz,
  add column status_note text;
comment on column public.ops_dispatch_log.status_note is '응답을 어디서 옮겼나 — net._http_response(ops_dispatch_log_fill) · 또는 손으로 보강한 근거. NULL 이면 아직 응답을 못 옮겼다';

CREATE OR REPLACE FUNCTION public.ops_dispatch_log_fill()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- 발송 응답을 ops_dispatch_log 로 옮겨 적는다(2026-10-07 · 우편함 「코드 — Z-2 …」 10 · 이슈 #372).
-- 🔴 왜: net._http_response 는 오래 남지 않는다(2026-10-07 03:3xZ — 남은 응답 11행 · 가장 오래된 것 02:40Z · pg_net 요청 번호가 14355 → 4 로 다시 시작).
--    하루 한 번 발송(health-screen 23:50Z)의 응답이 몇 시간 안에 사라져 health-ops 가 「응답 대기」로 실패했다(#372 · 실제 발송은 GitHub 실행 23:50:01Z 성공).
-- ops_health_dispatch()·ops_screen_dispatch() 가 발송하기 전에 부른다(25·55분) — 앞선 발송(화면 점검 23:50Z 는 23:55Z 에)의 응답을 옮긴다.
-- 🔴 요청 번호는 다시 쓰일 수 있다 — 응답이 그 발송 시각 언저리(−1분 ~ +10분)에 생긴 것만 받는다(다른 날 같은 번호의 응답을 잡지 않게).
-- 옮겨 적은 행: status_note = 'net._http_response'. 응답 행이 없으면 그대로 둔다(점검기는 응답 칸이 비고 응답 행도 없으면 「응답 대기」).
declare
  n integer;
begin
  update public.ops_dispatch_log l
     set status_code = r.status_code,
         error_msg = left(coalesce(r.error_msg, case when r.status_code >= 300 then r.content end), 200),
         response_at = r.created,
         status_note = 'net._http_response'
    from net._http_response r
   where r.id = l.net_request_id
     and l.status_note is null
     and r.created >= l.at - interval '1 minute' and r.created < l.at + interval '10 minutes';
  get diagnostics n = row_count;
  return n;
end
$function$;
revoke execute on function public.ops_dispatch_log_fill() from public, anon, authenticated;
grant execute on function public.ops_dispatch_log_fill() to service_role;

CREATE OR REPLACE FUNCTION public.ops_health_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
-- 운영 건강 점검(GitHub Actions health-ops.yml)을 workflow_dispatch 로 부른다(2026-10-03 · 우편함 「코드 — #328 해소 · 운영 점검 예약을 GitHub 밖으로」).
-- cron zipfit-health-ops-dispatch 가 25·55분에 부른다 — GitHub schedule 은 하루 몇 번만 돌았다(10-02 08:39Z 뒤 14:5xZ까지 0회).
-- 비밀값: Vault github_actions_dispatch_token(fine-grained · dauntown96/zipfit 하나 · Actions 읽기·쓰기 · 만료 2027-10-03) — 값은 표·반환에 싣지 않는다.
-- 요청 id 를 ops_dispatch_log 에 남긴다 — health-ops 가 마지막 발송의 응답(204)을 net._http_response 에서 읽는다. 7일 지난 기록은 지운다.
declare
  v_tok text; v_id bigint;
begin
  perform public.ops_dispatch_log_fill();   -- 앞선 발송의 응답을 옮겨 적는다(2026-10-07 · 응답 행은 몇 시간 안에 사라진다 — ops_dispatch_log_fill 주석)
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'github_actions_dispatch_token';
  if coalesce(v_tok, '') = '' then
    raise exception 'Vault github_actions_dispatch_token 없음';
  end if;
  v_id := net.http_post(
    url := 'https://api.github.com/repos/dauntown96/zipfit/actions/workflows/health-ops.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'zipfit-pg-cron', 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
  insert into public.ops_dispatch_log (target, net_request_id) values ('health-ops.yml', v_id);
  delete from public.ops_dispatch_log where at < now() - interval '7 days';
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.ops_screen_dispatch()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
-- 화면 점검(GitHub Actions health-screen.yml)을 workflow_dispatch 로 부른다(2026-10-06 · 우편함 「코드 — Z-1 …」 PR-A A5 · 백로그 「남은 GitHub 예약 실행 의존」).
-- cron zipfit-health-screen-dispatch 가 매일 23:50 UTC(KST 08:50 — 아침 워밍 수집 뒤)에 부른다. GitHub schedule(같은 시각)은 예비로 남는다.
-- 비밀값: Vault github_actions_dispatch_token(ops_health_dispatch 와 같은 토큰) — 값은 표·반환에 싣지 않는다.
-- 요청 id 를 ops_dispatch_log(target health-screen.yml)에 남긴다 — health-ops 가 마지막 발송 응답(204)을 읽는다.
declare
  v_tok text; v_id bigint;
begin
  perform public.ops_dispatch_log_fill();   -- 앞선 발송의 응답을 옮겨 적는다(2026-10-07 · 응답 행은 몇 시간 안에 사라진다 — ops_dispatch_log_fill 주석)
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'github_actions_dispatch_token';
  if coalesce(v_tok, '') = '' then
    raise exception 'Vault github_actions_dispatch_token 없음';
  end if;
  v_id := net.http_post(
    url := 'https://api.github.com/repos/dauntown96/zipfit/actions/workflows/health-screen.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'zipfit-pg-cron', 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
  insert into public.ops_dispatch_log (target, net_request_id) values ('health-screen.yml', v_id);
  return v_id;
end
$function$;

select public.ops_dispatch_log_fill();
update public.ops_dispatch_log
   set status_code = 204,
       status_note = 'GitHub 실행 37548703923(health-screen workflow_dispatch · 2026-10-06T23:50:01Z 생성 · 성공) — 응답 행이 사라진 뒤 보강(2026-10-07 · #372)'
 where id = 210 and target = 'health-screen.yml' and status_note is null;
