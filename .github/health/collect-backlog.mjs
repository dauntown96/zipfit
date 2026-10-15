// ⑰ 홍보물·단지 이미지 목록 수집 — cron 이 두 번 지나도록 처리 안 된 대상(2026-10-15 · 우편함 「코드 — 루틴 자기 깨우기 대안 조사 · 홍보물·단지 이미지 수집 신선도를 결과 표로 잰다」 2).
//    promo_fresh · images_fresh 는 cron.job_run_details.start_time(= net.http_post 를 건 때)만 본다 — EF 가 546 으로 죽어도 「실행됨」이다
//    (SH 가 10-13·10-14 18:00 에 만든 빈칸과 같은 꼴 · #511 sh_run). 그런데 이 두 EF 는 런 기록을 남기지 않고, 대상이 없으면
//    결과 표(announcement_promo_fetch · announcement_complex_image_fetch)에 아무 행도 안 생긴다 — 「돌았는데 할 일 없음」과 「죽음」을
//    결과 행의 있고 없음으로는 가를 수 없다. 그래서 EF 의 대상 규칙(pickTargets)을 SQL 로 그대로 재현해
//    「대상이 된 뒤 cron 회차가 두 번(각 10분 지나 끝난) 지났는데 아직 처리 안 된 대상」을 센다 — 할 일이 없으면 0, EF 가 죽으면 쌓인다.
//    · 대상(EF pickTargets 거울 — 바뀌면 여기도): LH · 홍보물 = 주택유형 「주거복지 - 매입임대」 / 이미지 = 그 밖 · 숨김 아님 · 접수 끝 ≥ 오늘(KST) 또는 없음
//      ① 결과 행 없음 → 대상이 된 때 = 공고 행 created_at ② 첨부 이력 seen_at > fetched_at → seen_at ③ 실패(ok=false) → fetched_at + 6시간
//    · 두 번: 한 런 상한(20건 · 예산 100초)에 큰 묶음이 들어와 다음 런으로 넘어가는 것은 실패가 아니다 — 한 번은 봐준다.
//    · 밤(UTC 10시~다음날 0시)에 생긴 대상은 다음 날 아침 회차 둘이 지나야 센다(cron 회차 기준이라 시간대 오탐이 없다).
//    🔵 「안 멈춤」(gate.mjs HARD 밖 → health-ops-soft) — 수집은 분석 데이터 쓰기를 틀리게 하지 않는다.
//    시험: 지난 24시간 30분 간격 49시점 × 2항목 되짚기 오탐 0 · 롤백(결과 행 삭제)에서 ❌ — 이 SQL·judge 를 그대로 가져다 쓴다.
export const BACKLOG_KINDS = [
  { kind: 'promo', id: 'promo_backlog', job: 'zipfit-collect-lh-promo', name: '매입 홍보물 목록 수집' },
  { kind: 'images', id: 'images_backlog', job: 'zipfit-collect-lh-images', name: '단지 이미지 목록 수집' },
]

export const BACKLOG_SQL = `
with kinds(kind, job) as (values ${BACKLOG_KINDS.map(k => `('${k.kind}', '${k.job}')`).join(', ')}),
runs as (
  select k.kind, d.start_time, row_number() over (partition by k.kind order by d.start_time desc) rn
    from kinds k join cron.job j on j.jobname = k.job join cron.job_run_details d on d.jobid = j.jobid
   where d.start_time > now() - interval '24 hours' and d.start_time < now() - interval '10 minutes'),
elig as (
  select 'promo' kind, a.announcement_id, a.created_at from public.announcements a
   where a.source = 'LH' and a.housing_type = '주거복지 - 매입임대' and a.hidden_from_listing is not true
     and (a.apply_end is null or a.apply_end >= (now() at time zone 'Asia/Seoul')::date)
  union all
  select 'images', a.announcement_id, a.created_at from public.announcements a
   where a.source = 'LH' and a.housing_type is distinct from '주거복지 - 매입임대' and a.hidden_from_listing is not true
     and (a.apply_end is null or a.apply_end >= (now() at time zone 'Asia/Seoul')::date)),
fx as (
  select 'promo' kind, announcement_id, fetched_at, ok from public.announcement_promo_fetch
  union all select 'images', announcement_id, fetched_at, ok from public.announcement_complex_image_fetch),
seen as (select announcement_id, max(seen_at) seen_at from public.announcement_attachment_history group by 1),
pend as (
  select e.kind, e.announcement_id,
         case when f.announcement_id is null then e.created_at
              when s.seen_at > f.fetched_at then s.seen_at
              when not f.ok then f.fetched_at + interval '6 hours' end as since
    from elig e left join fx f on f.kind = e.kind and f.announcement_id = e.announcement_id
    left join seen s on s.announcement_id = e.announcement_id)
select jsonb_object_agg(k.kind, jsonb_build_object(
  'runs_24h', (select count(*) from runs r where r.kind = k.kind),
  'second_last_kst', (select to_char(r.start_time at time zone 'Asia/Seoul', 'MM-DD HH24:MI') from runs r where r.kind = k.kind and r.rn = 2),
  'pending_now', (select count(*) from pend p where p.kind = k.kind and p.since <= now()),
  'missed', coalesce((select jsonb_agg(p.announcement_id || ' ' || to_char(p.since at time zone 'Asia/Seoul', 'MM-DD HH24:MI') order by p.since)
                       from pend p where p.kind = k.kind
                        and p.since < (select r.start_time from runs r where r.kind = k.kind and r.rn = 2)), '[]'::jsonb))) as j
from kinds k;`

// j = BACKLOG_SQL 의 j → [{ id, name, status, value, rule }] (ops-check 의 add 인자 꼴)
export function judgeBacklog(j) {
  return BACKLOG_KINDS.map(k => {
    const x = (j || {})[k.kind] || {}
    const name = `${k.name} — cron 두 번 지나도록 처리 안 된 대상`
    const rule = '0 — EF 대상 규칙(새 공고 · 첨부 바뀜 · 실패 6시간)을 SQL 로 재현 · 대상이 된 때가 10분 지난 cron 회차 중 끝에서 둘째 회차 시작보다 이르면 셈 · 할 일 없음 = 0 · EF 가 죽으면 쌓인다(cron 「실행됨」만 보는 *_fresh 의 빈칸)'
    if (!x.second_last_kst) return { id: k.id, name, status: 'skip', value: `24시간 안 10분 지난 cron 회차 ${x.runs_24h ?? 0}(둘 미만) · 대기 ${x.pending_now ?? 0}`, rule }
    const m = x.missed || []
    return { id: k.id, name, status: m.length ? 'fail' : 'pass',
      value: m.length ? `${m.length}: ${m.slice(0, 5).join(', ')}${m.length > 5 ? ' …' : ''} · 기준 회차 ${x.second_last_kst} KST` : `0 · 대기 ${x.pending_now} · 기준 회차 ${x.second_last_kst} KST`, rule }
  })
}
