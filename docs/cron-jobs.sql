-- pg_cron 잡 사본 — 정본은 DB `cron.job` (뽑은 시각 2026-10-21 15:30 KST · pg_cron 1.6.4 · 23잡)
-- 2026-10-21 신설 (우편함 「코드·운영 — 문서·SQL만(B): docs/cron-jobs.sql … + docs/ops-audit.sql …」 · 근거 조사 「런칭 전 점검 ① Supabase」 회신 ② · claude.ai 판정 1).
-- 왜: 백업(zipfit-backup backup.yml)은 public·zipfit_ops 만 덤프한다 — cron 스키마는 담기지 않아, DB를 복원해도 자동화(수집 · 분석 발송 · 점검 · 백업 깨우기)가
--   살아나지 않는다. 수집 잡 4·8·11·12·13 은 만든 SQL도 저장소에 없었다. 이 파일이 그 구멍을 메운다.
--
-- 🔴 이 파일은 사본이다 — 정본은 DB `cron.job`. 잡을 더하거나 바꾸거나 지우는 PR은 이 파일을 같은 PR에서 고친다(새로 뽑아 덮어쓴다 · 아래 「뽑은 SQL」).
-- 🔴 비밀값은 없다 — command 안 비밀은 전부 Vault 참조(`vault.decrypted_secrets where name = '…'`)이고, 글자로 박힌 값 0(뽑을 때 검사:
--    JWT · Bearer · 키=값 · 토큰 접두 · 40자 넘는 영숫자 줄 — 23잡 모두 0). 값이 박힌 잡이 생기면 그 잡은 이름·주기만 적고 command 를 비운다.
-- 「DB = 사본」 대조 점검(health-ops)은 아직 없다 — 런칭 뒤(G1 보호 · claude.ai 판정 2026-10-21). 손 대조는 맨 아래 「대조」 SELECT.
--
-- 뽑은 SQL(관리 API `/database/query` · 읽기 전용 · 결과 그대로 이 파일로 — 손으로 옮기지 않는다):
--   select json_agg(json_build_object('jobid',jobid,'jobname',jobname,'schedule',schedule,'active',active,'command',command) order by jobid) from cron.job;
--
-- 복구 때 쓰는 순서(새 프로젝트 · 덤프 복원 뒤):
--   1. 확장: pg_cron · pg_net · supabase_vault 를 켠다(cron.schedule · net.http_post · vault.decrypted_secrets 가 있어야 한다).
--   2. Vault 비밀 먼저 — 이름(값은 저장소 어디에도 없다 · 다운님이 넣는다): cron_secret_v2 · github_actions_dispatch_token ·
--      zipfit_routine_fire_url · zipfit_routine_fire_token · gdrive_client_id · gdrive_client_secret · gdrive_refresh_token
--      (잡 command 가 직접 읽는 것은 cron_secret_v2 하나 · 나머지는 잡이 부르는 함수가 읽는다 — ops_health_dispatch · ops_screen_dispatch ·
--      ops_backup_dispatch · ops_backup_poll(github_actions_dispatch_token) · analysis_dispatch_tick(zipfit_routine_fire_*) ·
--      gdrive_* 는 EF 비밀과 함께 쓰는 사본).
--   3. 덤프 복원으로 public·zipfit_ops 함수가 있어야 한다(잡 대부분이 함수 하나를 부른다).
--   4. 이 파일을 postgres 역할로 한 번 돌린다 — `cron.schedule(이름, 주기, 명령)`은 같은 이름이 있으면 그 잡을 고쳐 쓴다(다시 돌려도 겹치지 않는다).
--      ⚠️ jobid 는 새로 매겨진다(아래 주석의 jobid 는 뽑은 때 번호 — 문서·점검이 jobid 로 부르는 곳이 있으면 이름으로 바꿔 찾는다).
--   5. 주기는 UTC 다(Supabase pg_cron). 각 잡 머리 주석에 KST 를 적었다.
--   6. 끝에 「대조」 SELECT 로 23잡 · command md5 가 이 파일과 같은지 본다.


