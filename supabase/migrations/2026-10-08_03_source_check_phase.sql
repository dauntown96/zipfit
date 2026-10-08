-- zipfit:function source_check_targets() acl={postgres=X/postgres,service_role=X/postgres} secdef=true
-- 표시층 긴급 2 · 3 — 원문 키 대조의 「차수 일치」(2026-10-08 · 우편함 「표시층 긴급 2 …」 3).
--   매입 셋(…20737 · …20875 · …20882)의 페이지 접수기간 = 경로 표 첫 차수 「1순위 (우선)」 창 · 카드 확정값 = 공고 전체 창 — 카드가 맞다(분석 스킬 확정값 규칙).
--   ① source_check_targets() 가 원문 키·대표 카드의 경로 표 차수 창 card_phases 를 함께 낸다(반환 칸이 늘어 drop → create).
--   ② source_page_checks.phase_match — 페이지 시작·끝이 한 차수 창과 같으면 그 차수 이름(phase_text). 이때 end_diff·start_diff 는 거짓(기록 칸에는 남김).
-- 되돌리기: 이전 정의(git show 6f515b4:supabase/rpc/source_check_targets.sql)로 drop → create + alter table public.source_page_checks drop column phase_match.
alter table public.source_page_checks add column phase_match text;
comment on column public.source_page_checks.phase_match is '페이지 시작·끝이 같은 공고 경로 표의 한 차수 창(phase_text 있는 행)과 같으면 그 차수 이름 — 이때 end_diff·start_diff 는 거짓(2026-10-08 표시층 긴급 2)';

drop function public.source_check_targets();
CREATE OR REPLACE FUNCTION public.source_check_targets()
 RETURNS TABLE(source text, source_key text, card_id text, page_url text, title text, announcement_date date, card_status text, card_apply_start date, card_apply_end date, card_apply_end_confirmed date, card_notice_ends jsonb, card_soonest_open_end date, card_phases jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 🔴 2026-10-08(3-B ③ 1단계) — 열린 원문 키 정기 대조(check-source-pages)의 대상. 기록만 하는 함수가 부른다 — 화면은 부르지 않는다.
  --   열린 대표 카드 = get_announcements_deduped 중 접수마감 아님. 원문 키: LH = zipfit_ops.original_lh_id(대표 ID)(Z-2 한 정의 — NULL 이면 대상 아님)
  --   · SH = 대표 ID. 같은 원문 키에 대표 카드가 둘이면 ID 가 작은 것 하나.
  -- 🔵 2026-10-08(표시층 긴급 2 · 3) — card_phases: 원문 키·대표 카드의 경로 표 차수 창(phase_text 있는 행 · 시작·끝)을 함께 낸다.
  --   대조가 페이지 시작·끝이 한 차수 창과 같으면 「차수 일치」로 다름에서 뺀다(매입 1순위 (우선) 창 — …20882 10-27~10-29).
  WITH d AS (
    SELECT g.* FROM public.get_announcements_deduped(NULL, NULL, NULL) g WHERE g.status <> '접수마감'
  ),
  k AS (
    SELECT CASE WHEN d.source = 'SH' THEN 'SH' ELSE 'LH' END AS src,
           CASE WHEN d.source = 'SH' THEN d.announcement_id ELSE zipfit_ops.original_lh_id(d.announcement_id) END AS skey,
           d.announcement_id AS cid, d.status AS cst, d.apply_start AS cas, d.apply_end AS cae, d.apply_end_confirmed AS caec
    FROM d
    WHERE d.source = 'SH' OR d.source IN ('LH', 'MYHOME')
  ),
  u AS (
    SELECT DISTINCT ON (k.skey) k.* FROM k WHERE k.skey IS NOT NULL ORDER BY k.skey, k.cid
  )
  SELECT u.src, u.skey, u.cid, a.url, a.title, a.announcement_date, u.cst, u.cas, u.cae, u.caec,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.announcement_id, 'apply_end', m.apply_end) ORDER BY m.apply_end, m.announcement_id), '[]'::jsonb)
       FROM public.announcement_post_links l JOIN public.announcements m ON m.announcement_id = l.linked_announcement_id
      WHERE l.lh_announcement_id = u.skey),
    (SELECT min(e.d) FROM (
        SELECT u.cae AS d
        UNION ALL
        SELECT m.apply_end FROM public.announcement_post_links l JOIN public.announcements m ON m.announcement_id = l.linked_announcement_id
         WHERE l.lh_announcement_id = u.skey) e
      WHERE e.d >= (now() AT TIME ZONE 'Asia/Seoul')::date),
    (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('phase', r.phase_text, 'start', r.start_date, 'end', r.end_date)), '[]'::jsonb)
       FROM public.announcement_apply_routes r
      WHERE r.announcement_id IN (u.skey, u.cid) AND r.phase_text IS NOT NULL AND r.start_date IS NOT NULL AND r.end_date IS NOT NULL)
  FROM u JOIN public.announcements a ON a.announcement_id = u.skey
$function$
;
revoke all on function public.source_check_targets() from public, anon, authenticated;
grant execute on function public.source_check_targets() to service_role;
