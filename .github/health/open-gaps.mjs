// ㉔·㉕ 열린 카드 데이터 빈칸 둘(2026-10-22 · 우편함 「코드·운영 — A(G3 감시 덧): ⚠️ 두 줄 …」 1·2 · 조사 「모르는 값」 회신 4).
//    화면은 빈 칸을 「모름」이 아니라 확정 문구로 말할 수 있다 — ㉔ 자격 표 supply_form NULL → 자격 머리를 「일반」으로 지음(…20930 기장군) ·
//    ㉕ 전세 아닌데 monthly_rent NULL → 종전 화면은 「월세없음」(2026-10-30 #780 뒤 「확인 필요」). 화면 쪽 고침과 따로 데이터 빈칸 자체를 알린다.
//    열린 묶음 = 열린 행(apply_end ≥ 오늘 KST ∧ 숨김 아님 ∧ 제목 조기 마감 아님)의 저장 제목 키(title_dedup_key)와 같은 키의 행 전부 —
//    🔴 목록 함수(get_announcements_deduped)를 부르지 않는다(L0 자원 · 같은 게시물 링크·회차 날짜 꼬리는 세지 않는 근사 — G2 식 「열린 카드」와 같은 축).
//    🔴 ⚠️ 경고만 · gate.mjs HARD 밖(안 멈춤) · SQL 실패는 ⚠️ 점검 불능(blind) — lh_list_gone 과 같은 처리.
const OPEN_GROUP = `
with ok as materialized (select distinct a.title_dedup_key k from public.announcements a
        where a.apply_end >= (now() at time zone 'Asia/Seoul')::date and a.hidden_from_listing is not true and a.title not like '%조기%마감%'),
     g as materialized (select a.announcement_id, a.title, a.housing_type from public.announcements a join ok on ok.k = a.title_dedup_key)`

// 🔵 2026-11-16(우편함 「코드·운영 — 단지 도로명·좌표 표 …」 0장 ① · claude.ai 판정) — 원문에 공급 형태 구분이 아예 없는 공고는 supply_form 을 비운 것이
//    원문 충실이다. 그 공고는 경고 셈(n) 밖 exempt 로 따로 세어 ℹ️ 로 보인다 · 공고마다 근거(원문 쪽·문장)를 함께 적는다 · 더할 때는 판정을 받은 뒤.
export const ELIG_FORM_EXEMPT = [
  { id: '2015122300021004', why: '파주시 중소기업체 기관공급(행복주택) — 공고문 p.3 「우선공급은 없습니다」 · 원문에 공급 형태 구분 없음(claude.ai 판정 2026-11-16)' },
]
const EXEMPT_IDS = `array[${ELIG_FORM_EXEMPT.map(x => `'${x.id}'`).join(', ')}]::text[]`
export const ELIG_FORM_NULL_SQL = `${OPEN_GROUP}
select json_build_object('groups', (select count(*) from ok),
  'rows', (select count(*) from public.eligibility_criteria e join g using (announcement_id)),
  'n', (select count(*) from public.eligibility_criteria e join g using (announcement_id) where e.supply_form is null and e.announcement_id <> all(${EXEMPT_IDS})),
  'ids', (select coalesce(json_agg(distinct e.announcement_id), '[]'::json) from public.eligibility_criteria e join g using (announcement_id) where e.supply_form is null and e.announcement_id <> all(${EXEMPT_IDS})),
  'exempt', (select count(*) from public.eligibility_criteria e join g using (announcement_id) where e.supply_form is null and e.announcement_id = any(${EXEMPT_IDS})),
  'exempt_ids', (select coalesce(json_agg(distinct e.announcement_id), '[]'::json) from public.eligibility_criteria e join g using (announcement_id) where e.supply_form is null and e.announcement_id = any(${EXEMPT_IDS}))) j`