-- jobid 4 · zipfit-collect-announcements · '*/10 0-9 * * *' = KST 09:00~18:50 10분마다 · active=true · command md5 cb52125abe49d37f49a3748c819e15ec
select cron.schedule('zipfit-collect-announcements', '*/10 0-9 * * *', $cmd$
  -- 🔴 시크릿을 이 명령에 평문으로 박지 않는다. Vault에서 실행 시점에 읽는다.
  -- cron.job은 anon에 SELECT 권한이 붙어 있어(스키마 USAGE가 없어 현재는 도달 불가하나)
  -- 명령문에 값을 남기면 그 권한 하나가 풀리는 순간 그대로 노출된다.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-announcements',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 8 · zipfit-collect-sh-announcements · '0 0,3,6,9 * * *' = KST 09·12·15·18시 · active=true · command md5 b055202a86fdfe4ea42fed39822ce2cb
select cron.schedule('zipfit-collect-sh-announcements', '0 0,3,6,9 * * *', $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(jobid 4와 동일한 이유).
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-sh-announcements?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 11 · zipfit-collect-rental-stats · '0 18 * * 0' = KST 월 03:00 · active=true · command md5 06a5152866d1e7d9bc84dc3065391454
select cron.schedule('zipfit-collect-rental-stats', '0 18 * * 0', $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(jobid 4와 동일한 이유).
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-rental-stats',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 12 · zipfit-collect-announcements-warmup · '40,50 23 * * *' = KST 08:40·08:50 · active=true · command md5 cb52125abe49d37f49a3748c819e15ec
select cron.schedule('zipfit-collect-announcements-warmup', '40,50 23 * * *', $cmd$
  -- 🔴 시크릿을 이 명령에 평문으로 박지 않는다. Vault에서 실행 시점에 읽는다.
  -- cron.job은 anon에 SELECT 권한이 붙어 있어(스키마 USAGE가 없어 현재는 도달 불가하나)
  -- 명령문에 값을 남기면 그 권한 하나가 풀리는 순간 그대로 노출된다.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-announcements',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 13 · zipfit-collect-announcements-night · '0 18 * * *' = KST 03:00 · active=true · command md5 cb52125abe49d37f49a3748c819e15ec
select cron.schedule('zipfit-collect-announcements-night', '0 18 * * *', $cmd$
  -- 🔴 시크릿을 이 명령에 평문으로 박지 않는다. Vault에서 실행 시점에 읽는다.
  -- cron.job은 anon에 SELECT 권한이 붙어 있어(스키마 USAGE가 없어 현재는 도달 불가하나)
  -- 명령문에 값을 남기면 그 권한 하나가 풀리는 순간 그대로 노출된다.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-announcements',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 14 · zipfit-purge-usage-events · '0 15 * * *' = KST 00:00 · active=true · command md5 885844314dcd933b97af668b2f5210c1
select cron.schedule('zipfit-purge-usage-events', '0 15 * * *', $cmd$
  -- 처리방침 「서비스 이용 기록은 수집일로부터 1년간 보관한 뒤 파기합니다」를 지키는 장치.
  -- 🔴 삭제 기준에는 유예를 두지 않는다 — 유예를 두면 약속한 1년을 넘겨 보관하게 된다.
  --    유예는 감시(불변식 V8) 쪽에 둔다: 잡이 며칠 밀려도 경보가 깜빡이지 않게.
  -- occurred_at 인덱스가 있어 범위 삭제가 싸다. 시크릿이 필요 없는 순수 DELETE다.
  DELETE FROM public.usage_events WHERE occurred_at < now() - interval '1 year';
  -- 2026-10-09 — 검색어 원문(props.q)은 90일 뒤 걷는다. 행은 남긴다(검색 횟수는 1년).
  UPDATE public.usage_events
     SET props = (props - 'q') || '{"q_expired":true}'::jsonb
   WHERE event = 'search' AND props ? 'q' AND occurred_at < now() - interval '90 days';
  $cmd$);

-- jobid 16 · zipfit-purge-sh-run-log · '10 15 * * *' = KST 00:10 · active=true · command md5 728b7a58b36d1b12860efd4113c6ee65
select cron.schedule('zipfit-purge-sh-run-log', '10 15 * * *', $cmd$
  -- SH 수집 런 로그 보관 90일. 하루 4행이라 1년치도 1,460행에 불과하지만,
  -- 🔴 「정한다」를 말로만 두지 않으려고 잡으로 강제한다.
  -- 🔴 90일은 문턱보다 훨씬 길어야 한다 — 미검출 횟수는 이 표의 run_at 을 세어 구하므로,
  --    보관 기간이 문턱보다 짧으면 셀 수가 없다(현재 후보 문턱은 연속 8회 = 만 2일).
  -- 시크릿이 필요 없는 순수 DELETE다. jobid 14(KST 자정)와 10분 떼어 둔다.
  DELETE FROM public.sh_collection_run_log WHERE run_at < now() - interval '90 days';
  $cmd$);

-- jobid 17 · zipfit-sh-close-missing · '20 0,3,6,9 * * *' = KST 09·12·15·18시 20분 · active=true · command md5 b0d13bf7ee1dcf0b985d5a71788ce9fe
select cron.schedule('zipfit-sh-close-missing', '20 0,3,6,9 * * *', $cmd$
  -- SH 자동 마감. 🔴 문턱은 여기 없다 — sh_close_missing() 의 기본값 8이 유일한 자리다.
  -- SH 수집(jobid 8, 00/03/06/09 UTC) 20분 뒤에 돈다: 그 회차 런 로그가 이미 쓰여 있다.
  -- 🔵 수집이 멈추면 성공한 런이 안 늘어 미검출 횟수도 안 늘고, 그래서 아무것도 안 닫힌다.
  --    안전성은 스케줄이 아니라 판정식이 준다.
  SELECT public.sh_close_missing();
  $cmd$);

-- jobid 19 · zipfit-collect-lh-promo · '5,35 0-9 * * *' = KST 09:05~18:35 30분마다 · active=true · command md5 fe93813aae6b5da66ce997788a395ce5
select cron.schedule('zipfit-collect-lh-promo', '5,35 0-9 * * *', $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(jobid 4와 동일한 이유).
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-promo?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 22 · zipfit-refresh-post-links · '3-59/10 * * * *' = 10분마다(3분부터) · active=true · command md5 2542fde540161b5f7290ae1e6f330019
select cron.schedule('zipfit-refresh-post-links', '3-59/10 * * * *', $cmd$select public.refresh_announcement_post_links()$cmd$);

-- jobid 28 · zipfit-analysis-dispatch · '6-59/10 * * * *' = 10분마다(6분부터) · active=true · command md5 b9749b17da922f91d40b64e4ae3b3502
select cron.schedule('zipfit-analysis-dispatch', '6-59/10 * * * *', $cmd$select public.analysis_dispatch_tick()$cmd$);

-- jobid 30 · zipfit-collect-lh-images · '17,47 0-9 * * *' = KST 09:17~18:47 30분마다 · active=true · command md5 1c7675308817220128a36053e6dbb4fb
select cron.schedule('zipfit-collect-lh-images', '17,47 0-9 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-images?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 33 · zipfit-health-ops-dispatch · '25,55 * * * *' = 매시 25·55분 · active=true · command md5 289a2354c776f59169edc9f2d2e89008
select cron.schedule('zipfit-health-ops-dispatch', '25,55 * * * *', $cmd$ select public.ops_health_dispatch(); $cmd$);

-- jobid 37 · zipfit-health-screen-dispatch · '50 23 * * *' = KST 08:50 · active=true · command md5 5f8b329a9dd78b216952499821f42abb
select cron.schedule('zipfit-health-screen-dispatch', '50 23 * * *', $cmd$ select public.ops_screen_dispatch(); $cmd$);

-- jobid 39 · zipfit-check-source-pages · '30-50/5 11,21 * * *' = KST 20:30~20:50 · 06:30~06:50 5분마다 · active=true · command md5 968fab1ec415b7f009a24bf3d6aa99b6
select cron.schedule('zipfit-check-source-pages', '30-50/5 11,21 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/check-source-pages?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 45 · zipfit-uptime-ping · '*/10 * * * *' = 10분마다 · active=true · command md5 1237fa5728053b465fe58e1e3dd553e8
select cron.schedule('zipfit-uptime-ping', '*/10 * * * *', $cmd$ select public.ops_uptime_ping(); $cmd$);

-- jobid 50 · zipfit-backup-dispatch · '0 18 * * *' = KST 03:00 · active=true · command md5 411756841e9285f3852937e88bd31cdb
select cron.schedule('zipfit-backup-dispatch', '0 18 * * *', $cmd$ select public.ops_backup_dispatch('backup.yml'); $cmd$);

-- jobid 51 · zipfit-heartbeat-dispatch · '40 18 * * *' = KST 03:40 · active=true · command md5 66c901679cb869014303bc06ef53583c
select cron.schedule('zipfit-heartbeat-dispatch', '40 18 * * *', $cmd$ select public.ops_backup_dispatch('heartbeat.yml'); $cmd$);

-- jobid 54 · zipfit-backup-poll · '12 * * * *' = 매시 12분 · active=true · command md5 bcd5d0bca5cb74801dc0936c697c98a5
select cron.schedule('zipfit-backup-poll', '12 * * * *', $cmd$
  -- zipfit-backup backup.yml 실행 기록 수집(2026-10-11 고지 회차 2 · 10) — health-ops backup 이 ops_backup_seen 을 읽는다.
  select public.ops_backup_poll();
$cmd$);

-- jobid 57 · zipfit-purge-stale-sessions · '10 15 * * *' = KST 00:10 · active=true · command md5 df78fb88f7fb3293e51975a614c52f3c
select cron.schedule('zipfit-purge-stale-sessions', '10 15 * * *', $cmd$select zipfit_ops.purge_stale_auth_sessions(30)$cmd$);

-- jobid 60 · zipfit-check-source-pages-new-sh · '10 0,3,6,9 * * *' = KST 09·12·15·18시 10분 · active=true · command md5 d15ad0c34cf47bda5fb65eb783ed2fd7
select cron.schedule('zipfit-check-source-pages-new-sh', '10 0,3,6,9 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/check-source-pages?mode=collect&new=sh',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 67 · zipfit-net-purge-secrets · '*/5 * * * *' = 5분마다 · active=true · command md5 35b635192af36c82e3116eb432ccf1b3
select cron.schedule('zipfit-net-purge-secrets', '*/5 * * * *', $cmd$select zipfit_ops.net_purge_secret_responses()$cmd$);

-- jobid 68 · zipfit-list-rpc-probe · '5-59/10 * * * *' = 10분마다(5분부터) · active=true · command md5 0f147f2975b9c6b50731cc990d6d2727
select cron.schedule('zipfit-list-rpc-probe', '5-59/10 * * * *', $cmd$select zipfit_ops.list_rpc_probe()$cmd$);

-- 대조(읽기 전용) — DB 의 잡이 이 파일과 같은지. 23행 · 이름 · 주기 · active · command md5 가 위 주석과 같아야 한다.
--   빠진 잡(파일에 있는데 DB 에 없음)은 missing 행으로, 더 있는 잡(DB 에만 있음)은 extra 행으로 나온다.
-- select coalesce(j.jobname, f.n) jobname, j.schedule, j.active, md5(j.command) cmd_md5,
--        case when j.jobid is null then 'missing' when f.n is null then 'extra' else 'ok' end state
--   from cron.job j full join unnest(array['zipfit-collect-announcements', 'zipfit-collect-sh-announcements', 'zipfit-collect-rental-stats', 'zipfit-collect-announcements-warmup', 'zipfit-collect-announcements-night', 'zipfit-purge-usage-events', 'zipfit-purge-sh-run-log', 'zipfit-sh-close-missing', 'zipfit-collect-lh-promo', 'zipfit-refresh-post-links', 'zipfit-analysis-dispatch', 'zipfit-collect-lh-images', 'zipfit-health-ops-dispatch', 'zipfit-health-screen-dispatch', 'zipfit-check-source-pages', 'zipfit-uptime-ping', 'zipfit-backup-dispatch', 'zipfit-heartbeat-dispatch', 'zipfit-backup-poll', 'zipfit-purge-stale-sessions', 'zipfit-check-source-pages-new-sh', 'zipfit-net-purge-secrets', 'zipfit-list-rpc-probe']) f(n) on f.n = j.jobname
--  order by 1;
