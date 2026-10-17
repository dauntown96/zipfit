// 로컬 렌더용 목록 RPC 대역 — 운영 get_announcements_deduped 를 렌더마다 부르지 않게 한다(2026-10-17 · 우편함 「코드·운영 — 목록 RPC 가볍게 …」 3).
//
// 왜: 2026-10-17 24시간 목록 RPC 자동 브라우저 호출 205건 중 133건이 세션의 로컬 렌더(127.0.0.1:8201·8202)였고 그중 4건이 3초 한도 500이었다.
//   목록 함수는 CPU 에 묶여(동시 4 → 각 1초) 렌더가 몰리면 사람 호출이 함께 느려진다.
// 규칙(CLAUDE.md 원칙 26): 대역은 fetch/RPC 응답까지만 — 응답은 **운영 anon 응답 그대로**(한 번 받아 캐시 파일에 둔다) · 화면 매핑은 배포 코드 그대로 거친다.
// 🔴 운영 화면 자체를 재는 것(health-screen · 배포본 실사용 점검)은 이것을 쓰지 않는다 — 그건 측정이다.
//
// 쓰는 법(Playwright):
//   import { stubListRpc } from '/home/user/zipfit/scripts/render-list-stub.mjs'
//   const info = await stubListRpc(page)          // page.goto 전에 — 인자 없는 목록 호출만 캐시로 돌려주고, 인자 있는 호출은 그대로 보낸다
//   console.log(info)                              // { file, fetched, ageMin, bytes }
// 캐시: 기본 os.tmpdir()/zipfit-list-rpc-cache.json · 30분 지나면 첫 렌더가 한 번 다시 받는다(옵션 maxAgeMin · file).
// 봉합(원칙 26): 캐시는 받은 바이트 그대로라 손으로 옮겨 적은 것이 아니다 — 회신에는 「목록 RPC = 운영 anon 응답 캐시(받은 시각 …)」라고 적는다.

import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SUPABASE_URL = 'https://khdpjjyspmlqtzperoqg.supabase.co'
// 공개 anon 키 — index.html · CLAUDE.md · .github/health/lib.mjs 에 이미 공개된 값(비밀 아님).
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZHBqanlzcG1scXR6cGVyb3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTYyNDUsImV4cCI6MjA5NzY5MjI0NX0.XwSOuOk2UJiR8vTnwwqDZayJWOUstzD2DeB1COG4azs'
const RPC = '/rest/v1/rpc/get_announcements_deduped'

const noArgs = body => {
  if (!body) return true
  try {
    const o = JSON.parse(body)
    return o && typeof o === 'object' && Object.values(o).every(v => v == null)
  } catch { return false }
}

export async function stubListRpc(page, { file = join(tmpdir(), 'zipfit-list-rpc-cache.json'), maxAgeMin = 30 } = {}) {
  let fetched = false
  const ageMin = existsSync(file) ? (Date.now() - statSync(file).mtimeMs) / 60000 : Infinity
  if (ageMin > maxAgeMin) {
    // 브라우저 문맥의 요청기 — 컨테이너 프록시 설정을 브라우저와 같이 쓴다(Node fetch 는 프록시 환경변수를 저절로 쓰지 않는다).
    const res = await page.context().request.post(SUPABASE_URL + RPC, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      data: {}, timeout: 30000,
    })
    if (res.status() !== 200) throw new Error(`목록 RPC 캐시 받기 실패 ${res.status()} — 캐시 없이 렌더하지 않는다(운영에 몰리지 않게)`)
    writeFileSync(file, await res.body())
    fetched = true
  }
  const body = readFileSync(file)
  await page.route(`**${RPC}*`, async route => {
    const req = route.request()
    if (req.method() === 'POST' && noArgs(req.postData())) {
      await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body })
    } else {
      await route.continue()
    }
  })
  return { file, fetched, ageMin: fetched ? 0 : Math.round(ageMin), bytes: body.length }
}
