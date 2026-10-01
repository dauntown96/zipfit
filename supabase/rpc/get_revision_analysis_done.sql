CREATE OR REPLACE FUNCTION public.get_revision_analysis_done(p_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 정정본 분석 여부(2026-10-01) — 화면의 「정정 전 공고 기준」 배너 판정 재료. 정의는 마이그레이션 2026-10-01_05 머리 주석.
  select coalesce((
    select exists (
      select 1
        from public.get_announcement_group_ids(c.announcement_id) g
        join public.announcements m on m.announcement_id = g.announcement_id
        join public.announcement_analysis aa on aa.announcement_id = m.announcement_id
       where m.apply_end is not distinct from c.apply_end
         and (m.is_revised is true or m.announcement_date >= c.announcement_date)
         and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)')  -- 소급 제외: 머리 주석
         and aa.analyzed_at >= coalesce(c.revised_at, c.announcement_date::timestamptz))
      from public.announcements c
     where c.announcement_id = p_id and c.is_revised is true), false)
$function$
