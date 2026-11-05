// LH 커트라인 거름 시험 — node --experimental-strip-types scripts/lh-cutoff-filter.test.mjs (실패하면 종료 코드 1)
// 2026-11-04(우편함 「코드·운영 — LH 건설임대 당첨 합격점수 수집 장치」) — 받는 자리 거름(cutoff-filter.ts)과 DB CHECK(마이그레이션 2026-11-04_04)가
//   같은 꼴을 남기고 같은 꼴을 버리는지 본다. 사례는 실응답 5년 32,593행의 꼴(숫자를 가린 갈래)에 숫자를 지어 넣은 것이다 — 실제 값 0.
import { filterCutoff, CUTOFF_WHITELIST, CUTOFF_FORBIDDEN } from '../supabase/functions/collect-lh-cutoff/cutoff-filter.ts'
import { readFileSync } from 'node:fs'

const KEEP = [
  '1순위, 9점 당첨 (1순위, 8점 경쟁)', '3순위, 1점 (미달)', '1순위, 7점 당첨', '(미달)', '2순위, 0점 , 타지역 (미달)',
  '소득70%이하, 1순위, 5점 (미달)', '소득50%이하, 2순위, 3점 당첨 (소득50%이하, 2순위, 2점 경쟁)', '소득70%이하, 신혼1순위, 4점 (미달)',
  '(무순위, 0점 경쟁)', '5점 (미달)', '(2순위, 3점 경쟁)', '무순위, 0점 (미달)', '소득70%이하, 6점 당첨', '2순위 당첨 (3순위 경쟁)',
  '1순위 (미달)', '1순위, 4점 , 타지역 당첨', '8점 당첨 (7점 경쟁)', '(소득70%이하, 신혼1순위 경쟁)', '신혼2순위, 3점 (미달)',
]
const DROP = [
  '1순위, 3점 , 당해지역:전입일자(20190101) (미달)',
  '7점 , 당해지역:전입일자(20200101), 세대구성원수(3), 신청자연령(70) 당첨',
  '7점 , 타지역, 세대구성원수(2), 신청자연령(65) (미달)',
  '6세미만자녀여부(1) 3', '3', '3 (장애의 정도가 심한 장애인)', '추천순번 : 2번 (미달)',
  '소득70%이하, 만6세미만 자녀, 3점 (미달)', '소득70%이하, 장애의 정도가 심한 장애인, 4점 당첨',
  '2순위, 3점 , 만6세이하 자녀 당첨 (2순위, 2점 경쟁)', '미입주자, 1순위, 5점 , 당해지역:전입일자(20180101) 당첨',
  '기존입주자, 1순위, 3점 , 당해단지:전입일자(20170101) (미달)', '4점 , 소득(70%이하), 신청자연령(66), 당해지역:전입일자(20150101) 당첨',
  '1순위, 3점 , 당해지역 당첨 (1순위, 2점 , 타지역 경쟁)', '(장애인, 1순위 경쟁)', '소득해당없음, 1순위, 3점 당첨',
]

const sql = readFileSync(new URL('../supabase/migrations/2026-11-04_04_lh_cutoff_scores.sql', import.meta.url), 'utf8')
const dbWhite = new RegExp(sql.match(/lh_cutoff_scores_cutoff_whitelist check \(cutoff_text is null or cutoff_text ~ '([^']+)'\)/)[1])
const dbForbid = new RegExp(sql.match(/lh_cutoff_scores_cutoff_forbidden check \(cutoff_text is null or cutoff_text !~ '([^']+)'\)/)[1])
const dbOk = s => dbWhite.test(s) && !dbForbid.test(s)

let fail = 0
const check = (name, ok) => { if (!ok) { fail++; console.log('❌', name) } }
for (const s of KEEP) {
  check(`남김 ${s}`, filterCutoff(s, 20).reason === 'ok')
  check(`DB 남김 ${s}`, dbOk(s))
  check(`5명 이하 비움 ${s}`, filterCutoff(s, 5).text === null && filterCutoff(s, 5).reason === 'small_applicants')
}
for (const s of DROP) {
  check(`버림 ${s}`, filterCutoff(s, 20).text === null && filterCutoff(s, 20).reason === 'not_whitelisted')
  check(`DB 버림 ${s}`, !dbOk(s))
}
check('빈 값', filterCutoff('  ', 20).reason === 'empty')
check('신청자 수 모름 = 비움', filterCutoff('1순위, 7점 당첨', null).text === null)
check('공백 정리', filterCutoff('1순위,  7점   당첨', 20).text === '1순위, 7점 당첨')
check('DB 정규식 = 거름 정규식(소스 같음)', dbWhite.source === CUTOFF_WHITELIST.map(r => '(' + r.source + ')').join('|') && dbForbid.source === CUTOFF_FORBIDDEN.source)
console.log(fail ? `실패 ${fail}` : `통과 — 남김 ${KEEP.length} · 버림 ${DROP.length} · DB 정규식 같음`)
process.exit(fail ? 1 : 0)
