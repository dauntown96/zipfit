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
-- 반환 {mode, fetch, hold, gap_ms, cap_10min, block_streak}:
--   fetch = 'all'(normal — 다 허락) · 'none'(paused — 다 막음) · 'essential'(essential — 열린 공고 첨부만 파일당 한 번 · 규칙은 lh_file_gate)
--   hold  = 'lh_file'(paused — 발송기가 analysis_needs_lh_file 몫을 보내지 않음) · 'none'(essential · normal — #차수 포함 다 보냄 · 2026-11-09 PR #918)
--   🔵 2026-11-10(우편함 「코드·운영 — LH 첨부 문지기 복원 …」 · LH 답 · 다운님 결정 「빈도는 문제 되지 않음 · 소극적으로 줄이지 말고 복원」) —
--     몰림 막기 값도 여기서 돌려준다(normal 의 받기에만 쓴다 · lh_file_gate): gap_ms(받기 사이 최소 간격) · cap_10min(10분 상한) · block_streak(차단 감지 연속 수).
--     값은 analysis_dispatch_config 칸(행이 없거나 비면 3000 · 40 · 3 — 멈춤 전 7일 실측: 10분 최대 35 · 1시간 79 · 하루 135 · 한 실행 안 간격 중앙 0.17초).
select jsonb_build_object('mode', m,
         'fetch', case m when 'normal' then 'all' when 'paused' then 'none' else 'essential' end,
         'hold',  case m when 'paused' then 'lh_file' else 'none' end,
         'gap_ms', g, 'cap_10min', c10, 'block_streak', bs)
  from (select coalesce((select c.lh_file_mode from public.analysis_dispatch_config c where c.id = 1), 'essential') as m,
               coalesce((select c.lh_file_gap_ms from public.analysis_dispatch_config c where c.id = 1), 3000) as g,
               coalesce((select c.lh_file_cap_10min from public.analysis_dispatch_config c where c.id = 1), 40) as c10,
               coalesce((select c.lh_file_block_streak from public.analysis_dispatch_config c where c.id = 1), 3) as bs) x;
$function$
