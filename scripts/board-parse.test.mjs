// 지방공사 게시판 첨부 파서 단위 시험 — node scripts/board-parse.test.mjs (실패하면 종료 코드 1 · node 22 가 .ts 를 그대로 읽는다)
// 2026-10-22(우편함 「코드·운영 — A(G2): … 제주개발공사 …」 4) — 제주 상세(seq=24224 실물 · DB net.http_get 2026-10-22 15:4x KST 받음)에서
//   첨부 1만 나오고, 아래 공지 목록의 다른 글 받기 링크 19개(+ 같은 글 목록 줄 1개)는 걸러져야 한다.
import { readFileSync } from 'node:fs'
import { parseJpdcFiles, parseGmccFiles, parseCmsDownloadFiles } from '../supabase/functions/collect-announcements/board-parse.ts'

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

// 🔵 2026-10-26(우편함 「코드·운영 — 지방공사 받기 …」 ⓒ·ⓑ) — 광주 · 경북·경남 CMS. 자료 = 컨테이너 curl 실물(2026-10-26 15:4x KST ·
//   script·style 덩어리만 걷음). 받기 주소가 길어 이름 목록 + 주소 접두로 본다.
const td = f => readFileSync(new URL(`./testdata/${f}`, import.meta.url), 'utf8')
const labels = r => r && r.map(f => f.label)
const pre = (r, p) => !!r && r.every(f => f.url.startsWith(p) && f.filename === f.label)
const GMCC = 'https://www.gmcc.co.kr/board.es?mid=a10402000000&bid=0018&act=view&list_no=19505'
const GB = 'https://www.gbdc.co.kr/boardview/boardview.do?seqId=0000003638&BBS_ID=4c9b3e75-2935-4bcd-96be-62fb07903949&IPDS_IDX=11c991e5-1799-44a9-81bb-46ec039a129e&BBS_TYPE=L&COLM1=notice&COLM1_CD=notice_02&COLM1_STATUS=&SEARCH_CONTITION=CPDS_SUBJECT_CONTENT&SEARCH_KEYWORD=&CURRENT_PAGE=1'
const GN1 = 'https://www.gndc.co.kr/boardview/boardview.do?seqId=0000006202&BBS_ID=B491A490314446318099F9D828047900&IPDS_IDX=0f9007e7-6dea-43e7-adf3-05eec9b6c42f&BBS_TYPE=L&COLM1=notice&COLM1_CD=&SEARCH_CONTITION=CPDS_SUBJECT_CONTENT&SEARCH_KEYWORD=&CURRENT_PAGE=1'
const GN2 = 'https://www.gndc.co.kr/boardview/boardview.do?seqId=0000006202&BBS_ID=B491A490314446318099F9D828047900&IPDS_IDX=F7054C80FACF4D22AD23CAD92547CE03&BBS_TYPE=L&COLM1=notice&COLM1_CD=&SEARCH_CONTITION=CPDS_SUBJECT_CONTENT&SEARCH_KEYWORD=&CURRENT_PAGE=1'
const g = parseGmccFiles(td('gmcc-board-19505.html'), GMCC)
const b = parseCmsDownloadFiles(td('gbdc-boardview-11c991e5.html'), GB)
const n1 = parseCmsDownloadFiles(td('gndc-boardview-0f9007e7.html'), GN1)
const n2 = parseCmsDownloadFiles(td('gndc-boardview-F7054C80.html'), GN2)
cases.push(
  ['광주 19505 실물 — 첨부 2 · 미리보기·바로듣기 겹침 거름', g,
    [{ url: 'https://www.gmcc.co.kr/boardDownload.es?bid=0018&list_no=19505&seq=1', label: '금호빛여울채 12형 입주자격 완화 예비입주자 모집공고문.pdf', filename: '금호빛여울채 12형 입주자격 완화 예비입주자 모집공고문.pdf' },
     { url: 'https://www.gmcc.co.kr/boardDownload.es?bid=0018&list_no=19505&seq=2', label: '금호빛여울채 신청서식.hwpx', filename: '금호빛여울채 신청서식.hwpx' }]],
  ['광주 — 다른 글 주소(list_no)로 읽으면 0', parseGmccFiles(td('gmcc-board-19505.html'), GMCC.replace('list_no=19505', 'list_no=1')), null],
  ['경북 IPDS 11c991e5 실물 — 첨부 6(폴더 = IPDS_IDX)', labels(b), [
    '1. 2026년 영주시 드림주택(신혼·신생아 매입임대주택Ⅰ) 입주자 및 예비입주자 모집공고.hwp',
    '1-1. 2026년 영주시 드림주택(신혼·신생아 매입임대주택Ⅰ) 입주자 및 예비입주자 모집공고.pdf',
    '2. 영주시 드림주택(신혼·신생아 매입임대주택Ⅰ) 공급대상 주택목록(20260922).xlsx',
    '2-1. 영주시 드림주택(신혼·신생아 매입임대주택Ⅰ) 공급대상 주택목록(20260922).pdf',
    '[별첨] 영주시 드림주택(신혼·신생아 매입임대주택Ⅰ) 평면도(출입구 확인용, B동).pdf',
    '3. [신청서류] 신혼·신생아 매입임대주택Ⅰ 신청서류 양식(경상북도개발공사).hwp']],
  ['경북 — 받기 주소 접두', pre(b, 'https://www.gbdc.co.kr/common/download.do?fileVirtualPath='), true],
  ['경남 0f9007e7 실물 — 첨부 3(폴더 = BBS_ID)', labels(n1), [
    '_붙임2) 진주강남 청년머뭄센터 통합공공임대주택 공급신청서.hwp',
    '_붙임3) 진주강남 청년머뭄센터 통합공공임대주택 건축도면.pdf',
    '_붙임1) 진주강남 청년머뭄센터 통합공공임대주택 입주자모집 공고문.pdf']],
  ['경남 F7054C80 실물 — 첨부 3(폴더 = IPDS_IDX · 대문자)', labels(n2), [
    '[붙임] 1. 진주정촌올리움 국민임대 예비입주자 1차 모집 공고문.pdf',
    '[붙임] 3. 진주 정촌올리움 단지배치도 및 평면도 (1).pdf',
    '[붙임] 2. 서류 및 양식 (1).hwp']],
  ['경남 — 받기 주소 접두', pre(n1, 'https://www.gndc.co.kr/common/download.do?fileVirtualPath=') && pre(n2, 'https://www.gndc.co.kr/common/download.do?fileVirtualPath='), true],
  ['경남 — 남의 게시판·글 주소로 읽으면 0', parseCmsDownloadFiles(td('gndc-boardview-0f9007e7.html'), 'https://www.gndc.co.kr/boardview/boardview.do?BBS_ID=X&IPDS_IDX=Y'), null],
  ['CMS — 첨부 구역 밖 받기 주소 · 다른 호스트 · 폴더 다름 거름', labels(parseCmsDownloadFiles(
    '<a href="/common/download.do?fileVirtualPath=%2fprivatefiles%2fboard%2fAAA%2fx.pdf&fileOrgName=%EA%B5%AC%EC%97%AD%EB%B0%96.pdf">밖</a>' +
    '<div class="board-view-file"><ul class="file-list">' +
    '<li><a onclick="pdfViewr(\'가.pdf\',\'pdf\',\'/p\',\'/common/download.do?fileVirtualPath=%2fprivatefiles%2fboard%2fAAA%2fa.pdf&fileOrgName=%EA%B0%80.pdf\')">가.pdf</a>' +
    '<a href="/common/download.do?fileVirtualPath=%2fprivatefiles%2fboard%2fAAA%2fa.pdf&amp;fileOrgName=%EA%B0%80.pdf">받기</a></li>' +
    '<li><a href="https://evil.example/common/download.do?fileVirtualPath=%2fprivatefiles%2fboard%2fAAA%2fb.pdf&fileOrgName=b.pdf">남</a></li>' +
    '<li><a href="/common/download.do?fileVirtualPath=%2fprivatefiles%2fboard%2fZZZ%2fc.pdf&fileOrgName=c.pdf">다른 폴더</a></li>' +
    '<li><a href="/common/download.do?fileVirtualPath=%2fprivatefiles%2fBBS%2fbbb%2fd.hwp&fileOrgName=%EB%82%98+%EB%8B%A4.hwp">나 다</a></li></ul></div>',
    'https://www.gndc.co.kr/boardview/boardview.do?BBS_ID=aaa&IPDS_IDX=BBB')), ['가.pdf', '나 다.hwp']],
)
let bad = 0
for (const [name, got, want] of cases) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}
const links = (html.match(/act=download&amp;seq=\d+&amp;no=\d+/g) || []).length
console.log(`(자료 속 받기 링크 ${links}개)`)
process.exit(bad ? 1 : 0)
