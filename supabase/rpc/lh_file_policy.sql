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
-- 반환 {mode, fetch, hold}:
--   fetch = 'all'(normal — 다 허락) · 'none'(paused — 다 막음) · 'essential'(essential — 열린 공고 첨부만 파일당 한 번 · 규칙은 lh_file_gate)
--   hold  = 'lh_file'(paused — 발송기가 analysis_needs_lh_file 몫을 보내지 않음) · 'none'(essential · normal — #차수 포함 다 보냄 · 2026-11-09 PR #918)
select jsonb_build_object('mode', m,
         'fetch', case m when 'normal' then 'all' when 'paused' then 'none' else 'essential' end,
         'hold',  case m when 'paused' then 'lh_file' else 'none' end)
  from (select coalesce((select c.lh_file_mode from public.analysis_dispatch_config c where c.id = 1), 'essential') as m) x;
$function$
