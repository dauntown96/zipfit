// API 활용신청 만료 판정(2026-11-12 · 우편함 「코드·운영 — 0장 일곱 …」 7 · 다운님 질문 「API 만료 관리」).
// 재료는 docs/api-expiry.json(정본 표 docs/data-sources.md 「키·신청·만료」의 기계 사본 · 키 이름만).
// 남은 날(KST 날짜 차) ≤ warn_days(60) = ⚠️ · ≤ fail_days(30) 또는 지남 = ❌(안 멈춤 — gate.mjs HARD 밖 → health-ops-soft 이슈가 열려 다운님에게 닿는다)
//   (2026-11-12 두 단계 — 우편함 「코드·운영 — 서울 실행 EF 공용 길 …」 4 · claude.ai 판정) · expires=null 은 「표시 없음」으로 세기만(경보 밖).
// 비밀값(토큰) 만료는 따로 — secret_expiry(zipfit_ops.secret_expiry_list · 30일).
const kstDay = d => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3)

export function judgeApiExpiry(doc, now = new Date()) {
  const today = kstDay(now)
  const warnDays = Number(doc.warn_days ?? 60)
  const failDays = Number(doc.fail_days ?? 30)
  const dated = [], none = []
  for (const e of doc.entries || []) {
    if (!e.expires) { none.push(e); continue }
    dated.push({ ...e, left: daysBetween(today, e.expires) })
  }
  dated.sort((a, b) => a.left - b.left)
  const soon = dated.filter(e => e.left <= warnDays)
  const hard = soon.filter(e => e.left <= failDays)
  const fmt = e => `${e.portal} ${e.api.slice(0, 30)}${e.api.length > 30 ? '…' : ''} ${e.expires}(${e.left < 0 ? `${-e.left}일 지남` : `${e.left}일`})`
  const value = soon.length
    ? `${warnDays}일 안 ${soon.length}: ${soon.map(fmt).join(' · ')} · 표시 없음 ${none.length}`
    : `가장 이른 ${dated[0] ? fmt(dated[0]) : '없음'} · 날짜 ${dated.length} · 표시 없음 ${none.length}`
  return { status: hard.length ? 'fail' : soon.length ? 'warn' : 'pass', value, soon, hard, dated, none }
}