// 「전세」는 그 세대 행이 걸린 공고의 제목·유형에서 본다(든든전세·전세임대 — 월세가 원래 없다 · 2026-10-22 실측 열린 묶음 월세 NULL 688행 전부 이 꼴).
// 🔵 2026-11-10(우편함 「코드·운영 — 11-09 정돈 셋 …」 0장 1 · claude.ai 판정) — 원문이 월세를 「월 임대료 약 N만원」(확정 금액 아님 · 개별 안내)으로만
//    준 행은 칸을 비운 것이 원문 충실이다(analysis 「약」 규칙). 그 행(extra_note 에 「월 임대료 약」 꼴)은 경고 셈(n) 밖 approx 로 따로 세어 ℹ️ 로 보인다.
const RENT_APPROX = `h.extra_note ~ '월\\s*임대료\\s*약'`
const RENT_GAP = `h.monthly_rent is null and h.deposit is not null and coalesce(g.title, '') || ' ' || coalesce(g.housing_type, '') !~ '전세'`
export const RENT_NULL_SQL = `${OPEN_GROUP}
select json_build_object('rows', (select count(*) from public.housing_units h join g using (announcement_id)),
  'jeonse', (select count(*) from public.housing_units h join g using (announcement_id)
              where h.monthly_rent is null and coalesce(g.title, '') || ' ' || coalesce(g.housing_type, '') ~ '전세'),
  'n', (select count(*) from public.housing_units h join g using (announcement_id) where ${RENT_GAP} and not coalesce(${RENT_APPROX}, false)),
  'ids', (select coalesce(json_agg(distinct h.announcement_id), '[]'::json) from public.housing_units h join g using (announcement_id)
           where ${RENT_GAP} and not coalesce(${RENT_APPROX}, false)),
  'approx', (select count(*) from public.housing_units h join g using (announcement_id) where ${RENT_GAP} and ${RENT_APPROX}),
  'approx_ids', (select coalesce(json_agg(distinct h.announcement_id), '[]'::json) from public.housing_units h join g using (announcement_id)
           where ${RENT_GAP} and ${RENT_APPROX})) j`

export function judgeEligFormNull(j) {
  const rule = '0 — 열린 묶음(열린 행의 제목 키와 같은 키의 행) 자격 행 중 supply_form NULL · 넘으면 ⚠️ 경고만(자격 표 머리가 비거나 지어질 수 있음 — 원문 공급 형태 확인 · 채우기는 운영 데이터 쓰기 몫) · 원문에 공급 형태 구분이 없다고 판정된 공고(open-gaps.mjs ELIG_FORM_EXEMPT)는 셈 밖 ℹ️'
  const ex = j.exempt || 0
  const exv = ex ? ` · 예외 ${ex}행(${(j.exempt_ids || []).slice(0, 5).join(', ')} — 원문에 공급 형태 구분 없음)` : ''
  if (j.n === 0) return { status: ex ? 'info' : 'pass', value: `0(열린 묶음 ${j.groups} · 자격 행 ${j.rows}${exv})`, rule }
  return { status: 'warn', value: `${j.n}행: ${j.ids.slice(0, 5).join(', ')} — 자격 표 머리가 비거나 지어질 수 있음 · 원문 공급 형태 확인${exv}`, rule }
}

export function judgeRentNull(j) {
  const rule = '0 — 열린 묶음 세대 행 중 monthly_rent NULL ∧ deposit 있음 ∧ 그 공고 제목·유형에 「전세」 없음 · 넘으면 ⚠️ 경고만(월세 칸 빠짐 — 화면에 「확인 필요」로 보임) · 원문이 「월 임대료 약」(확정 금액 아님)으로만 준 행은 셈 밖 ℹ️'
  const ax = j.approx || 0
  const axv = ax ? ` · 「월 임대료 약」 ${ax}행(${(j.approx_ids || []).slice(0, 5).join(', ')} — 원문 확정 금액 아님 · 비운 것이 맞음)` : ''
  if (j.n === 0) return { status: ax ? 'info' : 'pass', value: `0(세대 행 ${j.rows} · 전세 월세 NULL ${j.jeonse}${axv})`, rule }
  return { status: 'warn', value: `${j.n}행: ${j.ids.slice(0, 5).join(', ')} — 월세 칸 빠짐 · 화면에 「확인 필요」로 보임${axv}`, rule }
}

