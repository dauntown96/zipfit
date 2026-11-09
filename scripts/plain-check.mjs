// 쉽게 쓴 말 기계 검사 — 정책 행 content_raw(원문) ↔ content_plain(쉽게 쓴 말) 한 쌍을 다섯 검사로 본다(2026-11-09 ·
//   우편함 「코드·운영 — 쉽게 쓴 말 저장 칸」 2장 · 스킬 zipfit-notice-analysis references/interpretation.md 「표시 층 「쉽게 쓴 말」」).
// 🔴 쓰기 0 — DB·파일에 쓰지 않는다. 통과한 글만 content_plain 에 넣고 content_plain_check 에 PLAIN_CHECK_VERSION 을 적는다(넣는 것은 분석 회차).
//   ① 원문 낱알(숫자·날짜·시각·%·「」 이름·URL·조건어)이 쉽게 쓴 말에 전부 있다
//   ② 쉽게 쓴 말에 원문 밖 낱알이 0
//   ③ 부정·제한 갈래(부정 · 제외 · 한정)가 그대로 — 「불가 → 할 수 없어요」는 같은 갈래(부정)
//   ④ 때 낱말(현재·금회·당해·이번 …)이 원문 그대로 · 같은 수
//   ⑤ 주어 없는 원문 문장은 그대로 둔다(쉽게 쓴 말에 그 문장이 글자 그대로) — ⚠️ 근사(조사로 주어를 가늠한다) · 최종 판정은 claude.ai
// 쓰는 법:
//   node scripts/plain-check.mjs <원문.txt> <쉽게.txt>          — 한 쌍
//   node scripts/plain-check.mjs --json <쌍.json>               — [{id?, raw, plain}, …]
//   통과 = 종료 코드 0 · 실패가 하나라도 있으면 1(사유를 찍는다). 시험: node scripts/plain-check.test.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const PLAIN_CHECK_VERSION = 'plain-check v1'

// 조건어 — 낱알로 센다(①·② 양쪽).
const COND_WORDS = ['이상', '이하', '초과', '미만', '이내']
// 때 낱말 — 원문과 같은 낱말·같은 수(④).
export const TIME_WORDS = ['현재', '금회', '당해', '이번', '금번', '기존', '종전', '최초']
// 부정·제한 갈래(③) — 갈래마다 표지 하나라도 있으면 「있음」. 원문에 있는 갈래는 쉽게 쓴 말에도, 없는 갈래는 쉽게 쓴 말에도 없어야 한다.
const POLARITY = {
  부정: [/않/, /없/, /불가/, /못\s?[하해합]/, /금지/, /아니/, /안\s?[되돼됩]/, /불허/, /불인정/, /무효/],
  제외: [/제외/, /빼고/, /뺀/, /배제/],
  // 「만」은 한글·닫는 괄호 뒤 · 띄어쓰기·문장부호·조사 앞만(「1,000만 원」·「만 19세」·「만들다」를 거른다)
  한정: [/[가-힣)」]만[이을은의도]?(?![가-힣])/u, /한하여/, /한함/, /한정/, /에\s?한해/, /에\s?한한/, /뿐/],
}

const norm = (s) => String(s ?? '').normalize('NFC').replace(/\r\n?/g, '\n')

// 낱알 뽑기 — 같은 값의 다른 꼴(「1,000」·「1000」 · 「2026. 11. 9.」·「2026.11.9」)은 하나로 맞춘다.
export function grains(text) {
  let t = norm(text)
  const out = []
  const take = (re, kind, fix = (x) => x) => {
    t = t.replace(re, (m) => { out.push(`${kind}:${fix(m)}`); return ' ' })
  }
  take(/https?:\/\/[^\s)」"'<>]+/g, 'url', (m) => m.replace(/[.,]+$/, ''))
  take(/「[^」]+」/g, '이름')
  // 날짜(연.월.일 · 연-월-일 · 연/월/일) — 띄어쓰기·끝 점 무시
  take(/\d{2,4}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}\.?/g, '날짜', (m) => m.replace(/\s+/g, '').replace(/\.$/, '').replace(/[-/]/g, '.').split('.').map((x) => String(+x)).join('.'))
  take(/\d{1,2}\s*:\s*\d{2}/g, '시각', (m) => m.replace(/\s+/g, '').replace(/^0(?=\d)/, ''))
  take(/\d[\d,]*(?:\.\d+)?\s*%/g, '%', (m) => m.replace(/[\s,]/g, ''))
  take(/\d[\d,]*(?:\.\d+)?/g, '수', (m) => m.replace(/,/g, ''))
  for (const w of COND_WORDS) for (const _ of norm(text).matchAll(new RegExp(w, 'g'))) out.push(`조건어:${w}`)
  return out
}

