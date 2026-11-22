CREATE OR REPLACE FUNCTION public.attachment_change_pending(p_announcement_id text, p_since timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-22(우편함 「코드 — 첨부 변경 갈래 켜기」 1) — 「분석 뒤 첨부 변경」 판정 한 벌. get_reanalysis_queue() 둘째 갈래 · attachment_change_candidates() 가 함께 부른다
--   (종전 두 함수가 같은 조건을 두 벌로 가졌다 — 「한쪽을 바꾸면 함께」 주석으로만 묶였다).
--   참 = p_since(= greatest(analyzed_at, attachment_reviewed_at)) 뒤 첨부 이력 행이 있고(옛 목록이 빈 첫 채움은 거름)
--        ∧ 「새 fileid · 내용 같음」이 아님. 내용 같음 = 분석 때 목록(p_since 뒤 첫 이력 행의 files — 트리거가 바뀌기 전 목록을 적는다)에 없던
--        지금 목록(announcements.attachment_urls)의 fileid 가 하나 이상이고, 그 모두가 attachment_content_sha 에 sha 가 있고 각 sha 가
--        분석 때 목록의 어느 fileid sha 와 같음(2026-11-22 넷째 묶음 A). 새 fileid 의 sha 를 모르면 참(받기 전에는 가릴 수 없다).
--   p_since 가 NULL 이면(분석·검토 시각 둘 다 없음) 거짓 — 종전 greatest(NULL, NULL) 비교와 같다.
  WITH h AS (
    SELECT h.id, h.seen_at, h.files FROM public.announcement_attachment_history h
     WHERE h.announcement_id = p_announcement_id AND h.seen_at > p_since
       AND h.files IS NOT NULL AND jsonb_typeof(h.files) = 'array' AND jsonb_array_length(h.files) > 0
  ),
  base AS (SELECT h.files FROM h ORDER BY h.seen_at, h.id LIMIT 1),
  old AS (SELECT DISTINCT substring(e->>'url' FROM 'fileid=([0-9]+)') AS f FROM base, jsonb_array_elements(base.files) e),
  cur AS (SELECT DISTINCT substring(e->>'url' FROM 'fileid=([0-9]+)') AS f
            FROM public.announcements a,
                 jsonb_array_elements(CASE WHEN jsonb_typeof(a.attachment_urls) = 'array' THEN a.attachment_urls ELSE '[]'::jsonb END) e
           WHERE a.announcement_id = p_announcement_id),
  nf AS (SELECT cur.f FROM cur WHERE cur.f IS NOT NULL AND NOT EXISTS (SELECT 1 FROM old WHERE old.f = cur.f))
  SELECT EXISTS (SELECT 1 FROM h)
     AND NOT (
       EXISTS (SELECT 1 FROM nf)
       AND NOT EXISTS (
         SELECT 1 FROM nf
          WHERE NOT EXISTS (
            SELECT 1 FROM public.attachment_content_sha sn
              JOIN public.attachment_content_sha so ON so.announcement_id = sn.announcement_id AND so.sha256 = sn.sha256
             WHERE sn.announcement_id = p_announcement_id AND sn.file_id = nf.f
               AND EXISTS (SELECT 1 FROM old WHERE old.f = so.file_id))))
$function$
