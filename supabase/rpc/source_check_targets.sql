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
  -- 🔵 2026-10-17(우편함 「코드·운영 — pg_net … source_end_diff 차수 오탐 …」 3) — 일정 표(announcement_schedule)의 접수 단계 창도 차수 창으로 낸다
  --   (묶음 구성원 전부 · get_announcement_group_ids(대표) · 차수 이름 = scope_text). 경로 표가 없는 차수 공고(…0877 — 접수 창 10-19~21 · 11-02~04 가
  --   형제 …0875 의 일정 표에만 있음)는 분석이 확정 마감을 마지막 창(11-04)으로 둔 뒤 페이지 첫 창(10-21)과 늘 어긋났다(10-16 11:30 UTC 부터).
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
      || (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('phase', coalesce(s.scope_text, s.stage_text), 'start', s.start_date, 'end', s.end_date)), '[]'::jsonb)
            FROM public.announcement_schedule s
           WHERE s.announcement_id IN (SELECT g.announcement_id FROM public.get_announcement_group_ids(u.cid) g)
             AND s.stage = '접수' AND s.start_date IS NOT NULL AND s.end_date IS NOT NULL)
  FROM u JOIN public.announcements a ON a.announcement_id = u.skey
$function$
