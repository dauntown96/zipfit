// 유형 색(--ln-*)이 유형 띠·점 밖에 쓰이는 자리 셈(2026-11-12 · 우편함 「코드·운영 — …21026 마감 원인·고침 + 커트라인 공급 이력 …」 5 · #980 ⑦ 1)
// — health-screen ℹ️ 정보만(판정하지 않는다 · 이슈 없음). 원본 index.html 을 읽기만 한다(브라우저 없음).
//   띠·점 = 카드가 고른 유형 색을 받는 자리 — 선언에 var(--ln, …)(카드가 style.setProperty('--ln', var(--ln-<유형>))로 건다)를 쓰는 규칙.
//   밖   = 선언에 var(--ln-<이름>)을 곧바로 쓰는 규칙(유형과 상관없이 한 색을 「유형 색」에서 빌려 씀 — 막대·안내 상자 테두리·내 몫 글자 등).
//   날값 = 토큰 정의(:root 의 --ln-*: 값) 밖에서 그 날값(#1F5FBF 등)을 그대로 쓰는 자리(대소문자 무시).
//   zf3Recolor 짝 = 손으로 적힌 색을 var(--ln-*)로 바꾸는 짝 수 · style*= 칩 규칙 = [style*="#…"] 선택자가 zf3Recolor 가 ln 으로 바꾸는 손 색을 잡는 규칙 수.
export function lnWatch(src) {
  const defs = {}
  for (const m of src.matchAll(/--ln-([a-z]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) (defs[m[1]] ||= new Set()).add(m[2].toLowerCase())
  const raws = new Set(Object.values(defs).flatMap(s => [...s]))
  const css = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
  const inSel = [], outSel = [], rawSel = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, ' '), body = m[2]
    if (/^:root|data-theme|prefers-color-scheme/.test(sel) && /--ln-[a-z]+\s*:/.test(body)) continue
    if (/var\(--ln\s*,/.test(body)) inSel.push(sel)
    if (/var\(--ln-(?!ink\b)[a-z]+\)/.test(body.replace(/var\(--ln\s*,\s*var\(--ln-[a-z]+\)\s*\)/g, ''))) outSel.push(sel)   // 띠·점의 대체값(var(--ln,var(--ln-gi)))은 밖이 아니다
    const hexes = (body.match(/#[0-9a-fA-F]{6}\b/g) || []).map(h => h.toLowerCase())
    if (hexes.some(h => raws.has(h)) && !/--ln-[a-z]+\s*:/.test(body)) rawSel.push(sel)
  }
  const rec = (src.match(/function zf3Recolor\([\s\S]*?\n\}/) || [''])[0]
  const pairs = [...rec.matchAll(/\['color:(#[0-9a-fA-F]{3,6})',\s*'color:var\(--ln-[a-z]+\)'\]/g)].map(m => m[1].toLowerCase())
  let chip = 0
  for (const m of css.matchAll(/([^{}]+)\{/g)) for (const h of m[1].matchAll(/\[style\*="(#[0-9a-fA-F]{3,6})"\]/g)) if (pairs.includes(h[1].toLowerCase())) chip++
  const jsLn = (src.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').match(/var\(--ln-(?!ink\b)[a-z]+\)/g) || []).length
  return { band: inSel.length, inSel, out: outSel.length, outSel, raw: rawSel.length, rawSel, recolorPairs: pairs.length, chipRules: chip, jsLn }
}
