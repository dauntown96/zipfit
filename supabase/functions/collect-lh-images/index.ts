// LH 단지형 공고 「단지 관련 이미지 정보」 목록 수집 Edge Function (2026-10-02 신설 — 우편함 「코드 — 현장 줄에 요일·제외 조각 · LH 단지 이미지 목록을 DB 표로」 2)
//
// 무엇을 하나: LH 공고 페이지의 이미지 탭(평면도 · 단지조감도 · 단지배치도 · 동호배치도 · 위치도 · 카다로그 · 기타) **파일 목록(메타데이터)**을
//   announcement_complex_images 에 남긴다. 🔴 파일은 받지 않는다 · Drive 를 건드리지 않는다 · announcement_extras 를 쓰지 않는다
//   — 받기·연결은 분석 회차 몫이다(collect-lh-promo 와 같은 역할 나눔). 페이지 구조는 parse.ts 머리.
//
// ⚠️ collect-announcements · collect-lh-promo 와 합치지 말 것 — 두 함수의 시간 예산을 잠식하지 않는다.
//   이 일은 공고 한 건에 페이지 1회(약 180~330KB)뿐이라 목록 추가 호출이 없다.
//
// 대상: LH · 매입임대(「주거복지 - 매입임대」 — 홍보물 표가 맡는다) 밖 · 목록 숨김 아님 · 접수 마감일이 오늘(KST) 이후이거나 없음, 그중
//   ① 새 공고(announcement_complex_image_fetch 에 행 없음) ② 첨부가 바뀐 공고(announcement_attachment_history.seen_at > fetched_at)
//   ③ 지난 시도가 실패하고 6시간이 지난 공고. 한 런은 시간 예산 안에서 앞에서부터 처리하고 남은 것은 다음 런이 이어 받는다.
//
// 모드: collect(기본) · probe(DB 미기록 — ?id=<PAN_ID> 한 건의 파싱 결과를 돌려준다) · authcheck.
//   collect 에 ?id=<PAN_ID>(여러 개는 쉼표)를 주면 대상 조건을 건너뛰고 그 공고만 다시 수집한다(역전파·재시도용).

import { createClient } from 'jsr:@supabase/supabase-js@2.116.0'
import { parseComplexImages, type ComplexImage } from './parse.ts'

const requireEnv = (key: string): string => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`필수 환경변수 누락: ${key}`)
  return v
}

const SUPABASE_URL              = requireEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const CRON_SECRET               = requireEnv('CRON_SECRET_V2')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const UA = 'Mozilla/5.0 (compatible; ZipFitBot/1.0; +https://kkokzip.com)'
const EXCLUDED_HOUSING_TYPE = '주거복지 - 매입임대'
const PAGE_TIMEOUT_MS = 30000
const PAGE_DELAY_MS = 500          // 페이지 호출 사이 간격 — 동시 호출하지 않는다
const RUN_BUDGET_MS = 100000       // 새 공고를 시작하지 않는 문턱(150초 wall-clock 한도 안쪽)
const MAX_ANNOUNCEMENTS = 20       // 한 런 상한
const RUN_ERROR_LIMIT = 3          // 한 런에 페이지 오류가 이만큼 나면 런을 멈춘다
const RETRY_AFTER_MS = 6 * 3600 * 1000

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

type Target = { announcement_id: string; url: string | null }

async function pickTargets(forceIds: string[]): Promise<Target[]> {
  if (forceIds.length) {
    const { data, error } = await supabase.from('announcements')
      .select('announcement_id, url').eq('source', 'LH').in('announcement_id', forceIds)
    if (error) throw new Error(`대상 조회: ${error.message}`)
    return (data ?? []) as Target[]
  }
  const { data: anns, error } = await supabase.from('announcements')
    .select('announcement_id, url')
    .eq('source', 'LH').neq('housing_type', EXCLUDED_HOUSING_TYPE)
    .not('hidden_from_listing', 'is', true)
    .or(`apply_end.is.null,apply_end.gte.${kstToday()}`)
  if (error) throw new Error(`대상 조회: ${error.message}`)
  const ids = (anns ?? []).map(a => a.announcement_id as string)
  if (!ids.length) return []
  const { data: done, error: e2 } = await supabase.from('announcement_complex_image_fetch')
    .select('announcement_id, fetched_at, ok').in('announcement_id', ids)
  if (e2) throw new Error(`수집 이력 조회: ${e2.message}`)
  const { data: hist, error: e3 } = await supabase.from('announcement_attachment_history')
    .select('announcement_id, seen_at').in('announcement_id', ids)
  if (e3) throw new Error(`첨부 이력 조회: ${e3.message}`)
  const lastSeen = new Map<string, number>()
  for (const h of hist ?? []) {
    const t = Date.parse(h.seen_at as string)
    lastSeen.set(h.announcement_id as string, Math.max(lastSeen.get(h.announcement_id as string) ?? 0, t))
  }
  const doneMap = new Map((done ?? []).map(d => [d.announcement_id as string, d]))
  const fresh: Target[] = [], changed: Target[] = [], retry: Target[] = []
  for (const a of (anns ?? []) as Target[]) {
    const d = doneMap.get(a.announcement_id)
    if (!d) { fresh.push(a); continue }
    const at = Date.parse(d.fetched_at as string)
    if ((lastSeen.get(a.announcement_id) ?? 0) > at) changed.push(a)
    else if (!d.ok && Date.now() - at > RETRY_AFTER_MS) retry.push(a)
  }
  const byId = (x: Target, y: Target) => x.announcement_id.localeCompare(y.announcement_id)
  return [...fresh.sort(byId), ...changed.sort(byId), ...retry.sort(byId)]
}

