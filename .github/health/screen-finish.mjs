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
import { redactSecrets } from './redact.mjs'

const RESERVED = new Set(['kind', 'title', 'at', 'ok', 'failed', 'warned', 'checks', 'run_url'])
let r = null
try { r = JSON.parse(readFileSync('health-result.json', 'utf8')) } catch {}
const checks = Array.isArray(r?.checks) ? r.checks
  : [{ id: 'runner', name: '점검 실행', status: 'fail', value: '점검 스크립트가 결과 파일을 남기지 못했다', rule: '점검 스크립트가 끝까지 돈다' }]
const extra = {}
for (const [k, v] of Object.entries(r || {})) if (!RESERVED.has(k)) extra[k] = v

// ① 로그인 흐름 항목
const NAME = '로그인 흐름 한 바퀴(시험 계정 · 하루 1회)'
const RULE = '로그인 → 조건 저장 → 공고 탭 ★ 희망 조건 칩 → 추천 → 찜 저장·해제 → 정리(시험 계정 0 · 링크 응답 행 0 · 계정 없는 찜 0)'
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
    ? `로그인 → 조건 저장(${step?.msg || '저장'}) → ★ 칩 ${step?.mineChip === true ? '있음' : step?.mineChip === false ? '없음' : '안 봄'} → 추천 ${step?.cards ?? '?'}장 → 찜 ${save ? `${save.afterSave}행 → 해제 ${save.afterClear}행` : '(안 돎)'} → 정리(${cl})`
    : (j?.error ? redactSecrets(String(j.error)).slice(0, 200) : (j ? `${step?.mineChip === false ? '저장 직후 공고 탭 ★ 희망 조건 칩 없음 · ' : ''}정리 확인 실패 또는 저장·찜 실패${save && !save.ok ? `(찜 ${save.afterSave ?? '?'}→${save.afterClear ?? '?'}${save.why ? ' · ' + save.why : ''})` : ''}` : '결과 없음(스크립트가 죽음 · 시간 초과 300초)'))
      + (clean ? ` · 정리 뒤 ${cl}` : '')
  // 알림 경로 시험(simulate=login_fail)의 실패는 id 를 simulate_login_walk 로 — DB 행은 실패(ok=false)로 남되 런칭 게이트 셈(docs/launch-gates.sql
  //   realf: 'simulate%' 제외)이 실제 실패로 세지 않는다(운영 점검 simulate 와 같은 꼴).
  const sim = process.env.LW_SIMULATE === 'login_fail'
  login = { id: sim && !ok ? 'simulate_login_walk' : 'login_walk', name: NAME + (sim ? ' — 시험 실패(simulate=login_fail)' : ''), status: ok ? 'pass' : 'fail', value, rule: RULE }
  extra.login_walk = { ok, why: ok ? null : value, clean }
}
// ①′ 페르소나 여정 항목(2026-11-19 · 우편함 「코드·운영 — 14장」 ②) — 판정 ℹ️·⚠️만(실패로 세지 않는다 · 이슈를 열지 않는다)
//   입력 persona-walk.json(scripts/target-persona-check.mjs --rules 의 PERSONA_WALK_JSON) · 환경 PW_RAN=1(단계가 돌았다).
const PW_NAME = '페르소나 여정(P1~P5 진단 → 매칭 · 제목 규칙 · 하루 1회)'
const PW_RULE = '규칙(scripts/target-persona-rules.json) 위반이 화면 「맞음」이면 ⚠️ · 확인·판정 없음이면 ℹ️(화면이 거르지 못함 — 관찰) · 못 돌면 ⚠️ · 실패 0'
let persona
if (process.env.PW_RAN !== '1') {
  persona = { id: 'persona_walk', name: PW_NAME, status: 'skip', value: '이 실행은 페르소나 여정을 돌지 않는다(병합 뒤 실행 · 하루 1회 발송·수동만)', rule: PW_RULE }
} else {
  let w = null
  try { w = JSON.parse(readFileSync('persona-walk.json', 'utf8')) } catch {}
  const sim = process.env.LW_SIMULATE === 'persona_walk'
  if (w && sim) w.hits = [...(w.hits || []), { rule: 'R1', persona: 'P1', id: 'simulate', title: '(시험) 다자녀 전세임대', screen: 'ok' }]
  if (!w || !Array.isArray(w.hits)) {
    persona = { id: 'persona_walk', name: PW_NAME, status: 'warn', value: '결과 없음(스크립트가 못 돎 · 시간 초과 240초)', rule: PW_RULE }
  } else {
    const okHits = w.hits.filter(h => h.screen === 'ok')
    const kept = Object.entries(w.kept || {}).map(([p, n]) => `${p} ${n}`).join(' · ')
    const list = w.hits.slice(0, 6).map(h => `${h.rule} ${h.persona} …${String(h.id).slice(-6)} ${h.title}(화면 ${h.screen})`).join(' / ')
    persona = { id: sim ? 'simulate_persona_walk' : 'persona_walk', name: PW_NAME + (sim ? ' — 시험 위반(simulate=persona_walk)' : ''),
      status: okHits.length ? 'warn' : 'info',
      value: `남은 카드 ${kept} · 규칙 ${w.rules} · 위반 ${w.hits.length}(화면 맞음 ${okHits.length})${list ? ' — ' + list : ''}${w.page_errors ? ` · 페이지 오류 ${w.page_errors}` : ''}`, rule: PW_RULE }
    extra.persona_walk = { hits: w.hits.length, screen_ok: okHits.length, kept: w.kept || null }
  }
}
// ①″ 화면 퍼즈 항목(2026-11-19 · 우편함 「코드·운영 — 18장」 2) — 브랜치 점검(PR · ref)만 돈다 · 입력 screen-fuzz.json(scripts/screen-fuzz.mjs 의 FUZZ_JSON) · 환경 FZ_RAN=1.
const FZ_NAME = '화면 퍼즈(목록·곁 표 응답 오염 → 스크립트 실행 0 · 브랜치 점검)'
const FZ_RULE = '실행 · 만들어진 요소([data-zfx]) · javascript: 링크가 모두 0 이면 통과 · 하나라도 있으면 ❌(XSS 구멍 — 고침은 표시층) · 못 돌면 ⚠️'
let fuzz
if (process.env.FZ_RAN !== '1') {
  fuzz = { id: 'screen_fuzz', name: FZ_NAME, status: 'skip', value: '이 실행은 퍼즈를 돌지 않는다(배포본 실행 — PR · ref 브랜치 점검만)', rule: FZ_RULE }
} else {
  let f = null
  try { f = JSON.parse(readFileSync('screen-fuzz.json', 'utf8')) } catch {}
  const sim = !!f?.simulate
  if (!f || f.blind || !f.poisoned?.list) {
    fuzz = { id: 'screen_fuzz', name: FZ_NAME, status: 'warn', value: f ? `못 잼 — ${(f.errors || []).join(' / ').slice(0, 200)}` : '결과 없음(스크립트가 못 돎 · 시간 초과 300초)', rule: FZ_RULE }
  } else {
    const hole = f.exec || f.elems || f.jsLinks
    fuzz = { id: sim ? 'simulate_screen_fuzz' : 'screen_fuzz', name: FZ_NAME + (sim ? ' — 시험 구멍(simulate=fuzz)' : ''), status: hole ? 'fail' : 'pass',
      value: `실행 ${f.exec} · 요소 ${f.elems} · javascript 링크 ${f.jsLinks} · 펼친 카드 ${f.opened} · 쪽 ${f.pagesSeen} · 화면 ${(f.views || []).join('·')} · 오염 글자 ${f.poisoned.strings} · URL ${f.poisoned.urls} · 곁 표 ${f.poisoned.side}`, rule: FZ_RULE }
    extra.screen_fuzz = { exec: f.exec, elems: f.elems, jsLinks: f.jsLinks, opened: f.opened }
  }
}
const rest = checks.filter(c => !['login_walk', 'simulate_login_walk', 'persona_walk', 'simulate_persona_walk', 'screen_fuzz', 'simulate_screen_fuzz'].includes(c.id))
const all = [...rest, login, persona, fuzz]

