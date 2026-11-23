// wide-fetch.mjs 시험(2026-11-23 · 여섯째 묶음 2) — node .github/health/wide-fetch.test.mjs
//    실제 소스(index.html · screen-check.mjs)로 「지금 자리를 찾는가」와, 낮춘 문턱에서 한 번 뜨는가를 본다.
import { readFileSync } from 'node:fs'
import { judgeWideFetch, bodyOf, outsideSpots, SPOTS } from './wide-fetch.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const root = new URL('../../', import.meta.url)
const sources = Object.fromEntries([...new Set(SPOTS.map(s => s.file))].map(f => [f, readFileSync(new URL(f, root), 'utf8')]))
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
console.log(`wide-fetch 시험 ${ok}/${ok + bad}`)
if (bad) process.exit(1)
