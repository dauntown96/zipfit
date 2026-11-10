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
$function$
