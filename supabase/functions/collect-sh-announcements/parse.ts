// SH 게시글(i-sh.co.kr m_241 view) 본문에서 접수 단계 날짜를 읽는다 — collect-sh-announcements 가 쓴다(재현 시험도 이 파일로).
//
// 🔵 2026-10-17(우편함 「코드·운영 — SH 게시물 본문의 접수 날짜 읽기 …」 1 · 다운님 승인 2026-10-17) — 후속 공지(「… 2순위 청약접수 안내」 등)는
//   접수 날짜가 첨부 없이 본문에만 있다(SH_311200 「□ 2순위 청약신청 기간 - 인터넷 청약 : 2026. 10. 8.(목) 10:00~17:00」).
//   수집이 그 날짜를 못 받아 닫힌 공고가 9일간 열린 목록에 남았다.
// 🔴 규칙: 본문의 **접수 단계 머리**(접수기간 · 신청기간 · 청약신청 기간 · 접수일 · 접수일정 · 인터넷 접수·청약 · 청약접수) 줄과 그 아래 줄(다음 ■·□ 머리 전 · 최대 6줄)에서만
//   날짜를 읽고, 읽힌 창이 **하나일 때만** 낸다. 둘 이상(1순위·2순위 · 유형별)·0이면 null — 틀린 날짜보다 빈 날짜.
//   계약 · 서류 · 발표 · 공고일 · 주택 공개 · 순위확인서 · 열람 · 제출 · 입주 줄과 「진행하지 않 · 취소 · 연기 · 중단」 줄은 읽지 않는다.
// 🔴 짓지 않는다 — 연도 없는 끝 날짜만 시작 날짜의 연도를 받는다(끝 달이 시작 달보다 작으면 다음 해).

export type Window = { start: string; end: string }

const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/ /g, ' ')

/** 게시글 본문(`<td … class="cont">`)을 줄 목록으로. 본문 칸이 없으면 null. */
export function bodyLines(html: string): string[] | null {
  const m = html.match(/<td[^>]*class="cont"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/)
  if (!m) return null
  const t = decode(m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ''))
  return t.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean)
}

const LABEL = /(접수\s*기간|신청\s*기간|청약\s*신청\s*기간|청약\s*기간|접수\s*일정|신청\s*일정|접수\s*일(?!자)|인터넷\s*(접수|청약)|모바일\s*(접수|청약)|청약\s*접수)/
const EXCL = /(계약|서류|발표|공고일|공고\s*\(|주택\s*공개|공개|확인서|열람|제출|입주|당첨|결과|진행하지\s*않|취소|연기|중단|정정\s*전|변경\s*전)/
const HEAD = /^[■□◆◇▶●]/
// 날짜 하나: (연도 마디)? 월 마디 일 [마디] — 연도가 없으면 뒤에 (요일)이 반드시 붙어야 한다(소수·비율을 날짜로 줍지 않는다).
const TOKEN = /(?:((?:20)?\d{2})\s*[.년]\s*)?(\d{1,2})\s*[.월]\s*(\d{1,2})\s*[.일]?\s*(\(\s*[월화수목금토일]\s*\))?/g

type Tok = { y: number | null; m: number; d: number; idx: number; len: number }

function tokens(line: string): Tok[] {
  const out: Tok[] = []
  for (const x of line.matchAll(TOKEN)) {
    const y = x[1] ? Number(x[1].length === 2 ? '20' + x[1] : x[1]) : null
    const m = Number(x[2]), d = Number(x[3])
    if (y === null && !x[4]) continue
    if (m < 1 || m > 12 || d < 1 || d > 31) continue
    if (y !== null && (y < 2020 || y > 2099)) continue
    out.push({ y, m, d, idx: x.index ?? 0, len: x[0].length })
  }
  return out
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** 한 줄에서 창을 읽는다. 날짜 0 → [] · 하나 → 그날 하루 · 둘(사이에 ~) → 그 창 · 그 밖 → 'many'. */
function windowsOfLine(line: string): Window[] | 'many' {
  const t = tokens(line)
  if (!t.length) return []
  if (t[0].y === null) return 'many'   // 첫 날짜에 연도가 없으면 짓지 않는다
  if (t.length === 1) return [{ start: iso(t[0].y, t[0].m, t[0].d), end: iso(t[0].y, t[0].m, t[0].d) }]
  if (t.length === 2) {
    const between = line.slice(t[0].idx + t[0].len, t[1].idx)
    if (!/[~∼〜]/.test(between)) return 'many'
    const y2 = t[1].y ?? (t[1].m < t[0].m ? t[0].y + 1 : t[0].y)
    const a = iso(t[0].y, t[0].m, t[0].d), b = iso(y2, t[1].m, t[1].d)
    return b >= a ? [{ start: a, end: b }] : 'many'
  }
  return 'many'
}

/** 본문 줄에서 접수 창 하나. 하나로 읽히지 않으면 null(사유를 함께). */
/** 접수 단계 머리 줄인가 — 머리 기호로 시작하거나 「:」가 있고, 머리 기호를 뗀 앞 12자 안에서 낱말이 시작한다.
 *  문장 가운데의 「신청기간」(「… 신청기간 종료 이후 …」 — SH_310107)과 머리 기호 없는 표 칸(「신청기간」 — SH_295159)은 머리가 아니다. */
function isLabelLine(l: string): boolean {
  if (EXCL.test(l)) return false
  const bullet = /^[■□◆◇▶●○\-·*]/.test(l)
  const rest = l.replace(/^[■□◆◇▶●○\-·*\s]+/, '')
  const m = rest.match(LABEL)
  if (!m || (m.index ?? 99) > 12) return false
  return bullet || /[:：]/.test(rest)
}

export function applyWindow(lines: string[]): { window: Window | null; why: string; found: Window[] } {
  const found: Window[] = []
  let many = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!isLabelLine(l)) continue
    const sect = [l]
    for (let j = i + 1; j < lines.length && j <= i + 6 && !HEAD.test(lines[j]); j++) sect.push(lines[j])
    // 표 칸(머리 기호도 「:」도 없는 맨 낱말 「신청기간」 등)이 섞인 절은 순위·대상별 표다 — 한 줄만 읽으면 일부 창만 잡힌다(SH_310041 순위별 신청접수 일정).
    if (sect.slice(1).some(s => LABEL.test(s) && s.length <= 12 && !/[:：]/.test(s) && !/^[■□◆◇▶●○\-·*]/.test(s))) { many = true; continue }
    for (const s of sect) {
      if (EXCL.test(s) || /^※/.test(s)) continue   // ※ 줄은 주석(시간 안내·예외)이라 날짜를 읽지 않는다
      const w = windowsOfLine(s)
      if (w === 'many') { many = true; continue }
      for (const x of w) if (!found.some(f => f.start === x.start && f.end === x.end)) found.push(x)
    }
  }
  if (many) return { window: null, why: '한 줄에 날짜가 셋 이상이거나 연도 없는 첫 날짜 — 읽지 않음', found }
  if (found.length === 0) return { window: null, why: '접수 단계 날짜 없음', found }
  if (found.length > 1) return { window: null, why: `접수 창 ${found.length}개 — 하나로 읽히지 않음`, found }
  return { window: found[0], why: '하나', found }
}
