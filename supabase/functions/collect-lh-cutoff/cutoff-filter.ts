// LH 건설임대 당첨 합격점수(커트라인) 글자 거름 — 받는 자리에서(2026-11-04 · 우편함 「코드·운영 — LH 합격점수 수집 장치」).
// 🔴 원문 글자(PWI_PNE_SCR_CTS)에는 마지막 당첨자의 동점 처리 값(전입일자 · 세대구성원수 · 신청자연령 · 자녀 여부 …)이 섞여 온다
//    (영구임대 등 · 실응답 5년 32,593행 중 버림 562 — 2026-11-04). 그 값은 제3자 신청자 개인 값이라 저장하지 않는다(원문 보존 예외 — claude.ai 판정 2026-11-04).
// 거름 = 화이트리스트: 아래 꼴 중 하나와 글자 전체가 맞을 때만 남긴다 · 맞지 않으면 글자 전체를 버린다(조각만 지우지 않는다 —
//    지우고 남은 조각이 맞는 꼴인지 다시 보장할 길이 없고, 새 꼴(사람 속성 낱말)이 와도 저절로 버려진다).
// 거른 뒤에도 신청자 수 ≤ 5 이면 버린다(점수 하나로도 사람이 특정될 수 있다 · 신청자 수·공급호수는 남긴다).
// 같은 규칙이 DB CHECK(lh_cutoff_scores_cutoff_whitelist · _small)에도 있다 — 둘 중 하나만 고치지 않는다.

// 꼴 문법(실응답 1년 3,388행 갈래 · 숫자는 순위·점수·소득 % 뿐):
//   순위 = 「N순위」·「신혼N순위」·「무순위」 · 머리 = [소득N%이하,] ([순위,] N점 | 순위) · 괄호 = (… [소득N%이하,] 순위[, N점] 또는 N점 … 경쟁)
//   글자 = 머리 [,] [타지역] (당첨 [괄호] | (미달)) · 「(미달)」 · 괄호 하나
//   🔴 사람 속성(전입일자 · 세대구성원수 · 신청자연령 · N세미만자녀여부 · 장애의 정도 · 추천순번 · 숫자 하나뿐) 꼴은 문법 밖이라 버린다.
const RANK = '(?:신혼)?\\d{1,2}순위|무순위'
const INCOME = '(?:소득\\d{1,3}%이하,\\s*)?'
const HEAD = `${INCOME}(?:(?:(?:${RANK}),\\s*)?\\d{1,3}점|(?:${RANK}))`   // 점수 없이 순위만(「2순위 당첨 (3순위 경쟁)」 · 2021~2024 꼴)
const PAREN = `\\(${INCOME}(?:(?:${RANK})(?:,\\s*\\d{1,3}점)?|\\d{1,3}점)\\s*경쟁\\)`
export const CUTOFF_WHITELIST: RegExp[] = [
  // 「1순위, 9점 당첨 (1순위, 8점 경쟁)」 · 「소득70%이하, 신혼1순위, 5점 당첨」 · 「3순위, 1점 (미달)」 · 「2순위, 0점 , 타지역 (미달)」 · 「5점 당첨 (4점 경쟁)」
  new RegExp(`^${HEAD}\\s*,?\\s*(?:타지역\\s*)?(?:당첨(?:\\s*${PAREN})?|\\(미달\\))$`),
  // 「(미달)」
  /^\(미달\)$/,
  // 「(2순위, 3점 경쟁)」 · 「(소득70%이하, 신혼1순위 경쟁)」
  new RegExp(`^${PAREN}$`),
]
// DB CHECK 와 같은 금지 낱말(화이트리스트를 지나도 막는 두 번째 줄)
export const CUTOFF_FORBIDDEN = /(전입|연령|나이|세대구성원|자녀|여부|당해지역|당해단지|거주기간|생년|출생|장애|추천순번)/

export type CutoffVerdict = { text: string | null; reason: 'ok' | 'empty' | 'not_whitelisted' | 'small_applicants' }

export function normalizeCutoff(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

export function filterCutoff(raw: unknown, applicants: number | null): CutoffVerdict {
  const s = normalizeCutoff(raw)
  if (!s) return { text: null, reason: 'empty' }
  if (CUTOFF_FORBIDDEN.test(s) || !CUTOFF_WHITELIST.some(r => r.test(s))) return { text: null, reason: 'not_whitelisted' }
  if (applicants == null || applicants <= 5) return { text: null, reason: 'small_applicants' }
  return { text: s, reason: 'ok' }
}

// 보고용 — 숫자를 N 으로 가린 꼴(값 0). 버린 글자의 갈래를 셀 때만 쓴다.
export function maskForm(raw: unknown): string {
  return normalizeCutoff(raw).replace(/\d+/g, 'N')
}
