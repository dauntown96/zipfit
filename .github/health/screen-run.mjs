// ㉙ 화면 점검 「발송했는데 기록 없음」(2026-11-02 · 우편함 「코드·운영 — 점검 빈틈 묶음 …」 A · 백로그 「화면 점검이 결과를 못 남기면 ops_health_runs에 행이 없어…」).
//    계기: 11-01 08:50 KST 화면 점검 발송(ops_dispatch_log target health-screen.yml)은 GitHub 가 204 로 받았는데, 그 뒤 ops_health_runs 에 kind='screen' 행이
//    하나도 남지 않았다(#799). screen_dispatch 는 「마지막 발송이 204 · 25시간 안」만 보고, launch-gates.sql g1_screen 은 기록이 있는 실행만 세서
//    그날은 「실패 0」으로 초록이었다 — 화면을 잰 적이 없는 날이 잰 날처럼 보였다.
//    판정: 마지막 204 발송이 문턱(90분 — 실측 발송 → 기록 2~4분) 넘게 지났는데 [발송 시각, 발송 + 90분] 안에 kind='screen' 행이 0 → ⚠️.
//    문턱 안(발송 뒤 90분 전)이면 아직 모른다 → 통과로 두고 값에 「기다림」을 적는다. 발송 기록이 없으면(첫 발송 전 · 7일 넘게 발송 없음) screen_dispatch 가 따로 잡는다 → 통과.
//    🔴 ⚠️ 경고만 · gate.mjs HARD 밖(안 멈춤 — 화면 점검은 분석 데이터를 쓰지 않는다) · SQL 이 실패하면 ⚠️ 점검 불능.
//    ops_dispatch_log 는 ops_health_dispatch() 가 7일 넘은 행을 지운다 — 이 점검·launch-gates missing_7d 는 그 7일 안에서만 본다.
//    과거 재현 시험이 이 SQL 을 그대로 쓴다 — at = 기준 시각 식(바꾸면 시험도 다시 돈다).
export const SCREEN_RUN_WAIT_MIN = 90
export const screenRunSql = ({ at = 'now()' } = {}) => `
with d as (select l.at from public.ops_dispatch_log l
            where l.target = 'health-screen.yml' and l.status_code = 204 and l.at <= ${at}
            order by l.at desc limit 1)
select json_build_object(
  'at_kst', (select to_char(d.at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') from d),
  'age_min', (select round(extract(epoch from ${at} - d.at) / 60) from d),
  'runs', (select count(*) from d, public.ops_health_runs h
            where h.kind = 'screen' and h.run_at >= d.at and h.run_at < d.at + interval '${SCREEN_RUN_WAIT_MIN} minutes' and h.run_at <= ${at})) j`

export function judgeScreenRun(j) {
  const rule = `마지막 화면 점검 발송(204) 뒤 ${SCREEN_RUN_WAIT_MIN}분 안에 ops_health_runs kind='screen' 행 ≥ 1 · 없으면 ⚠️ 경고만(화면을 잰 적 없는 날 — launch-gates g1_screen missing_7d 와 같은 축)`
  if (!j.at_kst) return { status: 'pass', value: '발송 기록 없음(screen_dispatch 가 본다)', rule }
  if (j.runs > 0) return { status: 'pass', value: `${j.at_kst} 발송 → 기록 ${j.runs}`, rule }
  if (j.age_min < SCREEN_RUN_WAIT_MIN) return { status: 'pass', value: `${j.at_kst} 발송 → 기다림(${j.age_min}분)`, rule }
  return { status: 'warn', value: `${j.at_kst} 발송(204) 뒤 ${SCREEN_RUN_WAIT_MIN}분 안 화면 점검 기록 0 — health-screen 실행이 결과를 못 남겼다(Actions 실행 확인)`, rule }
}
