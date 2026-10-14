// ⑮ 해마다 바뀌는 밑값 표 — 새 연도 경고(2026-10-14 · 우편함 「코드 — 마이그레이션 check에 anon 속도 전후 비율 … · 해마다 바뀌는 밑값 표 새 연도 경고」 2).
//    화면(index.html loadMedianIncome · loadUrbanIncome)은 표마다 **가장 큰 standard_year** 를 고르고 그 연도 1~8인이 다 있을 때만 쓴다
//    (하나라도 비면 null → 진단이 「보류」). 그래서 사고는 셋이다 — ① 새 연도 행을 안 넣음(낡은 값으로 판정) ② 일부만 넣음(진단 보류)
//    ③ 적용일 전에 미리 넣음(지난 공고 판정이 새 값으로 바뀜). 사람이 기억해야 하는 구조라 점검이 대신 기억한다.
//    🔴 전부 ⚠️ 경고다 — 고침은 데이터 쓰기 회차라 이슈를 열어 루틴 착수를 막지 않는다(revision_gap 과 같은 처리).
//    롤백 시험이 이 SQL 과 judgeYearly 를 그대로 가져다 쓴다(.github/health/yearly.mjs 를 import) — 바꾸면 시험도 다시 돈다.
//
// 표마다 「그해(KST) 화면이 써야 하는 연도」:
//   · median_income_monthly(기준 중위소득) = 그해. 보건복지부가 전년 7~8월 중앙생활보장위원회 의결 · 연말 고시 · 1월 1일 적용
//     (사전 「소득 기준 밑값 · 공통 · 2026」 — 2027 값은 2026-07-28 의결).
//   · urban_worker_monthly_income(도시근로자 월평균소득) = 그해 − 1. 2026 공고가 2025년도 값을 쓴다(표 출처 칸 · 공고 3건 대조 2026-09-11).
//     🔴 새 연도 값으로 바뀌는 날의 근거는 저장소·사전·⑩에 없다(2026-10-14 조사) — 그래서 날짜 유예 없이 「그해 − 1 행이 없다」만 본다.
//     근거가 생기면(공고가 새 값을 쓰기 시작한 날) 여기 날짜를 더한다.
export const YEARLY_TABLES = [
  { table: 'median_income_monthly', name: '기준 중위소득', lag: 0, early: true,
    how: '보건복지부 고시(전년 7~8월 의결 · 연말 고시) 1~8인 8행을 한 번에 넣는다' },
  { table: 'urban_worker_monthly_income', name: '도시근로자 월평균소득', lag: 1, early: false,
    how: '공고·LH 임대가이드 게시값 1~8인 8행을 한 번에 넣는다(갱신 날짜 근거 없음 — 그해 − 1 기준)' },
]

export const YEARLY_SQL = `
with t as (
  select 'median_income_monthly' tbl, standard_year y, household_size s, income_100 v from public.median_income_monthly
  union all
  select 'urban_worker_monthly_income', standard_year, household_size, income_100 from public.urban_worker_monthly_income),
c as (select tbl, y::int y, count(distinct s) filter (where s between 1 and 8 and v > 0) n from t group by 1, 2)
select jsonb_build_object(
  'today', ((now() at time zone 'Asia/Seoul')::date)::text,
  'year', extract(year from (now() at time zone 'Asia/Seoul'))::int,
  'tables', coalesce((select jsonb_object_agg(tbl, jsonb_build_object('max_year', mx, 'max_n', mn, 'complete', cy))
     from (select tbl, max(y) mx, (array_agg(n order by y desc))[1] mn, coalesce(jsonb_agg(y order by y) filter (where n = 8), '[]'::jsonb) cy
             from c group by tbl) s), '{}'::jsonb)) as j;`

// j = YEARLY_SQL 의 j → [{ id, name, status, value, rule }] (ops-check 의 add 인자 꼴)
export function judgeYearly(j) {
  const out = []
  for (const t of YEARLY_TABLES) {
    const need = j.year - t.lag
    const x = (j.tables || {})[t.table]
    const id = 'yearly_' + t.table
    const name = `해마다 바뀌는 밑값 표 — ${t.name}(${t.table})`
    const rule = `화면은 가장 큰 standard_year 의 1~8인 완비만 쓴다 · ${j.year}년(KST)에 쓸 연도 = ${need}${t.lag ? `(그해 − ${t.lag})` : '(1월 1일 적용)'} · ` +
      '최대 연도가 1~8인 완비가 아님 = 즉시 ⚠️ · 쓸 연도 완비 행 없음 = ⚠️' + (t.early ? ' · 쓸 연도보다 큰 연도가 있음(미리 넣음) = ⚠️' : '') + ' · 경고만(이슈를 열지 않는다)'
    if (!x) {
      out.push({ id, name, status: 'warn', value: `행 없음 — 진단 소득 판정이 보류된다. 지금 ${need}년 값: ${t.how}`, rule })
      continue
    }
    const msgs = []
    const early = t.early && x.max_year > need
    if (x.max_n < 8) {
      msgs.push(`최대 연도 ${x.max_year}이 ${x.max_n}/8인뿐 — 화면이 이 연도를 골라 진단이 보류된다. ` +
        (early ? `지금 ${x.max_year} 행을 빼고 ${x.max_year}-01-01에 1~8인 완비로 넣는다` : `지금 나머지 행을 채우거나 ${x.max_year} 행을 뺀다`))
    } else if (early) {
      msgs.push(`${x.max_year} 행이 ${need}년 안에 들어 있다(미리 넣음) — 화면이 ${need}년 공고 판정을 ${x.max_year} 값으로 한다. 지금 빼고 ${x.max_year}-01-01에 넣는다`)
    }
    if (!x.complete.includes(need)) {
      const late = t.lag ? `${need}년 값이 ${j.year}년 공고에 쓰인다` : `${need}-01-01부터 쓰는 값이다(지남)`
      msgs.push(`${need}년 1~8인 완비 행이 없다(완비 연도 ${x.complete.join('·') || '없음'}) — ${late}. 지금 ${need}년 값: ${t.how}`)
    }
    out.push({ id, name, status: msgs.length ? 'warn' : 'pass',
      value: msgs.length ? msgs.join(' / ') : `${need} 완비 · 최대 연도 ${x.max_year}(${x.max_n}/8인) · 오늘 ${j.today}`, rule })
  }
  return out
}