const bag = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())
const count = (s, w) => (norm(s).match(new RegExp(w, 'g')) ?? []).length

// 문장 나누기 — 줄바꿈 · 마침표·물음표·느낌표 뒤 띄어쓰기(숫자 사이 점은 가르지 않는다).
export function sentences(text) {
  return norm(text).split(/\n+|(?<=[^\d][.?!])\s+/).map((x) => x.trim()).filter(Boolean)
}

// 주어 표지(근사) — 명사 뒤 「이·가·께서·은·는」 · 동사 관형형(「하는」·「있는」 …)·「또는」 같은 꼴은 뺀다.
const NOT_SUBJECT = /^(또는|혹은|있는|없는|하는|되는|않는|받는|드는|오는|가는|이는|나는|같이|함께|모두가|만이|뿐이)$|(하|되|있|없|않|받|드|오|주|지|리|시|내|두|보|쓰|따르|이르|이루)는$/
export function hasSubject(sentence) {
  for (const w of norm(sentence).split(/[\s,·()「」:]+/)) {
    const tok = w.replace(/[.?!]+$/, '')
    if (tok.length < 2 || NOT_SUBJECT.test(tok)) continue
    if (/(께서|[가-힣A-Za-z0-9)][이가은는])$/.test(tok)) return true
  }
  return false
}

const squash = (s) => norm(s).replace(/\s+/g, '')

export function checkPlain(raw, plain) {
  const fails = []
  const R = norm(raw), P = norm(plain)
  if (!R.trim()) fails.push({ kind: '입력', detail: '원문이 비었다' })
  if (!P.trim()) fails.push({ kind: '입력', detail: '쉽게 쓴 말이 비었다' })
  if (fails.length) return { ok: false, fails }

  // ① · ②
  const gr = bag(grains(R)), gp = bag(grains(P))
  const missing = [...gr].filter(([k, n]) => (gp.get(k) ?? 0) < n).map(([k, n]) => `${k}(${n - (gp.get(k) ?? 0)})`)
  const extra = [...gp].filter(([k, n]) => (gr.get(k) ?? 0) < n).map(([k, n]) => `${k}(${n - (gr.get(k) ?? 0)})`)
  if (missing.length) fails.push({ kind: '①낱알 빠짐', detail: missing.join(' · ') })
  if (extra.length) fails.push({ kind: '②원문 밖 낱알', detail: extra.join(' · ') })

  // ③
  for (const [g, res] of Object.entries(POLARITY)) {
    const inR = res.some((re) => re.test(R)), inP = res.some((re) => re.test(P))
    if (inR && !inP) fails.push({ kind: '③부정·제한 갈래', detail: `원문의 「${g}」 갈래가 쉽게 쓴 말에 없다` })
    if (!inR && inP) fails.push({ kind: '③부정·제한 갈래', detail: `원문에 없는 「${g}」 갈래가 쉽게 쓴 말에 있다` })
  }

  // ④
  const tw = TIME_WORDS.filter((w) => count(R, w) !== count(P, w)).map((w) => `${w} 원문 ${count(R, w)} · 쉽게 ${count(P, w)}`)
  if (tw.length) fails.push({ kind: '④때 낱말', detail: tw.join(' · ') })

  // ⑤ (근사)
  const sp = squash(P)
  const bare = sentences(R).filter((s) => !hasSubject(s) && !sp.includes(squash(s)))
  if (bare.length) fails.push({ kind: '⑤주어 없는 문장 바뀜(근사)', detail: bare.map((s) => `「${s.length > 40 ? s.slice(0, 40) + '…' : s}」`).join(' · ') })

  return { ok: fails.length === 0, fails }
}

function report(id, r) {
  console.log(`${r.ok ? '✓ 통과' : '✗ 실패'}${id ? ` ${id}` : ''}`)
  for (const f of r.fails) console.log(`   ${f.kind} — ${f.detail}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2)
  let pairs
  if (a[0] === '--json' && a[1]) pairs = JSON.parse(readFileSync(a[1], 'utf8'))
  else if (a.length === 2) pairs = [{ raw: readFileSync(a[0], 'utf8'), plain: readFileSync(a[1], 'utf8') }]
  else { console.error('쓰는 법: node scripts/plain-check.mjs <원문.txt> <쉽게.txt> | --json <쌍.json>'); process.exit(2) }
  let bad = 0
  for (const p of pairs) { const r = checkPlain(p.raw, p.plain); if (!r.ok) bad++; report(p.id, r) }
  console.log(`— ${PLAIN_CHECK_VERSION} · 쌍 ${pairs.length} · 실패 ${bad}`)
  process.exit(bad ? 1 : 0)
}
