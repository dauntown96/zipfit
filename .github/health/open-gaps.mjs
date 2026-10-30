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
  const rule = '0 — 열린 묶음 세대 행 중 monthly_rent NULL ∧ deposit 있음 ∧ 그 공고 제목·유형에 「전세」 없음 · 넘으면 ⚠️ 경고만(월세 칸 빠짐 — 화면에 「확인 필요」로 보임)'
  if (j.n === 0) return { status: 'pass', value: `0(세대 행 ${j.rows} · 전세 월세 NULL ${j.jeonse})`, rule }
  return { status: 'warn', value: `${j.n}행: ${j.ids.slice(0, 5).join(', ')} — 월세 칸 빠짐 · 화면에 「확인 필요」로 보임`, rule }
}
