// wide-fetch.mjs 시험(2026-11-23 · 여섯째 묶음 2) — node .github/health/wide-fetch.test.mjs
//    실제 소스(index.html · screen-check.mjs)로 「지금 자리를 찾는가」와, 낮춘 문턱에서 한 번 뜨는가를 본다.
import { readFileSync } from 'node:fs'
import { judgeWideFetch, bodyOf, outsideSpots, callChunk, SPOTS } from './wide-fetch.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const root = new URL('../../', import.meta.url)
const real = Object.fromEntries([...new Set(SPOTS.map(s => s.file))].map(f => [f, readFileSync(new URL(f, root), 'utf8')]))
// 🔵 2026-11-23(여덟째 묶음) — #1215 병합 뒤 실제 소스의 SPOTS 는 모두 zfGetAll(대상 밖)이라, 문턱 시험은 쪽 나눔 표지를 지운 사본으로 한다.
const sources = Object.fromEntries(Object.entries(real).map(([f, s]) => [f, s.replaceAll('zfGetAll(', 'zfGetX(').replaceAll('offset=', 'offX=')]))
t('실제 소스 — SPOTS 여섯 모두 쪽 나눔 있음(#1215 뒤)', judgeWideFetch({ sources: real, counts: {}, maxRows: 2000 }).paged.length === SPOTS.length)
const small = Object.fromEntries(SPOTS.map(s => [s.key, 10]))

const j0 = judgeWideFetch({ sources, counts: small, maxRows: 2000 })
t('실제 소스에서 자리를 다 찾는다', j0.gone.length === 0)
t('작으면 통과', j0.status === 'pass')
t('max_rows 못 읽으면 상수', judgeWideFetch({ sources, counts: small, maxRows: null }).cap === 2000)
t('문턱 = 0.8 배', j0.line === 1600)
t('문턱 넘으면 ⚠️', judgeWideFetch({ sources, counts: { ...small, tier_hu: 1600 }, maxRows: 2000 }).status === 'warn')
t('문턱을 낮추면 지금 값으로도 뜬다', judgeWideFetch({ sources, counts: small, maxRows: 2000, ratio: 0.001 }).near.length > 0)
t('셈 못 하면 ⚠️', judgeWideFetch({ sources, counts: { ...small, win_sched: null }, maxRows: 2000 }).status === 'warn')
// 쪽 나눔이 들어가면 그 자리는 빠진다(병합 순서 무관)
const pagedSrc = { ...sources, 'index.html': sources['index.html'].replace('function zfLoadWinSched(){', "function zfLoadWinSched(){ const x = 'limit=1000&offset=0';") }
const jp = judgeWideFetch({ sources: pagedSrc, counts: { ...small, win_sched: 99999 }, maxRows: 2000 })
t('쪽 나눔 들어간 자리는 대상 밖', jp.status === 'pass' && jp.paged.some(p => p.key === 'win_sched'))
t('자리를 못 찾으면 ⚠️', judgeWideFetch({ sources: { ...sources, 'index.html': '' }, counts: small, maxRows: 2000 }).status === 'warn')
t('bodyOf 는 다음 최상위 선언에서 끊는다', bodyOf('function a(){\n  x\n}\nfunction b(){ offset= }', 'function a(') === '){\n  x\n}')
t('bodyOf 는 같은 깊이 다음 문장에서 끊는다', bodyOf('  const o = await f(() => {\n    y\n  })\n  const z = 1 // offset=', 'const o = ') === 'await f(() => {\n    y\n  })')
// 🔵 2026-11-23(일곱째 묶음 3·4)
const getAllSrc = { ...sources, 'index.html': sources['index.html'].replace('function zfLoadWinSched(){', "function zfLoadWinSched(){ zfGetAll('announcement_schedule?select=x');") }
const jg = judgeWideFetch({ sources: getAllSrc, counts: { ...small, win_sched: 99999 }, maxRows: 2000 })
t('zfGetAll 꼴 본문은 대상 밖', jg.status === 'pass' && jg.paged.some(p => p.key === 'win_sched'))
const os = outsideSpots('function a(){\n  fetch(`${U}/rest/v1/t?select=x`)\n  fetch(`${U}/rest/v1/t?select=x&limit=5`)\n  // fetch(`${U}/rest/v1/c`)\n}\nfunction zfLoadWinSched(){\n  fetch(`${U}/rest/v1/s?select=y`)\n}')
t('SPOTS 밖 통째 조회 — 표지 없는 줄만 · SPOTS 함수·주석 뺌', os.length === 1 && os[0].fn === 'a')
t('값 칸에 SPOTS 밖 수', /ℹ️ SPOTS 밖 통째 조회 \d+/.test(j0.value))
// 🔵 2026-11-23(여덟째 묶음 1) — 호출 한 덩이
const nextLine = outsideSpots('function b(){\n  const r = await fetch(\n    `${U}/rest/v1/announcements?select=x&announcement_id=in.(${l})`,\n    { headers: h });\n}')
t('다음 줄 거름(in.)은 뺌', nextLine.length === 0)
const nextLimit = outsideSpots('function b(){\n  const r = await fetch(`${U}/rest/v1/t?select=x`,\n    { headers: h, x: `&limit=5` });\n}')
t('덩이 안 다음 줄 표지(limit=)는 뺌', nextLimit.length === 0)
const pids = outsideSpots('function c(){\n  fetch(`${U}/rest/v1/rpc/f`,\n    {method:"POST", body: JSON.stringify({p_ids: need})});\n  fetch(`${U}/rest/v1/rpc/g`, {method:"POST", body: "{}"});\n}')
t('p_ids RPC 는 뺌 · 인자 없는 RPC 는 셈', pids.length === 1 && pids[0].line === 4)
t('표에 POST(쓰기)는 뺌', outsideSpots("function d(){\n  fetch(U+'/rest/v1/usage_events',\n    {method:'POST', body:b})\n}").length === 0)
t('callChunk 는 짝 괄호에서 끊는다', callChunk(['fetch(`/rest/v1/t`, { a: (1) })', 'next(/rest/v1/z)'], 0) === 'fetch(`/rest/v1/t`, { a: (1) })')
console.log(`wide-fetch 시험 ${ok}/${ok + bad}`)
if (bad) process.exit(1)
