CREATE OR REPLACE FUNCTION public.analysis_lh_file_hold(p_announcement_id text, p_group_key text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 이 분석 몫을 LH 첨부 경로 쓰임 가름 때문에 발송하지 않고 대기열에 두는가(2026-11-09 · 우편함 「코드·운영 — 모드 정의 하나(lh_file_policy) …」 1장).
-- = lh_file_policy() 의 hold 가 'lh_file'(지금 paused) ∧ analysis_needs_lh_file(공고, 키)(묶음 첨부에 lhFile.do ∨ #차수 몫).
-- 부르는 곳: 발송기 analysis_dispatch_tick ②-1(ready 거두기 · 세우기) · health-ops ㉝ 「발송 대기 몫」 — 같은 조건을 한 자리에서.
-- case 로 먼저 정책을 본다 — hold 가 'none' 이면 analysis_needs_lh_file(묶음 첨부 훑기)를 부르지 않는다.
select case when public.lh_file_policy()->>'hold' = 'lh_file'
            then public.analysis_needs_lh_file(p_announcement_id, p_group_key)
            else false end;
$function$
