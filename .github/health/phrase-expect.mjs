// 카드 요약 자리 문구 갈래 — DB 로 따로 셈하는 식(2026-11-25 · 우편함 「코드·운영 — 스물두째」 1 · #1283).
// 🔴 정본은 화면이다 — index.html zfFillSummarySlots 의 차례: 닫힌 간단 줄 → 「분석 중」(zfAnaPending) → 가격 요약 줄 → 같은 게시물 링크 → 빈 칸 안내.
//    zfAnaPending = analysis_done === false ∧ has_attachments !== false ∧ 같은 게시물 링크 없음(zfPostLinkOrganized === null).
//    종전 점검 식은 「가격이 있으면 요약」을 「분석중」보다 먼저 봐서, 묶음 형제(지난 회차)의 세대 값이 있는 분석 전 카드를 「요약」으로 기대했다
//    (가격 요약은 묶음 전체 값에 round_state 이름표만 붙인다 — 2026-11-25 …21054·…21055 · 화면이 맞다).
//    화면 차례를 바꾸면 이 파일도 같은 PR 에서 바꾼다(원칙 33 판정표) · 시험 node .github/health/phrase-expect.test.mjs
// p = get_announcement_price_summary 행 별칭 · link = 「같은 게시물 링크가 있다」 SQL 불리언(부르는 쪽마다 카드 제목을 쥔 꼴이 다르다)
export const anaPendingSql = (p, link) =>
  `(${p}.analysis_done is false and ${p}.has_attachments is not false and not ${link})`

export const phraseCaseSql = (p, link) => `case when ${p}.announcement_id is null then '빈칸'
             when ${anaPendingSql(p, link)} then '분석중'
             when ${p}.deposit_min is not null or ${p}.rent_min is not null or ${p}.area_min is not null then '요약'
             when ${link} then '④링크'
             when ${p}.analysis_done then '목록없음'
             when ${p}.has_attachments = false then '링크만'
             when ${p}.analysis_done is false then '분석중'
             else '미정리' end`