// ㉖ 회차 거르기 빠짐 감시(2026-10-29 · 우편함 「코드·운영 — 런칭 뒤 묶음」 2ⓐ · 백로그 「회차 거르기 규칙을 한 벌로」 ③ · 조사 10-27 ⑦).
//    열린 카드(목록 RPC 대표 · apply_end ≥ 오늘 KST · 제목 조기 마감 아님)의 묶음에서 다른 회차 ID(get_announcement_round_ids same_round 거짓)에
//    경로 행(announcement_apply_routes) 또는 서류 정책 행(category ~ 서류|증명서 — 관리 탭 zfChkDocRows 와 같은 거름)이 있는 카드.
//    그 카드들에서는 화면이 회차를 걸러야 한다 — 거르기를 빠뜨린 새 화면이 생기면 여기 카드에서 지난 회차 날짜·서류가 드러난다(2026-10-27 G3 · 관리 탭 서류 · 카드 1층 📅).
//    🔴 데이터가 틀린 것이 아니다(지난 회차 산물은 그 ID 에 맞게 산다) — ℹ️ 정보만(판정하지 않는다 · claude.ai 2026-10-29 판정 — 화면 거르기가 실제로 빠진 것은 health-screen 몫) ·
//       gate.mjs HARD 밖 · 못 읽으면 ⚠️ 점검 불능.
//    목록 RPC 를 한 번 부른다(이 파일 위 두 줄과 달리 대표·카드 접수 끝이 있어야 회차를 가른다).
export const ROUND_MIX_SQL = `
with oc as materialized (select d.announcement_id cid, d.apply_end cend from public.get_announcements_deduped() d
        where d.apply_end >= (now() at time zone 'Asia/Seoul')::date and d.title not like '%조기%마감%'),
     rr as materialized (select oc.cid, f.announcement_id aid from oc cross join lateral public.get_announcement_round_ids(oc.cid, oc.cend) f where not f.same_round),
     hit as (select rr.cid,
        bool_or(exists (select 1 from public.announcement_apply_routes x where x.announcement_id = rr.aid)) route,
        bool_or(exists (select 1 from public.announcement_policies x where x.announcement_id = rr.aid and x.category ~ '서류|증명서')) doc
       from rr group by rr.cid)
select json_build_object('cards', (select count(*) from oc), 'other_cards', (select count(distinct cid) from rr),
  'route', (select coalesce(json_agg(cid order by cid) filter (where route), '[]'::json) from hit),
  'doc', (select coalesce(json_agg(cid order by cid) filter (where doc), '[]'::json) from hit)) j`

export function judgeRoundMix(j) {
  const rule = '정보 — 판정하지 않는다 · 열린 카드 묶음의 다른 회차 ID(get_announcement_round_ids)에 경로 행 또는 서류 정책 행이 있는 카드(화면이 회차를 걸러야 하는 카드 — 데이터 오류 아님 · 진짜 빠짐은 health-screen)'
  const ids = [...new Set([...(j.route || []), ...(j.doc || [])])]
  if (!ids.length) return { status: 'info', value: `0(열린 카드 ${j.cards} · 다른 회차 ID 있는 카드 ${j.other_cards})`, rule }
  return { status: 'info', value: `${ids.length}: 경로 ${j.route.length}(${j.route.slice(0, 5).join(', ')}) · 서류 ${j.doc.length}(${j.doc.slice(0, 5).join(', ')}) — 화면 회차 거르기가 받쳐야 하는 카드`, rule }
}

