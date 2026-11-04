// LH 건설임대 당첨 합격점수(커트라인) 수집(2026-11-04 신설 · 우편함 「코드·운영 — LH 건설임대 당첨 합격점수 수집 장치」).
// 원천: data.go.kr 15160376 「한국토지주택공사_건설임대 당첨 합격점수(커트라인) 조회 서비스」
//       B552555/lhCsrLsPwiPneScrInfo/getCsrLsPwiPneScrInfo — 시도명(CNP_NM 필수) × 모집공고일 창(최대 1년) · 쪽 넘김 없이 한 번에 전부 온다.
// 쓰는 곳: public.lh_cutoff_scores(열쇠 PAN_ID · SBD_LGO_NO · LTST_NM(주택형) · RQS_TP_NM(신청유형)) · 런마다 public.lh_cutoff_run_log 한 행.
// 🔴 받는 자리 거름(cutoff-filter.ts) — 커트라인 글자는 화이트리스트 꼴만 남기고, 신청자 5명 이하면 비운다. 원문 글자는 어디에도 남기지 않는다
//    (DB · 로그 · 응답 · 런 기록 모두). DB CHECK 가 같은 규칙을 한 번 더 막는다.
// 🔴 CM_RT(경쟁률)는 받지 않는다 — 94.7%가 「0」(조사 회차 실측). 경쟁률은 표의 생성 칸(신청 ÷ 공급)이다.
// 호출:  ?mode=collect                — 최근 1년 창(오늘 KST 기준) × 시도 16 = 16호출(주 1회 pg_cron)
//        ?mode=collect&years_ago=N    — N년 전 1년 창(N = 1~4 · 5년 소급을 한 창씩 나눠 부른다 · 한 번에 16호출)
//        ?mode=authcheck              — 인증만(호출 0)
// 인증: x-cron-secret(Vault cron_secret_v2) — JWT 없음(config.toml verify_jwt=false).
import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'
import { filterCutoff } from './cutoff-filter.ts'

const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}
const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
// 다운님 data.go.kr 계정 키 — 이 API(15160376)에 활용신청된 키(조사 회차 실호출 200 · EF 비밀값에도 같은 이름으로 있다).
const API_KEY = requireEnv('MOLIT_RENT_API_KEY')
const CRON_SECRET = requireEnv('CRON_SECRET_V2')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const secretVariants = (v: string): string[] => {
  const out = new Set<string>([v])
  try { out.add(encodeURIComponent(v)) } catch { /* 무시 */ }
  try { out.add(decodeURIComponent(v)) } catch { /* 무시 */ }
  return [...out].filter(s => s.length >= 8)
}
const KNOWN_SECRETS = [...secretVariants(API_KEY), ...secretVariants(CRON_SECRET)]
const scrubSecrets = (text: string): string => {
  let out = text.replace(/(serviceKey|ServiceKey)=[^&\s"'<]*/g, '$1=***')
  for (const s of KNOWN_SECRETS) out = out.split(s).join('***')
  return out
}

// 시도명은 지금 이름만 — 옛 이름(광주광역시 · 전라남도 · 강원도 · 전라북도)은 5년 창 모두 0행(2026-11-04 실측 · 20이름 × 5창).
const SIDO = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '대전광역시', '울산광역시', '세종특별자치시', '경기도',
  '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전남광주통합특별시', '경상북도', '경상남도', '제주특별자치도',
]
const ENDPOINT = 'https://apis.data.go.kr/B552555/lhCsrLsPwiPneScrInfo/getCsrLsPwiPneScrInfo'
const CALL_TIMEOUT_MS = 25000
const BUDGET_MS = 135000   // EF 150초 전에 멈추고 남은 시도는 errors 에 「시간 예산」으로 남긴다

type Raw = Record<string, unknown>
const txt = (v: unknown): string | null => { const s = String(v ?? '').trim(); return s ? s : null }
const int = (v: unknown): number | null => { const s = String(v ?? '').trim(); return /^\d+$/.test(s) ? parseInt(s, 10) : null }
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
const isoDate = (s: string | null): string | null => s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null

// 창: 끝 = 오늘(KST) − N년 · 시작 = 끝 − 1년 + 1일(조사 회차와 같은 꼴 — 20251105~20261104)
function windowOf(yearsAgo: number) {
  const today = new Date(Date.now() + 9 * 3600_000)
  const end = new Date(Date.UTC(today.getUTCFullYear() - yearsAgo, today.getUTCMonth(), today.getUTCDate()))
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate() + 1))
  return { from: ymd(start), to: ymd(end) }
}

