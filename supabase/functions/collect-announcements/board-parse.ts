// 지방공사 게시판 상세 — 첨부 목록 파싱(순수 함수 · DB 없음).
// index.ts 와 단위 시험(scripts/board-parse.test.mjs — node 가 .ts 를 그대로 읽는다)이 함께 쓴다. 🔴 여기서 supabase 를 부르지 않는다.

export type BoardFile = { url: string; label: string; filename: string }

export const decodeEntities = (s: string): string =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
   .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
   .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')

// 제주특별자치도개발공사 게시판 상세(2026-10-22 · 우편함 「코드·운영 — A(G2): 지방공사 게시판 첨부 목록에 제주개발공사 더하기 …」 2) —
//   `/open/news/notice.htm?act=view&seq=S`(UTF-8). 본문 아래 `<p class="info"><span><strong>· 첨부 #N : </strong>
//   <a href="/open/news/notice.htm?act=download&amp;seq=S&amp;no=N"><i …></i> 이름 (18  MBytes)</a>` (2026-10-22 seq=24224 실물).
// 🔴 같은 쪽 아래 공지 목록에도 글마다 `act=download&seq=<다른 글>&no=1` 링크가 섞인다(24224 실물 19개 + 이 글 자신 1개) —
//   「· 첨부 #N :」 머리 바로 뒤 링크만 읽고, 그 링크의 seq 가 글 주소의 seq 와 같고 no 가 N 과 같은 것만 남긴다.
// 🔴 이름은 게시판이 보여 주는 글자 그대로(앞 번호 「1. 」 포함) — 끝의 크기 표시 「(18  MBytes)」만 뗀다. 못 읽으면 null(쓰지 않는다).
export function parseJpdcFiles(html: string, base: string): BoardFile[] | null {
  let b: URL
  try { b = new URL(base) } catch { return null }
  const seq = b.searchParams.get('seq')
  if (!seq) return null
  const out: BoardFile[] = []
  const seen = new Set<string>()
  const re = /·\s*첨부\s*#(\d+)\s*:\s*<\/strong>\s*<a\s[^>]*href="([^"]*act=download[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    let u: URL
    try { u = new URL(decodeEntities(m[2]), b) } catch { continue }
    if (u.hostname !== b.hostname || u.searchParams.get('act') !== 'download') continue
    if (u.searchParams.get('seq') !== seq || u.searchParams.get('no') !== m[1]) continue
    const label = decodeEntities(m[3].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
      .replace(/\s*\(\s*[\d.,]+\s*[KMG]?Bytes\s*\)$/i, '').trim()
    if (!label || seen.has(u.toString())) continue
    seen.add(u.toString())
    out.push({ url: u.toString(), label, filename: label })
  }
  return out.length ? out : null
}

// 첨부 구역 하나를 자른다 — 머리 표지(class 이름)부터 그 뒤 첫 </ul> 까지. 없으면 null.
const fileSection = (html: string, markers: string[]): string | null => {
  for (const mk of markers) {
    const start = html.indexOf(mk)
    if (start < 0) continue
    const end = html.indexOf('</ul>', start)
    return html.slice(start, end < 0 ? undefined : end)
  }
  return null
}

