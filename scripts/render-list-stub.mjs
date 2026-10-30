// 로컬 렌더용 목록 RPC 대역 — 운영 get_announcements_deduped 를 렌더마다 부르지 않게 한다(2026-10-17 · 우편함 「코드·운영 — 목록 RPC 가볍게 …」 3).
//
// 왜: 2026-10-17 24시간 목록 RPC 자동 브라우저 호출 205건 중 133건이 세션의 로컬 렌더(127.0.0.1:8201·8202)였고 그중 4건이 3초 한도 500이었다.
//   목록 함수는 CPU 에 묶여(동시 4 → 각 1초) 렌더가 몰리면 사람 호출이 함께 느려진다.
// 🔵 2026-10-21(우편함 「코드·운영 — 가리킴 고침·대역 캐시」 ②) — 인자 있는 호출(p_region · p_type · p_status)도 인자별로 캐시한다.
//   지역·유형 칩을 누르는 렌더가 인자마다 운영으로 갔다. 이제 인자 조합마다 첫 호출만 운영으로 가고 30분 안의 같은 인자는 캐시로 돌려준다.
// 규칙(CLAUDE.md 원칙 26): 대역은 fetch/RPC 응답까지만 — 응답은 **운영 anon 응답 그대로**(첫 호출의 요청을 그대로 보내 받은 바이트를 캐시 파일에 둔다) · 화면 매핑은 배포 코드 그대로 거친다.
// 🔴 운영 화면 자체를 재는 것(health-screen · 배포본 실사용 점검)은 이것을 쓰지 않는다 — 그건 측정이다.
//
// 🔴 이용 기록(usage_events) 송신도 여기서 받아 끝낸다(운영 기록에 쓰지 않는다 · 2026-10-20).
// 쓰는 법(Playwright):
//   import { stubListRpc } from '/home/user/zipfit/scripts/render-list-stub.mjs'
//   const info = await stubListRpc(page)          // page.goto 전에 — 목록 POST 를 인자별 캐시로 돌려준다
//   console.log(info)                              // { dir, maxAgeMin, upstream, hits, keys: { '<인자>': { file, fetched, ageMin, bytes, hits } } } — 렌더가 진행되며 채워진다
// 인자 키: 요청 본문 JSON 에서 null 값을 빼고 키를 정렬한 것 — 인자 없음 · {} · 전부 null 은 같은 키 '{}'(화면 zfRpcArgs 와 같은 거름).
// 캐시 자리: 옵션 dir → 환경변수 ZIPFIT_RENDER_CACHE_DIR → 이 세션 scratchpad(/tmp/claude-*/…/<CLAUDE_CODE_SESSION_ID>/scratchpad) → os.tmpdir().
//   파일은 인자 키마다 하나(list-rpc-<md5 앞 12>.json) · 30분 지나면 그 인자의 첫 호출이 한 번 다시 받는다(옵션 maxAgeMin).
// 운영이 200 이 아니면 캐시하지 않고 그 응답을 그대로 화면에 넘긴다(화면의 재시도·실패 처리가 실물대로 돈다).
// 봉합(원칙 26): 캐시는 받은 바이트 그대로라 손으로 옮겨 적은 것이 아니다 — 회신에는 「목록 RPC = 운영 anon 응답 캐시(받은 시각 …)」라고 적는다.

