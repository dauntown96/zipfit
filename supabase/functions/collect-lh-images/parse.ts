// LH 공고 페이지 「단지 관련 이미지 정보」 — 페이지 HTML 파싱(순수 함수 · DB 없음 · 네트워크 없음).
// index.ts 와 로컬 시험(컨테이너 node --experimental-strip-types)이 함께 쓴다. 🔴 여기서 supabase 를 부르지 않는다.
//
// 페이지 구조(2026-10-02 실측 · 고령다산2 …0746 · 전주·완주 …0733 · 마산중리1 …0692 · 양산 …0825):
//   ① 평면도 탭 — 인라인 스크립트 한 줄 `var wrtancFloorplan = JSON.parse('[[{…},…],[…]]');`
//      바깥 배열 = 단지 탭 순서 · 안쪽 = 형별 평면도 {sbdLgoNo, htyNna(형 표기), cmnAhflNm, cmnAhflSn, cmnAhflSz, lsSplInfUplFlDsCdNm:'평면도'}.
//      같은 꼴의 주석 줄(`// var wrtancFloorplan = …`)이 앞에 있다 — 주석은 읽지 않는다.
//   ② 나머지 이미지 탭(단지조감도·단지배치도·동호배치도·위치도·카다로그·기타) — onClickPlanTab 안의
//      `list.push("{cmnAhflSn=…, sbdLgoNo=…, …, cmnAhflNm=…, cmnAhflSz=…, lsSplInfUplFlDsCdNm=…}");` (Java Map 문자열).
//      같은 목록이 onchangeImageTab 에 객체 꼴로 한 번 더 나온다 — 문자열 꼴만 읽는다.
//      sbdLgoNo 가 같은 두 단지 탭은 같은 파일을 두 번 싣는다(…0733 완주봉동 7장) — (sbdLgoNo, cmnAhflSn)으로 한 번만 센다.
//   받기: GET /lhapply/lhFile.do?fileid=<cmnAhflSn> (페이지 다운로드 버튼과 같은 경로) — 🔴 수집은 받지 않는다(목록만).
//   상세 API dsSbdAhfl 은 이 목록과 같지 않다(고령다산2 36·51형 평면도가 API에 없다 — 2026-09-29 실측). 그래서 페이지를 읽는다.

export type ComplexImage = {
  sbd_lgo_no: string
  tab: '평면도' | '이미지'
  tab_index: number | null     // 평면도만 — wrtancFloorplan 바깥 배열 순서
  file_sn: number
  file_name: string
  file_kind: string | null     // lsSplInfUplFlDsCdNm 원문
  hty_nna: string | null       // 평면도 형 표기 원문(36형 · 46A · 51 …)
  file_size: number | null
}

export type ParseResult = { pageOk: boolean; floorplanLine: boolean; files: ComplexImage[] }

// JS 홑따옴표 문자열 본문 → 실제 문자열(\' \" \\ \/ 만 푼다 — 그 밖의 역슬래시는 JSON 이 읽게 둔다).
function unescapeJsSingle(s: string): string {
  return s.replace(/\\(['"\\/])/g, (m, c) => (c === '\\' ? '\\\\' : c))
}

const num = (v: unknown): number | null => {
  if (v == null || v === '' || v === 'null') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' && v !== 'null' ? v : null)

export function parseComplexImages(html: string): ParseResult {
  const pageOk = html.includes('selectWrtancInfo') || html.includes('wrtancFloorplan')
  const out: ComplexImage[] = []
  const seen = new Set<string>()
  const push = (f: ComplexImage) => {
    const k = `${f.sbd_lgo_no}|${f.file_sn}`
    if (seen.has(k)) return
    seen.add(k)
    out.push(f)
  }
  let floorplanLine = false
  for (const line of html.split('\n')) {
    const m = /^\s*var\s+wrtancFloorplan\s*=\s*JSON\.parse\('(.*)'\);?\s*$/.exec(line)
    if (!m) continue
    floorplanLine = true
    const tabs = JSON.parse(unescapeJsSingle(m[1])) as Record<string, unknown>[][]
    if (!Array.isArray(tabs)) throw new Error('wrtancFloorplan 이 배열이 아니다')
    tabs.forEach((tab, ti) => {
      if (!Array.isArray(tab)) return
      for (const f of tab) {
        const sn = num(f.cmnAhflSn)
        const name = str(f.cmnAhflNm)
        if (!sn || !name) continue                       // 빈 탭 자리({}) — 페이지도 「이미지가 없습니다」
        push({
          sbd_lgo_no: str(f.sbdLgoNo) ?? '', tab: '평면도', tab_index: ti, file_sn: sn, file_name: name,
          file_kind: str(f.lsSplInfUplFlDsCdNm), hty_nna: str(f.htyNna), file_size: num(f.cmnAhflSz),
        })
      }
    })
    break
  }
  for (const m of html.matchAll(/list\.push\("\{(cmnAhflSn=[^"]*)\}"\);/g)) {
    const kv: Record<string, string> = {}
    for (const part of m[1].split(/, (?=[A-Za-z]+=)/)) {
      const i = part.indexOf('=')
      if (i > 0) kv[part.slice(0, i)] = part.slice(i + 1)
    }
    const sn = num(kv.cmnAhflSn)
    const name = str(kv.cmnAhflNm)
    if (!sn || !name) continue
    push({
      sbd_lgo_no: str(kv.sbdLgoNo) ?? '', tab: '이미지', tab_index: null, file_sn: sn, file_name: name,
      file_kind: str(kv.lsSplInfUplFlDsCdNm) ?? str(kv.ahflDesc), hty_nna: null, file_size: num(kv.cmnAhflSz),
    })
  }
  return { pageOk, floorplanLine, files: out }
}