function pageUrlOf(t: Target): string {
  // 수집이 채운 url 을 쓰되 LH 공고 페이지가 아니면 panId 로 다시 만든다(유형 코드는 페이지가 panId 로 찾는다).
  try {
    const u = new URL(t.url ?? '')
    if (u.hostname === 'apply.lh.or.kr' && u.pathname.endsWith('/selectWrtancInfo.do')) return u.toString()
  } catch { /* 아래로 */ }
  return `https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=${encodeURIComponent(t.announcement_id)}&ccrCnntSysDsCd=03&uppAisTpCd=06&mi=1026`
}

type OneResult = { files: ComplexImage[]; pageStatus: number; pageBytes: number }

async function fetchOne(t: Target): Promise<OneResult> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), PAGE_TIMEOUT_MS)
  let html = '', pageStatus = 0
  try {
    const res = await fetch(pageUrlOf(t), { headers: { 'User-Agent': UA }, signal: ctl.signal })
    pageStatus = res.status
    html = await res.text()
  } finally {
    clearTimeout(timer)
  }
  if (pageStatus !== 200) throw new Error(`페이지 HTTP ${pageStatus}`)
  const r = parseComplexImages(html)
  if (!r.pageOk) throw new Error('공고 페이지 꼴이 아니다')
  // 🔴 평면도 스크립트 줄이 없으면 페이지 꼴이 바뀐 것이다 — 「0장」으로 쓰지 않고 실패로 남긴다(2026-10-02 대상 38쪽 전부 이 줄이 있었다).
  if (!r.floorplanLine) throw new Error('wrtancFloorplan 줄이 없다 — 페이지 꼴 바뀜')
  return { files: r.files, pageStatus, pageBytes: html.length }
}

async function saveOne(aid: string, r: OneResult, runAt: string, ms: number) {
  const rows = r.files.map(f => ({ ...f, announcement_id: aid, fetched_at: runAt }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('announcement_complex_images')
      .upsert(rows.slice(i, i + 200), { onConflict: 'announcement_id,sbd_lgo_no,file_sn' })
    if (error) throw new Error(`목록 저장: ${error.message}`)
  }
  // 이번 목록에 없는 옛 행을 걷는다(첨부가 바뀐 공고 — 이미지가 빠진 경우).
  const { error: delErr } = await supabase.from('announcement_complex_images')
    .delete().eq('announcement_id', aid).lt('fetched_at', runAt)
  if (delErr) throw new Error(`옛 목록 정리: ${delErr.message}`)
  const { error } = await supabase.from('announcement_complex_image_fetch').upsert({
    announcement_id: aid, fetched_at: runAt, ok: true,
    floorplans: rows.filter(f => f.tab === '평면도').length,
    images: rows.filter(f => f.tab === '이미지').length,
    files_listed: rows.length, duration_ms: ms, error: null,
  }, { onConflict: 'announcement_id' })
  if (error) throw new Error(`수집 이력 저장: ${error.message}`)
}

async function saveFail(aid: string, msg: string, ms: number) {
  // 🔴 실패면 목록 행은 건드리지 않는다(옛 목록 유지). 이력에만 남기고 6시간 뒤 다시 시도한다.
  await supabase.from('announcement_complex_image_fetch').upsert({
    announcement_id: aid, fetched_at: new Date().toISOString(), ok: false,
    duration_ms: ms, error: msg.slice(0, 500),
  }, { onConflict: 'announcement_id' })
}

async function collect(forceIds: string[]) {
  const startedAt = Date.now()
  const targets = await pickTargets(forceIds)
  let errorCount = 0
  let stoppedBy: string | null = null
  const done: Record<string, unknown>[] = []
  for (const t of targets.slice(0, MAX_ANNOUNCEMENTS)) {
    if (Date.now() - startedAt >= RUN_BUDGET_MS) { stoppedBy = 'budget'; break }
    if (done.length) await sleep(PAGE_DELAY_MS)
    const t0 = Date.now()
    try {
      const r = await fetchOne(t)
      const ms = Date.now() - t0
      await saveOne(t.announcement_id, r, new Date().toISOString(), ms)
      done.push({ id: t.announcement_id, ok: true, files: r.files.length, ms })
    } catch (e) {
      const ms = Date.now() - t0
      await saveFail(t.announcement_id, String(e), ms)
      done.push({ id: t.announcement_id, ok: false, error: String(e).slice(0, 200) })
      if (++errorCount >= RUN_ERROR_LIMIT) { stoppedBy = 'page_errors'; break }
    }
  }
  return { targets: targets.length, processed: done.length, stopped_by: stoppedBy, errors: errorCount, duration_ms: Date.now() - startedAt, done }
}

async function probe(id: string) {
  const r = await fetchOne({ announcement_id: id, url: null })
  return {
    id, page_status: r.pageStatus, page_bytes: r.pageBytes, files: r.files.length,
    floorplans: r.files.filter(f => f.tab === '평면도').length, sample: r.files.slice(0, 5),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Unauthorized' }, 401)
  const params = new URL(req.url).searchParams
  const mode = params.get('mode') ?? 'collect'
  if (mode === 'authcheck') return json({ mode, ok: true })
  const ids = (params.get('id') ?? '').split(',').map(s => s.trim()).filter(s => /^\d{10,20}$/.test(s))
  try {
    if (mode === 'probe') {
      if (ids.length !== 1) return json({ error: 'probe 는 ?id= 하나' }, 400)
      return json({ mode, ...(await probe(ids[0])) })
    }
    if (mode === 'collect') return json({ mode, ...(await collect(ids)) })
    return json({ error: `미구현 mode: ${mode}` }, 400)
  } catch (e) {
    return json({ mode, error: String(e) }, 500)
  }
})
