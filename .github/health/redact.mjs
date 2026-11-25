// 점검 글 속 비밀값 가림(2026-11-24 · 우편함 「코드·운영 — 열아홉째」 1 · 계기: 공개 저장소 이슈 #1277·#1184 본문에
//   로그인 흐름 page.goto 시간 초과 오류문이 1회용 로그인 확인 주소(…/auth/v1/verify?token=…)를 통째로 실었다).
// 꼴 = token= · access_token= · refresh_token= · apikey= 뒤 값, 「Bearer 」 뒤 값 — 값은 토큰 글자([A-Za-z0-9._~+/=%-]) 12자 이상일 때만 「***」로.
//   12자 미만 · 한글 · 낱말(「토큰 만료」 · 「Bearer 토큰」)은 그대로 — 판정 글을 바꾸지 않는다.
// 쓰는 곳: lib.mjs report()(결과 파일 · 요약 · 로그 · 작업 요약) · screen-finish.mjs(로그인 흐름 오류) · issue.sh(이슈 글 — 마지막 문).
export const SECRET_RE = /((?:access_token|refresh_token|token|apikey)=|Bearer\s+)([A-Za-z0-9._~+/=%-]{12,})/g
export const MASK = '***'
export function redactSecrets(s) {
  return String(s ?? '').replace(SECRET_RE, (_, k) => k + MASK)
}
export function countSecrets(s) {
  return (String(s ?? '').match(SECRET_RE) || []).length
}
