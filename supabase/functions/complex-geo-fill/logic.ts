// complex-geo-fill 의 순수 규칙(2026-11-17 · 우편함 「코드·운영 — 2장 …」 본 2) — 바깥 호출 없음 · 단위 시험 logic.test.mts.
// 규칙의 근거는 docs/jibun-to-road.md(2026-11-16 실측 · claude.ai 판정):
//   키워드 = 원 주소에서 동·호수 · 「번지」 · 「일원」 · 겹친 낱말만 걷고 쉼표 뒤(둘째 지번)는 버린다.
//   「정확」 = 결과의 법정동(리)·본번·부번·산 여부가 원 주소와 같은 것(지번 꼴) · 도로명·건물번호가 같은 것(도로명 꼴) · 시군구 이름이 원 주소에 있는 것.
//   여러 결과 고르기 = 원문 단지명(세대 행 building_name · 공고 제목)과 juso 건물명이 맞는 것 → 아니면 건축HUB newPlatPlc 와 같은 것 → 둘 다 못 고르면 비움(사람 판정).

export type JusoRow = {
  roadAddr?: string; roadAddrPart1?: string; jibunAddr?: string; siNm?: string; sggNm?: string; emdNm?: string; liNm?: string
  rn?: string; buldMnnm?: string; buldSlno?: string; udrtYn?: string; mtYn?: string; lnbrMnnm?: string; lnbrSlno?: string
  admCd?: string; rnMgtSn?: string; bdMgtSn?: string; bdNm?: string
}

const SIDO = new Set(['서울특별시', '서울시', '서울', '부산광역시', '부산', '대구광역시', '대구', '인천광역시', '인천', '광주광역시', '광주',
  '대전광역시', '대전', '울산광역시', '울산', '세종특별자치시', '세종', '경기도', '경기', '강원특별자치도', '강원도', '강원', '충청북도', '충북',
  '충청남도', '충남', '전북특별자치도', '전라북도', '전북', '전라남도', '전남', '전남광주통합특별시', '경상북도', '경북', '경상남도', '경남',
  '제주특별자치도', '제주도', '제주'])

// 원 주소 → juso 키워드(원문은 그대로 두고 부르는 글자만 만든다).
export const keywordOf = (addr: string): string => {
  let s = (addr ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/,.*$/, '')                                  // 쉼표 뒤(둘째 지번) 버림
  const out: string[] = []
  for (let t of s.split(' ')) {
    t = t.replace(/번지$/, '')
    if (!t || t === '일원') continue
    if (/^[0-9]+동$/.test(t) || /^[0-9]+호$/.test(t) || /^[0-9]+층$/.test(t)) continue   // 동·호수
    if (out.includes(t)) continue                             // 겹친 낱말
    out.push(t)
  }
  return out.join(' ')
}

// 첫 토큰이 시도가 아닌데 「…도」로 끝나면(원문 오탈자 시도 — 「강원특별차지도」) 그 토큰을 뺀 키워드(결과 0일 때 한 번만 쓴다).
export const keywordWithoutBadSido = (kw: string): string | null => {
  const t = kw.split(' ')
  if (t.length < 3 || SIDO.has(t[0]) || !/도$/.test(t[0])) return null
  return t.slice(1).join(' ')
}

type Parsed = { dong?: string; mt?: boolean; bun?: number; ji?: number; road?: string; bn?: number; bs?: number }
export const parseAddr = (kw: string): Parsed => {
  const p: Parsed = {}
  const j = kw.match(/(?:^|\s)([가-힣0-9]+(?:동|리|가))\s+(산\s?)?([0-9]+)(?:-([0-9]+))?(?:\s|$)/)
  if (j) { p.dong = j[1]; p.mt = !!j[2]; p.bun = Number(j[3]); p.ji = j[4] ? Number(j[4]) : 0 }
  const r = kw.match(/(?:^|\s)([가-힣A-Za-z0-9]+(?:로|길))\s?((?:[0-9]+번?(?:길|로))?)\s?([0-9]+)(?:-([0-9]+))?(?:\s|$)/)
  if (r) { p.road = r[1] + r[2]; p.bn = Number(r[3]); p.bs = r[4] ? Number(r[4]) : 0 }
  return p
}

const normDong = (s: string) => s.replace(/[0-9]+/g, '').replace(/제(?=동$)/, '')

