-- 되돌리기 — 서울 이전 준비 ①(마이그레이션 2026-11-19_02_seoul_prep_project_ref) 의 cron 14잡을 어제 command 로(2026-11-19 12:2x KST 관리 API 로 뽑은 cron.job.command 그대로).
-- 쓰는 법: 실패한 잡 하나만 되돌릴 때는 그 잡의 select 한 줄만 관리 API 로 보낸다(데이터 쓰기 · cron.alter_job). 함수 둘은 git 의 supabase/rpc 사본 앞 판으로 새 마이그레이션.

-- jobid 4 · zipfit-collect-announcements · md5 cb52125abe49d37f49a3748c819e15ec
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-announcements'), command := $cmd$
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

-- jobid 8 · zipfit-collect-sh-announcements · md5 b055202a86fdfe4ea42fed39822ce2cb
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-sh-announcements'), command := $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(jobid 4와 동일한 이유).
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-sh-announcements?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 11 · zipfit-collect-rental-stats · md5 06a5152866d1e7d9bc84dc3065391454
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-rental-stats'), command := $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(jobid 4와 동일한 이유).
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-rental-stats',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 12 · zipfit-collect-announcements-warmup · md5 cb52125abe49d37f49a3748c819e15ec
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-announcements-warmup'), command := $cmd$
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

-- jobid 13 · zipfit-collect-announcements-night · md5 cb52125abe49d37f49a3748c819e15ec
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-announcements-night'), command := $cmd$
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

-- jobid 19 · zipfit-collect-lh-promo · md5 fe93813aae6b5da66ce997788a395ce5
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-lh-promo'), command := $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(jobid 4와 동일한 이유).
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-promo?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 30 · zipfit-collect-lh-images · md5 1c7675308817220128a36053e6dbb4fb
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-lh-images'), command := $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-images?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 39 · zipfit-check-source-pages · md5 968fab1ec415b7f009a24bf3d6aa99b6
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-check-source-pages'), command := $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/check-source-pages?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 60 · zipfit-check-source-pages-new-sh · md5 d15ad0c34cf47bda5fb65eb783ed2fd7
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-check-source-pages-new-sh'), command := $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/check-source-pages?mode=collect&new=sh',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 75 · zipfit-gh-observe · md5 32c19763f9e323ab6ddcb57e723e1aae
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-gh-observe'), command := $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(다른 수집 잡과 같은 꼴). 관찰만 — announcements 쓰기 0.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-gh-announcements?mode=observe',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 78 · zipfit-collect-lh-cutoff · md5 31bfe212268599196b6ff8ad6769ea5d
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-lh-cutoff'), command := $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-cutoff?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);

-- jobid 82 · zipfit-collect-lh-notices · md5 daf7c21646ec75e55fb3294469f8219e
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-lh-notices'), command := $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-notices?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 92 · zipfit-collect-gh-announcements · md5 c59237f2e5869dcbc2aab4da940df443
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-collect-gh-announcements'), command := $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(다른 수집 잡과 같은 꼴). 마감일 있는 열린 GH 공고만 announcements 에 쓴다.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-gh-announcements?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

-- jobid 96 · zipfit-complex-geo-fill · md5 051cf3965a44b8cbf3d5b1ffd373a9ea
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-complex-geo-fill'), command := $cmd$
  -- 시크릿은 Vault에서 실행 시점에 읽는다(다른 수집 잡과 같은 꼴). 대상 0 이면 EF 가 바깥을 부르지 않는다.
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/complex-geo-fill?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);
