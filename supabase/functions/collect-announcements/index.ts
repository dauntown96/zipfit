import { createClient } from 'jsr:@supabase/supabase-js@2'

// 시크릿은 전부 환경변수 필수. 하드코딩 폴백을 두지 않는다.
// TypeScript의 `!`는 타입 단언일 뿐 런타임 검사가 아니라서, 미설정 시 undefined로
// 조용히 잘못 동작한다(예: serviceKey=undefined로 API 호출). 명시적으로 throw 한다.
const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL              = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const LH_API_KEY                = requireEnv('LH_API_KEY')
const CRON_SECRET               = requireEnv('CRON_SECRET')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const san = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return (s === '' || s === 'null' || s === 'undefined') ? null : s
}
const sanNum = (v: unknown): number | null => {
  if (v == null) return null
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}
const parseDate = (v: unknown): string | null => {
  if (!v) return null
  const s = String(v).replace(/[.\-/]/g, '').trim()
  return /^\d{8}$/.test(s) ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : null
}
const normalizeTitle = (v: string | null): string | null =>
  v ? v.replace(/^(\[정정공고\]\s*)+/, '[정정공고]') : v
const SIDO_MAP: Record<string,string> = {
  '서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시',
  '광주':'광주광역시','대전':'대전광역시','울산':'울산광역시','세종':'세종특별자치시',
  '경기':'경기도','강원':'강원특믄자치도','충북':'충청북도','충남':'충청남도',
  '전북':'전북특별자치도','전남':'전라남도','경북':'경상북도','경남':'경상남도',
  '제주':'제주특별자치도',
}
const normSido = (v: string): string => SIDO_MAP[v] ?? v

const MERGED_SIDO_MAP: Record<string,string> = {
  '광주광역시': '전남광주통합특별시',
  '전라남도':   '전남광주통합특별시',
}
const applySidoMerge = (v: string | null): string | null => v ? (MERGED_SIDO_MAP[v] ?? v) : v

type NoticeItem = {
  PAN_ID: string; PAN_NM: string; CNP_CD_NM: string
  UPP_AIS_TP_NM: string; AIS_TP_CD_NM: string
  UPP_AIS_TP_CD: string; AIS_TP_CD: string
  SPL_INF_TP_CD: string; CCR_CNNT_SYS_DS_CD: string
  PAN_SS: string; PAN_NT_ST_DT: string; CLSG_DT: string; PAN_DT: string; DTL_URL: string
}
type SbdItem = {
  MIN_MAX_RSDN_DDO_AR?: string; DDO_AR?: string
  SUM_TOT_HSH_CNT?: string; HSH_CNT?: string
  HTN_FMLA_DS_CD_NM?: string; HTN_FMLA_DESC?: string
  MVIN_XPC_YM?: string; LCT_ARA_ADR?: string; LGDN_ADR?: string
  LCC_NT_NM?: string
}
type SplScdlItem = {
  SBSC_ACP_ST_DT?: string; SBSC_ACP_CLSG_DT?: string
  PPR_SBM_OPE_ANC_DT?: string; PPR_ACP_ST_DT?: string; PPR_ACP_CLSG_DT?: string
  PZWR_ANC_DT?: string; CTRT_ST_DT?: string; CTRT_ED_DT?: string
}
type EtcInfoItem = { ETC_CTS?: string; CRC_RSN?: string }
type AhflInfoItem = { AHFL_URL?: string; SL_PAN_AHFL_DS_CD_NM?: string; CMN_AHFL_NM?: string }
type MyHomeItem = Record<string, string | number | null>

