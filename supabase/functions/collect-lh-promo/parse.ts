// LH 매입 공고 페이지 「홍보물」 — 페이지 HTML 파싱과 목록 호출(순수 함수 · DB 없음).
// index.ts 와 로컬 시험(컨테이너 deno)이 함께 쓴다. 🔴 여기서 supabase 를 부르지 않는다.
//
// 페이지 구조(2026-09-29 실측 · 매입 68쪽):
//   주택 행 <tr> 안에 `javascript:ahflPop('파일수','sbdLgoNo','dngHsAdmNo','aptBrndCd')` 버튼이 있다.
//   같은 버튼이 보기(표)마다 되풀이된다(htyListTb05·07·08… — 한 공고 31회 호출 = 고유 5개). 그래서 네 인자로 모은다.
//   파일 수가 '0'·빈 값이면 페이지 자신도 목록을 부르지 않는다(「등록된 홍보물이 없습니다」) — 우리도 부르지 않는다.
//   호 단위 표(htyListTb02 — 주소·동·호·층)만 있는 공고(경남 …0706 · 경기북부 …0713)에는 버튼이 아예 없다.

export const LH_ORIGIN = 'https://apply.lh.or.kr'
export const BRAND_LIST_PATH = '/lhapply/apply/wt/wrtanc/selectListAptBrndAhfInf.do'
export const ADM_LIST_PATH = '/lhapply/apply/wt/wrtanc/selectWrtancAhflInfList.do'

export type PromoButton = {
  fileCount: number
  sbdLgoNo: string
  dngHsAdmNo: string
  aptBrndCd: string
  rowAddress: string | null
}

export type PromoFile = {
  sbd_lgo_no: string
  apt_brnd_cd: string | null
  dng_hs_adm_no: string | null
  button_file_count: number
  row_address: string | null
  dng_hs_adr: string | null
  file_sn: number
  file_name: string
  file_size: number | null
  file_kind: string | null
}

const AHFL_RE = /ahflPop\('(\d*)','([^']*)','([^']*)','([^']*)'\)/g
// 도로명 주소 꼴(「… 구지로211번길 17-15 …」·「… 테크노1로 12-22 …」) — 행 칸 중 주소를 고르는 데만 쓴다.
const ROAD_ADDR_RE = /[가-힣A-Za-z0-9]+(로|길)\s*\d/

const decodeEntities = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")

function cellsOf(rowHtml: string): string[] {
  const out: string[] = []
  for (const m of rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)) {
    out.push(decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
  }
  return out
}

// 페이지 HTML → 고유 버튼 목록. rowAddress 는 그 버튼이 있는 행들 중 주소 꼴 칸(가장 긴 것).
export function parseButtons(html: string): PromoButton[] {
  const byKey = new Map<string, PromoButton>()
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = tr[1]
    if (!row.includes('ahflPop(')) continue
    const addrCells = cellsOf(row).filter(c => ROAD_ADDR_RE.test(c) && !c.includes('ahflPop'))
    const addr = addrCells.sort((a, b) => b.length - a.length)[0] ?? null
    for (const m of row.matchAll(AHFL_RE)) {
      const key = `${m[2]}|${m[3]}|${m[4]}`
      const prev = byKey.get(key)
      const cnt = Number(m[1] || 0)
      if (!prev) {
        byKey.set(key, { fileCount: cnt, sbdLgoNo: m[2], dngHsAdmNo: m[3], aptBrndCd: m[4], rowAddress: addr })
      } else if (addr && (!prev.rowAddress || addr.length > prev.rowAddress.length)) {
        prev.rowAddress = addr
      }
    }
  }
  return [...byKey.values()]
}

type ListItem = {
  cmnAhflSn?: number | string; cmnAhflNm?: string; cmnAhflSz?: number | string
  lsSplInfUplFlDsCdNm?: string; dngHsAdr?: string
}

// 버튼 하나의 목록을 부른다. 페이지 스크립트(ahflPop)와 같은 분기 · 같은 인자다.
export async function fetchButtonFiles(b: PromoButton, timeoutMs: number, ua: string): Promise<PromoFile[]> {
  const brand = b.aptBrndCd !== ''
  const body = brand
    ? new URLSearchParams({ aptBrndCd: b.aptBrndCd, sbdLgoNo: b.sbdLgoNo })
    : new URLSearchParams({ dngHsAdmNo: b.dngHsAdmNo, sbdLgoNo: b.sbdLgoNo })
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(LH_ORIGIN + (brand ? BRAND_LIST_PATH : ADM_LIST_PATH), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': ua },
      body, signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`목록 HTTP ${res.status}`)
    const j = await res.json() as { list?: ListItem[] }
    if (!j || !Array.isArray(j.list)) throw new Error('목록 응답에 list 배열이 없다')
    return j.list.map(it => ({
      sbd_lgo_no: b.sbdLgoNo,
      apt_brnd_cd: b.aptBrndCd || null,
      dng_hs_adm_no: b.dngHsAdmNo || null,
      button_file_count: b.fileCount,
      row_address: b.rowAddress,
      dng_hs_adr: typeof it.dngHsAdr === 'string' ? it.dngHsAdr : null,
      file_sn: Number(it.cmnAhflSn),
      file_name: String(it.cmnAhflNm ?? ''),
      file_size: it.cmnAhflSz == null ? null : Number(it.cmnAhflSz),
      file_kind: typeof it.lsSplInfUplFlDsCdNm === 'string' ? it.lsSplInfUplFlDsCdNm : null,
    })).filter(f => Number.isFinite(f.file_sn) && f.file_sn > 0 && f.file_name !== '')
  } finally {
    clearTimeout(t)
  }
}
