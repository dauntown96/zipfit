// 단지 도로명·좌표 자동 채움 Edge Function (2026-11-17 신설 · 우편함 「코드·운영 — 2장: 단지 잇기 둘째 키 + 자동 채움 장치 …」 본 2)
//
// 왜: 세대 행 주소가 지번 꼴(또는 시도 없는 도로명 꼴)이면 complex_road_key 가 NULL 이라 단지 잇기가 묶지 못한다.
//   그 주소를 juso(도로명주소 검색 · 좌표제공)로 풀어 complex_geo 에 한 행 남기면, 잇기 함수 둘째 키(complex_geo.road_address)가 단지를 잇는다.
//   2026-11-16 소급(28행)은 사람이 돌렸다 — 이 함수가 그 뒤에 새로 생기는 주소를 맡는다.
//
// 흐름(pg_cron zipfit-complex-geo-fill 매시 34분 UTC · ?mode=collect):
//   ① RPC complex_geo_targets(n) — 대상 주소(세대 행 complex_id 빈칸 ∧ 숫자 있음 ∧ 도로명 키 NULL ∧ complex_geo 에 없음 ∧ 사람 판정·결과 0 기록 없음).
//      🔴 대상 0 이면 바깥을 한 번도 부르지 않는다(juso_calls 0).
//   ② 주소마다 순차 · 간격 GAP_MS(juso 는 몰아 부르면 E0007 — 2026-11-16 실측 18건 중 5건 · 3초 간격이면 정상).
//      juso 는 EF seoul-api(서울 실행)로만 부른다 — 키는 그 함수 비밀값에서만.
//   ③ 「정확」 결과(logic.ts isExact)가 하나면 고름 · 여럿이면 원문 단지명 → 건축HUB newPlatPlc → 둘 다 못 고르면 비움 + 사람 판정(multi).
//   ④ 고른 결과의 좌표(juso_coord · UTM-K → WGS84) · RPC complex_geo_put 이 complex_geo 한 행 + 시도 기록 + 그 공고 단지 잇기를 한 트랜잭션에.
// 🔴 원문(housing_units.address)은 건드리지 않는다 · juso 값만 쓴다(source juso) · 짓는 중 택지(결과 0)는 complex_geo 에 쓰지 않고 시도 기록만(none).
// mode=dry: ①~③(바깥 호출 포함)까지만 하고 쓰지 않는다(모의 실행).

import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'
import { keywordOf, keywordWithoutBadSido, exactCandidates, pickByName, pickByBldhub, utmkToWgs84, type JusoRow } from './logic.ts'

