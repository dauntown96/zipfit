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
