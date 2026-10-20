// 공급대상 판정 페르소나 대조 — 페르소나(scripts/target-personas.json) × 지금 열린 카드 → 카드별 판정 표(JSON + 사람이 읽는 표).
// (2026-10-20 · 우편함 「표시층 — 판정 페르소나 대조 스크립트를 저장소에」 · 백로그 「판정 페르소나 대조 스크립트가 회차마다 새로 짜여 저장소에 없다」)
//
// 왜: 판정 규칙(zfTarget*)을 고치는 회차마다 「페르소나 × 열린 카드 전후 표」를 임시 스크립트로 다시 짰다(2026-10-19 두 회차).
// 규칙: 🔴 판정 규칙을 여기 다시 쓰지 않는다 — 화면을 띄워 진단 칸에 페르소나 값을 넣고 화면 함수를 그대로 부른다.
//   열린 카드 = matchHouses 와 같은 거름(zfListRpc → zfLoadPostNotices·zfLoadRoutes → zfOpenNotices → 짝 있는/없는 [취소공고] 뺌).
//   판정 = zfTargetDiagFacts() → zfTargetVerdictFor()(「판정」 — 2026-10-19 회신 표가 잰 값) → zfTargetIncomeGate()(「화면」 — 매칭이 실제로 쓰는 값).
//   이유 낱말 = 판정 객체의 names · checks · targets · income.why, 안내 글자 = zfTargetNoteHtml().
// health-screen target_samples(.github/health/target-samples.json)와의 관계: 그쪽은 고정 키 표본 × 기대값(회귀 — 틀리면 실패),
//   여기는 운영 키 행 × 페르소나(관찰 — 기대값 없음 · 전후 차이만 본다). 축이 달라 그 파일을 넓히지 않았다.
//
// 쓰는 법(저장소 뿌리에서):
//   node scripts/target-persona-check.mjs                        # 작업 트리 index.html · 표를 찍고 결과 JSON 을 쓴다
//   node scripts/target-persona-check.mjs --base origin/main     # 🔵 규칙 회차 전후: 같은 데이터로 main 판과 작업 트리 판을 돌려 「바뀐 카드 × 페르소나」만
//   node scripts/target-persona-check.mjs --diff scripts/target-persona-baseline.json   # 저장한 기준과 비교(데이터가 바뀐 칸은 따로 가른다)
//   node scripts/target-persona-check.mjs --save scripts/target-persona-baseline.json   # 기준 저장
// 선택: --ref <git ref>(그 판 index.html 로) · --personas <파일> · --out <결과 JSON> · --md <사람이 읽는 표 .md> · --only P1,SP45
// 목록 RPC 는 scripts/render-list-stub.mjs 캐시(운영 anon 응답 그대로 · 원칙 26)를 쓴다. 키 행·소득 표는 화면이 부르는 운영 anon REST 그대로다.
// DB 쓰기 0 · 운영 화면을 재는 것이 아니다(배포본이 아니라 로컬 판을 띄운다).

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { stubListRpc } from './render-list-stub.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const req = createRequire(import.meta.url)
const { chromium } = (() => {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { return req(p) } catch {} }
  throw new Error('playwright 를 찾지 못했다(컨테이너: /opt/node22/lib/node_modules/playwright)')
})()

const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const personasFile = opt('--personas') || join(ROOT, 'scripts/target-personas.json')
const only = (opt('--only') || '').split(',').filter(Boolean)
const outFile = opt('--out') || join(tmpdir(), 'zipfit-target-persona-result.json')
const mdFile = opt('--md')

const SYM = { ok: '맞음', check: '확인', no: '아님', none: '—' }
const md5 = s => createHash('md5').update(s).digest('hex')

function htmlFor(ref) {
  if (!ref) return { html: readFileSync(join(ROOT, 'index.html')), label: '작업 트리' }
  const sha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', ref]).toString().trim()
  return { html: execFileSync('git', ['-C', ROOT, 'show', `${ref}:index.html`], { maxBuffer: 64 << 20 }), label: `${ref}(${sha})` }
}