// 코딩원칙 16번: Deno.env.get('X')! 금지.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}
const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const CRON_SECRET = requireEnv('CRON_SECRET_V2')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const MAX_PER_RUN = 6
const GAP_MS = 3_000
const JUSO_SEARCH_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do'
const JUSO_COORD_URL = 'https://business.juso.go.kr/addrlink/addrCoordApi.do'
const BLDHUB_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let calls = 0
let lastCallAt = 0
// seoul-api 한 번(순차 · 간격). 바깥 응답 몸(글)을 돌려준다.
const seoul = async (api: string, params: Record<string, string>): Promise<string> => {
  const wait = lastCallAt + GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastCallAt = Date.now(); calls++
  const q = new URLSearchParams({ api, ...params })
  const res = await fetch(`${SUPABASE_URL}/functions/v1/seoul-api?${q}`, { headers: { 'x-cron-secret': CRON_SECRET }, signal: AbortSignal.timeout(30_000) })
  const j = await res.json().catch(() => null) as { ok?: boolean; status?: number; body?: string; error?: string } | null
  if (!res.ok || !j?.ok) throw new Error(`seoul-api ${api} ${res.status} ${(j?.error ?? '').slice(0, 80)}`)
  if (j.status !== 200) throw new Error(`${api} 바깥 ${j.status}`)
  return j.body ?? ''
}
const jusoRows = (body: string): JusoRow[] => {
  const d = JSON.parse(body)
  const common = d?.results?.common ?? {}
  if (String(common.errorCode ?? '0') !== '0') throw new Error(`juso ${common.errorCode} ${String(common.errorMessage ?? '').slice(0, 60)}`)
  return Array.isArray(d?.results?.juso) ? d.results.juso : []
}
const search = async (kw: string) => jusoRows(await seoul('juso_search', { keyword: kw, countPerPage: '50', currentPage: '1' }))
const coord = async (j: JusoRow): Promise<{ x: number; y: number } | null> => {
  const rows = jusoRows(await seoul('juso_coord', { admCd: j.admCd ?? '', rnMgtSn: j.rnMgtSn ?? '', udrtYn: j.udrtYn ?? '0', buldMnnm: String(j.buldMnnm ?? ''), buldSlno: String(j.buldSlno ?? '0') })) as Array<Record<string, string>>
  const x = Number(rows[0]?.entX), y = Number(rows[0]?.entY)
  return Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 ? { x, y } : null
}
const bldhub = async (j: JusoRow): Promise<string[]> => {
  const adm = j.admCd ?? ''
  if (!/^[0-9]{10}$/.test(adm)) return []
  const body = await seoul('bldhub_title', { sigunguCd: adm.slice(0, 5), bjdongCd: adm.slice(5), platGbCd: j.mtYn === '1' ? '1' : '0',
    bun: String(Number(j.lnbrMnnm)).padStart(4, '0'), ji: String(Number(j.lnbrSlno ?? 0)).padStart(4, '0'), numOfRows: '100', pageNo: '1' })
  const d = JSON.parse(body)
  const it = d?.response?.body?.items?.item
  const arr = Array.isArray(it) ? it : it ? [it] : []
  return arr.map((x: Record<string, string>) => x.newPlatPlc).filter(Boolean)
}

type Target = { address: string; names: string[]; ann_ids: string[] }
type Outcome = { address: string; outcome: 'picked' | 'multi' | 'none' | 'error'; how?: string; total?: number; exact?: number
  candidates?: Array<Record<string, unknown>>; row?: Record<string, unknown>; note?: string; ann_ids: string[] }

const kstNow = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') + ' KST'

