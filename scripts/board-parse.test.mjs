// 지방공사 게시판 첨부 파서 단위 시험 — node scripts/board-parse.test.mjs (실패하면 종료 코드 1 · node 22 가 .ts 를 그대로 읽는다)
// 2026-10-22(우편함 「코드·운영 — A(G2): … 제주개발공사 …」 4) — 제주 상세(seq=24224 실물 · DB net.http_get 2026-10-22 15:4x KST 받음)에서
//   첨부 1만 나오고, 아래 공지 목록의 다른 글 받기 링크 19개(+ 같은 글 목록 줄 1개)는 걸러져야 한다.
import { readFileSync } from 'node:fs'
import { parseJpdcFiles } from '../supabase/functions/collect-announcements/board-parse.ts'

const html = readFileSync(new URL('./testdata/jpdc-notice-24224.html', import.meta.url), 'utf8')
const base = 'https://www.jpdc.co.kr/open/news/notice.htm?act=view&seq=24224'
const cases = [
  ['제주 24224 실물', parseJpdcFiles(html, base),
    [{ url: 'https://www.jpdc.co.kr/open/news/notice.htm?act=download&seq=24224&no=1', label: '1. 공고문 및 신청접수 서류양식.zip', filename: '1. 공고문 및 신청접수 서류양식.zip' }]],
  ['다른 글 주소로 읽으면 0(seq 가 달라 전부 거름)', parseJpdcFiles(html, 'https://www.jpdc.co.kr/open/news/notice.htm?act=view&seq=24222'), null],
  ['seq 없는 주소', parseJpdcFiles(html, 'https://www.jpdc.co.kr/open/news/notice.htm'), null],
  ['첨부 둘 · 번호 짝 · 다른 호스트 거름', parseJpdcFiles(
    '<strong>· 첨부 #1 : </strong> <a href="/open/news/notice.htm?act=download&amp;seq=7&amp;no=1"><i class="x"></i> 가.pdf (1.5 MBytes)</a>' +
    '<strong>· 첨부 #2 : </strong><a href="/open/news/notice.htm?act=download&amp;seq=7&amp;no=3">어긋난 번호.hwp (2 KBytes)</a>' +
    '<strong>· 첨부 #3 : </strong><a href="https://evil.example/open/news/notice.htm?act=download&amp;seq=7&amp;no=3">남.hwp</a>' +
    '<strong>· 첨부 #4 : </strong><a href="/open/news/notice.htm?act=download&amp;seq=7&amp;no=4">나 &amp; 다.hwpx (300 Bytes)</a>',
    'https://www.jpdc.co.kr/open/news/notice.htm?act=view&seq=7'),
    [{ url: 'https://www.jpdc.co.kr/open/news/notice.htm?act=download&seq=7&no=1', label: '가.pdf', filename: '가.pdf' },
     { url: 'https://www.jpdc.co.kr/open/news/notice.htm?act=download&seq=7&no=4', label: '나 & 다.hwpx', filename: '나 & 다.hwpx' }]],
]
let bad = 0
for (const [name, got, want] of cases) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}
const links = (html.match(/act=download&amp;seq=\d+&amp;no=\d+/g) || []).length
console.log(`(자료 속 받기 링크 ${links}개)`)
process.exit(bad ? 1 : 0)