// 저장소 뿌리를 그대로 내주고 index.html 만 고른 판으로 바꾼다.
function serve(html) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
  const srv = createServer((q, s) => {
    const p = decodeURIComponent(new URL(q.url, 'http://x').pathname)
    if (p === '/' || p === '/index.html') { s.writeHead(200, { 'content-type': types['.html'] }); return s.end(html) }
    const f = join(ROOT, p)
    if (!f.startsWith(ROOT) || !existsSync(f)) { s.writeHead(404); return s.end() }
    try { s.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)) } catch { s.writeHead(404); s.end() }
  })
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)))
}

async function run(browser, ref, personas) {
  const { html, label } = htmlFor(ref)
  const srv = await serve(html)
  const ctx = await browser.newContext({ serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  // 지도·분석 같은 바깥 스크립트는 판정과 무관 — 막아서 렌더를 가볍게 한다.
  await page.route(/dapi\.kakao\.com|t1\.kakaocdn\.net|googletagmanager|google-analytics/, r => r.abort())
  const stub = await stubListRpc(page)
  await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof zfTargetVerdictFor === 'function' && typeof zfTargetIncomeGate === 'function', null, { timeout: 30000 })
  const year = new Date().getFullYear()
  const res = await page.evaluate(async ({ personas, year }) => {
    // ── 열린 카드: matchHouses 와 같은 거름(지역·유형 칩 전) ──
    let rows = await zfListRpc(JSON.stringify(zfRpcArgs({ p_region: null, p_type: null, p_status: null })))
    if (!Array.isArray(rows)) throw new Error('목록 RPC 응답이 배열이 아님')
    const listed = rows.length
    await Promise.all([zfLoadPostNotices(), zfLoadRoutes()])
    rows = rows.filter(r => !isHiddenAsClosed(r))
    const drop = zfPairedCancelIds(rows, r => ({ id: r.announcement_id, title: r.title || '', url: r.url || '', applyEnd: r.apply_end || '' }))
    rows = rows.filter(r => !drop.has(r.announcement_id) && !zfIsCancelRow(r.title))
    const [loaded, urbanT, medianT] = await Promise.all([zfLoadTargetRows(), loadUrbanIncome(), loadMedianIncome()])
    if (!loaded) throw new Error('공급대상 키 행을 받지 못했다(zfLoadTargetRows)')
    const tables = (urbanT && medianT) ? { '도시근로자': urbanT, '기준중위소득': medianT } : null
    const cards = rows.map(r => {
      const gk = zfTargetRowsFor(r.announcement_id, r.title)
      return { id: String(r.announcement_id), title: r.title || '', apply_end: r.apply_end || '', key: gk ? JSON.stringify([gk, zfTargetMoneyOf.get(gk) || null]) : null }
    })
    // ── 진단 칸에 페르소나 값을 넣는다(사용자가 고른 것과 같은 자리) ──
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = String(v) }
    const fill = p => {
      zfMatchTouched.clear(); zfMatchFilledVals = {}
      diagMarital = p.marital || ''
      set('marital', p.marital || '')
      const by = p.birthYear != null ? p.birthYear : (p.age != null ? year - p.age : '')
      document.getElementById('birthYear').value = String(by)
      set('children', p.children != null ? p.children : 0)
      if (p.members != null) { set('members', p.members); zfMatchTouched.add('members') } else set('members', 2)   // 안 건드림 = 기본 2 · 판정은 모름
      document.getElementById('income').value = p.income != null ? String(p.income) : ''
      set('dualIncome', p.dualIncome || 'unknown')
      set('birthAfterBase', p.birthAfterBase || 'unknown')
      document.querySelectorAll('#zfClassSet input[name="zfClass"]').forEach(i => { i.checked = (p.classes || []).includes(i.value) })
    }
    const words = v => !v ? [] : v.state === 'check'
      ? [...(v.targets || []).map(t => '대상:' + t), ...(v.checks || []), ...(v.income ? ['소득:' + v.income.why] : [])]
      : (v.names || [])
    const box = document.createElement('div')
    const out = personas.map(p => {
      fill(p.inputs)
      const f = zfTargetDiagFacts(), m = zfDiagMoneyInputs()
      const facts = { marital: f.marital, children: f.children, birthYear: f.birthYear, members: f.members, classes: [...(f.classes || [])].sort(), income: m.income }
      const cells = {}
      rows.forEach(r => {
        const v = zfTargetVerdictFor(r.announcement_id, f, r.title)
        const g = zfTargetIncomeGate(v, r.announcement_id, r.title, f, m, tables)
        box.innerHTML = zfTargetNoteHtml(g)
        cells[String(r.announcement_id)] = { base: v ? v.state : 'none', screen: g ? g.state : 'none', why: words(g), note: box.textContent.replace(/\s+/g, ' ').trim() }
      })
      return { id: p.id, facts, cells }
    })
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const endOpen = rows.filter(r => { const e = parseNoticeDate(r.apply_end || ''); return e && startOfLocalDay(e) >= today }).length
    return { listed, endOpen, cards, out, tables: !!tables }
  }, { personas: personas.map(p => ({ id: p.id, inputs: p.inputs })), year })
  await ctx.close(); srv.close()
  if (errors.length) console.error(`⚠️ ${label} 페이지 오류 ${errors.length}:`, errors.slice(0, 3))
  const cards = res.cards.map(c => ({ id: c.id, title: c.title, apply_end: c.apply_end, key_md5: c.key ? md5(c.key).slice(0, 12) : null }))
  return {
    meta: { 판: label, index_md5: md5(html).slice(0, 12), 잰_시각: new Date().toISOString(), 목록_rpc: { 행: res.listed, 캐시: stub },
      열린_카드: cards.length, 키_있는_카드: cards.filter(c => c.key_md5).length, apply_end_오늘_이후: res.endOpen, 소득_표: res.tables,
      페르소나: personas.length, 칸: cards.length * personas.length, 페이지_오류: errors.length },
    personas: personas.map((p, i) => ({ id: p.id, name: p.name, facts: res.out[i].facts })),
    cards,
    cells: Object.fromEntries(res.out.map(o => [o.id, o.cells])),
  }
}

