// dict-gap.mjs — 최근 PR 제목에 자주 나오는데 ⑨ 5장 「검색 키워드 사전」에 없는 낱말을 센다(2026-11-20 · 우편함 「조사 — Notion 정리 1회차의 저장소 몫 하나」).
//
// 입력  ① PR 제목 — GitHub API(GITHUB_TOKEN · GITHUB_REPOSITORY · 기본 30일) 또는 --titles <파일>(JSON 배열 [{number,title}] · gh search 출력 그대로도 받음)
//       ② 사전 사본 — docs/routing/dict5-keywords.txt(⑨ 5장 왼쪽 칸 · 한 줄 = 한 행 · 「 · 」로 가름 · 정본은 ⑨)
// 출력  사전에 없는 낱말 상위 n — 나온 PR 수 · 예 PR 번호 셋(표준 출력 · --md · --json)
//
// 쓰는 법
//   node scripts/dict-gap.mjs --titles prs.json [--top 20] [--md out.md] [--json out.json]
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node scripts/dict-gap.mjs [--days 30]
//
// 🔴 「없는 낱말」은 후보일 뿐이다 — 사전에 넣을지는 ⑨를 고치는 쪽(claude.ai)이 고른다. 이 스크립트는 ⑨·Notion에 쓰지 않는다.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_DICT = join(HERE, '..', 'docs', 'routing', 'dict5-keywords.txt')

// 한 글자 꼬리(조사)·두 글자 꼬리를 뗀다 — 「분석률을」 → 「분석률」. 낱말이 두 글자 밑으로 줄면 떼지 않는다.
const TAILS = ['으로', '에서', '까지', '부터', '에게', '이며', '이고', '처럼', '보다', '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만']
// PR 제목에 늘 붙는 틀 낱말 — 사전 거리가 아니다(회차 이름 머리 · 수량 · 동작 꼬리).
const STOP = new Set([
  '회차', '고침', '더함', '걷음', '이력', '정리', '반영', '추가', '수정', '변경', '확인', '조사', '코드', '운영', '표시층', '분석',
  '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '첫', '새', '옛', '뒤', '앞', '전', '후', '한', '두', '세', '네',
  '및', '등', '그', '이', '것', '때', '곳', '수', '안', '밖', '중', '줄', '칸', '행', '건', '개', '장', '판', '쪽', '번', '날',
  'pr', 'run', 'fix', 'feat', 'docs', 'chore', 'the', 'and', 'for', 'to', 'of', 'in', 'on', 'a',
])

const norm = (s) => String(s || '').normalize('NFC').toLowerCase().trim()

// 사전 사본 → { terms: 행의 낱말 그대로, words: 낱말 + 낱말을 빈칸으로 가른 조각 }
export function loadDict(text) {
  const terms = new Set()
  const words = new Set()
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    for (const t of line.split(/\s+·\s+/)) {
      const term = norm(t)
      if (!term) continue
      terms.add(term)
      words.add(term)
      for (const w of term.split(/[\s/]+/)) if (w.length >= 2) words.add(stripTail(w))
    }
  }
  return { terms, words }
}

export function stripTail(w, min = 2) {
  if (!/[가-힣]$/.test(w)) return w
  for (const t of TAILS) if (w.endsWith(t) && w.length - t.length >= min) return w.slice(0, -t.length)
  return w
}

