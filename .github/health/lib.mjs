// 자동 점검(A 화면 · B 운영) 공통 — Node 20 내장 fetch 만 쓴다(의존성 없음).
// 🔴 DB 는 **읽기만** 한다: 관리 API 로 보내는 모든 SQL 앞에 `set transaction read only;` 를 붙인다
//    (요청 하나 = 트랜잭션 하나라 그 안의 쓰기는 전부 25006 으로 거부된다 — 2026-09-29 실측).
// 🔴 비밀값은 SUPABASE_ACCESS_TOKEN(기존 Actions Secret) 하나 · 공개 anon 키. 어떤 값도 출력하지 않는다.
import { writeFileSync, appendFileSync } from 'node:fs'

export const PROJECT_REF = 'khdpjjyspmlqtzperoqg'
export const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
// 공개 anon 키 — index.html 과 CLAUDE.md 에 이미 공개된 값이다(비밀 아님).
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs'
export const SITE = 'https://kkokzip.com/'

export async function sqlRead(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN 이 없다')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'set transaction read only;\n' + query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`관리 API ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

export async function anonRpc(fn, body, timeoutMs = 30000) {
  const t0 = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal,
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text) } catch { /* 본문이 JSON 이 아니면 null */ }
    return { status: res.status, ms: Date.now() - t0, data, snippet: res.ok ? '' : text.slice(0, 200) }
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, data: null, snippet: String(e).slice(0, 200) }
  } finally {
    clearTimeout(timer)
  }
}

// 결과를 세 곳에 남긴다 — ① 파일(Actions 아티팩트로 올린다 · claude.ai 가 커넥터로 받는다)
// ② 작업 요약(사람이 보는 표) ③ 로그 한 줄(HEALTH_RESULT_JSON= — 로그만 읽을 때).
export function report(kind, title, checks, extra = {}) {
  const failed = checks.filter(c => c.status === 'fail')
  // 🔵 2026-10-03 — warn(⚠️)은 알리기만 한다: 결과 파일·요약에 남고 ok 를 깨지 않는다(이슈를 열지 않는다).
  const warned = checks.filter(c => c.status === 'warn')
  const result = {
    kind, title, at: new Date().toISOString(),
    ok: failed.length === 0,
    failed: failed.map(c => c.id),
    warned: warned.map(c => c.id),
    checks, ...extra,
    run_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  }
  writeFileSync('health-result.json', JSON.stringify(result, null, 2))
  const cell = v => String(v ?? '').replace(/\u001b\[[0-9;]*m/g, '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').slice(0, 400)
  const icon = s => (s === 'pass' ? '✅' : s === 'fail' ? '❌' : s === 'skip' ? '⏭' : s === 'warn' ? '⚠️' : 'ℹ️')
  const head = (result.ok ? '통과' : `실패 ${failed.length}`) + (warned.length ? ` · 경고 ${warned.length}` : '')
  const lines = [`## ${title} — ${head}`, '',
    '| | 점검 | 값 | 기준 |', '|---|---|---|---|',
    ...checks.map(c => `| ${icon(c.status)} | ${c.name} | ${cell(c.value)} | ${cell(c.rule)} |`)]
  const md = lines.join('\n') + '\n'
  writeFileSync('health-summary.md', md)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
  console.log(md)
  console.log('HEALTH_RESULT_JSON=' + JSON.stringify({ kind, ok: result.ok, failed: result.failed, warned: result.warned, at: result.at }))
  return result
}
