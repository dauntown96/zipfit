// 배포본 성능·전송량 기준선 — 2026-11-25(우편함 「코드·운영 — 스물여섯째」 1 · 💡 chrome-devtools-mcp 3f28 · 다운님 승인 11-24 15:06).
//   쓰임(한 줄): node scripts/perf-baseline.mjs --cdm <chrome-devtools-mcp 1.10.1 을 깐 폴더> --out <결과 폴더> [--chrome <크롬 경로>] [--net none,Fast 3G]
//     <폴더> 준비: npm i chrome-devtools-mcp@1.10.1 @modelcontextprotocol/sdk@1.20.2 (버전 고정 · 저장소 밖 임시 폴더 — 원칙 6 프레임워크 금지는 화면 쪽 · 이것은 재는 도구)
//   망 조건마다 빈 캐시 세션 하나(--isolated)에서 한 번씩: ① 첫 화면(빈 캐시 · 첫 방문) ② 공고 탭 누름 ③ 상세 하나 열기(…21132 — 정책 행 많은 공고).
//     화면당 1회(멈춤 조건 「화면당 3회 안」) · 390×844 · 헤드리스 · 사용 통계·CrUX 전송 끔 · 이용 기록(usage_events) 쓰기는 막음(initScript fetch 감쌈).
//   재는 것: LCP · CLS · INP(공고 탭 누름 · 상세 열기 — 도구 click = 신뢰 입력) — trace 요약 글 · 요청별 바이트 = trace 원본 ResourceFinish encodedDataLength(헤더 포함 전송량).
//   🔴 --slim 은 쓰지 않는다 — 1.10.1 slim 은 evaluate · navigate · screenshot 셋뿐이라 망 늦추기(emulate)·신뢰 클릭·trace 가 없다(회신 ③).
//   결과: <out>/<망>/{load,tab,detail}.trace.json.gz · summary-*.txt · <out>/result.json(값 · 상위 요청). 쓰기 0(배포본·DB) — 읽기만.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join, resolve } from 'node:path'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const CDM = resolve(arg('--cdm', '.')), OUT = resolve(arg('--out', 'perf-out'))
const CHROME = arg('--chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome')
const NETS = arg('--net', 'none,Fast 3G').split(',')
const SITE = 'https://kkokzip.com/', DETAIL_ID = arg('--detail', '2015122300021132'), DETAIL_WORD = arg('--detail-word', '충북혁신클러스터')
// MCP 클라이언트는 --cdm 폴더의 것을 쓴다(저장소에 npm 의존 0)
const { Client } = await import(join(CDM, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'))
const { StdioClientTransport } = await import(join(CDM, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'))
// 이용 기록(usage_events) 쓰기 막기 — 페이지 스크립트보다 먼저 fetch 를 감싸 그 주소만 바깥으로 안 보낸다(201 빈 응답).
//   --blockedUrlPattern 은 1.10.1 에서 망 늦추기(emulate)와 함께 못 쓴다(「Network throttling is not supported when network blocking … is configured」).
const NO_USAGE = `(() => { const f = window.fetch; window.fetch = function (u, o) { if (String(u && u.url || u).includes('/rest/v1/usage_events')) return Promise.resolve(new Response(null, { status: 201 })); return f.apply(this, arguments) } })()`
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function session(net) {
  const dir = join(OUT, net.replace(/\s+/g, '')); mkdirSync(dir, { recursive: true })
  const args = [join(CDM, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'), '--headless', '--isolated', '--no-usage-statistics',
    '--no-performance-crux', '--viewport', '390x844', '-e', CHROME, '--chromeArg=--no-sandbox', '--no-page-id-routing',
    '--workspace', OUT]
  if (process.env.HTTPS_PROXY) args.push('--proxyServer', process.env.HTTPS_PROXY)
  const t = new StdioClientTransport({ command: 'node', args, cwd: CDM, env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' }, stderr: 'ignore' })
  const c = new Client({ name: 'zipfit-perf-baseline', version: '1' }); await c.connect(t)
  const call = async (name, a = {}) => { const r = await c.callTool({ name, arguments: a }); const s = (r.content || []).map(x => x.text || '').join('\n'); if (r.isError) throw new Error(`${name}: ${s.slice(0, 300)}`); return s }
  const settle = net === 'none' ? 8000 : 30000
  const res = { net }
  await call('navigate_page', { type: 'url', url: 'about:blank' })
  if (net !== 'none') await call('emulate', { networkConditions: net })
  // ① 첫 화면
  await call('performance_start_trace', { reload: false, autoStop: false })
  await call('navigate_page', { type: 'url', url: SITE, initScript: NO_USAGE })
  await sleep(settle)
  res.load = await call('performance_stop_trace', { filePath: join(dir, 'load.trace.json.gz') }); writeFileSync(join(dir, 'summary-load.txt'), res.load)
  // ② 공고 탭 누름
  const snap = await call('take_snapshot', {})
  const tabUid = (snap.match(/uid=(\S+) tab "공고"/) || [])[1]
  if (!tabUid) throw new Error('공고 탭 uid 없음')
  await call('performance_start_trace', { reload: false, autoStop: false })
  await call('click', { uid: tabUid })
  await sleep(net === 'none' ? 4000 : 12000)
  res.tab = await call('performance_stop_trace', { filePath: join(dir, 'tab.trace.json.gz') }); writeFileSync(join(dir, 'summary-tab.txt'), res.tab)
  // ③ 상세 열기 — 검색 칸에 낱말을 넣어 그 카드만 남긴 뒤 카드 누름(검색 입력은 trace 밖)
  let snap2 = await call('take_snapshot', {})
  const searchUid = (snap2.match(/uid=(\S+) (?:searchbox|textbox) "[^"]*(?:검색|공고)[^"]*"/) || [])[1]
  if (searchUid) { await call('fill', { uid: searchUid, value: DETAIL_WORD }); await sleep(1500); snap2 = await call('take_snapshot', {}) }
  const cardUid = (snap2.match(new RegExp(`uid=(\\S+) button "${DETAIL_WORD}[^"]*상세 보기"`)) || [])[1]   // 카드 단추 이름 = 「<제목> 상세 보기」
  if (!cardUid) throw new Error('상세 카드 uid 없음')
  await call('performance_start_trace', { reload: false, autoStop: false })
  await call('click', { uid: cardUid })
  await sleep(net === 'none' ? 6000 : 20000)
  res.detail = await call('performance_stop_trace', { filePath: join(dir, 'detail.trace.json.gz') }); writeFileSync(join(dir, 'summary-detail.txt'), res.detail)
  res.opened = (await call('evaluate_script', { function: `() => JSON.stringify([...document.querySelectorAll('.hcard[aria-expanded="true"], .hcard.open, .hcard.expanded')].map(c => c.dataset.announcementId).concat(document.querySelector('.detail-grid') ? ['상세 칸 있음'] : []))` })).match(/\[[^\]]*\]/)?.[0]
  await c.close()
  for (const k of ['load', 'tab', 'detail']) res[k + '_bytes'] = bytesOf(join(dir, k + '.trace.json.gz'))
  return res
}

// trace 원본 → 요청별 전송 바이트(ResourceFinish.encodedDataLength · 헤더 포함) · URL 은 쿼리 앞 80자
export function bytesOf(path) {
  let raw = readFileSync(path); try { raw = gunzipSync(raw) } catch {}
  const j = JSON.parse(raw.toString('utf8')), ev = Array.isArray(j) ? j : j.traceEvents
  const url = new Map(), size = new Map()
  for (const e of ev) {
    const d = e.args && e.args.data
    if (!d || !d.requestId) continue
    if (e.name === 'ResourceSendRequest' && d.url) url.set(d.requestId, d.url)
    if (e.name === 'ResourceFinish') size.set(d.requestId, Math.max(size.get(d.requestId) || 0, d.encodedDataLength || 0))
  }
  const rows = [...size].map(([id, b]) => ({ url: String(url.get(id) || '?').replace(/([?&](appkey|apikey)=)[^&]+/g, '$1…').slice(0, 110), bytes: b })).sort((a, b) => b.bytes - a.bytes)
  return { requests: rows.length, total: rows.reduce((s, r) => s + r.bytes, 0), top: rows.slice(0, 10) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true })
  const all = []
  for (const net of NETS) all.push(await session(net))
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(all, null, 1))
  for (const r of all) console.log(r.net, '첫 방문', r.load_bytes.total, 'B ·', r.load_bytes.requests, '요청 · 탭', r.tab_bytes.total, '· 상세', r.detail_bytes.total, '·', r.opened)
}