// 🔵 2026-10-26(우편함 「코드·운영 — 지방공사 받기 …」 ⓒ) 광주광역시도시공사 게시판 상세 — `/board.es?mid=…&bid=B&act=view&list_no=L`.
//   본문 아래 `<div class="file"><strong class="title">첨부파일</strong><ul class="list"><li>…<a href="/boardDownload.es?bid=B&list_no=L&seq=N">이름</a>
//   <span class="txt">(크기 / 다운로드 N회)</span> …` (2026-10-26 list_no=19505 실물 — 첨부 2). 같은 <li> 안에 미리보기·바로듣기가
//   같은 받기 주소를 onclick 으로 다시 부른다 — <li> 마다 첫 href 하나만 읽는다.
// 🔴 받기 주소의 bid · list_no 가 글 주소와 같은 것만 남긴다(다른 글 받기 링크가 섞여도 거른다). 이름은 링크 글자 그대로.
export function parseGmccFiles(html: string, base: string): BoardFile[] | null {
  let b: URL
  try { b = new URL(base) } catch { return null }
  const bid = b.searchParams.get('bid'), listNo = b.searchParams.get('list_no')
  if (!bid || !listNo) return null
  const seg = fileSection(html, ['<div class="file">'])
  if (!seg) return null
  const out: BoardFile[] = []
  const seen = new Set<string>()
  for (const li of seg.split(/<li[\s>]/i).slice(1)) {
    const m = li.match(/<a\s[^>]*href="([^"]*boardDownload\.es\?[^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!m) continue
    let u: URL
    try { u = new URL(decodeEntities(m[1]), b) } catch { continue }
    if (u.hostname !== b.hostname || u.pathname !== '/boardDownload.es') continue
    if (u.searchParams.get('bid') !== bid || u.searchParams.get('list_no') !== listNo || !u.searchParams.get('seq')) continue
    const label = decodeEntities(m[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (!label || seen.has(u.toString())) continue
    seen.add(u.toString())
    out.push({ url: u.toString(), label, filename: label })
  }
  return out.length ? out : null
}

// 🔵 2026-10-26(같은 우편함 ⓑ) 경상북도개발공사 · 경상남도개발공사 — 같은 CMS. 상세 `/boardview/boardview.do?…&BBS_ID=…&IPDS_IDX=…`.
//   첨부 구역(경북 `class="atch-file"` · 경남 `class="board-view-file"`) 안 <li> 마다 받기 주소
//   `/common/download.do?fileVirtualPath=/privatefiles/<board|BOARD|BBS>/<폴더>/<파일>&fileOrgName=<이름>`이
//   onclick(pdfViewr 넷째 인자) · href · 버튼 location.href 로 두세 번 나온다(2026-10-26 경북 IPDS 11c991e5… 6 · 경남 0f9007e7… 3 · F7054C80… 3 실물).
// 🔴 폴더는 글(IPDS_IDX — 경북 · 경남 일부)이거나 게시판(BBS_ID — 경남 일부)이다 — 폴더가 글 주소의 둘 중 하나와 같은 것만 남긴다
//   (대소문자 무시 · 다른 게시판·글의 받기 주소가 섞여도 거른다). 이름은 fileOrgName(게시판이 보여 주는 글자와 같음).
export function parseCmsDownloadFiles(html: string, base: string): BoardFile[] | null {
  let b: URL
  try { b = new URL(base) } catch { return null }
  const ids = [b.searchParams.get('IPDS_IDX'), b.searchParams.get('BBS_ID')].filter(Boolean).map(s => s!.toLowerCase())
  if (!ids.length) return null
  const seg = fileSection(html, ['class="atch-file"', 'class="board-view-file"'])
  if (!seg) return null
  const out: BoardFile[] = []
  const seen = new Set<string>()
  for (const li of seg.split(/<li[\s>]/i).slice(1)) {
    // 🔴 앞에 붙은 「https://호스트」까지 함께 잡는다 — 경로만 떼면 남의 호스트 링크가 이 글 호스트로 붙는다(단위 시험이 잡은 구멍).
    for (const m of li.matchAll(/((?:https?:)?(?:\/\/[^/'"\s]+)?\/common\/download\.do\?fileVirtualPath=[^'"\s]+)/gi)) {
      let u: URL
      try { u = new URL(decodeEntities(m[1]), b) } catch { continue }
      if (u.hostname !== b.hostname) continue
      const vp = u.searchParams.get('fileVirtualPath') ?? ''
      const dir = vp.split('/').filter(Boolean)
      // /privatefiles/<board>/<폴더>/<파일>
      if (dir.length !== 4 || dir[0].toLowerCase() !== 'privatefiles' || !ids.includes(dir[2].toLowerCase())) continue
      const label = (u.searchParams.get('fileOrgName') ?? '').replace(/\s+/g, ' ').trim()
      if (!label || seen.has(vp)) continue
      seen.add(vp)
      out.push({ url: u.toString(), label, filename: label })
      break   // <li> 하나 = 파일 하나 — 같은 주소가 두세 번 나온다
    }
  }
  return out.length ? out : null
}
