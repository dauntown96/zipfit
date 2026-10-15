// ⑯ SH 수집 회차가 런 로그를 남겼나 · SH 런 140초(2026-10-15 · 우편함 「코드 — … SH 18:00 수집 546 조사·감시 …」 3).
//    10-13·10-14 18:00 KST 회차가 150초 벽시계로 끊겨(HTTP 546) sh_collection_run_log 행을 못 남겼다 — cron.job_run_details 는 「succeeded」
//    (net.http_post 를 건 것까지만 본다). 그동안 감시는 경과 시간 sh_fresh(≤ 960분) 하나라 다음 날 아침까지 약 13시간 뒤에야 잡혔다.
//    · sh_run  = 10분 넘게 지난 가장 최근 SH cron 회차에 그 회차 시각(−1분 ~ +10분) 안에 시작한 런 로그 행이 있는가 — 없으면 ❌.
//                다음 정기 점검(25·55분)이 바로 잡는다: 18:00 회차가 죽으면 18:25 점검 · 다음 회차가 행을 남기면 저절로 풀린다.
//    · sh_slow = 24시간 안 140초 넘은 SH 런(collect_slow 는 collection_run_log — LH·MYHOME 만 본다).
//    🔵 둘 다 「안 멈추는」 실패다(gate.mjs — 수집은 분석 데이터 쓰기를 틀리게 하지 않는다 → 라벨 health-ops-soft).
//    롤백 시험이 이 SQL 과 judgeShRun 을 그대로 가져다 쓴다 — 바꾸면 시험도 다시 돈다.
export const SH_JOB = 'zipfit-collect-sh-announcements'

export const SH_RUN_SQL = `
with runs as (
  select d.start_time, d.status,
         exists (select 1 from public.sh_collection_run_log s
                  where s.started_at >= d.start_time - interval '1 minute' and s.started_at < d.start_time + interval '10 minutes') logged
    from cron.job_run_details d join cron.job j using (jobid)
   where j.jobname = '${SH_JOB}' and d.start_time > now() - interval '24 hours' and d.start_time < now() - interval '10 minutes')
select jsonb_build_object(
  'last', (select jsonb_build_object('at_kst', to_char(start_time at time zone 'Asia/Seoul', 'MM-DD HH24:MI'),
                                     'age_min', round(extract(epoch from now() - start_time) / 60), 'status', status, 'logged', logged)
             from runs order by start_time desc limit 1),
  'miss_24h', coalesce((select jsonb_agg(to_char(start_time at time zone 'Asia/Seoul', 'MM-DD HH24:MI') order by start_time) from runs where not logged), '[]'::jsonb),
  'slow_24h', (select count(*) from public.sh_collection_run_log where run_at > now() - interval '24 hours' and duration_ms >= 140000)
) as j;`

// j = SH_RUN_SQL 의 j → [{ id, name, status, value, rule }] (ops-check 의 add 인자 꼴)
export function judgeShRun(j) {
  const miss = j.miss_24h || []
  const missTxt = miss.length ? ` · 24시간 안 행 없는 회차 ${miss.length}(${miss.join(', ')} KST)` : ''
  const out = []
  if (!j.last) {
    out.push({ id: 'sh_run', name: 'SH 수집 회차가 런 로그를 남겼나', status: 'skip', value: '24시간 안 10분 지난 cron 회차 없음',
      rule: 'cron 회차마다 그 시각(−1분 ~ +10분)에 시작한 sh_collection_run_log 행' })
  } else {
    out.push({ id: 'sh_run', name: 'SH 수집 회차가 런 로그를 남겼나', status: j.last.logged ? 'pass' : 'fail',
      value: `마지막 cron ${j.last.at_kst} KST(${j.last.age_min}분 전 · ${j.last.status}) → 행 ${j.last.logged ? '있음' : '없음'}${missTxt}`,
      rule: '10분 넘게 지난 가장 최근 cron 회차에 그 시각(−1분 ~ +10분)에 시작한 sh_collection_run_log 행 — 없으면 함수가 끊겼다(546 · 10-13·10-14 18:00)' })
  }
  out.push({ id: 'sh_slow', name: '24시간 안 140초 넘은 SH 수집 런', status: j.slow_24h === 0 ? 'pass' : 'fail', value: j.slow_24h,
    rule: '0(150초에서 함수가 죽는다 · 2026-10-15 요청 20초·런 예산 105초)' })
  return out
}