async function fetchSido(sido: string, w: { from: string; to: string }): Promise<Raw[]> {
  const url = `${ENDPOINT}?serviceKey=${API_KEY}&CNP_NM=${encodeURIComponent(sido)}&SRCH_BGNG_YMD=${w.from}&SRCH_END_YMD=${w.to}`
  let last = ''
  for (let i = 0; i < 3; i++) {   // apis.data.go.kr 은 연결이 절반쯤 끊긴다(CLAUDE.md 컨테이너 메모 · 수집 EF 와 같은 호스트) — 세 번까지
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) })
      const body = await res.text()
      if (!res.ok) { last = `http_${res.status}`; continue }
      const j = JSON.parse(body)
      if (!Array.isArray(j)) { last = 'not_an_array'; continue }
      const blk = j.find((x: Raw) => Array.isArray((x as Raw).dsList)) as Raw | undefined
      if (!blk) {
        const code = j.map((x: Raw) => x.resultCode).find(Boolean)
        last = `no_dsList${code ? ' resultCode=' + code : ''}`; continue
      }
      const rc = String(blk.resultCode ?? '0')
      if (rc !== '0' && rc !== '00') { last = `resultCode=${rc}`; continue }
      return blk.dsList as Raw[]
    } catch (e) {
      last = `network:${e instanceof Error ? e.name : 'Error'}`
    }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)))
  }
  throw new Error(last || 'unknown')
}

async function collect(yearsAgo: number) {
  const started = Date.now()
  const w = windowOf(yearsAgo)
  const errors: string[] = []
  const stat = { calls: 0, ok_calls: 0, rows_in: 0, upserted: 0, kept: 0, dropped_empty: 0, dropped_filter: 0, dropped_small: 0, dup_dropped: 0 }
  for (const sido of SIDO) {
    if (Date.now() - started > BUDGET_MS) { errors.push(`${sido}: 시간 예산`); continue }
    stat.calls++
    let raw: Raw[]
    try { raw = await fetchSido(sido, w) } catch (e) { errors.push(`${sido}: ${scrubSecrets(String(e instanceof Error ? e.message : e)).slice(0, 120)}`); continue }
    stat.ok_calls++
    stat.rows_in += raw.length
    const seen = new Set<string>()
    const rows: Record<string, unknown>[] = []
    for (const r of raw) {
      const pan = txt(r.PAN_ID), sbd = txt(r.SBD_LGO_NO), dt = isoDate(txt(r.RCR_PAN_DT))
      if (!pan || !sbd || !dt) { errors.push(`${sido}: 열쇠·날짜 빈 행 건너뜀`); continue }
      const ltst = txt(r.LTST_NM) ?? '', rqs = txt(r.RQS_TP_NM) ?? ''
      const k = [pan, sbd, ltst, rqs].join('\u0000')
      if (seen.has(k)) { stat.dup_dropped++; continue }   // 같은 응답 안 같은 열쇠 두 줄(5년 32,593행 중 1쌍) — 첫 행만
      seen.add(k)
      const applicants = int(r.RQPR_CNT)
      const v = filterCutoff(r.PWI_PNE_SCR_CTS, applicants)
      if (v.reason === 'ok') stat.kept++
      else if (v.reason === 'empty') stat.dropped_empty++
      else if (v.reason === 'not_whitelisted') stat.dropped_filter++
      else stat.dropped_small++
      rows.push({
        pan_id: pan, sbd_lgo_no: sbd, ltst_nm: ltst, rqs_tp_nm: rqs,
        sbd_lgo_nm: txt(r.SBD_LGO_NM), pan_nm: txt(r.PAN_NM), spl_tp_nm: txt(r.SPL_TP_NM),
        cnp_nm: txt(r.CNP_NM) ?? sido, sgg_nm: txt(r.SGG_NM),
        spl_rmno: int(r.SPL_RMNO), rqpr_cnt: applicants,
        cutoff_text: v.text, cutoff_state: v.reason,
        gmy_stnd_desc: txt(r.GMY_STND_DESC), rfe_stnd_desc: txt(r.RFE_STND_DESC),
        rcr_pan_dt: dt, last_seen_at: new Date().toISOString(),
      })
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await supabase.from('lh_cutoff_scores')
        .upsert(rows.slice(i, i + 500), { onConflict: 'pan_id,sbd_lgo_no,ltst_nm,rqs_tp_nm', ignoreDuplicates: false })
        .select('pan_id')
      if (error) errors.push(`${sido} upsert[${i}]: ${error.code ?? ''} ${String(error.message).slice(0, 120)}`)
      else stat.upserted += data?.length ?? 0
    }
  }
  const { count } = await supabase.from('lh_cutoff_scores').select('pan_id', { count: 'exact', head: true })
  const out = { mode: 'collect', years_ago: yearsAgo, window_from: isoDate(w.from), window_to: isoDate(w.to), ...stat, total_after: count ?? null,
    duration_ms: Date.now() - started, errors }
  const { error: logErr } = await supabase.from('lh_cutoff_run_log').insert(out)
  if (logErr) errors.push(`run_log: ${String(logErr.message).slice(0, 120)}`)
  return out
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('unauthorized', { status: 401 })
  const p = new URL(req.url).searchParams
  if (p.get('mode') === 'authcheck') return Response.json({ mode: 'authcheck', ok: true })
  if (p.get('mode') !== 'collect') return Response.json({ error: 'mode=collect | authcheck' }, { status: 400 })
  const ya = parseInt(p.get('years_ago') ?? '0', 10)
  if (!(ya >= 0 && ya <= 4)) return Response.json({ error: 'years_ago 0~4' }, { status: 400 })
  try {
    const out = await collect(ya)
    return new Response(scrubSecrets(JSON.stringify(out)), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(scrubSecrets(JSON.stringify({ error: String(e instanceof Error ? e.message : e).slice(0, 300) })), { status: 500 })
  }
})
