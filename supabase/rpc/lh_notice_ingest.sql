CREATE OR REPLACE FUNCTION public.lh_notice_ingest(p_notices jsonb, p_run jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- EF collect-lh-notices 가 부른다(service_role) — 받은 공지 목록을 지금 대상(wave_notice_targets() 의 due ∧ not has_warn)과 맞춰(lh_notice_pick)
-- 맞은 짝만 lh_notice_matches 에 남기고(있으면 last_seen_at · candidates 만 갱신) 런 기록 한 행을 쓴다(2026-11-05 · 우편함 「코드·운영 — 대상주택 공지 감지 구현 …」).
-- 🔵 2026-11-24(우편함 「코드·운영 — 열여섯째 묶음」 1) — 같은 목록을 선순위 마감 대상(wave_cutoff_targets())과도 맞춰(lh_cutoff_notice_pick)
--   lh_cutoff_notice_matches 에 남긴다 · 런 기록 칸 cutoff_targets · cutoff_matched · 🔴 대기열에 넣지 않는다(셈만 — 루틴·스킬이 새 갈래를 모른다).
-- p_run = {targets, calls, ok_calls, errors[], duration_ms, window_from, window_to} — EF 가 잰 셈(키·URL 은 싣지 않는다).
-- 🔴 대기열에 넣지 않는다 — 대기열은 analysis_dispatch_tick #차수 갈래가 켜기 칸(analysis_dispatch_config.wave_notice_enabled)을 보고 넣는다.
declare
  v_tg jsonb; v_ct jsonb; v_new int := 0; v_hit int := 0; v_n int; v_chit int := 0; v_cnew int := 0;
begin
  select coalesce(jsonb_agg(jsonb_build_object('announcement_id', t.announcement_id, 'scope_text', t.scope_text, 'post_on', t.post_on,
                                               'region_office', t.region_office, 'title_dep', t.title_dep)), '[]'::jsonb)
    into v_tg from public.wave_notice_targets() t where t.due and not t.has_warn;
  select coalesce(jsonb_agg(jsonb_build_object('announcement_id', c.announcement_id, 'prev_to', c.prev_to, 'win_from', c.win_from,
                                               'region_office', c.region_office, 'title_dep', c.title_dep, 'title', c.title)), '[]'::jsonb)
    into v_ct from public.wave_cutoff_targets() c;
  v_n := jsonb_array_length(coalesce(p_notices, '[]'::jsonb));
  with p as (select * from public.lh_notice_pick(v_tg, p_notices)),
  up as (
    insert into public.lh_notice_matches as m (announcement_id, scope_text, bbs_sn, bbs_tl, dep_nm, posted_on, link_url, candidates)
    select p.announcement_id, p.scope_text, p.bbs_sn, p.bbs_tl, p.dep_nm, p.posted_on, p.link_url, p.candidates from p
    on conflict (announcement_id, scope_text, bbs_sn) do update
       set last_seen_at = now(), candidates = excluded.candidates, bbs_tl = excluded.bbs_tl, link_url = excluded.link_url
    returning (xmax = 0) as ins
  )
  select count(*), count(*) filter (where ins) into v_hit, v_new from up;
  with p as (select * from public.lh_cutoff_notice_pick(v_ct, p_notices)),
  up as (
    insert into public.lh_cutoff_notice_matches as m (announcement_id, bbs_sn, bbs_tl, dep_nm, posted_on, link_url, prev_to, win_from)
    select p.announcement_id, p.bbs_sn, p.bbs_tl, p.dep_nm, p.posted_on, p.link_url, p.prev_to, p.win_from from p
    on conflict (announcement_id, bbs_sn) do update
       set last_seen_at = now(), bbs_tl = excluded.bbs_tl, link_url = excluded.link_url, prev_to = excluded.prev_to, win_from = excluded.win_from
    returning (xmax = 0) as ins
  )
  select count(*), count(*) filter (where ins) into v_chit, v_cnew from up;
  insert into public.lh_notice_run_log (targets, calls, ok_calls, notices, matched, new_matches, window_from, window_to, duration_ms, errors, cutoff_targets, cutoff_matched)
  values (jsonb_array_length(v_tg), coalesce((p_run->>'calls')::int, 0), coalesce((p_run->>'ok_calls')::int, 0), v_n, v_hit, v_new,
          (p_run->>'window_from')::date, (p_run->>'window_to')::date, (p_run->>'duration_ms')::int,
          coalesce(p_run->'errors', '[]'::jsonb), jsonb_array_length(v_ct), v_chit);
  return jsonb_build_object('targets', jsonb_array_length(v_tg), 'notices', v_n, 'matched', v_hit, 'new', v_new,
                            'cutoff_targets', jsonb_array_length(v_ct), 'cutoff_matched', v_chit, 'cutoff_new', v_cnew);
end
$function$
