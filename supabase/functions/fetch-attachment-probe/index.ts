// 🔴 폐기됨 (2026-09-10). 이 함수는 fetch-attachment 로 대체됐다.
//
// 원래 이 함수는 임시 조사용이었고, 정식화하면서 이름을 바꿨다.
// ⚠️ Supabase는 EF 이름을 바꿀 수 없어서 새 이름으로 배포하고 옛 것을 내려야 했다.
//
// 🔴 그런데 이 세션에서 함수를 *삭제*할 수단이 없다:
//   - Supabase MCP에 삭제 도구가 없다(deploy/get/list만 있다).
//   - Management API는 컨테이너 egress 프록시가 supabase.com을 막아 부를 수 없다.
//   - Vault에도 관리 토큰이 없다(cron_secret_v2 하나뿐).
//
// 그래서 슬롯은 남기되 **기능을 통째로 들어냈다.** 시크릿을 아는 누구도
// 이 함수로 외부 요청을 낼 수 없다 — 허용목록도 fetch도 남아 있지 않다.
//
// 🟡 슬롯 자체의 삭제는 다운님이 Supabase 대시보드에서 하신다
//    (Edge Functions → fetch-attachment-probe → Delete).

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: 'gone',
      detail: '이 함수는 폐기됐다. fetch-attachment 를 쓴다.',
      replaced_by: 'fetch-attachment',
      retired_at: '2026-09-10',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  )
)