async function fetchNoticeList(): Promise<NoticeItem[]> {
  const today  = new Date()
  const past   = new Date(today); past.setDate(today.getDate() - 90)
  const future = new Date(today); future.setDate(today.getDate() + 365)
  const fmt    = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  const all: NoticeItem[] = []
  // 2026-07-13 추가 실측 확인(다운님 제보): 카테고리 39는 "공공분양(매매)"과 "행복주택(임대)"이
  // 뒤섞여 있음 — AIS_TP_CD_NM에 "분양"이 포함되면 매매 확정, 아니면(행복주택 등) 임대로 정상 수집.
  for (const tp of ['06','13','39']) {
    let page = 1
    while (true) {
      const url = `https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1` +
        `?ServiceKey=${LH_API_KEY}&PG_SZ=100&PAGE=${page}&UPP_AIS_TP_CD=${tp}` +
        `&PAN_ST_DT=${fmt(past)}&PAN_ED_DT=${fmt(today)}` +
        `&CLSG_ST_DT=${fmt(past)}&CLSG_ED_DT=${fmt(future)}`
      const raw  = await (await fetch(url)).json() as Record<string,unknown>[]
      const body = raw.find(c => Array.isArray(c['dsList']))
      const rawItems = (body?.['dsList'] as NoticeItem[]) ?? []
      const items = tp === '39' ? rawItems.filter(i => !(i.AIS_TP_CD_NM ?? '').includes('분양')) : rawItems
      all.push(...items)
      if (rawItems.length < 100) break
      page++; if (page > 10) break
    }
  }
  const seen = new Set<string>()
  return all.filter(i => { if (!i.PAN_ID || seen.has(i.PAN_ID)) return false; seen.add(i.PAN_ID); return true })
}

async function fetchDetailWithTimeout(item: NoticeItem, timeoutMs: number): Promise<{ sbd: SbdItem | null; scdl: SplScdlItem | null; etcInfo: EtcInfoItem | null; ahflInfo: AhflInfoItem[] | null }> {
  try {
    const url = `https://apis.data.go.kr/B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1` +
      `?serviceKey=${LH_API_KEY}` +
      `&SPL_INF_TP_CD=${item.SPL_INF_TP_CD}&CCR_CNNT_SYS_DS_CD=${item.CCR_CNNT_SYS_DS_CD}` +
      `&PAN_ID=${item.PAN_ID}&UPP_AIS_TP_CD=${item.UPP_AIS_TP_CD}&AIS_TP_CD=${item.AIS_TP_CD}`
    const raw  = await (await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })).json() as Record<string,unknown>[]
    const sbdBody   = raw.find(c => Array.isArray(c['dsSbd']))
    const scdlBody  = raw.find(c => Array.isArray(c['dsSplScdl']))
    const etcBody   = raw.find(c => Array.isArray(c['dsEtcInfo']))
    const ahflBody  = raw.find(c => Array.isArray(c['dsAhflInfo']))
    const sbds  = (sbdBody?.['dsSbd'] as SbdItem[]) ?? []
    const scdls = (scdlBody?.['dsSplScdl'] as SplScdlItem[]) ?? []
    const etcs  = (etcBody?.['dsEtcInfo'] as EtcInfoItem[]) ?? []
    const ahfls = (ahflBody?.['dsAhflInfo'] as AhflInfoItem[]) ?? []
    return { sbd: sbds[0] ?? null, scdl: scdls[0] ?? null, etcInfo: etcs[0] ?? null, ahflInfo: ahfls.length ? ahfls : null }
  } catch { return { sbd: null, scdl: null, etcInfo: null, ahflInfo: null } }
}
async function fetchDetail(item: NoticeItem) {
  return fetchDetailWithTimeout(item, 5000)
}

function parseArea(s: string | null | undefined): [number|null, number|null] {
  if (!s) return [null, null]
  const parts = s.split('~').map(p => parseFloat(p.replace(/[^0-9.]/g,'')))
  const min = isNaN(parts[0]) ? null : parts[0]
  const max = (parts.length > 1 && !isNaN(parts[1])) ? parts[1] : min
  return [min, max]
}

