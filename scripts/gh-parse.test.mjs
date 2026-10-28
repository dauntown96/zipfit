// GH 청약센터 파서 단위 시험 — node scripts/gh-parse.test.mjs (실패하면 종료 코드 1 · node 22 가 .ts 를 그대로 읽는다)
// 2026-10-28(우편함 「코드·운영(브랜치만 · 병합 0) — GH 수집기 …」) — 실물 HTML(apply.gh.or.kr · 2026-10-28 09:4x KST 받음 · 공개 공고 페이지)
//   임대주택 목록 1쪽 · 매입임대 목록 1쪽 · 상세 811(지구 하나 · 끝 없는 접수 창) · 상세 792(매입 · 공급일정 없음 · 첨부 넷)
//   + 손으로 짠 짧은 HTML(지구 여러 개 같은 창 · 창 둘 · 「-」 칸) — 839(지구 24 · 455KB)는 너무 커 싣지 않고 꼴만 옮겼다.
import { readFileSync } from 'node:fs'
import { parseList, parseTotalPages, parseDetail, applyWindow, winnerDate, sigunguOf } from '../supabase/functions/collect-gh-announcements/parse.ts'

const read = (f) => readFileSync(new URL(`./testdata/${f}`, import.meta.url), 'utf8')
const l50 = read('gh-sr7150-list-p1.html'), l55 = read('gh-sr7155-list-p1.html')
const d811 = parseDetail(read('gh-sr7150-detail-811.html')), d792 = parseDetail(read('gh-sr7155-detail-792.html'))
const r50 = parseList(l50, 'sr7150'), r55 = parseList(l55, 'sr7155')

const sched = (lines) => '<ul class="bul_list mt10">' + lines.map(([k, v]) => `<li class="mt5"><span><b>${k} : </b>${v}</span></li>`).join('') + '</ul>'
const two = parseDetail(sched([['온라인접수기간', '2026.10.26 10:00 ~ 2026.10.28 17:00'], ['현장접수기간', '2026.10.26 10:00 ~ 2026.10.28 17:00'], ['당첨자발표일', '2026.11.04 17:00']]).repeat(3)
  + '<th scope="row">소재지</th><td class="txt_l"> <span>경기도 남양주시 다산동 6027 </span>'
  + '<th scope="row">소재지</th><td class="txt_l"> <span>경기도 남양주시 별내동 1 </span>')
const diff = parseDetail(sched([['온라인접수기간', '2026.10.26 10:00 ~ 2026.10.28 17:00']]) + sched([['온라인접수기간', '2026.11.02 10:00 ~ 2026.11.04 17:00']]))

const cases = [
  ['임대 목록 쪽 수(맨끝으로)', parseTotalPages(l50), 26],
  ['매입 목록 쪽 수(쪽 하나)', parseTotalPages(l55), 1],
  ['임대 목록 10행 · 식별자는 data-pbancNo(번호 칸 1~10 아님)', r50.map(r => r.pbancNo), ['839', '811', '808', '801', '809', '800', '793', '790', '783', '788']],
  ['임대 첫 행', r50[0], { board: 'sr7150', pbancNo: '839', pbancKndCd: '01', bizTyNm: '행복주택', previewYn: 'N', type: '행복주택',
    title: "'26년 하반기 경기행복주택 예비입주자 추가모집 공고", area: '성남시', announceDate: '2026-10-16', closeDate: '2026-10-28', status: '접수중' }],
  ['「-」 칸은 null·빈 문자(연천 기숙사 811)', [r50[1].closeDate, r50[1].status], [null, '']],
  ['정정공고는 pbancKndCd 02(788)', [r50[9].pbancKndCd, r50[9].title.startsWith('[정정공고]')], ['02', true]],
  ['매입 목록 10행 · 첫 행 823', [r55.length, r55[0].pbancNo, r55[0].type, r55[0].area], [10, '823', '매입임대', '경기도']],
  ['상세 811 — 첨부 둘(카탈로그 받기 링크는 뺀다) · 바이트', d811.files?.map(f => [f.filename, f.bytes]),
    [['연천BIX 경기행복주택 기업체 기숙사 추가모집 공고(안)_최종_1.pdf', 827950], ['연천BIX 경기행복주택 기업체 기숙사 추가모집 공고(안)_최종_1.hwp', 1119744]]],
  ['상세 811 — 끝 없는 창은 null', applyWindow(d811).window, null],
  ['상세 811 — 지구 하나 → 연천군', sigunguOf(d811), '연천군'],
  ['상세 792 — 매입 첨부 넷 · 공급일정 없음 · 시군 없음', [d792.files?.length, applyWindow(d792).window, sigunguOf(d792), winnerDate(d792)], [4, null, null, null]],
  ['상세 792 — 받기 주소는 apply-cdn sr7155', d792.files?.every(f => f.url.startsWith('https://apply-cdn.gh.or.kr/sr/sr7155/selectFileDown.do?pbancNo=792&')), true],
  ['지구 셋 · 온라인=현장 같은 창 → 창 하나', applyWindow(two).window, { start: '2026-10-26', end: '2026-10-28' }],
  ['당첨자발표일 하나', winnerDate(two), '2026-11-04'],
  ['지구 둘 같은 시 → 남양주시', sigunguOf(two), '남양주시'],
  ['창 둘 → null', applyWindow(diff).window, null],
]
let bad = 0
for (const [name, got, want] of cases) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}
console.log(bad ? `❌ ${bad}/${cases.length} 실패` : `✅ ${cases.length}/${cases.length}`)
process.exit(bad ? 1 : 0)