// 제목 → 낱말들(중복 없음). 백틱 안은 통째로 한 낱말(식별자) · PR 번호·숫자·공고 번호는 버린다.
export function tokenize(title) {
  const out = new Set()
  let s = String(title || '').normalize('NFC')
  s = s.replace(/`([^`]+)`/g, (_, code) => { const c = norm(code); if (/[a-z가-힣]/.test(c) && c.length >= 2) out.add(c); return ' ' })
  s = s.replace(/\(#\d+\)|#\d+/g, ' ')
  for (let piece of s.split(/[\s·,()「」『』\[\]{}:;!?"'“”‘’…—–→←↔<>|=+*~]+/)) {
    piece = norm(piece).replace(/^[-./]+|[-./]+$/g, '')
    if (piece.length < 2) continue
    if (!/[a-z가-힣]/.test(piece)) continue          // 숫자·기호만
    if (/^\d/.test(piece)) continue                   // 2026-11-20 · 3회차 · 10분
    if (/^…?\d{4,}/.test(piece) || /^[a-z]{2,3}_\d+$/.test(piece)) continue // 공고 번호(…21007 · gh_843 · sh_313225)
    const w = stripTail(piece)
    if (w.length < 2 || STOP.has(w)) continue
    out.add(w)
  }
  return [...out]
}

// 낱말이 사전에 있나 — 낱말·조각과 같거나, 여러 글자 낱말 안에 통째로 들어 있으면 있다(「정정」 ⊂ 「정정 몫」).
export function inDict(word, dict) {
  const w = norm(word)
  // 한 글자 줄기(「몫을」 → 「몫」)는 사전 대조 때만 떼 본다 — 셈 낱말로는 남기지 않는다.
  for (const c of new Set([w, stripTail(w, 1)])) {
    if (dict.words.has(c)) return true
    for (const t of dict.terms) if (t.length > c.length && t.includes(c)) return true
  }
  return false
}

// [{number,title}] → 사전에 없는 낱말 [{word, prs, sample}] · PR 수 큰 순 → 낱말 순
export function gap(prs, dict, top = 20) {
  const seen = new Map()
  for (const pr of prs || []) {
    if (!pr || !pr.title) continue
    for (const w of tokenize(pr.title)) {
      if (inDict(w, dict)) continue
      if (!seen.has(w)) seen.set(w, [])
      seen.get(w).push(pr.number)
    }
  }
  return [...seen.entries()]
    .map(([word, nums]) => ({ word, prs: nums.length, sample: nums.slice(0, 3) }))
    .sort((a, b) => b.prs - a.prs || a.word.localeCompare(b.word, 'ko'))
    .slice(0, Math.max(0, top))
}

export function toMarkdown(rows, meta) {
  const head = `## ⑨ 5장 사전에 없는 낱말 — 최근 PR 제목 ${meta.count}건(${meta.since} 뒤) · 상위 ${rows.length}\n\n`
  if (!rows.length) return head + '없음\n'
  return head + '| 순 | 낱말 | PR 수 | 예 PR |\n|---|---|---|---|\n' +
    rows.map((r, i) => `| ${i + 1} | ${r.word.replace(/\|/g, '\\|')} | ${r.prs} | ${r.sample.map((n) => '#' + n).join(' ')} |`).join('\n') + '\n'
}

// gh search · REST 응답 · 손으로 쓴 배열을 모두 [{number,title,created_at}]로
export function normalizePrs(data) {
  const arr = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : [])
  return arr.flatMap((x) => (x && Array.isArray(x.items) ? x.items : [x]))
    .filter((x) => x && x.title)
    .map((x) => ({ number: x.number, title: x.title, created_at: x.created_at || null }))
}

async function fetchPrs(repo, token, sinceIso) {
  const out = []
  for (let page = 1; page <= 20; page++) {
    const u = `https://api.github.com/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ZipFitBot-dict-gap' } })
    if (!r.ok) throw new Error(`GitHub ${r.status} — ${u}`)
    const rows = await r.json()
    if (!rows.length) break
    for (const p of rows) if (p.created_at >= sinceIso) out.push({ number: p.number, title: p.title, created_at: p.created_at })
    if (rows[rows.length - 1].created_at < sinceIso) break
  }
  return out
}

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def
}

async function main() {
  const days = Number(arg('--days', '30'))
  const top = Number(arg('--top', '20'))
  const sinceIso = new Date(Date.now() - days * 86400e3).toISOString()
  const dict = loadDict(readFileSync(arg('--dict', DEFAULT_DICT), 'utf8'))
  let prs
  const file = arg('--titles', null)
  if (file) {
    prs = normalizePrs(JSON.parse(readFileSync(file, 'utf8'))).filter((p) => !p.created_at || p.created_at >= sinceIso)
  } else {
    const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN
    if (!repo || !token) throw new Error('--titles 파일이 없으면 GITHUB_REPOSITORY · GITHUB_TOKEN 이 필요하다')
    prs = await fetchPrs(repo, token, sinceIso)
  }
  const rows = gap(prs, dict, top)
  const meta = { count: prs.length, since: sinceIso.slice(0, 10), dict_terms: dict.terms.size }
  const md = toMarkdown(rows, meta)
  process.stdout.write(md)
  const mdOut = arg('--md', null), jsonOut = arg('--json', null)
  if (mdOut) writeFileSync(mdOut, md)
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...meta, rows }, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(String(e && e.message || e)); process.exit(1) })
}