function mapLHRow(item: NoticeItem, sbd: SbdItem | null, scdl: SplScdlItem | null, ahflInfo: AhflInfoItem[] | null) {
  const areaStr = san(sbd?.MIN_MAX_RSDN_DDO_AR ?? sbd?.DDO_AR)
  const [areaMin, areaMax] = parseArea(areaStr)
  const units   = sanNum(sbd?.SUM_TOT_HSH_CNT ?? sbd?.HSH_CNT)
  const regionRaw = san(item.CNP_CD_NM) ?? ''
  const parts   = regionRaw.split(' ')
  const sido    = applySidoMerge(normSido(parts[0]) || null)
  const sigungu = parts.length > 1 ? parts.slice(1).join(' ') : null
  const addr    = san(sbd?.LCT_ARA_ADR ?? sbd?.LGDN_ADR)
  const title   = normalizeTitle(san(item.PAN_NM))
  return {
    source:            'LH',
    announcement_id:   san(item.PAN_ID),
    title,
    region:            addr ?? (regionRaw || null),
    sido_nm:           sido,
    sigungu_nm:        sigungu,
    housing_type:      ([san(item.UPP_AIS_TP_NM), san(item.AIS_TP_CD_NM)].filter(Boolean).join(' - ')) || null,
    supply_org:        'LH',
    announcement_date: parseDate(item.PAN_NT_ST_DT),
    apply_start:       parseDate(scdl?.SBSC_ACP_ST_DT),
    apply_end:         parseDate(item.CLSG_DT),
    status:            san(item.PAN_SS),
    url:               san(item.DTL_URL),
    is_revised:        String(item.PAN_SS ?? '').includes('정정') || (title ?? '').startsWith('[정정공고]'),
    area_min:          areaMin,
    area_max:          areaMax,
    total_units:       units ? Math.round(units) : null,
    heating_type:      san(sbd?.HTN_FMLA_DS_CD_NM ?? sbd?.HTN_FMLA_DESC),
    move_in_date:      san(sbd?.MVIN_XPC_YM),
    doc_submit_announce_date: parseDate(scdl?.PPR_SBM_OPE_ANC_DT),
    doc_submit_start:         parseDate(scdl?.PPR_ACP_ST_DT),
    doc_submit_end:           parseDate(scdl?.PPR_ACP_CLSG_DT),
    winner_announce_date:     parseDate(scdl?.PZWR_ANC_DT),
    contract_start:           parseDate(scdl?.CTRT_ST_DT),
    contract_end:             parseDate(scdl?.CTRT_ED_DT),
    building_name:     san(sbd?.LCC_NT_NM),
    attachment_urls:   ahflInfo ? ahflInfo.map(a => ({
      url: san(a.AHFL_URL), label: san(a.SL_PAN_AHFL_DS_CD_NM), filename: san(a.CMN_AHFL_NM)
    })) : null,
    updated_at:        new Date().toISOString(),
  }
}

async function fetchMyHome(): Promise<MyHomeItem[]> {
  const all: MyHomeItem[] = []
  let totalCount = 0
  let page = 1
  while (true) {
    const url = `https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList` +
      `?serviceKey=${LH_API_KEY}&numOfRows=100&pageNo=${page}&type=json`
    try {
      const res  = await fetch(url, { signal: AbortSignal.timeout(15000) })
      const raw  = await res.json()
      if (page === 1) totalCount = parseInt(String(raw?.response?.body?.totalCount ?? 0))
      const itemsRaw = raw?.response?.body?.item
      const items: MyHomeItem[] = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : []
      all.push(...items)
      if (items.length < 100) break
      page++; if (page > 20) break
    } catch(e) {
      console.error(`MYHOME page${page} 오류:`, e)
      break
    }
  }
  console.log(`[MYHOME] totalCount=${totalCount} collected=${all.length}`)
  return all
}