function counts(r, pid, axis) {
  const c = { ok: 0, check: 0, no: 0, none: 0 }
  Object.values(r.cells[pid]).forEach(x => c[x[axis]]++)
  return c
}
const cstr = c => `${c.ok} · ${c.check} · ${c.no} · ${c.none}`

function table(r) {
  const L = []
  const m = r.meta
  L.push(`# 공급대상 판정 페르소나 대조 — ${m.판} · index ${m.index_md5} · ${m.잰_시각}`)
  L.push(`열린 카드 ${m.열린_카드}(키 있음 ${m.키_있는_카드} · apply_end ≥ 오늘 ${m.apply_end_오늘_이후}) × 페르소나 ${m.페르소나} = 칸 ${m.칸} · 목록 RPC ${m.목록_rpc.행}행(캐시 ${m.목록_rpc.캐시.fetched ? '새로 받음' : m.목록_rpc.캐시.ageMin + '분 전'})`)
  L.push('')
  L.push('| 페르소나 | 판정 맞음 · 확인 · 아님 · 판정 없음 | 화면(소득 관문 뒤) |')
  L.push('|---|---|---|')
  r.personas.forEach(p => L.push(`| ${p.id} ${p.name} | ${cstr(counts(r, p.id, 'base'))} | ${cstr(counts(r, p.id, 'screen'))} |`))
  L.push('')
  L.push(`카드별(키 있는 카드만 · 칸 = 판정/화면 · 판정 없음 카드 ${m.열린_카드 - m.키_있는_카드}장은 모든 페르소나 「—」)`)
  L.push('')
  L.push(`| 카드 | ${r.personas.map(p => p.id).join(' | ')} |`)
  L.push(`|---|${r.personas.map(() => '---').join('|')}|`)
  r.cards.filter(c => c.key_md5).forEach(c => {
    L.push(`| ${c.id} ${c.title.slice(0, 28)} | ${r.personas.map(p => { const x = r.cells[p.id][c.id]; return x.base === x.screen ? SYM[x.base] : `${SYM[x.base]}/${SYM[x.screen]}` }).join(' | ')} |`)
  })
  L.push('')
  L.push('「확인」 이유 낱말(화면 기준 · 페르소나별)')
  r.personas.forEach(p => {
    const xs = r.cards.filter(c => r.cells[p.id][c.id].screen === 'check').map(c => `${c.id} ${r.cells[p.id][c.id].why.join(' · ') || '(낱말 없음)'}`)
    if (xs.length) L.push(`- ${p.id}: ${xs.join(' / ')}`)
  })
  return L.join('\n')
}

