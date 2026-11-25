// 「금회 한정」 공고 순위 행 this_round_open 빔(2026-11-25 · 우편함 「코드·운영 — 스물넷째」 1 · 스물셋째 V27 을 불변식에서 옮김) — health-ops ⚠️(안 멈춤 · HARD 밖).
//   식 = 스물셋째 V27 그대로: 같은 공고 정책 행 content_raw 가 「금회 모집(공급·접수)은 n순위에 한함(하·합)」 또는 「n(,m)순위 : 이번(금회) 공고는 모집하지 않음」인데
//   순위(rank) 있는 자격 행의 this_round_open 이 모두 NULL 인 공고. 조건부(「선순위 … 초과하면 후순위 …」)는 안 걸린다 · rank 없는 공고는 셈 밖.
//   불변식에서 옮긴 까닭: 분석 스킬이 이 칸을 아직 몰라 불변식 가드면 새 「금회 한정」 공고의 분석 쓰기가 막힌다. 여기서는 알리기만 한다(채우기는 운영 데이터 쓰기 몫).
//   기준선 2026-11-25: 식에 맞는 공고 5(거짓 걸림 0) · rank 있음 2 · 소급 9행 뒤 대상 0.
export const KUMHOE_RE = "금회\\s*(모집|공급|접수)[은는]?\\s*[0-9][0-9,·ㆍ\\s]*순위에?\\s*한(하|합|함)|[0-9](\\s*[,·ㆍ]\\s*[0-9])*\\s*순위\\s*:?\\s*(이번|금회)\\s*(공고는|모집은|공고에서는)?\\s*모집하지\\s*않"
// treatNull = true 이면 칸 값을 모두 NULL 로 보고 센다(시험 — 소급 전 꼴 재현)
export const thisRoundSql = (treatNull = false) => `
with k as (select distinct p.announcement_id aid from public.announcement_policies p where p.content_raw ~ '${KUMHOE_RE}'),
r as (select e.announcement_id aid, count(*) n, bool_and(${treatNull ? 'true' : 'e.this_round_open is null'}) empty
        from public.eligibility_criteria e join k on k.aid = e.announcement_id where e.rank is not null group by 1)
select json_build_object('matched', (select count(*) from k), 'ranked', (select count(*) from r),
  'empty', coalesce((select json_agg(json_build_array(r.aid, r.n) order by r.aid) from r where r.empty), '[]'::json)) j`
export function judgeThisRound(j) {
  const empty = j.empty || []
  const short = id => (/^\d{16}$/.test(id) ? '…' + id.slice(-5) : id)
  return {
    status: empty.length ? 'warn' : 'pass',
    value: `${empty.length ? `빔 ${empty.length}: ${empty.slice(0, 5).map(([a, n]) => `${short(a)}(순위 행 ${n})`).join(', ')}` : '빔 0'} · 「금회 한정」 공고 ${j.matched} · 그중 순위 있는 행 공고 ${j.ranked}`,
    rule: '0 — 「금회 한정」 정책 행(「금회 모집은 n순위에 한함」·「n순위 : 이번 공고는 모집하지 않음」)이 있는 공고에서 순위(rank) 있는 자격 행의 this_round_open 이 모두 NULL 이면 ⚠️(안 멈춤 · 원문 문장대로 채우는 것은 운영 데이터 쓰기 몫 · 조건부 「선순위 초과 시」 안 걸림 · rank 없는 공고 셈 밖) · 2026-11-25 불변식 V27 에서 옮김',
  }
}

// 🔵 2026-11-25(우편함 「코드·운영 — 스물다섯째」 1) — 배포본 화면 로더(index.html zfLoadRankOnly → zfRankOnlyByAnn 키) 집합 = 위 KUMHOE_RE 정책 행 공고 집합.
//    화면은 category 가 ⚠️로 시작하는 행을 빼므로 DB 쪽도 같이 뺀 집합(want)과 견준다 · 안 뺀 집합(all)은 값에만(⚠️ 행만 맞는 공고가 생기면 보인다).
//    어긋나거나 화면이 받기에 실패(zfRankOnlyFailed)하면 health-screen ⚠️(안 멈춤).
export const RANK_ONLY_SQL = `
select json_build_object(
  'want', (select coalesce(json_agg(distinct p.announcement_id order by p.announcement_id), '[]'::json) from public.announcement_policies p
            where p.content_raw ~ '${KUMHOE_RE}' and coalesce(p.category, '') !~ '^\\s*⚠️'),
  'all', (select count(distinct p.announcement_id)::int from public.announcement_policies p where p.content_raw ~ '${KUMHOE_RE}')) j`
export function judgeRankOnly(screen, db) {
  const want = (db.want || []).map(String), got = [...new Set((screen.ids || []).map(String))]
  const miss = want.filter(a => !got.includes(a)), extra = got.filter(a => !want.includes(a))
  const short = id => (/^\d{16}$/.test(id) ? '…' + id.slice(-5) : id)
  const bad = screen.failed || miss.length || extra.length
  return {
    status: bad ? 'warn' : 'pass',
    value: `화면 ${got.length} · DB ${want.length}(⚠️ 행 포함 ${db.all})${screen.failed ? ' · 화면 받기 실패(zfRankOnlyFailed)' : ''}${miss.length ? ` · 화면에 없음 ${miss.length}: ${miss.slice(0, 5).map(short).join(', ')}` : ''}${extra.length ? ` · DB에 없음 ${extra.length}: ${extra.slice(0, 5).map(short).join(', ')}` : ''}${bad ? '' : ' · 같음'}`,
    miss, extra,
  }
}