function mapMyHomeRow(it: MyHomeItem) {
  const pblancId = san(it['pblancId'])
  const houseSn  = String(it['houseSn'] ?? '0').trim()

  const sttusNm  = san(it['sttusNm']) ?? ''
  let status = '공고중'
  if (sttusNm.includes('정정')) status = '정정공고중'
  else if (sttusNm.includes('마감') || sttusNm.includes('종료')) status = '접수마감'
  else if (sttusNm.includes('접수')) status = '접수중'

  const depositRaw = sanNum(it['rentGtn'])
  const rentRaw    = sanNum(it['mtRntchrg'])
  const unitsRaw   = sanNum(it['sumSuplyCo'])
  const brtcNm     = san(it['brtcNm']) ?? ''
  const signguNm   = san(it['signguNm']) ?? ''
  const region     = [brtcNm, signguNm].filter(Boolean).join(' ') || null
  const beforePblancId = san(it['beforePblancId'])

  const annId = [pblancId, houseSn !== '0' ? houseSn : null, brtcNm, signguNm]
    .filter(Boolean).join('_')

  const title = normalizeTitle(san(it['pblancNm']))
  return {
    source:            'MYHOME',
    announcement_id:   annId,
    title,
    region,
    sido_nm:           applySidoMerge(brtcNm || null),
    sigungu_nm:        signguNm || null,
    housing_type:      san(it['suplyTyNm']),
    supply_org:        san(it['suplyInsttNm']),
    announcement_date: parseDate(it['rcritPblancDe']),
    apply_start:       parseDate(it['beginDe']),
    apply_end:         parseDate(it['endDe']),
    status,
    url:               san(it['url']),
    before_pblanc_id:  beforePblancId,
    is_revised:        sttusNm.includes('정정') || (title ?? '').startsWith('[정정공고]'),
    total_units:       unitsRaw ? Math.round(unitsRaw) : null,
    deposit_min:       (depositRaw && depositRaw !== 0) ? depositRaw : null,
    rent_min:          (rentRaw && rentRaw !== 0) ? rentRaw : null,
    winner_announce_date: parseDate(it['przwnerPresnatnDe']),
    building_name:     san(it['hsmpNm']),
    precise_address:   san(it['fullAdres']) || null,
    updated_at:        new Date().toISOString(),
  }
}

async function markExpired(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('announcements')
    .update({ status: '접수마감', updated_at: new Date().toISOString() })
    .lt('apply_end', today).not('status','eq','접수마감').not('apply_end','is',null)
    .select('id')
  return data?.length ?? 0
}

