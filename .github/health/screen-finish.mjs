// A. 화면 점검 마무리 — 로그인 흐름 결과를 점검 항목 하나(login_walk)로 더하고, 실행 요약을 DB 한 줄로 남기고, 결과 파일·요약을 다시 쓴다.
// (2026-11-03 · 우편함 「코드·운영 — 로그인 결과 DB 기록 · 이슈 머리 · 찜 바퀴 + 이미지 같은 파일 공유」 A ①②)
//
// 왜: 그 전에는 점검 단계(screen-check.mjs)가 먼저 DB 에 기록하고 로그인 단계가 그 뒤에 결과 파일에만 실패를 더했다 —
//     로그인 실패 실행도 ops_health_runs kind=screen 행이 ok=true · failed [] 였고(런칭 게이트 G1 화면 셈이 못 봄),
//     이슈 본문 머리는 「A. 화면 점검 — 통과」인데 아래에 「❌ 로그인 흐름」이 붙었다(#821).
// 이제: health-screen 워크플로가 SCREEN_RECORD_DEFER=1 로 점검 단계의 기록을 미루고, 로그인 단계 뒤 이 스크립트가
//   ① login_walk 항목을 checks 에 더한다 — 로그인 단계가 돈 실행: 통과(pass) / 실패(fail) · 안 돈 실행(push 병합 뒤): 건너뜀(skip)
//   ② public.ops_health_record(jsonb · kind=screen)로 한 행 — 로그인 실패면 그 행이 ok=false · failed 에 login_walk
//   ③ lib.mjs report() 로 결과 파일·요약을 다시 쓴다 — 이슈 본문 머리(「— 통과」/「— 실패 N」)가 로그인까지 센 결과가 된다.
// 기록이 실패하면 종전처럼 ⚠️ findings_log 하나만 더한다(판정은 결과 파일·이슈가 낸다).
// 입력: health-result.json(점검 단계 · 없으면 runner 실패) · login-walk.json + 환경 LW_CODE(로그인 단계가 돌았을 때만) · LW_RAN=1(로그인 단계가 돌았다)
// 🔴 로그인 결과 JSON 에서 꺼내는 것은 ok · 오류문 · 정리 개수 · 저장 메시지 · 카드 수 · 찜 행 수뿐이다(링크·토큰·id 는 그 파일에 없다 — test-login.mjs).
import { readFileSync, existsSync } from 'node:fs'
import { report, recordFindings } from './lib.mjs'

const RESERVED = new Set(['kind', 'title', 'at', 'ok', 'failed', 'warned', 'checks', 'run_url'])
let r = null
try { r = JSON.parse(readFileSync('health-result.json', 'utf8')) } catch {}
const checks = Array.isArray(r?.checks) ? r.checks
  : [{ id: 'runner', name: '점검 실행', status: 'fail', value: '점검 스크립트가 결과 파일을 남기지 못했다', rule: '점검 스크립트가 끝까지 돈다' }]
const extra = {}
for (const [k, v] of Object.entries(r || {})) if (!RESERVED.has(k)) extra[k] = v

// ① 로그인 흐름 항목
const NAME = '로그인 흐름 한 바퀴(시험 계정 · 하루 1회)'
const RULE = '로그인 → 조건 저장 → 추천 → 찜 저장·해제 → 정리(시험 계정 0 · 링크 응답 행 0 · 계정 없는 찜 0)'
let login
if (process.env.LW_RAN !== '1') {
  login = { id: 'login_walk', name: NAME, status: 'skip', value: '이 실행은 로그인 흐름을 돌지 않는다(병합 뒤 실행 · 하루 1회 발송·수동만)', rule: RULE }
} else {
  let j = null
  try { j = JSON.parse(readFileSync('login-walk.json', 'utf8')) } catch {}
  const ok = !!(j && j.ok === true && process.env.LW_CODE === '0')
  const clean = j?.clean ?? null
  const step = j?.result?.steps?.[0] ?? null
  const save = j?.result?.save ?? null
  const cl = clean ? `시험 계정 ${clean.test_accounts} · 링크 응답 행 ${clean.link_rows} · 계정 없는 찜 ${clean.saved_orphans ?? '?'}` : '정리 확인 없음'
  const value = ok
    ? `로그인 → 조건 저장(${step?.msg || '저장'}) → 추천 ${step?.cards ?? '?'}장 → 찜 ${save ? `${save.afterSave}행 → 해제 ${save.afterClear}행` : '(안 돎)'} → 정리(${cl})`
    : (j?.error ? String(j.error).slice(0, 200) : (j ? `정리 확인 실패 또는 저장·찜 실패${save && !save.ok ? `(찜 ${save.afterSave ?? '?'}→${save.afterClear ?? '?'}${save.why ? ' · ' + save.why : ''})` : ''}` : '결과 없음(스크립트가 죽음 · 시간 초과 300초)'))
      + (clean ? ` · 정리 뒤 ${cl}` : '')
  // 알림 경로 시험(simulate=login_fail)의 실패는 id 를 simulate_login_walk 로 — DB 행은 실패(ok=false)로 남되 런칭 게이트 셈(docs/launch-gates.sql
  //   realf: 'simulate%' 제외)이 실제 실패로 세지 않는다(운영 점검 simulate 와 같은 꼴).
  const sim = process.env.LW_SIMULATE === 'login_fail'
  login = { id: sim && !ok ? 'simulate_login_walk' : 'login_walk', name: NAME + (sim ? ' — 시험 실패(simulate=login_fail)' : ''), status: ok ? 'pass' : 'fail', value, rule: RULE }
  extra.login_walk = { ok, why: ok ? null : value, clean }
}
const rest = checks.filter(c => c.id !== 'login_walk' && c.id !== 'simulate_login_walk')
const all = [...rest, login]

// ② 실행 요약 DB 한 줄(점검 단계의 시각 그대로 — 발송 뒤 90분 안 기록 셈과 맞춘다)
if (process.env.SCREEN_RECORD !== '0') {
  const run_url = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null
  try {
    const n = await recordFindings({ kind: 'screen', at: r?.at || new Date().toISOString(), run_url, ref: process.env.GITHUB_REF_NAME || null,
      checks: all.map(c => ({ id: c.id, name: c.name, status: c.status, value: String(c.value ?? '') })) })
    console.log(`경고·실패 기록 ${n}행(kind=screen · 로그인 ${login.status})`)
  } catch (e) {
    all.push({ id: 'findings_log', name: '실행 요약·경고·실패 DB 기록(ops_health_runs kind=screen)', status: 'warn', value: String(e).slice(0, 200), rule: '기록 실패는 ⚠️ 경고만 — 판정은 결과 파일·이슈가 낸다' })
  }
} else console.log('SCREEN_RECORD=0 — DB 기록 안 함(로컬 시험)')

// ③ 결과 파일·요약 다시 쓰기 — 머리가 로그인까지 센 결과
report('screen', 'A. 화면 점검', all, extra)