// ㉛ LH 「…마감」인데 원문 접수 창이 남은 열린 카드(2026-11-16 · 우편함 「코드·운영 — 🔴 순위별 접수 창 …」 3 · 연천전곡1 …20996).
//    LH 목록 상태(PAN_SS)는 첫 창 끝 직후 「접수마감」으로 바뀐다 — 다음 순위 창이 남은 카드는 화면이 경로 표 창(zfRouteWinsAll · zfRouteGap)으로
//    「접수 예정 · 다음 창」을 세운다. 그 장치는 **경로 표(announcement_apply_routes)** 만 본다 — 일정 표(announcement_schedule 접수 행)에만 남은 창이 있고
//    경로 행이 없는 카드는 화면이 LH 「…마감」으로 닫는다(기준 ① 틀린 「마감」). 그 꼴이 ⚠️ · 경로 표로 받치는 카드 수는 ℹ️ 값 칸.
//    대상 = LH 행 ∧ status 「…마감」 ∧ apply_end ≥ 오늘 KST ∧ 숨김 아님 · 남은 창 = 같은 제목 키 묶음의 경로·일정(접수) 행 중 시작 > 오늘 KST.
//    🔴 ⚠️ 경고만 · gate.mjs HARD 밖(안 멈춤 — 고침은 데이터(경로 행)나 화면 회차) · SQL 실패는 ⚠️ 점검 불능.
export const LH_CLOSED_WIN_SQL = `
with t as (select (now() at time zone 'Asia/Seoul')::date d),
lh as materialized (select a.announcement_id, a.title_dedup_key k from public.announcements a, t
        where a.source = 'LH' and a.status ~ '마감$' and a.apply_end >= t.d and a.hidden_from_listing is not true),
g as materialized (select lh.announcement_id, x.announcement_id aid from lh join public.announcements x on x.title_dedup_key = lh.k),
z as (select lh.announcement_id,
        exists (select 1 from g join public.announcement_apply_routes r on r.announcement_id = g.aid, t where g.announcement_id = lh.announcement_id and r.start_date > t.d) route_ahead,
        exists (select 1 from g join public.announcement_schedule s on s.announcement_id = g.aid, t where g.announcement_id = lh.announcement_id and s.stage = '접수' and s.start_date > t.d) sched_ahead,
        exists (select 1 from g join public.announcement_apply_routes r on r.announcement_id = g.aid where g.announcement_id = lh.announcement_id) has_route
      from lh)
select json_build_object('lh_closed', (select count(*) from lh),
  'covered', (select count(*) from z where route_ahead),
  'covered_ids', (select coalesce(json_agg(announcement_id order by announcement_id), '[]'::json) from z where route_ahead),
  'n', (select count(*) from z where sched_ahead and not has_route),
  'ids', (select coalesce(json_agg(announcement_id order by announcement_id), '[]'::json) from z where sched_ahead and not has_route)) j`

export function judgeLhClosedWin(j) {
  const rule = '0 — LH 행 status 「…마감」 ∧ 열린 기간인데 같은 제목 키 묶음 일정 표에 시작 > 오늘(KST) 접수 행이 남았고 경로 표 행이 0인 카드(화면이 그 창을 못 봐 LH 마감으로 닫음) · 넘으면 ⚠️ 경고만 · 경로 표로 화면이 받치는 카드 수는 값 칸(ℹ️)'
  const cov = j.covered ? ` · 경로 표로 받침 ${j.covered}(${j.covered_ids.slice(0, 5).join(', ')})` : ''
  if (j.n === 0) return { status: j.covered ? 'info' : 'pass', value: `0(LH 마감 열린 행 ${j.lh_closed}${cov})`, rule }
  return { status: 'warn', value: `${j.n}: ${j.ids.slice(0, 5).join(', ')} — 일정 표에만 남은 접수 창(경로 행 0) · 화면이 「마감」으로 닫음${cov}`, rule }
}

