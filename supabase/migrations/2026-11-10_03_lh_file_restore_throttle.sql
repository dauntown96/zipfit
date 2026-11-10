-- LH 첨부 문지기 복원 준비(2026-11-10 · 우편함 「코드·운영 — LH 첨부 문지기 복원(멈춤 전 꼴 + 몰림 막기 + 차단 감지) …」 · LH 답 2026-11-10 ·
--   다운님 결정 「빈도는 문제 되지 않음 · 소극적으로 줄이지 말고 복원 · 숫자는 기록」).
-- 이 파일은 장치만 깐다 — 모드는 그대로(essential). 복원(lh_file_mode = 'normal')은 병합·적용 뒤 데이터 쓰기 한 줄로 한다.
-- ① analysis_dispatch_config 칸 다섯 — 몰림 막기 값(lh_file_gap_ms 3000 · lh_file_cap_10min 40 · lh_file_block_streak 3) · 자동 멈춤 표지(lh_file_block_at · lh_file_block_reason).
--    값의 근거: 멈춤 전 7일(10-29~11-05) fetch-attachment 받기 호출 402 — 10분 최대 35 · 1시간 79 · 하루 135 · 한 실행 안 간격 중앙 0.17초(거의 동시).
--    → 양은 그대로(10분 상한 40 > 실측 최대 35) · 몰림만 편다(받기 사이 3초 · 동시 1 — 35개 묶음이 약 2분으로).
-- ② lh_file_policy() — 위 값도 돌려준다(반환 칸 셋 더함 · 종전 칸 그대로).
-- ③ lh_file_gate(url, 목적) — normal 일 때 동시 1 · 최소 간격 · 10분 상한을 「기다림(wait_ms · 기록 행 없음)」으로 돌려준다(권고 잠금으로 결정 한 줄 세우기) · essential · paused 는 그대로.
-- ④ lh_file_gate_done(행, 결과) — 차단 꼴 결과가 연속 block_streak 번(서로 다른 파일 둘 이상)이면 그 자리에서 paused + 표지 + 기록 행(block_stop).
-- 되돌리기: 세 함수를 앞 커밋 사본(git show e6b338c:supabase/rpc/<이름>.sql)으로 같은 꼴 새 마이그레이션 · 칸 다섯 drop.
-- zipfit:function lh_file_policy() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function lh_file_gate(text,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function lh_file_gate_done(bigint,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false

alter table public.analysis_dispatch_config
  add column lh_file_gap_ms int not null default 3000 constraint analysis_dispatch_config_lh_file_gap_ms check (lh_file_gap_ms between 0 and 60000),
  add column lh_file_cap_10min int not null default 40 constraint analysis_dispatch_config_lh_file_cap_10min check (lh_file_cap_10min between 1 and 1000),
  add column lh_file_block_streak int not null default 3 constraint analysis_dispatch_config_lh_file_block_streak check (lh_file_block_streak between 1 and 20),
  add column lh_file_block_at timestamptz,
  add column lh_file_block_reason text;
comment on column public.analysis_dispatch_config.lh_file_gap_ms is 'LH 첨부(lhFile.do) 받기 사이 최소 간격 ms — normal 의 몰림 막기(2026-11-10 · lh_file_gate)';
comment on column public.analysis_dispatch_config.lh_file_cap_10min is 'LH 첨부 10분 상한(허락 수) — 넘으면 기다림(2026-11-10 · 멈춤 전 7일 10분 최대 35)';
comment on column public.analysis_dispatch_config.lh_file_block_streak is '차단 감지 — 결과가 차단 꼴인 허락 받기가 이만큼 연속이면 paused(2026-11-10 · lh_file_gate_done)';
comment on column public.analysis_dispatch_config.lh_file_block_at is '차단 감지로 스스로 paused 가 된 때 — 다시 켜기는 사람(normal 로 바꾸며 이 칸을 null 로)';
comment on column public.analysis_dispatch_config.lh_file_block_reason is '차단 감지 사유(최근 결과 목록) — health-ops lh_file_block 이 보인다';

CREATE OR REPLACE FUNCTION public.lh_file_policy()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- LH 첨부 경로(lhFile.do) 쓰임 가름의 뜻 한 정의(2026-11-09 · 우편함 「코드·운영 — 모드 정의 하나(lh_file_policy) …」 1장 · #918 회신 ⑦1 채택).
-- 모드 = analysis_dispatch_config.lh_file_mode(행이 없거나 비면 essential · 모르는 값도 essential 로 읽는다 — 종전 세 곳과 같다).
-- 부르는 곳: 문지기 lh_file_gate(fetch) · 발송기 analysis_dispatch_tick ②-1(hold — analysis_lh_file_hold 로) · health-ops ㉝ lh_file_mode.
--   🔴 모드 이름을 세 곳에서 따로 비교하지 않는다 — 뜻을 바꾸려면 여기를 고친다.
-- 반환 {mode, fetch, hold, gap_ms, cap_10min, block_streak}:
--   fetch = 'all'(normal — 다 허락) · 'none'(paused — 다 막음) · 'essential'(essential — 열린 공고 첨부만 파일당 한 번 · 규칙은 lh_file_gate)
--   hold  = 'lh_file'(paused — 발송기가 analysis_needs_lh_file 몫을 보내지 않음) · 'none'(essential · normal — #차수 포함 다 보냄 · 2026-11-09 PR #918)
--   🔵 2026-11-10(우편함 「코드·운영 — LH 첨부 문지기 복원 …」 · LH 답 · 다운님 결정 「빈도는 문제 되지 않음 · 소극적으로 줄이지 말고 복원」) —
--     몰림 막기 값도 여기서 돌려준다(normal 의 받기에만 쓴다 · lh_file_gate): gap_ms(받기 사이 최소 간격) · cap_10min(10분 상한) · block_streak(차단 감지 연속 수).
--     값은 analysis_dispatch_config 칸(행이 없거나 비면 3000 · 40 · 3 — 멈춤 전 7일 실측: 10분 최대 35 · 1시간 79 · 하루 135 · 한 실행 안 간격 중앙 0.17초).
select jsonb_build_object('mode', m,
         'fetch', case m when 'normal' then 'all' when 'paused' then 'none' else 'essential' end,
         'hold',  case m when 'paused' then 'lh_file' else 'none' end,
         'gap_ms', g, 'cap_10min', c10, 'block_streak', bs)
  from (select coalesce((select c.lh_file_mode from public.analysis_dispatch_config c where c.id = 1), 'essential') as m,
               coalesce((select c.lh_file_gap_ms from public.analysis_dispatch_config c where c.id = 1), 3000) as g,
               coalesce((select c.lh_file_cap_10min from public.analysis_dispatch_config c where c.id = 1), 40) as c10,
               coalesce((select c.lh_file_block_streak from public.analysis_dispatch_config c where c.id = 1), 3) as bs) x;
$function$;
CREATE OR REPLACE FUNCTION public.lh_file_gate(p_url text, p_purpose text DEFAULT 'fetch'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- LH 첨부 경로(lhFile.do) 문지기(2026-11-05 · 우편함 「코드·운영 — LH 첨부 경로(lhFile.do) 사용 중단 …」 「🔴 요청 고침」 2장 · 다운님 결정 「문의 답 전까지 중간 길」).
-- apply.lh.or.kr/robots.txt 가 Disallow: /lhapply/lhFile.do · /lhapply/apply/csvc/lhFile.do 를 건다. EF fetch-attachment 가 그 경로를 받기 전에 부른다(service_role)
-- — 허락 여부를 돌려주고 결정을 lh_file_fetch_log 에 한 행 남긴다(받은 결과는 lh_file_gate_done 이 같은 행에 적는다).
-- 모드 = analysis_dispatch_config.lh_file_mode(행이 없거나 못 읽으면 essential) — 🔵 2026-11-09 뜻은 lh_file_policy() 한 곳(fetch 칸)에서 읽는다:
--   normal    = 다 허락(종전) — 기록만 · 같은 파일 재사용은 호출 쪽 몫 · 🔵 2026-11-10 몰림 막기(양은 줄이지 않는다 — 짧은 시간에 몰리지 않게):
--               동시 받기 1(앞 허락 행의 결과가 아직 없으면 · 180초 넘은 행은 끝난 것으로 본다) · 받기 사이 최소 gap_ms · 10분 상한 cap_10min —
--               셋 다 「기다림」으로 돌려준다(allow false · wait_ms · 기록 행 없음) → EF fetch-attachment 가 그만큼 쉬고 다시 묻는다.
--               결정은 권고 잠금(pg_advisory_xact_lock)으로 한 줄로 세운다 — 동시에 물어도 한 번에 하나만 허락된다.
--   paused    = 다 막음(robots 멈춤) — 발송기는 LH 원문 몫을 보내지 않는다(analysis_dispatch_tick)
--   essential = 유지 몫만 허락 — 열린 공고(apply_end ≥ 오늘 KST 또는 없음)의 첨부(announcements.attachment_urls 의 같은 fileid)를 그 파일당 한 번(+ 재시도 한 번).
--               막는 것: 첨부가 아닌 파일(단지·홍보물 이미지 · 공지 첨부 · 그 밖) · 지난 회차(소급) 첨부 · 이미 갤러리(announcement_extras.source_url)에 있는 파일(재사용) ·
--               이미 받은 파일(lh_file_fetch_log 성공 행) · 받기 실패·잘림 두 번 뒤(재시도 한 번까지) · 운영 탐침(p_purpose 'probe').
-- 반환: {allow, reason, kind, mode, announcement_id, reuse_url, log_id, wait_ms}
declare
  v_pol jsonb; v_mode text; v_fid text; v_kind text := 'other'; v_aid text; v_open boolean := false; v_reuse text;
  v_ok boolean; v_fail int; v_allow boolean; v_reason text; v_id bigint;
  v_busy timestamptz; v_last timestamptz; v_n10 int; v_first timestamptz; v_gap int; v_cap int;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  v_pol := public.lh_file_policy();
  v_mode := v_pol->>'mode';
  v_fid := substring(coalesce(p_url, '') from '[?&]fileid=([0-9]+)');
  if v_fid is not null then
    select a.announcement_id, (a.apply_end is null or a.apply_end >= v_today)
      into v_aid, v_open
      from public.announcements a
      cross join lateral jsonb_array_elements(case when jsonb_typeof(a.attachment_urls) = 'array' then a.attachment_urls else '[]'::jsonb end) e
     where coalesce(e->>'url', e#>>'{}') ~ ('[?&]fileid=' || v_fid || '($|&)')
     order by (a.apply_end is null or a.apply_end >= v_today) desc, a.apply_end desc nulls first
     limit 1;
    if v_aid is not null then v_kind := 'attachment';
    elsif exists (select 1 from public.announcement_complex_images where file_sn::text = v_fid) then v_kind := 'complex_image';
    elsif exists (select 1 from public.announcement_promo_files where file_sn::text = v_fid) then v_kind := 'promo_file';
    end if;
    select x.file_url into v_reuse from public.announcement_extras x
     where x.source_url ~ ('[?&]fileid=' || v_fid || '($|&)') and x.file_url is not null order by x.created_at limit 1;
    select bool_or(l.outcome = 'ok'), count(*) filter (where l.allowed and l.outcome is distinct from 'ok')
      into v_ok, v_fail from public.lh_file_fetch_log l where l.file_id = v_fid;
  end if;
  if v_pol->>'fetch' = 'all' then
    -- 몰림 막기(2026-11-10) — 기다림은 기록 행을 남기지 않는다(허락·막음 결정만 남긴다).
    perform pg_advisory_xact_lock(hashtext('zipfit.lh_file_gate'));
    v_gap := greatest(coalesce((v_pol->>'gap_ms')::int, 3000), 0);
    v_cap := greatest(coalesce((v_pol->>'cap_10min')::int, 40), 1);
    select max(l.at) into v_busy from public.lh_file_fetch_log l
     where l.allowed and l.outcome is null and l.at > now() - interval '180 seconds';
    if v_busy is not null then
      return jsonb_build_object('allow', false, 'reason', 'normal — 앞 받기가 아직 진행 중(동시 1) — 기다림', 'kind', v_kind, 'mode', v_mode,
                                'announcement_id', v_aid, 'reuse_url', v_reuse, 'log_id', null, 'wait_ms', greatest(v_gap, 1500));
    end if;
    select max(l.at) into v_last from public.lh_file_fetch_log l where l.allowed and l.at > now() - make_interval(secs => v_gap / 1000.0);
    if v_last is not null then
      return jsonb_build_object('allow', false, 'reason', 'normal — 받기 사이 최소 ' || v_gap || 'ms — 기다림', 'kind', v_kind, 'mode', v_mode,
                                'announcement_id', v_aid, 'reuse_url', v_reuse, 'log_id', null,
                                'wait_ms', greatest(ceil(v_gap - extract(epoch from now() - v_last) * 1000)::int, 100));
    end if;
    select count(*), min(l.at) into v_n10, v_first from public.lh_file_fetch_log l where l.allowed and l.at > now() - interval '10 minutes';
    if v_n10 >= v_cap then
      return jsonb_build_object('allow', false, 'reason', 'normal — 10분 상한 ' || v_cap || ' — 기다림', 'kind', v_kind, 'mode', v_mode,
                                'announcement_id', v_aid, 'reuse_url', v_reuse, 'log_id', null,
                                'wait_ms', greatest(ceil(extract(epoch from v_first + interval '10 minutes' - now()) * 1000)::int, 1000));
    end if;
    v_allow := true; v_reason := 'normal';
  elsif v_pol->>'fetch' = 'none' then v_allow := false; v_reason := 'paused — robots 멈춤(모든 lhFile.do)';
  elsif p_purpose = 'probe' then v_allow := false; v_reason := 'essential — 운영 탐침은 받지 않음';
  elsif v_fid is null then v_allow := false; v_reason := 'essential — fileid 를 읽지 못함';
  elsif v_kind <> 'attachment' then v_allow := false; v_reason := 'essential — 공고 첨부가 아님(' || v_kind || ')';
  elsif not v_open then v_allow := false; v_reason := 'essential — 지난 회차(소급) 공고 첨부';
  elsif v_reuse is not null then v_allow := false; v_reason := 'essential — 재사용(갤러리에 같은 파일)';
  elsif coalesce(v_ok, false) then v_allow := false; v_reason := 'essential — 이미 받은 파일(반복)';
  elsif coalesce(v_fail, 0) >= 2 then v_allow := false; v_reason := 'essential — 재시도는 한 번까지';
  else v_allow := true; v_reason := 'essential — 열린 공고 첨부' || case when coalesce(v_fail, 0) = 1 then '(재시도)' else '' end;
  end if;
  insert into public.lh_file_fetch_log (file_id, kind, announcement_id, mode, purpose, allowed, reason)
  values (v_fid, v_kind, v_aid, v_mode, coalesce(p_purpose, 'fetch'), v_allow, v_reason)
  returning id into v_id;
  return jsonb_build_object('allow', v_allow, 'reason', v_reason, 'kind', v_kind, 'mode', v_mode,
                            'announcement_id', v_aid, 'reuse_url', v_reuse, 'log_id', v_id, 'wait_ms', null);
end
$function$;
CREATE OR REPLACE FUNCTION public.lh_file_gate_done(p_log_id bigint, p_outcome text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lh_file_gate 가 허락한 받기의 결과를 같은 기록 행에 적는다(2026-11-05) — EF fetch-attachment 가 응답을 돌려주기 직전에 부른다.
-- p_outcome = 'ok'(받음 · 올림) 또는 실패 사유(fail · truncated · html_response · upstream_403 · upstream_429 · conn_error …) — 실패 행은 「재시도 한 번까지」 셈에 든다.
-- 🔵 2026-11-10(우편함 「코드·운영 — LH 첨부 문지기 복원 …」 3) 차단 감지 — 결과가 적힌 최근 허락 행 block_streak(기본 3)개가 모두 차단 꼴
--   (upstream_403 · upstream_429 · conn_error · html_response) ∧ 서로 다른 파일 둘 이상이면 그 자리에서 멈춘다:
--   analysis_dispatch_config.lh_file_mode = 'paused' · lh_file_block_at · lh_file_block_reason · 기록 행 kind 'block_stop' 한 줄.
--   🔴 다시 켜기는 사람 판단(데이터 쓰기 — lh_file_mode = 'normal' · lh_file_block_at = null). health-ops lh_file_block 이 안 멈춤 실패로 알린다(이슈).
declare
  v_n int; v_rows int; v_hits int; v_files int; v_mode text; v_list text;
begin
  update public.lh_file_fetch_log
     set outcome = left(coalesce(p_outcome, 'fail'), 60), outcome_at = now()
   where id = p_log_id and allowed and outcome is null;
  select coalesce(c.lh_file_block_streak, 3), c.lh_file_mode into v_n, v_mode from public.analysis_dispatch_config c where c.id = 1;
  if v_mode is null or v_mode = 'paused' or coalesce(v_n, 0) < 1 then return; end if;
  select count(*), count(*) filter (where x.outcome ~ '^(upstream_(403|429)|conn_error|html_response)'), count(distinct x.file_id),
         string_agg(x.outcome, ' · ' order by x.outcome_at desc)
    into v_rows, v_hits, v_files, v_list
    from (select l.outcome, l.file_id, l.outcome_at from public.lh_file_fetch_log l
           where l.allowed and l.outcome is not null order by l.outcome_at desc, l.id desc limit v_n) x;
  if v_rows = v_n and v_hits = v_n and v_files >= least(2, v_n) then
    update public.analysis_dispatch_config
       set lh_file_mode = 'paused', lh_file_block_at = now(),
           lh_file_block_reason = left('차단 감지 — 최근 ' || v_n || '번 연속(' || v_list || ') · 모드 ' || v_mode || ' → paused', 300)
     where id = 1;
    insert into public.lh_file_fetch_log (file_id, kind, announcement_id, mode, purpose, allowed, reason)
    values (null, 'block_stop', null, 'paused', 'block', false, left('차단 감지 — 최근 ' || v_n || '번 연속 · ' || v_list || ' · 그 자리에서 paused(다시 켜기는 사람)', 300));
  end if;
end
$function$;
