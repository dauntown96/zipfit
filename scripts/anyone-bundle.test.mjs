// 「계층 구분 없이 누구나」 묶음 판정 시험 — node scripts/anyone-bundle.test.mjs (실패하면 종료 코드 1)
// 2026-11-19(우편함 「표시층 — 계층 칩(청년 등) 결과에 「계층 구분 없이 누구나」 접힌 묶음」 4) — index.html 의 판정 함수를 그대로 떠서 다섯 꼴을 댄다:
//   누구나형 / 영구임대 / 나이 칸 있음 / 계층 키(공급대상 갈래) 있음 / 자격 행 0(판단 못 함 = 묶음에 넣지 않음).
// 🔴 규칙을 여기 다시 쓰지 않는다 — 함수 본문은 index.html 에서 떠 온다(사본 0). 자격 행 표(zfEcByKey)와 제목 키(zfDedupKey)만 대역.
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
function grab(name) {
  const at = html.indexOf(`function ${name}(`)
  if (at < 0) throw new Error(`index.html 에 ${name} 없음`)
  let i = html.indexOf('{', at), depth = 0
  for (; i < html.length; i++) {
    const c = html[i]
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return html.slice(at, i + 1)
  }
  throw new Error(`${name} 끝을 못 찾음`)
}
const src = ['classifyDemographics', 'classifyNoticeType', 'zfOpenSupplyForm', 'zfAnyoneState'].map(grab).join('\n')
const zfEcByKey = new Map()
const zfDedupKey = t => String(t || '').trim()
const { zfAnyoneState, zfOpenSupplyForm } = new Function('zfEcByKey', 'zfDedupKey', `${src}\nreturn { zfAnyoneState, zfOpenSupplyForm }`)(zfEcByKey, zfDedupKey)

const put = (title, e) => zfEcByKey.set(title, { n: e.forms.length, gk: !!e.gk, age: !!e.age, forms: e.forms })
put('대전도안 국민임대 예비입주자 모집', { forms: ['일반공급(대전도안 1단지 33형, 39형)', '일반공급(대전도안 1단지 51형)'] })
put('부산 일반 매입임대 입주자 모집', { forms: ['1순위(우선) 수급자·차상위계층·지원대상 한부모가족', '1순위(일반) 월평균소득 70% 이하 장애인', '2순위 월평균소득 100% 이하'] })
put('대구 영구임대 예비입주자 모집', { forms: ['일반공급 2순위 차목(일반입주자)', '일반공급 1순위 나목 국가유공자 등'] })
put('완주삼례 행복주택 입주자격완화 예비입주자 모집', { forms: ['청년 계층', '대학생 계층'], age: true, gk: true })
put('영암 국민임대 입주자 모집', { forms: ['일반공급'], age: true })
put('학익 국민임대 입주자 모집', { forms: ['일반공급'], gk: true })
put('평창 고령자복지 공공임대', { forms: ['고령자복지주택'] })

const row = (title, type) => ({ '공고명': title, '공급유형': type })
const CASES = [
  ['누구나형 — 일반공급(단지 괄호)', row('대전도안 국민임대 예비입주자 모집', '국민임대'), 'anyone'],
  ['누구나형 — 「2순위 월평균소득」 행이 있는 일반 매입', row('부산 일반 매입임대 입주자 모집', '매입임대'), 'anyone'],
  ['영구임대 — 일반입주자 순위가 있어도 넣지 않음', row('대구 영구임대 예비입주자 모집', '영구임대'), 'perm'],
  ['영구임대 — 자격 행이 없어도 영구임대', row('어느 영구임대 모집', '영구임대'), 'perm'],
  ['나이 칸 있음', row('영암 국민임대 입주자 모집', '국민임대'), 'no'],
  ['계층 키(공급대상 갈래) 있음', row('학익 국민임대 입주자 모집', '국민임대'), 'no'],
  ['계층 키 + 나이(행복주택)', row('완주삼례 행복주택 입주자격완화 예비입주자 모집', '행복주택'), 'no'],
  ['일반 꼴 행 없음(계층 낱말만)', row('평창 고령자복지 공공임대', '공공임대'), 'no'],
  ['자격 행 0 — 판단 못 함', row('인천논현 창업지원주택 입주자 모집', '행복주택'), 'unknown'],
]
const FORMS = [
  ['일반', true], ['일반공급', true], ['일반공급(입주자격 완화 · 선착순)', true], ['입주자격완화(소득요건 제한 없음 · 총자산요건 제한 없음)', true],
  ['입주자격', true], ['전용면적 50㎡미만주택', true], ['2순위 월평균소득 100% 이하', true], ['통합공공임대 일반공급대상자', true],
  ['1순위(일반) 월평균소득 70% 이하 장애인', false], ['청년 계층', false], ['우선공급', false], ['당해 사업지구 철거민·세입자', false],
  ['일반공급 1순위 가목 생계급여수급자 · 라목 지원대상 한부모가족', false], ['', false],
]

let fail = 0
for (const [name, n, want] of CASES) {
  const got = zfAnyoneState(n)
  if (got !== want) { fail++; console.log(`❌ ${name}: ${got} (기대 ${want})`) } else console.log(`✅ ${name}: ${got}`)
}
for (const [f, want] of FORMS) {
  const got = zfOpenSupplyForm(f)
  if (got !== want) { fail++; console.log(`❌ 일반 꼴 「${f}」: ${got} (기대 ${want})`) }
}
console.log(fail ? `실패 ${fail}` : `통과 ${CASES.length + FORMS.length}`)
process.exit(fail ? 1 : 0)