import { readFileSync, writeFileSync, renameSync, statSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const RPC = '/rest/v1/rpc/get_announcements_deduped'

// 이 세션 scratchpad — 하네스가 /tmp/claude-<uid>/<작업 경로 꼴>/<세션 id>/scratchpad 에 만든다. 못 찾으면 null.
function sessionScratchpad() {
  const sid = process.env.CLAUDE_CODE_SESSION_ID
  if (!sid) return null
  try {
    for (const a of readdirSync('/tmp').filter(n => n.startsWith('claude-'))) {
      for (const b of readdirSync(join('/tmp', a))) {
        const p = join('/tmp', a, b, sid, 'scratchpad')
        if (existsSync(p)) return p
      }
    }
  } catch { /* 없으면 아래 기본값 */ }
  return null
}

// 요청 본문 → 인자 키. JSON 이 아니면 null(캐시하지 않고 그대로 보낸다).
export function argKey(body) {
  if (!body) return '{}'
  let o
  try { o = JSON.parse(body) } catch { return null }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const kept = Object.keys(o).filter(k => o[k] != null).sort()
  return JSON.stringify(Object.fromEntries(kept.map(k => [k, o[k]])))
}

export async function stubListRpc(page, { dir, maxAgeMin = 30 } = {}) {
  dir = dir || process.env.ZIPFIT_RENDER_CACHE_DIR || sessionScratchpad() || tmpdir()
  mkdirSync(dir, { recursive: true })
  const info = { dir, maxAgeMin, upstream: 0, hits: 0, keys: {} }
  const inflight = new Map()   // 같은 인자가 한 렌더 안에서 동시에 와도 운영은 한 번

  const load = async (key, route) => {
    const file = join(dir, `list-rpc-${createHash('md5').update(key).digest('hex').slice(0, 12)}.json`)
    const k = info.keys[key] || (info.keys[key] = { file, fetched: false, ageMin: null, bytes: 0, hits: 0 })
    const ageMin = existsSync(file) ? (Date.now() - statSync(file).mtimeMs) / 60000 : Infinity
    if (ageMin <= maxAgeMin) {
      k.ageMin = Math.round(ageMin)
      return { status: 200, body: readFileSync(file), cached: true }
    }
    // 첫 호출: 화면이 보낸 요청 그대로(같은 anon 헤더 · 같은 본문) 운영으로 — 브라우저 문맥의 망(프록시)을 그대로 쓴다.
    info.upstream++
    const res = await route.fetch({ timeout: 30000 })
    const body = await res.body()
    if (res.status() !== 200) return { status: res.status(), body, cached: false, headers: res.headers() }
    writeFileSync(file + '.part', body)
    renameSync(file + '.part', file)
    Object.assign(k, { fetched: true, ageMin: 0, bytes: body.length })
    return { status: 200, body, cached: false }
  }

  // 🔵 2026-10-20(우편함 「표시층 — S1 첫 묶음」 4 · 백로그 「이용 기록에서 운영·시험 세션을 가를 수 없다」 ③) — 로컬 렌더는 운영 이용 기록(usage_events)에
  //    쓰지 않는다(health-screen 과 같은 꼴 · keepalive 송신도 이 가로챔에 걸린다 — 실측 3/3). 2026-10-20 실측: 이 대역 없이 띄운 세션 렌더가
  //    10분 단위 10 · 27 · 19 세션으로 이용 기록에 남았다(ops 표지 0). 화면 동작은 그대로(송신은 fire-and-forget).
  await page.route(/\/rest\/v1\/usage_events(\?|$)/, r => r.fulfill({ status: 201, body: '' }))
  await page.route(`**${RPC}*`, async route => {
    const req = route.request()
    const key = req.method() === 'POST' ? argKey(req.postData()) : null
    if (key == null) return route.continue()
    let p = inflight.get(key)
    const mine = !p
    if (mine) { p = load(key, route); inflight.set(key, p) }
    let r
    try { r = await p } finally { if (mine) inflight.delete(key) }
    if (r.status !== 200) {
      // 실패는 캐시하지 않는다 — 받은 쪽은 그대로, 같이 기다린 쪽은 운영으로 다시(화면 재시도와 같은 꼴)
      if (mine) return route.fulfill({ status: r.status, headers: r.headers, body: r.body })
      info.upstream++
      return route.continue()
    }
    if (!mine || r.cached) { info.hits++; info.keys[key].hits++ }
    info.keys[key].bytes = r.body.length
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: r.body })
  })
  return info
}
