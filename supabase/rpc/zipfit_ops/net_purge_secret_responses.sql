CREATE OR REPLACE FUNCTION zipfit_ops.net_purge_secret_responses()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — pg_net 응답 표 권한(보안) …」 1 ④) — pg_net 응답 표에서 비밀값(OAuth 토큰) 응답 행을 지운다.
--   cron zipfit-net-purge-secrets 가 5분마다 부른다. 지운 행 수를 돌려준다.
--   까닭: net._http_response 는 pg_net 이 6시간(pg_net.ttl) 남기고, 그 표의 권한은 supabase_admin 이 PUBLIC 에 준 것이라
--   postgres 가 anon·authenticated 에서 회수할 수 없다(2026-10-17 롤백 시험 — REVOKE 가 아무것도 바꾸지 못함). REST·GraphQL 로는
--   net 스키마가 노출되지 않는다(PGRST106 · pg_graphql 꺼짐 — 같은 날 실측) — 그래도 토큰이 6시간 남는 자리 자체를 줄인다.
--   대상: 본문에 "access_token" · "refresh_token" · "id_token" · "client_secret" 키가 있는 응답(Google OAuth 토큰 응답 꼴 — 2026-10-16 1행 관측).
--   우리 함수는 그런 응답을 받지 않는다(Drive 토큰은 fetch-attachment 안에서만 받는다) — 손으로 net.http_post 를 부른 자리를 거둔다.
--   🔵 2026-10-18(우편함 「G8 확정 고침」 강화 c) — "action_link" 키도 더한다: test-login(mode=link)의 1회용 로그인 링크(토큰 해시 포함 · 1시간)가
--   net.http_post 로 불렸을 때 응답 표에 남는 꼴이다(그날 0행).
declare
  n integer;
begin
  delete from net._http_response r
   where r.content ~* '"(access_token|refresh_token|id_token|client_secret|action_link)"\s*:';
  get diagnostics n = row_count;
  return n;
end
$function$
