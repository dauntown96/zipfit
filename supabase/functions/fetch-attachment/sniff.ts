// 원문 대신 온 HTML 쪽 가리기(2026-11-03 첫 판 · 2026-11-11 우편함 「코드·운영 — 0장 여섯 …」 1에서 넓힘 · 단위 시험 sniff.test.mts).
//   🔴 2026-11-11 빈틈: LH 오류 쪽(errorFile.do · 2,621B · text/html)은 `<script` 로 시작해 종전 판정(`<!doctype html` · `<html` 머리만)을 비켜 갔다 —
//      그림으로 받혀 문지기 결과 ok · 연속 차단 감지도 비켜 감(역전파 7회차).
//   판정(앞 512B를 UTF-8로 풀어 BOM·공백을 걷은 앞 64자 · 소문자):
//     ① 머리가 `<!doctype html` · `<html` · `<head` · `<body` · `<script` · `<meta` · `<title` 이면 HTML.
//     ② 응답 content-type 이 text/html 이고 머리가 `<` 로 시작하면(`<?xml` 제외 — 그것은 nexacro 거름 몫) HTML.
//     ③ BOM 바로 뒤가 `<` 이면 HTML(문서 파일은 BOM 으로 시작하지 않는다).
//   🔴 content-type 만으로는 막지 않는다 — 옛 서버가 hwp·pdf 를 text/html 로 내보내는 꼴이 있다(바이트 머리가 `<` 가 아니라 막히지 않는다).
//   실제 첨부(pdf %PDF · hwp D0CF · hwpx/zip/xlsx PK · jpg FFD8 · png 89504E47 · gif GIF8)는 `<` 로 시작하지 않는다 · svg 는 `<svg`·`<?xml` 이라 ①·②에 안 걸린다(②는 text/html 일 때만).
const HTML_HEADS = ['<!doctype html', '<html', '<head', '<body', '<script', '<meta', '<title']

export const looksLikeHtml = (bytes: Uint8Array, contentTypeHtml = false): boolean => {
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 512))   // TextDecoder 는 UTF-8 BOM 을 걷는다
  const head = raw.replace(/^[\uFEFF\s]+/, '').slice(0, 64).toLowerCase()
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  if (bom && head.startsWith('<') && !head.startsWith('<?xml')) return true
  if (HTML_HEADS.some(h => head.startsWith(h))) return true
  if (contentTypeHtml && head.startsWith('<') && !head.startsWith('<?xml')) return true
  return false
}

export const isContentTypeHtml = (ct: string | null): boolean => /^\s*text\/html\b/i.test(ct ?? '')