const solve = async (t: Target): Promise<Outcome> => {
  const base = { address: t.address, ann_ids: t.ann_ids }
  try {
    let kw = keywordOf(t.address)
    let rows = await search(kw)
    let ex = exactCandidates(t.address, kw, rows)
    if (!ex.length) {
      const kw2 = keywordWithoutBadSido(kw)
      if (kw2) { kw = kw2; rows = await search(kw); ex = exactCandidates(t.address, kw, rows) }
    }
    const brief = (j: JusoRow) => ({ roadAddr: j.roadAddr, bdNm: j.bdNm || null, jibunAddr: j.jibunAddr })
    if (!ex.length) return { ...base, outcome: 'none', total: rows.length, exact: 0, candidates: rows.slice(0, 5).map(brief), note: `juso 정확 결과 0(결과 ${rows.length}) · 키워드 「${kw}」` }
    let pick: JusoRow | null = null; let how = ''
    const used = [JUSO_SEARCH_URL, JUSO_COORD_URL]
    if (ex.length === 1) { pick = ex[0]; how = `juso 정확 결과 1건` }
    else {
      pick = pickByName(ex, t.names)
      if (pick) how = `juso 정확 결과 ${ex.length}건 중 원문 단지명 같음`
      else {
        let plcs: string[] = []
        try { plcs = await bldhub(ex[0]) } catch (e) { plcs = []; how = `건축HUB 실패(${String(e).slice(0, 40)}) · ` }
        pick = pickByBldhub(ex, plcs)
        if (pick) { how = `juso 정확 결과 ${ex.length}건 중 건축HUB newPlatPlc 같음`; used.push(BLDHUB_URL) }
        else return { ...base, outcome: 'multi', total: rows.length, exact: ex.length, candidates: ex.map(brief),
                      note: `${how}juso 정확 결과 ${ex.length}건 · 원문 단지명·건축HUB(${plcs.length})로 못 고름 — 사람 판정 · 키워드 「${kw}」` }
      }
    }
    let xy: { x: number; y: number } | null = null
    try { xy = await coord(pick) } catch { xy = null }
    const ll = xy ? utmkToWgs84(xy.x, xy.y) : null
    const row = {
      road_address: pick.roadAddr, adm_cd: pick.admCd ?? null, rn_mgt_sn: pick.rnMgtSn ?? null, bd_mgt_sn: pick.bdMgtSn ?? null,
      bd_nm: (pick.bdNm ?? '').trim() || null, udrt_yn: pick.udrtYn ?? null,
      buld_mnnm: pick.buldMnnm != null ? Number(pick.buldMnnm) : null, buld_slno: pick.buldSlno != null ? Number(pick.buldSlno) : null,
      ent_x: xy?.x ?? null, ent_y: xy?.y ?? null, lat: ll?.lat ?? null, lng: ll?.lng ?? null,
      source_url: used.join(' · '),
      note: `${how} · ${xy ? '좌표 juso_coord' : '좌표 없음'} · 자동 채움 complex-geo-fill(${kstNow()})`,
    }
    return { ...base, outcome: 'picked', how, total: rows.length, exact: ex.length, candidates: ex.map(brief), row, note: row.note }
  } catch (e) {
    return { ...base, outcome: 'error', note: String(e instanceof Error ? e.message : e).slice(0, 200) }
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401)
  const mode = new URL(req.url).searchParams.get('mode') ?? 'collect'
  if (!['collect', 'dry'].includes(mode)) return json({ ok: false, error: 'mode = collect | dry' }, 400)
  calls = 0
  let targets: Target[]
  // 모의 실행만: addr=<세대 행 주소 그대로>(여럿 · 최대 MAX_PER_RUN)로 대상 밖 주소도 풀어 본다(쓰기 0 — 규칙 시험).
  const addrs = mode === 'dry' ? new URL(req.url).searchParams.getAll('addr').slice(0, MAX_PER_RUN) : []
  if (addrs.length) {
    targets = []
    for (const a of addrs) {
      const { data: hu, error: e } = await supabase.from('housing_units').select('announcement_id, building_name').eq('address', a).limit(200)
      if (e || !hu?.length) return json({ ok: false, error: `세대 행에 없는 주소: ${a.slice(0, 60)}` }, 400)
      const rows = hu as Array<{ announcement_id: string; building_name: string | null }>
      targets.push({ address: a, names: [...new Set(rows.map(h => (h.building_name ?? '').trim()).filter(Boolean))], ann_ids: [...new Set(rows.map(h => h.announcement_id))] })
    }
  } else {
    const { data, error } = await supabase.rpc('complex_geo_targets', { p_limit: MAX_PER_RUN })
    if (error) return json({ ok: false, error: `targets: ${error.message}` }, 500)
    targets = (data ?? []) as Target[]
  }
  if (!targets.length) return json({ ok: true, mode, targets: 0, juso_calls: 0 })
  const out: Array<Record<string, unknown>> = []
  for (const t of targets) {
    const o = await solve(t)
    let put: unknown = null
    if (mode === 'collect') {
      const r = await supabase.rpc('complex_geo_put', { p: o })
      put = r.error ? { error: r.error.message } : r.data
    }
    out.push({ address: o.address, outcome: o.outcome, how: o.how ?? null, exact: o.exact ?? null, road: (o.row as { road_address?: string } | undefined)?.road_address ?? null,
               latlng: o.row ? [o.row.lat, o.row.lng] : null, note: o.note, candidates: o.outcome === 'multi' ? o.candidates : undefined, put })
    // E0007(짧은 시간 다량 요청)이면 이 런을 멈춘다 — 다음 시각에 다시.
    if (o.outcome === 'error' && /E0007/.test(o.note ?? '')) break
  }
  return json({ ok: true, mode, targets: targets.length, juso_calls: calls, results: out })
})
