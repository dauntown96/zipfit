// LH 대상주택 공지 감지(2026-11-05 신설 · 우편함 「코드·운영 — 대상주택 공지 감지 구현 …」 1장 · 설계 = 「… 대상주택 공지 감지 설계 …」 1장).
// 원천: data.go.kr 15058222 「LH 청약센터 공지사항 목록 조회」 B552555/lhNoticeInfo1/getNoticeInfo1 — 칸 11(유형 · 제목 · 담당본부 · 게시일 · 상세 URL · BBS_SN …).
//       🔴 개인 식별 값은 이 원천에 없다(2026-11-05 조사 · 9~11월 341건) · 저장은 맞은 공지의 칸만(lh_notice_ingest → lh_notice_matches).
// 차례: ① wave_notice_targets()(DB 한 정의 — 매입 순위별 둘째 이후 창 · 게시 시각 지남 · ⚠️ 차수 행 없음)를 읽는다
//       ② 대상 0 이면 API 호출 0 — 런 기록만 남긴다 ③ 있으면 창 오늘−3 ~ 오늘(KST) · PG_SZ=100 으로 부른다(ALL_CNT 가 100 넘으면 3쪽까지)
//       ④ 받은 목록을 lh_notice_ingest 에 넘긴다(맞춤 규칙 = lh_notice_pick · 맞은 것만 저장 · 런 기록 한 행).
// 🔴 대기열에 넣지 않는다 — analysis_dispatch_tick #차수 갈래가 켜기 칸(wave_notice_enabled)을 보고 넣는다.
// 호출:  ?mode=collect(pg_cron zipfit-collect-lh-notices · 하루 4회 KST 10·13·16·19시) · ?mode=authcheck(인증만 · 호출 0)
// 인증: x-cron-secret(Vault cron_secret_v2) — JWT 없음(config.toml verify_jwt=false).
import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'

const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}
const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
// 다운님 data.go.kr 계정 키 — 15058222 에 활용신청된 키(2026-10-21 · 11-05 컨테이너 실호출 200 · collect-lh-cutoff 와 같은 EF 비밀값).
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

const ENDPOINT = 'https://apis.data.go.kr/B552555/lhNoticeInfo1/getNoticeInfo1'
const PAGE_SIZE = 100
const MAX_PAGES = 3
const TRIES = 4             // apis.data.go.kr 은 절반쯤 연결을 끊는다(docs/network-allowlist.md) — 4번까지
const CALL_TIMEOUT_MS = 20000

// 받는 칸 — 맞춤에 쓰는 것만 넘긴다(INQ_CNT 등은 버림).
const KEEP = ['AIS_TP_CD_NM', 'BBS_TL', 'DEP_NM', 'BBS_WOU_DTTM', 'LINK_URL', 'BBS_SN'] as const
type Notice = Record<(typeof KEEP)[number], string>

const kstYmd = (offsetDays = 0) => {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchPage(from: string, to: string, page: number): Promise<{ rows: Notice[]; all: number }> {
  const u = `${ENDPOINT}?serviceKey=${API_KEY}&PG_SZ=${PAGE_SIZE}&PAGE=${page}&SCH_ST_DT=${from}&SCH_ED_DT=${to}`
  let last = ''
  for (let a = 1; a <= TRIES; a++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) })
      const t = await r.text()
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = JSON.parse(t)
      const list: Record<string, unknown>[] = (Array.isArray(j) ? j : []).flatMap((b: Record<string, unknown>) => (b?.dsList as Record<string, unknown>[]) ?? [])
      const all = list.length ? parseInt(String(list[0].ALL_CNT ?? '0'), 10) || 0 : 0
      const rows = list.map(x => Object.fromEntries(KEEP.map(k => [k, String(x[k] ?? '').trim()])) as Notice)
      return { rows, all }
    } catch (e) {
      last = String(e instanceof Error ? e.message : e)
      if (a < TRIES) await sleep(2000 * 2 ** (a - 1))
    }
  }
  throw new Error(`쪽 ${page} ${TRIES}번 실패: ${last}`)
}

async function collect() {
  const t0 = Date.now()
  const { data: tg, error: te } = await supabase.rpc('wave_notice_targets')
  if (te) throw new Error(`wave_notice_targets: ${te.message}`)
  const targets = (tg ?? []).filter((t: Record<string, unknown>) => t.due === true && t.has_warn === false && t.scope_text)
  const from = kstYmd(-3), to = kstYmd(0)
  const errors: string[] = []
  let calls = 0, ok = 0
  const notices: Notice[] = []
  if (targets.length) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      calls++
      try {
        const { rows, all } = await fetchPage(from, to, page)
        ok++
        notices.push(...rows)
        if (page * PAGE_SIZE >= all || !rows.length) break
      } catch (e) {
        errors.push(scrubSecrets(String(e instanceof Error ? e.message : e)).slice(0, 200))
        break
      }
    }
  }
  const run = { targets: targets.length, calls, ok_calls: ok, errors, duration_ms: Date.now() - t0, window_from: from, window_to: to }
  const { data, error } = await supabase.rpc('lh_notice_ingest', { p_notices: notices, p_run: run })
  if (error) throw new Error(`lh_notice_ingest: ${error.message}`)
  return { mode: 'collect', window: `${from}~${to}`, calls, ok_calls: ok, errors: errors.length, ...(data as Record<string, unknown>) }
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('unauthorized', { status: 401 })
  const p = new URL(req.url).searchParams
  if (p.get('mode') === 'authcheck') return Response.json({ mode: 'authcheck', ok: true })
  if (p.get('mode') !== 'collect') return Response.json({ error: 'mode=collect | authcheck' }, { status: 400 })
  try {
    return Response.json(await collect())
  } catch (e) {
    return new Response(scrubSecrets(JSON.stringify({ error: String(e instanceof Error ? e.message : e).slice(0, 300) })), { status: 500 })
  }
})
