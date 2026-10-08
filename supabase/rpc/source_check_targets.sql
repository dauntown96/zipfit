CREATE OR REPLACE FUNCTION public.source_check_targets()
 RETURNS TABLE(source text, source_key text, card_id text, page_url text, title text, announcement_date date, card_status text, card_apply_start date, card_apply_end date, card_apply_end_confirmed date, card_notice_ends jsonb, card_soonest_open_end date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 🔴 2026-10-08(3-B ③ 1단계) — 열린 원문 키 정기 대조(check-source-pages)의 대상. 기록만 하는 함수가 부른다 — 화면은 부르지 않는다.
  --   열린 대표 카드 = get_announcements_deduped 중 접수마감 아님. 원문 키: LH = zipfit_ops.original_lh_id(대표 ID)(Z-2 한 정의 — NULL 이면 대상 아님)
  --   · SH = 대표 ID. 같은 원문 키에 대표 카드가 둘이면 ID 가 작은 것 하나.
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
      WHERE e.d >= (now() AT TIME ZONE 'Asia/Seoul')::date)
  FROM u JOIN public.announcements a ON a.announcement_id = u.skey
$function$
