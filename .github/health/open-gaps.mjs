// ㉔·㉕ 열린 카드 데이터 빈칸 둘(2026-10-22 · 우편함 「코드·운영 — A(G3 감시 덧): ⚠️ 두 줄 …」 1·2 · 조사 「모르는 값」 회신 4).
//    화면은 빈 칸을 「모름」이 아니라 확정 문구로 말할 수 있다 — ㉔ 자격 표 supply_form NULL → 자격 머리를 「일반」으로 지음(…20930 기장군) ·
//    ㉕ 전세 아닌데 monthly_rent NULL → 「월세없음」. 화면 쪽 고침과 따로 데이터 빈칸 자체를 알린다.
//    열린 묶음 = 열린 행(apply_end ≥ 오늘 KST ∧ 숨김 아님 ∧ 제목 조기 마감 아님)의 저장 제목 키(title_dedup_key)와 같은 키의 행 전부 —
//    🔴 목록 함수(get_announcements_deduped)를 부르지 않는다(L0 자원 · 같은 게시물 링크·회차 날짜 꼬리는 세지 않는 근사 — G2 식 「열린 카드」와 같은 축).
//    🔴 ⚠️ 경고만 · gate.mjs HARD 밖(안 멈춤) · SQL 실패는 ⚠️ 점검 불능(blind) — lh_list_gone 과 같은 처리.
const OPEN_GROUP = `
with ok as materialized (select distinct a.title_dedup_key k from public.announcements a
        where a.apply_end >= (now() at time zone 'Asia/Seoul')::date and a.hidden_from_listing is not true and a.title not like '%조기%마감%'),
     g as materialized (select a.announcement_id, a.title, a.housing_type from public.announcements a join ok on ok.k = a.title_dedup_key)`

export const ELIG_FORM_NULL_SQL = `${OPEN_GROUP}
select json_build_object('groups', (select count(*) from ok),
  'rows', (select count(*) from public.eligibility_criteria e join g using (announcement_id)),
  'n', (select count(*) from public.eligibility_criteria e join g using (announcement_id) where e.supply_form is null),
  'ids', (select coalesce(json_agg(distinct e.announcement_id), '[]'::json) from public.eligibility_criteria e join g using (announcement_id) where e.supply_form is null)) j`

// 「전세」는 그 세대 행이 걸린 공고의 제목·유형에서 본다(든든전세·전세임대 — 월세가 원래 없다 · 2026-10-22 실측 열린 묶음 월세 NULL 688행 전부 이 꼴).
export const RENT_NULL_SQL = `${OPEN_GROUP}
select json_build_object('rows', (select count(*) from public.housing_units h join g using (announcement_id)),
  'jeonse', (select count(*) from public.housing_units h join g using (announcement_id)
              where h.monthly_rent is null and coalesce(g.title, '') || ' ' || coalesce(g.housing_type, '') ~ '전세'),
  'n', (select count(*) from public.housing_units h join g using (announcement_id)
         where h.monthly_rent is null and h.deposit is not null and coalesce(g.title, '') || ' ' || coalesce(g.housing_type, '') !~ '전세'),
  'ids', (select coalesce(json_agg(distinct h.announcement_id), '[]'::json) from public.housing_units h join g using (announcement_id)
           where h.monthly_rent is null and h.deposit is not null and coalesce(g.title, '') || ' ' || coalesce(g.housing_type, '') !~ '전세')) j`

export function judgeEligFormNull(j) {
  const rule = '0 — 열린 묶음(열린 행의 제목 키와 같은 키의 행) 자격 행 중 supply_form NULL · 넘으면 ⚠️ 경고만(자격 표 머리가 비거나 지어질 수 있음 — 원문 공급 형태 확인 · 채우기는 운영 데이터 쓰기 몫)'
  if (j.n === 0) return { status: 'pass', value: `0(열린 묶음 ${j.groups} · 자격 행 ${j.rows})`, rule }
  return { status: 'warn', value: `${j.n}행: ${j.ids.slice(0, 5).join(', ')} — 자격 표 머리가 비거나 지어질 수 있음 · 원문 공급 형태 확인`, rule }
}

export function judgeRentNull(j) {
  const rule = '0 — 열린 묶음 세대 행 중 monthly_rent NULL ∧ deposit 있음 ∧ 그 공고 제목·유형에 「전세」 없음 · 넘으면 ⚠️ 경고만(월세 칸 빠짐 — 화면이 「월세없음」으로 말할 수 있음)'
  if (j.n === 0) return { status: 'pass', value: `0(세대 행 ${j.rows} · 전세 월세 NULL ${j.jeonse})`, rule }
  return { status: 'warn', value: `${j.n}행: ${j.ids.slice(0, 5).join(', ')} — 월세 칸 빠짐 · 화면이 「월세없음」으로 말할 수 있음`, rule }
}

// ㉖ 회차 거르기 빠짐 감시(2026-10-29 · 우편함 「코드·운영 — 런칭 뒤 묶음」 2ⓐ · 백로그 「회차 거르기 규칙을 한 벌로」 ③ · 조사 10-27 ⑦).
//    열린 카드(목록 RPC 대표 · apply_end ≥ 오늘 KST · 제목 조기 마감 아님)의 묶음에서 다른 회차 ID(get_announcement_round_ids same_round 거짓)에
//    경로 행(announcement_apply_routes) 또는 서류 정책 행(category ~ 서류|증명서 — 관리 탭 zfChkDocRows 와 같은 거름)이 있는 카드.
//    그 카드들에서는 화면이 회차를 걸러야 한다 — 거르기를 빠뜨린 새 화면이 생기면 여기 카드에서 지난 회차 날짜·서류가 드러난다(2026-10-27 G3 · 관리 탭 서류 · 카드 1층 📅).
//    🔴 데이터가 틀린 것이 아니다(지난 회차 산물은 그 ID 에 맞게 산다) — ⚠️ 경고만 · gate.mjs HARD 밖 · 못 읽으면 ⚠️ 점검 불능.
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
  const rule = '0 — 열린 카드 묶음의 다른 회차 ID(get_announcement_round_ids)에 경로 행 또는 서류 정책 행 · 넘으면 ⚠️ 경고만(화면이 회차를 걸러야 하는 카드 — 데이터 오류 아님)'
  const ids = [...new Set([...(j.route || []), ...(j.doc || [])])]
  if (!ids.length) return { status: 'pass', value: `0(열린 카드 ${j.cards} · 다른 회차 ID 있는 카드 ${j.other_cards})`, rule }
  return { status: 'warn', value: `${ids.length}: 경로 ${j.route.length}(${j.route.slice(0, 5).join(', ')}) · 서류 ${j.doc.length}(${j.doc.slice(0, 5).join(', ')}) — 화면 회차 거르기가 받쳐야 하는 카드`, rule }
}