// ② 실행 요약 DB 한 줄(점검 단계의 시각 그대로 — 발송 뒤 90분 안 기록 셈과 맞춘다)
if (process.env.SCREEN_RECORD !== '0') {
  const run_url = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null
  try {
    // 🔵 2026-11-04 — 시험 실행(수동 입력 simulate)이면 실행 요약 표지로(ops_health_runs.simulate · 게이트 셈·상태판이 뺀다)
    const n = await recordFindings({ kind: 'screen', at: r?.at || new Date().toISOString(), run_url, ref: process.env.GITHUB_REF_NAME || null,
      simulate: process.env.LW_SIMULATE || null,
      checks: all.map(c => ({ id: c.id, name: c.name, status: c.status, value: String(c.value ?? '') })) })
    console.log(`경고·실패 기록 ${n}행(kind=screen · 로그인 ${login.status})`)
  } catch (e) {
    all.push({ id: 'findings_log', name: '실행 요약·경고·실패 DB 기록(ops_health_runs kind=screen)', status: 'warn', value: String(e).slice(0, 200), rule: '기록 실패는 ⚠️ 경고만 — 판정은 결과 파일·이슈가 낸다' })
  }
} else console.log('SCREEN_RECORD=0 — DB 기록 안 함(브랜치 점검 site · record=false · 로컬 시험)')

// ③ 결과 파일·요약 다시 쓰기 — 머리가 로그인까지 센 결과
report('screen', 'A. 화면 점검', all, extra)
