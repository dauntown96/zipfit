// ⑯ SH 수집 회차가 런 로그를 남겼나 · SH 런 140초(2026-10-15 · 우편함 「코드 — … SH 18:00 수집 546 조사·감시 …」 3).
//    10-13·10-14 18:00 KST 회차가 150초 벽시계로 끊겨(HTTP 546) sh_collection_run_log 행을 못 남겼다 — cron.job_run_details 는 「succeeded」
//    (net.http_post 를 건 것까지만 본다). 그동안 감시는 경과 시간 sh_fresh(≤ 960분) 하나라 다음 날 아침까지 약 13시간 뒤에야 잡혔다.
//    · sh_run  = 10분 넘게 지난 가장 최근 SH cron 회차에 그 회차 시각(−1분 ~ +10분) 안에 시작한 런 로그 행이 있는가 — 없으면 ❌.
//                다음 정기 점검(25·55분)이 바로 잡는다: 18:00 회차가 죽으면 18:25 점검 · 다음 회차가 행을 남기면 저절로 풀린다.
//    · sh_slow = 24시간 안 140초 넘은 SH 런(collect_slow 는 collection_run_log — LH·MYHOME 만 본다).
//    🔵 둘 다 「안 멈추는」 실패다(gate.mjs — 수집은 분석 데이터 쓰기를 틀리게 하지 않는다 → 라벨 health-ops-soft).
//    롤백 시험이 이 SQL 과 judgeShRun 을 그대로 가져다 쓴다 — 바꾸면 시험도 다시 돈다.
export const SH_JOB = 'zipfit-collect-sh-announcements'

// 🔵 2026-11-02(우편함 「코드·운영 — health-screen 로그인 흐름 … + sh_run 실패 이유에 EF 응답 코드」 B · #808) — 행이 없을 때 그 회차의 EF 응답을 이유에 싣는다.
//    cron 은 net.http_post 만 걸고 요청 번호를 남기지 않아(return_message 「1 row」) 회차 ↔ 응답을 시각으로 잇는다: 그 회차 시각부터 160초(cron timeout 120초 + 여유)
//    안에 만들어진 net._http_response 중 바깥 감시(ops_uptime_log)·발송(ops_dispatch_log)이 가리키는 요청과 LH 수집 성공 본문("started"·"finished")을 뺀 것.
//    🔴 근사다 — 같은 시각(정시)에 LH 수집(collect-announcements)도 돈다. 둘 다 실패하면(11-02 12:00 — 502 두 건) 어느 것이 SH 것인지 못 가른다 → 코드를 모두 싣는다.
//    net._http_response 는 몇 시간만 남는다(pg_net 정리) — 남아 있지 않으면 「응답 기록 없음」.
//    at = 기준 시각 식(롤백·과거 재현 시험). SH_RUN_SQL 은 at = now() 판(종전 이름 그대로).
export const shRunSql = ({ at = 'now()' } = {}) => `
with runs as (
  select d.start_time, d.status,
         exists (select 1 from public.sh_collection_run_log s
                  where s.started_at >= d.start_time - interval '1 minute' and s.started_at < d.start_time + interval '10 minutes') logged
    from cron.job_run_details d join cron.job j using (jobid)
   where j.jobname = '${SH_JOB}' and d.start_time > ${at} - interval '24 hours' and d.start_time < ${at} - interval '10 minutes'),
last as (select * from runs order by start_time desc limit 1),
net as (select r.status_code, r.timed_out, r.error_msg from net._http_response r, last
         where r.created >= last.start_time - interval '5 seconds' and r.created < last.start_time + interval '160 seconds'
           and not exists (select 1 from public.ops_uptime_log u where u.net_request_id = r.id)
           and not exists (select 1 from public.ops_dispatch_log l where l.net_request_id = r.id)
           and not (coalesce(r.content, '') like '%"started"%' and coalesce(r.content, '') like '%"finished"%'))
select jsonb_build_object(
  'last', (select jsonb_build_object('at_kst', to_char(start_time at time zone 'Asia/Seoul', 'MM-DD HH24:MI'),
                                     'age_min', round(extract(epoch from ${at} - start_time) / 60), 'status', status, 'logged', logged)
             from last),
  'net', (select coalesce(jsonb_agg(case when timed_out then 'timeout' when status_code is null then coalesce(left(error_msg, 40), '오류') else status_code::text end
                                    order by status_code), '[]'::jsonb) from net),
  'miss_24h', coalesce((select jsonb_agg(to_char(start_time at time zone 'Asia/Seoul', 'MM-DD HH24:MI') order by start_time) from runs where not logged), '[]'::jsonb),
  'slow_24h', (select count(*) from public.sh_collection_run_log where run_at > ${at} - interval '24 hours' and run_at <= ${at} and duration_ms >= 140000)
) as j;`

export const SH_RUN_SQL = shRunSql()

// 그 회차 EF 응답 한 낱말(같은 코드는 묶는다 — 502×2) · 없으면 「응답 기록 없음」. 근사(같은 시각 LH 수집 포함)라 「그 시각」이라고 쓴다.
const netTxt = (n) => {
  if (!Array.isArray(n) || n.length === 0) return ' · 그 시각 EF 응답 기록 없음'
  const c = {}; for (const x of n) c[x] = (c[x] || 0) + 1
  return ' · 그 시각 EF 응답 ' + Object.entries(c).map(([k, v]) => v > 1 ? `${k}×${v}` : k).join(' · ')
}

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
      value: `마지막 cron ${j.last.at_kst} KST(${j.last.age_min}분 전 · ${j.last.status}) → 행 ${j.last.logged ? '있음' : '없음'}${j.last.logged ? '' : netTxt(j.net)}${missTxt}`,
      rule: '10분 넘게 지난 가장 최근 cron 회차에 그 시각(−1분 ~ +10분)에 시작한 sh_collection_run_log 행 — 없으면 함수가 끊겼다(546 · 10-13·10-14 18:00)' })
  }
  out.push({ id: 'sh_slow', name: '24시간 안 140초 넘은 SH 수집 런', status: j.slow_24h === 0 ? 'pass' : 'fail', value: j.slow_24h,
    rule: '0(150초에서 함수가 죽는다 · 2026-10-15 요청 20초·런 예산 105초)' })
  return out
}
