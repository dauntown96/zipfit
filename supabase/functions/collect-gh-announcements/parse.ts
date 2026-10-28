// GH(경기주택도시공사) 청약센터 목록·상세 HTML 파서 — collect-gh-announcements 가 쓴다(재현 시험: node scripts/gh-parse.test.mjs).
//
// 🔵 2026-10-28(우편함 「코드·운영(브랜치만 · 병합 0) — GH 수집기 …」) — 실물 HTML(apply.gh.or.kr · 2026-10-28 받음)로 짠 꼴.
//   목록: /sb/sr/<board>/selectPbancRentHouseList.do — 표 칸 [번호 · 유형 · 공고명 · 지역 · 첨부 · 게시일 · 마감일 · 상태 · 경쟁률 · 조회수].
//         🔴 「번호」 칸은 페이지 안 행 번호(1~10)다 — 식별자는 공고명 <a> 의 data-pbancNo(게시글 ID)다(SH seq 두 종류 선례 · ⑧ 2026-08-19).
//         ⚠️ 일부 <td> 는 닫는 태그가 없다(지역 · 마감일 · 상태 칸) — 그래서 칸을 「<td」 로 가른다.
//   상세: /sb/sr/<board>/selectPbancDetailView.do (GET·POST 모두 200 — previewYn · pbancNo · pbancKndCd · bizTyNm)
//         공고문 첨부 = apply-cdn.gh.or.kr/sr/<board>/selectFileDown.do?… 링크 · 지구 탭마다 「공급일정」 목록(온라인·현장 접수기간 · 당첨자발표일).
// 🔴 짓지 않는다 — 접수 창은 상세의 「…접수기간 : 시작 ~ 끝」 줄이 **하나의 날짜 창으로 읽힐 때만** 낸다(지구 24개 · 온라인·현장이 같은 창이면 하나).
//   끝이 비었거나(「2026.09.01 09:00 ~」 연천 기숙사 811) 창이 둘 이상이면 null — 틀린 날짜보다 빈 날짜(SH parse.ts 와 같은 축).

export type GhBoard = 'sr7150' | 'sr7155'

export type GhListRow = {
  board: GhBoard
  pbancNo: string
  pbancKndCd: string      // 01 = 본공고 · 02 = 정정공고(목록 실측 — 788 · 778 · 770 이 02)
  bizTyNm: string
  previewYn: string
  type: string | null     // 유형 칸(행복주택 · 국민임대 · 장기전세 · 통합공공임대 · 공공임대 · 매입임대)
  title: string
  area: string | null     // 지역 칸 원문 — 🔴 공고 단위 지역이 아니다(지구 24개인 839 가 「성남시」) · 칸 그대로 둔다
  announceDate: string | null
  closeDate: string | null // 마감일 칸 — 「-」 는 null(운영기관 상시 접수 등)
  status: string           // 상태 칸 원문 — 「-」 는 ''
}

export type GhFile = { url: string; label: string; filename: string; bytes: number | null }
export type Window = { start: string; end: string }
export type GhDetail = {
  title: string | null
  status: string | null
  type: string | null
  announceDate: string | null
  files: GhFile[] | null
  windows: { kind: string; raw: string }[]   // 「…접수기간」 줄 원문(지구 탭마다 · 중복 포함)
  winnerRaw: string[]                        // 「당첨자발표일」 줄 원문
  addresses: string[]                        // 지구별 소재지 원문
}

export const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&#0*39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const text = (s: string) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const dash = (s: string | null | undefined) => { const t = (s ?? '').trim(); return t === '-' ? '' : t }
const ymd = (s: string | null | undefined): string | null => {
  const m = (s ?? '').match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}

/** 마지막 쪽 번호 — 「맨끝으로」 링크의 data-page. 없으면 쪽 링크 최대치 · 그것도 없으면 1. */
export function parseTotalPages(html: string): number {
  const last = html.match(/data-page="(\d+)"[^>]*>(?:(?!<\/a>)[\s\S])*맨끝으로/)
  if (last) return Math.max(1, parseInt(last[1]))
  const nums = [...html.matchAll(/data-page="(\d+)"/g)].map(m => parseInt(m[1]))
  return nums.length ? Math.max(1, ...nums) : 1
}

