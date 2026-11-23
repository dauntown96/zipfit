// 운영 점검 같은 물음 중복 검사(2026-11-23 · 우편함 「코드·운영 — 열째 묶음」 2 · 아홉째 묶음 회신 ⑦1)
//   왜: 여덟째 묶음(#1222)이 이미 있던 unit_sigungu_unknown 과 같은 물음의 unit_sigungu 를 또 만들었다 — 한 사건에 ⚠️ 두 번.
//   무엇: .github/health/ops-check.mjs 의 add('id', '이름', …) 을 모아, 기준(base) 에 없던 새 id 의 이름이 기존 이름과
//         핵심 낱말을 OVERLAP 개 넘게(넷 이상) 겹치고 ∧ 겹침 비율(자카드 = 겹친 낱말 / 두 이름 낱말 합집합) ≥ JACCARD 이면
//         「⚠️ 같은 물음일 수 있음」을 낸다(실패 아님 — 종료 코드 0 · GitHub 주석 ::warning::).
//   비율 조건을 더한 까닭(2026-11-23 실측): 낱말 수만이면 지금 main 의 일부러 나란히 둔 쌍 13이 걸린다(LH/MYHOME 목록 0건 · 홍보물/이미지 수집 ·
//         simulate/simulate_hard 등 — 비율 최대 0.75). 이번 겹침(unit_sigungu ↔ unit_sigungu_unknown)은 7낱말 · 0.88 — 0.8 로 두 쪽을 가른다.
//   핵심 낱말 = 이름을 한글·영숫자 덩이로 자르고 → 끝 조사(이·가·은·는·을·를·의·에·도·만·로·으로·에서·에도·까지) 하나를 떼고 → 2자 이상 · 흔한 낱말(STOP) 뺌.
//   쓰는 법:
//     node scripts/ops-name-overlap.mjs --base origin/main          # PR: 기준에 없던 새 id 만 견준다
//     node scripts/ops-name-overlap.mjs --all                       # 지금 파일 안 모든 쌍(거짓 경보 셈 · 규칙 고를 때)
//     node scripts/ops-name-overlap.mjs --base <ref> --head <ref>   # 지난 상태 재현(예: 겹침이 생긴 PR)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const OVERLAP = 3   // 「셋 넘게」 = 넷 이상
export const JACCARD = 0.8
export const STOP = new Set(['정보', '없음', '있음', '셈', '이름', '점검', '불능', '것', '수', '안', '넘음', '같은', '전후', '지금', '오늘', '기준', '확인'])
const FILE = '.github/health/ops-check.mjs'
const JOSA = /(으로|에서|에도|까지|이|가|은|는|을|를|의|에|도|만|로)$/

export function itemsOf(src) {
  const out = new Map()
  for (const m of String(src || '').matchAll(/add(?:Blind)?\(\s*'([a-z0-9_]+)'\s*,\s*'([^']+)'/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2])   // 같은 id 의 첫 이름(점검 불능 줄은 뒤에 온다)
  }
  return out
}
export function wordsOf(name) {
  const w = new Set()
  for (const raw of String(name).split(/[^가-힣A-Za-z0-9_]+/)) {
    if (!raw) continue
    const x = raw.length > 2 ? raw.replace(JOSA, '') : raw
    if (x.length >= 2 && !STOP.has(x)) w.add(x)
  }
  return w
}
export function overlap(a, b) {
  const A = wordsOf(a), B = wordsOf(b)
  return [...A].filter(x => B.has(x))
}
export function jaccard(a, b) {
  const A = wordsOf(a), B = wordsOf(b)
  const u = new Set([...A, ...B]).size
  return u ? overlap(a, b).length / u : 0
}
export function isSameQuestion(a, b) { return overlap(a, b).length > OVERLAP && jaccard(a, b) >= JACCARD }
// 새 id(기준에 없음)마다 기존 id 와 겹침 > OVERLAP 인 쌍
export function findOverlaps(baseItems, headItems, { all = false } = {}) {
  const hits = []
  const ids = [...headItems.keys()]
  for (const id of ids) {
    if (!all && baseItems.has(id)) continue
    for (const [oid, oname] of (all ? headItems : baseItems)) {
      if (oid === id || (all && oid < id)) continue
      if (!isSameQuestion(headItems.get(id), oname)) continue
      hits.push({ id, name: headItems.get(id), other: oid, otherName: oname, words: overlap(headItems.get(id), oname), j: jaccard(headItems.get(id), oname) })
    }
  }
  return hits
}

function show(ref) { return execFileSync('git', ['show', `${ref}:${FILE}`], { encoding: 'utf8', maxBuffer: 64 << 20 }) }

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const val = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
  const all = argv.includes('--all')
  const head = val('--head') ? itemsOf(show(val('--head'))) : itemsOf(readFileSync(FILE, 'utf8'))
  const base = all ? new Map() : itemsOf(show(val('--base') || 'origin/main'))
  const hits = findOverlaps(base, head, { all })
  for (const h of hits) {
    const msg = `${h.id}「${h.name}」 ↔ ${h.other}「${h.otherName}」 — 핵심 낱말 ${h.words.length}개 겹침(${h.words.join(' · ')}) · 비율 ${h.j.toFixed(2)} — 같은 물음이면 기존 항목을 넓힌다`
    console.log(all ? msg : `::warning file=${FILE}::같은 물음일 수 있음: ${msg}`)
  }
  console.log(`점검 이름 겹침 ${all ? '(모든 쌍)' : '(새 id)'} ${hits.length} · 항목 ${head.size}${all ? '' : ` · 새 id ${[...head.keys()].filter(i => !base.has(i)).length}`} · 문턱 낱말 ${OVERLAP} 넘음 ∧ 비율 ≥ ${JACCARD}`)
}
