CREATE OR REPLACE FUNCTION public.analysis_needs_lh_file(p_announcement_id text, p_group_key text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 이 분석 몫이 LH 첨부 경로(lhFile.do)를 받아야 하는가(2026-11-05 · 우편함 「코드·운영 — LH 첨부 경로(lhFile.do) 사용 중단 …」 2장 · 다운님 결정).
-- apply.lh.or.kr/robots.txt 가 Disallow: /lhapply/lhFile.do · /lhapply/apply/csvc/lhFile.do 를 건다(2025-09~10 부터) — 멈춤 칸
-- analysis_dispatch_config.lh_file_mode = 'paused' 동안 이 함수가 참인 몫은 발송하지 않는다(analysis_dispatch_tick ready_at) · health-ops lh_file_mode 가 센다.
--   참 = #차수 몫(공지 첨부 목록을 읽는 몫) ∨ 같은 묶음(get_announcement_group_ids) 공고의 첨부 중 하나라도 lhFile.do 주소.
--   SH(innoFD.do) · 지방공사 게시판 · MYHOME 단독 첨부는 거짓 — 그대로 발송한다.
select coalesce(p_group_key like '% #차수 %', false)
    or exists (select 1
                 from public.get_announcement_group_ids(p_announcement_id) g
                 join public.announcements a on a.announcement_id = g.announcement_id
                 cross join lateral jsonb_array_elements(case when jsonb_typeof(a.attachment_urls) = 'array' then a.attachment_urls else '[]'::jsonb end) e
                where coalesce(e->>'url', e#>>'{}') ~* '^https?://apply\.lh\.or\.kr/lhapply/(apply/csvc/)?lhfile\.do');
$function$
