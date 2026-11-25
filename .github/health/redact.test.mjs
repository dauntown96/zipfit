// redact.mjs 시험(2026-11-24 · 열아홉째 1) — node .github/health/redact.test.mjs [실행 로그 파일 …]
//   로그 파일을 주면 그 파일에서 가림 전후로 바뀌는 줄 수·줄 번호만 찍는다(값은 찍지 않는다).
import { redactSecrets, countSecrets, MASK } from './redact.mjs'
import { readFileSync } from 'node:fs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const fake = 'FAKEFAKEfake0123456789abcdefABCDEF-_.~'
// #1277 꼴(page.goto 시간 초과 오류문)
const goto = `page.goto: Timeout 30000ms exceeded. Call log: - navigating to "https://x.supabase.co/auth/v1/verify?token=${fake}&type=magiclink&redirect_to=https%3A%2F%2Fkkokzip.com%2F%3Fops%3D1"`
const g = redactSecrets(goto)
t('verify 토큰 가림', !g.includes(fake) && g.includes(`token=${MASK}&type=magiclink`))
t('나머지 글 그대로', g.startsWith('page.goto: Timeout 30000ms exceeded.') && g.includes('redirect_to=https%3A%2F%2Fkkokzip.com'))
t('셈', countSecrets(goto) === 1 && countSecrets(g) === 0)
// 다른 꼴
t('access_token', redactSecrets(`#access_token=${fake}&expires_in=3600`) === `#access_token=${MASK}&expires_in=3600`)
t('refresh_token', redactSecrets(`refresh_token=${fake}`) === `refresh_token=${MASK}`)
t('apikey', redactSecrets(`?apikey=${fake}`) === `?apikey=${MASK}`)
t('Bearer', redactSecrets(`Authorization: Bearer ${fake}`) === `Authorization: Bearer ${MASK}`)
// 판정 글은 그대로(낱말·짧은 값·한글)
for (const s of ['발송 토큰 만료까지(일) 313', 'Bearer 토큰은 출력하지 않는다', 'token=abc', 'github_actions_dispatch_token 2027-10-03(313일)',
  '| ✅ | pg_net 비밀값 — 거두기·노출 함수·바깥 REST | 10분 넘은 토큰 꼴 응답 0 |', 'token= 칸 없음', '토큰=한글값한글값한글값한글값'])
  t(`그대로: ${s.slice(0, 24)}`, redactSecrets(s) === s)
t('null·undefined', redactSecrets(null) === '' && redactSecrets(undefined) === '')
// 실행 로그 다시 돌리기(인자)
for (const f of process.argv.slice(2)) {
  const lines = readFileSync(f, 'utf8').split('\n')
  const changed = lines.map((l, i) => [i + 1, l]).filter(([, l]) => redactSecrets(l) !== l).map(([i]) => i)
  console.log(`${f}: ${lines.length}줄 · 가림으로 바뀐 줄 ${changed.length}${changed.length ? ' — ' + changed.slice(0, 10).join(', ') : ''}`)
}
console.log(`redact 시험 ${ok} 통과 · ${bad} 실패`)
if (bad) process.exit(1)
