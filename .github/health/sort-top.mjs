// 정렬마다 위 10장 순서(2026-11-25 · 우편함 「코드·운영 — 스물두째」 3 · 백로그 「승인된 점검 항목 셋」 ③) — 화면 정렬이 정렬 키 순서와 같은가.
//   재료: 화면 쪽은 그 정렬로 선 목록(noticeFiltered — 보이는 카드 집합과 차례) · 기대 쪽은 같은 집합을 DB 가격 요약 값으로 따로 줄 세운 것.
//   키 = 화면 index.html noticeSortCmp 와 같은 재료(가격 요약 deposit_min · rent_min · area_max · rent_per_sqm_med(round_state current 만)) · 빈 값은 뒤(nullLast).
//   열린/마감 묶음 가름은 기본 거름(마감 숨김)에서 모두 열린 카드라 보지 않는다. 같은 값(동률)은 차례를 따지지 않고 값 줄만 견준다.
//   최신·마감 임박·접수 시작 정렬은 키가 화면 판정(zfNoticeDate · zfDeadline — 경로 창 · 정정일)에 묶여 DB 로 따로 셀 수 없어 이 점검 밖이다.
export const SORT_OPTS = [
  ['deposit-asc', 'deposit_min', false, '보증금 낮은순'],
  ['rent-asc', 'rent_min', false, '월임대료 낮은순'],
  ['area-desc', 'area_max', true, '전용면적 넓은순'],
  ['sqm-asc', 'sqm', false, '㎡당 월세 낮은순'],
]
export const keyOf = (row, k) => {
  if (!row) return null
  const v = k === 'sqm' ? (row.round_state === 'current' ? row.rent_per_sqm_med : null) : row[k]
  return v === null || v === undefined ? null : Number(v)
}
// got = {opt: {set:[id…], top:[id…]}} · rows = Map(id → 가격 요약 행) → {bad:[글], seen:{opt: n}}
export function judgeSortTop(got, rows, n = 10) {
  const bad = [], seen = {}
  for (const [opt, k, desc, label] of SORT_OPTS) {
    const g = got[opt]
    if (!g) { bad.push(`${label}: 화면 값 없음`); continue }
    const want = [...g.set].map(id => keyOf(rows.get(id), k))
      .sort((a, b) => a === null ? (b === null ? 0 : 1) : b === null ? -1 : desc ? b - a : a - b).slice(0, n)
    const have = g.top.slice(0, n).map(id => keyOf(rows.get(id), k))
    seen[opt] = have.length
    const i = want.findIndex((w, j) => w !== have[j])
    if (i >= 0 || want.length !== have.length)
      bad.push(`${label}: ${i + 1}째 화면 ${g.top[i] ?? '-'}(${have[i] ?? '빈 값'}) ↔ 기대 값 ${want[i] ?? '빈 값'}`)
  }
  return { bad, seen }
}