// ㊲ 머리 정정 괄호가 남은 저장 키(2026-11-19 · 우편함 「코드·운영 — 16장」 · 순위표 8위 · 💡 「운영 점검에 「머리 정정 괄호가 남은 저장 키」」).
//    …20937 창녕영산(2026-10-21) — 제목 머리 「('26.10.21. 정정)」이 키에 남아 카드 두 장 · 정정 몫 누락(PR #704 마이그레이션 2026-10-22_01 이 걷음).
//    식 = 그 마이그레이션 가드 식 「^[\[(][^\])]*(수정|정정)[^\])]*[\])]」 + 변경 · 연장(💡) · 공고 행 전부(열림·닫힘) · 0 이 아니면 ⚠️(안 멈춤) · 2026-11-19 첫 값 0.
export const DEDUP_KEY_PAREN_SQL = `
with t as (select announcement_id, title_dedup_key k from public.announcements where title_dedup_key ~ '^[\\[(][^\\])]*(수정|정정|변경|연장)[^\\])]*[\\])]')
select json_build_object('n', (select count(*) from t), 'ids', (select coalesce(json_agg(announcement_id order by announcement_id desc), '[]'::json) from (select announcement_id from t order by announcement_id desc limit 5) z)) j`
export function judgeDedupKeyParen(j) {
  const rule = '0 — 공고 행 title_dedup_key 가 머리 괄호(정정·수정·변경·연장)로 시작 · 넘으면 ⚠️(안 멈춤 · 정정이 카드를 쪼개고 정정본 분석에서 빠지는 꼴 — 2026-10-21 …20937 · 키 함수 머리 규칙에 그 꼴을 더할 몫)'
  if (j.n === 0) return { status: 'pass', value: '0', rule }
  return { status: 'warn', value: `${j.n}행: ${j.ids.join(', ')} — 같은 공고의 다른 행과 키가 갈려 카드가 쪼개질 수 있음`, rule }
}

// ㊳ 회차 사이 같은 동 다른 전용면적(2026-11-19 · 16장 · 순위표 10위 · 💡 「회차 사이 같은 동·다른 전용면적 감시」) — ℹ️ 정보(판정 0 · 원문 오기 후보).
//    세대 행 extra_note 「해당동: …」 · 「건설 세대수: N호」가 같고 complex_id 가 같은 행을 묶어, 공고 둘 이상에 걸쳐 전용면적(area_sqm) 종류가
//    한 공고 안 종류 수보다 많으면 센다(한 공고 안에서 원래 여러 형이면 빼는 셈). 근거: 광주하남1 101동 60호 8월 …20524 40.32㎡ ↔ 10월 …20970 31.32㎡(2026-11-02 국면 C 7회차).
export const UNIT_AREA_ROUND_SQL = `
with u as (select complex_id c, announcement_id aid, round(area_sqm::numeric, 2) a,
    btrim(substring(extra_note from '해당동:\\s*([^;]+)')) dong, substring(extra_note from '건설 세대수:\\s*([0-9,]+)\\s*호') units
  from public.housing_units where complex_id is not null and area_sqm is not null and extra_note ~ '해당동:'),
per as (select c, dong, units, aid, count(distinct a) na from u where units is not null group by c, dong, units, aid),
k as (select u.c, u.dong, u.units, count(distinct u.aid) n_ann, count(distinct u.a) n_area, max(p.na) per_ann,
    array_agg(distinct u.aid) ids, array_agg(distinct u.a) areas
  from u join per p on p.c = u.c and p.dong = u.dong and p.units = u.units and p.aid = u.aid where u.units is not null group by u.c, u.dong, u.units)
select json_build_object('keys', (select count(*) from k), 'n', (select count(*) from k where n_ann >= 2 and n_area > per_ann),
  'top', (select coalesce(json_agg(json_build_object('c', c, 'dong', dong, 'units', units, 'areas', areas, 'ids', ids)), '[]'::json)
          from (select * from k where n_ann >= 2 and n_area > per_ann order by c limit 5) z)) j`
export function judgeUnitAreaRound(j) {
  const rule = '정보 — 판정하지 않는다 · 같은 단지(complex_id) · 같은 「해당동」 · 같은 「건설 세대수」 세대 행이 공고 둘 이상에 걸쳐 전용면적 종류가 한 공고 안보다 많음(원문 오기 후보 — 원문을 다시 볼 몫 · 한 공고 안 모순이 아니라 ⚠️ 아님)'
  const top = (j.top || []).map(t => `단지 ${t.c} ${t.dong}동 ${t.units}호 ${t.areas.join('↔')}㎡(${t.ids.map(i => '…' + String(i).slice(-5)).join(' · ')})`).join(' / ')
  return { status: 'info', value: `${j.n}${top ? ' — ' + top : ''} · 묶음 키 ${j.keys}`, rule }
}
