// node scripts/lh-page-attachments.test.mjs — 떼기 규칙 시험(지어 낸 페이지 조각 · 네트워크 0)
import { parsePage, labelFor, compare } from './lh-page-attachments.mjs'
let ok = 0, bad = 0
const t = (n, c) => { if (c) ok++; else { bad++; console.log('✗', n) } }
const li = (fid, name) => `<li><a href="javascript:fileDownLoad('${fid}');">${name}</a><a href="javascript:void(0);" onclick="docViewer('x')">바로보기</a></li>`
const page = `<html><div class="bbsV_atchmnfl"><dl class="col_red"><dt class="pc_red">공고문</dt><dd><ul>${li('111', '가 모집공고문(20260326).hwp')}${li('112', '가 모집공고문(20260326).pdf')}${li('113', '가 공고문.zip')}</ul></dd></dl>
<dl><dt>다운로드</dt><dd><ul>${li('121', '신청서 &amp; 서식.hwp')}</ul></dd></dl><dl><dt>공급정보</dt><dd><ul>${li('131', '평면도.jpg')}</ul></dd></dl></div></html>`
const f = parsePage(page)
t('다섯 중 넷(공급정보 묶음 뺌)', f.length === 4)
t('공고문 hwp', f[0].label === '공고문(hwp)' && f[0].url === 'https://apply.lh.or.kr/lhapply/lhFile.do?fileid=111' && f[0].filename === '가 모집공고문(20260326).hwp')
t('공고문 PDF', f[1].label === '공고문(PDF)')
t('공고문 그 밖 확장자', f[2].label === '공고문')
t('다운로드 → 첨부파일 · &amp; 풀기', f[3].label === '첨부파일' && f[3].filename === '신청서 & 서식.hwp')
t('상자 없음 → 빈 목록', parsePage('<html>없음</html>').length === 0)
t('hwpx → 공고문(hwp)', labelFor('공고문', 'a.HWPX') === '공고문(hwp)')
t('같은 집합(차례 무관) → 같음', compare(f, [...f].reverse()).same)
const c = compare(f, f.slice(1))
t('하나 빠짐 → 다름', !c.same && c.onlyPage === 1 && c.onlyDb === 0)
t('DB 빔(null) → 다름', !compare(f, null).same)
console.log(`LH 페이지 첨부 떼기 시험 ${ok}/${ok + bad}`)
process.exit(bad ? 1 : 0)