export const isExact = (addr: string, kw: string, j: JusoRow): boolean => {
  const sgg = (j.sggNm ?? '').trim()
  if (sgg && !sgg.split(/\s+/).every(w => addr.includes(w))) return false
  const p = parseAddr(kw)
  if (p.dong != null) {
    const d = normDong(p.dong)
    const names = [j.emdNm, j.liNm].filter(Boolean).map(x => normDong(String(x)))
    if (names.includes(d) && Number(j.lnbrMnnm) === p.bun && Number(j.lnbrSlno ?? 0) === p.ji && String(j.mtYn ?? '0') === (p.mt ? '1' : '0')) return true
  }
  if (p.road != null) {
    if ((j.rn ?? '').replace(/\s/g, '') === p.road && Number(j.buldMnnm) === p.bn && Number(j.buldSlno ?? 0) === p.bs) return true
  }
  return false
}

// 같은 건물 줄이 겹치면 하나로(도로명 + 건물번호).
export const roadKeyOf = (j: JusoRow) => `${(j.rn ?? '').replace(/\s/g, '')} ${Number(j.buldMnnm)}${Number(j.buldSlno ?? 0) ? '-' + Number(j.buldSlno) : ''}`
export const exactCandidates = (addr: string, kw: string, rows: JusoRow[]): JusoRow[] => {
  const seen = new Set<string>(); const out: JusoRow[] = []
  for (const j of rows) {
    if (!isExact(addr, kw, j)) continue
    const k = roadKeyOf(j)
    if (seen.has(k)) continue
    seen.add(k); out.push(j)
  }
  return out
}

const normName = (s: string) => (s ?? '').replace(/\([^)]*\)/g, '').replace(/[\s·.,\-_]/g, '').trim()
// 이름 고르기: 건물명이 원문 이름 하나와 맞는(어느 쪽이 다른 쪽을 품는) 후보가 정확히 하나면 그것.
export const pickByName = (cands: JusoRow[], names: string[]): JusoRow | null => {
  const ns = names.map(normName).filter(x => x.length >= 2)
  if (!ns.length) return null
  const hit = cands.filter(c => { const b = normName(c.bdNm ?? ''); return b.length >= 2 && ns.some(n => n.includes(b) || b.includes(n)) })
  return hit.length === 1 ? hit[0] : null
}
// 건축HUB 고르기: 표제부 newPlatPlc(도로명 주소) 안에 후보의 「도로명 건물번호」가 있는 후보가 정확히 하나면 그것.
export const pickByBldhub = (cands: JusoRow[], newPlatPlcs: string[]): JusoRow | null => {
  const ps = newPlatPlcs.map(x => (x ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (!ps.length) return null
  const hit = cands.filter(c => {
    const no = `${Number(c.buldMnnm)}${Number(c.buldSlno ?? 0) ? '-' + Number(c.buldSlno) : ''}`
    const rn = (c.rn ?? '').replace(/\s/g, '')
    return ps.some(p => new RegExp(`(^|\\s)${rn}\\s${no}(\\s|$)`).test(p))
  })
  return hit.length === 1 ? hit[0] : null
}

// GRS80 UTM-K(EPSG:5179) → WGS84(위도·경도) — 횡축 메르카토르 역변환(Snyder). GRS80 과 WGS84 타원체 차이는 mm 단위라 무시.
export const utmkToWgs84 = (x: number, y: number): { lat: number; lng: number } => {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996
  const lat0 = 38 * Math.PI / 180, lon0 = 127.5 * Math.PI / 180, FE = 1_000_000, FN = 2_000_000
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const M = (p: number) => a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p))
  const m = M(lat0) + (y - FN) / k0
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5
  const D = (x - FE) / (N1 * k0)
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720)
  const lng = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(p1)
  return { lat: lat * 180 / Math.PI, lng: lng * 180 / Math.PI }
}

// 🔵 2026-11-22(우편함 「코드·운영 — 셋째 묶음」 A 1) — 단지 단위 키워드 = 시도 + 시군구 + road_key 의 도로명·번호(앞 약칭 시도 뺌).
//   조사 「단지 좌표」(docs/complex-geo-sample.md B 갈래 — 표본 100 중 road_key 키워드로 정확 100/100)와 같은 꼴.
export const keywordOfComplex = (sido: string | null, sgg: string | null, roadKey: string): string => {
  const t = (roadKey ?? '').trim().split(/\s+/)
  const road = t.length >= 3 ? t.slice(1).join(' ') : t.join(' ')
  return [sido, sgg, road].map(x => (x ?? '').trim()).filter(Boolean).join(' ')
}