export function parseList(html: string, board: GhBoard): GhListRow[] {
  const h = html.replace(/<!--[\s\S]*?-->/g, '')
  const tb = h.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
  if (!tb) return []
  const out: GhListRow[] = []
  for (const trM of tb[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tr = trM[1]
    const a = tr.match(/<a\b([^>]*\bdata-pbancNo="(\d+)"[^>]*)>([\s\S]*?)<\/a>/i)
    if (!a) continue   // 「등록된 공고가 없습니다」 같은 행
    const attr = (k: string) => (a[1].match(new RegExp(`data-${k}="([^"]*)"`, 'i')) ?? [, ''])[1] ?? ''
    const cells = tr.split(/<td\b[^>]*>/i).slice(1).map(text)
    if (cells.length < 8) continue
    const title = text(a[3])
    if (!title) continue
    out.push({
      board, pbancNo: a[2], pbancKndCd: attr('pbancKndCd'), bizTyNm: decode(attr('bizTyNm')), previewYn: attr('previewYn') || 'N',
      type: dash(cells[1]) || null, title, area: dash(cells[3]) || null,
      announceDate: ymd(cells[5]), closeDate: ymd(cells[6]), status: dash(cells[7]),
    })
  }
  return out
}

export function parseDetail(html: string): GhDetail {
  const h = html.replace(/<!--[\s\S]*?-->/g, '')
  const th = (name: string) => {
    const m = h.match(new RegExp(`<th scope="row">${name}</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`))
    return m ? (text(m[1]) || null) : null
  }
  const files: GhFile[] = []
  for (const m of h.matchAll(/<a\s+href="(https:\/\/apply-cdn\.gh\.or\.kr\/sr\/sr715[05]\/selectFileDown\.do\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = decode(m[1])
    const t = text(m[2])
    const bm = t.match(/^(.*?)\s*\((\d+)\s*Byte\)\s*$/)
    const name = (bm ? bm[1] : t).trim()
    if (!name || files.some(f => f.url === url)) continue
    files.push({ url, label: name, filename: name, bytes: bm ? parseInt(bm[2]) : null })
  }
  const windows: { kind: string; raw: string }[] = []
  const winnerRaw: string[] = []
  for (const m of h.matchAll(/<li class="mt5">\s*<span>\s*<b>\s*([^<:]*?)\s*:\s*<\/b>([\s\S]*?)<\/span>/g)) {
    const kind = text(m[1]), raw = text(m[2])
    if (/접수기간$/.test(kind)) windows.push({ kind, raw })
    else if (/당첨자\s*발표/.test(kind)) winnerRaw.push(raw)
  }
  const addresses = [...h.matchAll(/<th scope="row">소재지<\/th>\s*<td[^>]*>\s*<span>([\s\S]*?)<\/span>/g)].map(m => text(m[1])).filter(Boolean)
  return {
    title: th('공고명'), status: th('공고상태'), type: th('유형'), announceDate: ymd(th('공고일')),
    files: files.length ? files : null, windows, winnerRaw, addresses,
  }
}

/** 상세의 접수기간 줄들이 하나의 날짜 창일 때만 창을 낸다. */
export function applyWindow(d: GhDetail): { window: Window | null; why: string } {
  if (!d.windows.length) return { window: null, why: '공급일정 접수기간 줄 없음' }
  const set = new Set<string>()
  for (const w of d.windows) {
    const m = w.raw.match(/^(\d{4}\.\d{1,2}\.\d{1,2})(?:\s+\d{1,2}:\d{2})?\s*~\s*(\d{4}\.\d{1,2}\.\d{1,2})(?:\s+\d{1,2}:\d{2})?$/)
    if (!m) return { window: null, why: `날짜 창으로 읽히지 않는 줄: ${w.kind} 「${w.raw}」` }
    const s = ymd(m[1])!, e = ymd(m[2])!
    if (e < s) return { window: null, why: `끝이 시작보다 앞: ${w.raw}` }
    set.add(`${s}~${e}`)
  }
  if (set.size !== 1) return { window: null, why: `접수 창 ${set.size}개: ${[...set].join(' · ')}` }
  const [start, end] = [...set][0].split('~')
  return { window: { start, end }, why: `${d.windows.length}줄 → 창 하나` }
}

/** 당첨자발표일 — 날짜가 하나로 읽힐 때만. */
export function winnerDate(d: GhDetail): string | null {
  const s = new Set(d.winnerRaw.map(ymd).filter((x): x is string => !!x))
  return s.size === 1 ? [...s][0] : null
}

/** 지구 소재지가 모두 같은 「경기도 <시·군>」 이면 그 시·군 — 하나가 아니면 null(지구 24개 공고 · 매입임대처럼 소재지 칸 없는 공고). */
export function sigunguOf(d: GhDetail): string | null {
  const s = new Set<string>()
  for (const a of d.addresses) {
    const m = a.match(/^경기도\s+(\S+?[시군])(?:\s|$)/)
    if (!m) return null
    s.add(m[1])
  }
  return s.size === 1 ? [...s][0] : null
}