// 두 결과의 차이 — 판정이 바뀐 칸만. 키 행(md5)이 바뀐 카드는 「데이터」, 같으면 「코드」로 가른다.
function diff(a, b) {
  const L = []
  const A = new Map(a.cards.map(c => [c.id, c])), B = new Map(b.cards.map(c => [c.id, c]))
  const gone = a.cards.filter(c => !B.has(c.id)), came = b.cards.filter(c => !A.has(c.id))
  L.push(`# 전후 차이 — 전 ${a.meta.판}(${a.meta.잰_시각}) → 후 ${b.meta.판}(${b.meta.잰_시각})`)
  L.push(`열린 카드 ${a.meta.열린_카드} → ${b.meta.열린_카드} · 나감 ${gone.length} · 들어옴 ${came.length}`)
  gone.forEach(c => L.push(`- 나감 ${c.id} ${c.title}`))
  came.forEach(c => L.push(`- 들어옴 ${c.id} ${c.title}`))
  const ps = b.personas.filter(p => a.cells[p.id])
  b.personas.filter(p => !a.cells[p.id]).forEach(p => L.push(`- 새 페르소나 ${p.id}(전 결과에 없음 — 비교 안 함)`))
  const rows = []
  b.cards.filter(c => A.has(c.id)).forEach(c => ps.forEach(p => {
    const x = a.cells[p.id][c.id], y = b.cells[p.id][c.id]
    if (!x || !y || (x.base === y.base && x.screen === y.screen)) return
    rows.push(`| ${c.id} ${c.title.slice(0, 28)} | ${p.id} | ${SYM[x.base]}/${SYM[x.screen]} → ${SYM[y.base]}/${SYM[y.screen]} | ${A.get(c.id).key_md5 === c.key_md5 ? '코드' : '데이터(키 행 바뀜)'} | ${y.why.join(' · ')} |`)
  }))
  L.push('')
  L.push(`판정이 바뀐 칸 ${rows.length}(칸 = 판정/화면)`)
  if (rows.length) { L.push('', '| 카드 | 페르소나 | 전 → 후 | 까닭 | 후 이유 낱말 |', '|---|---|---|---|---|', ...rows) }
  return { text: L.join('\n'), changed: rows.length }
}

const personas = JSON.parse(readFileSync(personasFile, 'utf8')).personas.filter(p => !only.length || only.includes(p.id))
const browser = await chromium.launch()
try {
  const base = opt('--base')
  const after = await run(browser, opt('--ref'), personas)
  writeFileSync(outFile, JSON.stringify(after, null, 1))
  const text = table(after)
  console.log(text)
  if (mdFile) writeFileSync(mdFile, text + '\n')
  console.log(`\n결과 JSON: ${outFile}`)
  // 기준 파일은 비교에 쓰는 칸만(안내 글자 note 는 결과 JSON 에만 — 저장소 파일을 가볍게) · 캐시 경로는 컨테이너마다 달라 뺀다.
  if (opt('--save')) {
    // 한 칸 = 한 줄(다음 회차 git diff 가 바뀐 칸만 보이게).
    const J = JSON.stringify
    const meta = { ...after.meta, 목록_rpc: { 행: after.meta.목록_rpc.행 } }
    const body = [
      '{', ` "meta": ${J(meta)},`,
      ` "personas": [\n${after.personas.map(p => '  ' + J(p)).join(',\n')}\n ],`,
      ` "cards": [\n${after.cards.map(c => '  ' + J(c)).join(',\n')}\n ],`,
      ` "cells": {\n${Object.entries(after.cells).map(([p, cs]) => `  ${J(p)}: {\n${Object.entries(cs).map(([c, x]) => `   ${J(c)}: ${J({ base: x.base, screen: x.screen, why: x.why })}`).join(',\n')}\n  }`).join(',\n')}\n }`,
      '}']
    writeFileSync(opt('--save'), body.join('\n') + '\n'); console.log(`기준 저장: ${opt('--save')}`)
  }
  let before = null
  if (base) before = await run(browser, base, personas)
  else if (opt('--diff')) before = JSON.parse(readFileSync(opt('--diff'), 'utf8'))
  if (before) { const d = diff(before, after); console.log('\n' + d.text); if (mdFile) writeFileSync(mdFile, text + '\n\n' + d.text + '\n') }
} finally { await browser.close() }