async function collect() {
  const startedAt = Date.now()
  const errors: string[] = []

  let lhNotices: NoticeItem[] = []
  try {
    lhNotices = await fetchNoticeList()
    console.log(`[LH] 목록 ${lhNotices.length}건`)
  } catch(e) {
    errors.push(`LH 목록: ${e}`)
  }

  const lhBaseRows = lhNotices.map(n => mapLHRow(n, null, null, null)).filter(r => r.announcement_id && r.title)
  let lhUpserted = 0
  for (let i = 0; i < lhBaseRows.length; i += 50) {
    const { data, error } = await supabase.from('announcements')
      .upsert(lhBaseRows.slice(i, i+50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
      .select('id')
    if (error) errors.push(`LH upsert[${i}]: ${error.message}`)
    else lhUpserted += data?.length ?? 0
  }
  console.log(`[LH] upsert ${lhUpserted}건`)

  const activeNotices = lhNotices.filter(n => ['접수중','공고중','정정공고중'].includes(n.PAN_SS ?? ''))

  const nullApplyStartIds = new Set<string>()
  const failCountMap = new Map<string, number>()
  try {
    const activeIds = activeNotices.map(n => n.PAN_ID)
    const { data: existing } = await supabase.from('announcements')
      .select('announcement_id, apply_start, detail_fetch_fail_count')
      .eq('source', 'LH')
      .in('announcement_id', activeIds)
    const knownIds = new Set((existing ?? []).map(r => r.announcement_id as string))
    for (const r of (existing ?? [])) {
      if (r.apply_start === null) nullApplyStartIds.add(r.announcement_id as string)
      failCountMap.set(r.announcement_id as string, (r.detail_fetch_fail_count as number) ?? 0)
    }
    for (const id of activeIds) {
      if (!knownIds.has(id)) nullApplyStartIds.add(id)
    }
  } catch(e) {
    errors.push(`상세조회 우선순위 조회: ${e}`)
  }

  const needDetail = [...activeNotices]
    .sort((a, b) => {
      const aNull = nullApplyStartIds.has(a.PAN_ID) ? 0 : 1
      const bNull = nullApplyStartIds.has(b.PAN_ID) ? 0 : 1
      return aNull - bNull
    })
    .slice(0, 90)

  let lhDetailOk = 0
  const detailRows: ReturnType<typeof mapLHRow>[] = []
  const failedIds: string[] = []
  const revisionCandidates: { id: string; note: string }[] = []
  for (let i = 0; i < needDetail.length; i += 5) {
    const batch   = needDetail.slice(i, i+5)
    const results = await Promise.all(batch.map(n => fetchDetail(n)))
    batch.forEach((n, j) => {
      const r = results[j]
      if (r.sbd || r.scdl) {
        lhDetailOk++
        detailRows.push({
          ...mapLHRow(n, r.sbd, r.scdl, r.ahflInfo),
          detail_fetch_fail_count: 0,
          detail_fetch_last_attempt: new Date().toISOString(),
        })
        const crcRsn = san(r.etcInfo?.CRC_RSN)
        if (crcRsn) revisionCandidates.push({ id: n.PAN_ID, note: crcRsn })
      } else {
        failedIds.push(n.PAN_ID)
      }
    })
    if (i + 5 < needDetail.length) await new Promise(r => setTimeout(r, 150))
  }

  // 만성 실패 항목 전용 "느린 재시도" 패스.
  // 배경: 일부 공고는 정상 응답을 주지만 응답 자체가 30~40초대로 느려(예: 물금2천년나무
  // PAN_ID=2015122300020266, 실측 43초) 5초 타임아웃 안에서는 몇 번을 재시도해도 성공 불가.
  // 이전에 2회 이상(이번까지 3연속) 실패한 소수 항목만 골라 훨씬 긴 타임아웃으로 한 번 더 시도한다.
  //
  // 타임아웃/시간예산 값은 지시서 원안(SLOW_TIMEOUT_MS=35000, TIME_BUDGET_MS=90000)에서 조정했다.
  // 조정 근거(Supabase 공식 문서 확인): Free 플랜 Edge Function wall-clock 한도는 150초(고정,
  // 컨트롤 불가) — 그런데 이 함수의 메인 패스만으로도 최근 실행 기록상 45~133초까지 관측됨
  // (collection_run_log 실측: id 38=132.9초). 만약 원안대로 TIME_BUDGET_MS=90000에서 게이트를
  // 통과한 뒤 SLOW_TIMEOUT_MS=35000 만큼 더 실행하면 90+35=125초, 이후 MyHome 수집·만료처리·
  // 로그기록까지 더해질 경우 150초 한도에 근접하거나 초과할 위험이 있었음. 또한 원안의
  // SLOW_TIMEOUT_MS=35000은 애초에 지시서가 인용한 실측 재현 시간(43초)보다 짧아 정작 목표
  // 사례조차 못 잡을 모순이 있었음. 이에 SLOW_TIMEOUT_MS=45000(43초 실측치를 여유있게 커버)
  // /TIME_BUDGET_MS=70000(메인 패스가 이미 70초를 넘겼으면 느린 재시도 자체를 건너뛰어, 이미
  // 오래 걸린 실행을 150초 한도 쪽으로 더 밀어붙이지 않도록)으로 하향 조정.
  const CHRONIC_THRESHOLD = 2
  const MAX_SLOW_RETRY = 5
  const SLOW_TIMEOUT_MS = 45000
  const TIME_BUDGET_MS = 70000

  let slowRetryOk = 0
  const chronicIds = failedIds.filter(id => (failCountMap.get(id) ?? 0) >= CHRONIC_THRESHOLD)
    .slice(0, MAX_SLOW_RETRY)

  if (chronicIds.length > 0 && (Date.now() - startedAt) < TIME_BUDGET_MS) {
    const chronicNotices = needDetail.filter(n => chronicIds.includes(n.PAN_ID))
    const slowResults = await Promise.all(
      chronicNotices.map(n => fetchDetailWithTimeout(n, SLOW_TIMEOUT_MS))
    )
    chronicNotices.forEach((n, j) => {
      const r = slowResults[j]
      if (r.sbd || r.scdl) {
        slowRetryOk++
        detailRows.push({
          ...mapLHRow(n, r.sbd, r.scdl, r.ahflInfo),
          detail_fetch_fail_count: 0,
          detail_fetch_last_attempt: new Date().toISOString(),
        })
        const idx = failedIds.indexOf(n.PAN_ID)
        if (idx >= 0) failedIds.splice(idx, 1)
        const crcRsn = san(r.etcInfo?.CRC_RSN)
        if (crcRsn) revisionCandidates.push({ id: n.PAN_ID, note: crcRsn })
      }
    })
    console.log(`[LH] 느린 재시도 ${slowRetryOk}/${chronicIds.length}건 (대상 ${chronicIds.length}건)`)
  }

  for (let i = 0; i < detailRows.length; i += 50) {
    const { error } = await supabase.from('announcements')
      .upsert(detailRows.slice(i, i+50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
    if (error) errors.push(`LH detail_upsert[${i}]: ${error.message}`)
  }
  console.log(`[LH] 상세 ${lhDetailOk}/${needDetail.length}건`)

  if (failedIds.length > 0) {
    const { error } = await supabase.rpc('bump_detail_fetch_fail', { p_ids: failedIds })
    if (error) errors.push(`상세조회 실패추적: ${error.message}`)
  }

  if (revisionCandidates.length > 0) {
    const { error } = await supabase.rpc('bulk_set_revision_note', {
      p_ids: revisionCandidates.map(r => r.id),
      p_notes: revisionCandidates.map(r => r.note),
    })
    if (error) errors.push(`정정사유 자동채움: ${error.message}`)
  }

  let mhUpserted = 0
  let mhFetched  = 0
  let mhDedupMerged = 0
  try {
    const mhItems = await fetchMyHome()
    mhFetched = mhItems.length
    const mhRowsRaw = mhItems.map(mapMyHomeRow).filter(r => r.announcement_id && r.title)

    const mhMap = new Map<string, ReturnType<typeof mapMyHomeRow>>()
    for (const row of mhRowsRaw) mhMap.set(row.announcement_id, row)
    mhDedupMerged = mhRowsRaw.length - mhMap.size
    const mhRows = Array.from(mhMap.values())
    if (mhDedupMerged > 0) console.log(`[MYHOME] dedup으로 ${mhDedupMerged}건 병합 (annId 충돌)`)

    for (let i = 0; i < mhRows.length; i += 50) {
      const { data, error } = await supabase.from('announcements')
        .upsert(mhRows.slice(i, i+50), { onConflict: 'source,announcement_id', ignoreDuplicates: false })
        .select('id')
      if (error) errors.push(`MYHOME upsert[${i}]: ${error.message}`)
      else mhUpserted += data?.length ?? 0
    }
    console.log(`[MYHOME] upsert ${mhUpserted}건`)
  } catch(e) {
    errors.push(`MYHOME: ${e}`)
  }

  const expired = await markExpired()
  const durationMs = Date.now() - startedAt

  try {
    const { error: logError } = await supabase.from('collection_run_log').insert({
      lh_fetched:          lhNotices.length,
      lh_detail_ok:        lhDetailOk,
      lh_upserted:         lhUpserted,
      lh_slow_retry_ok:    slowRetryOk,
      myhome_fetched:      mhFetched,
      myhome_upserted:     mhUpserted,
      myhome_dedup_merged: mhDedupMerged,
      expired_marked:      expired,
      errors:              errors.length ? errors : null,
      duration_ms:         durationMs,
    })
    if (logError) errors.push(`collection_run_log insert: ${logError.message}`)
  } catch(e) {
    errors.push(`collection_run_log insert exception: ${e}`)
  }

  return {
    lh:     { fetched: lhNotices.length, detail_ok: lhDetailOk, upserted: lhUpserted, slow_retry_ok: slowRetryOk },
    myhome: { fetched: mhFetched, upserted: mhUpserted, dedup_merged: mhDedupMerged },
    expired,
    errors,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,x-cron-secret'
  }})
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'Method not allowed'}), {status:405})
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response(JSON.stringify({error:'Unauthorized'}), {status:401})

  const started = new Date().toISOString()
  const result  = await collect()
  const res = { started, finished: new Date().toISOString(), ...result }
  console.log('[DONE]', JSON.stringify(res))
  return new Response(JSON.stringify(res), {headers:{'Content-Type':'application/json'}})
})
