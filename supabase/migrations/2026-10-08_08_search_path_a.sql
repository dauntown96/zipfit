-- search_path 고정 묶음 A(2026-10-08 · 우편함 「코드 — 운영 기반 후속」 7 · 운영 기반 묶음 회신 2-③ 계획).
--   정의자(SECURITY DEFINER)인데 search_path 가 열려 있던 셋 — 정의자 함수는 호출자의 search_path 로 객체를 찾으면 위험하다(보안 권고 function_search_path_mutable).
--   · get_announcement_group_ids(text) — 화면(anon·authenticated)이 카드 열 때 부른다
--   · bulk_set_revision_note(text[], text[]) · bump_detail_fetch_fail(text[]) — 수집 EF(service_role)
--   정의자 SQL 함수는 원래 인라인되지 않으므로 SET 을 더해도 실행 계획이 바뀌지 않는다. 본문 변경 0 · ACL 변경 0(ALTER … SET 은 권한을 건드리지 않는다).
--   본문이 부르는 표는 전부 public(announcements · announcement_post_links)이고 함수 announcement_dedup_key 도 public 이다.
--   되돌리기: alter function … reset search_path 새 마이그레이션 + 사본 되돌림.
-- zipfit:function get_announcement_group_ids(text) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=true
-- zipfit:function bulk_set_revision_note(text[],text[]) acl={postgres=X/postgres,service_role=X/postgres} secdef=true
-- zipfit:function bump_detail_fetch_fail(text[]) acl={postgres=X/postgres,service_role=X/postgres} secdef=true
-- zipfit:anon select count(*) from get_announcement_group_ids('2015122300020726')
alter function public.get_announcement_group_ids(text) set search_path = public, pg_temp;
alter function public.bulk_set_revision_note(text[], text[]) set search_path = public, pg_temp;
alter function public.bump_detail_fetch_fail(text[]) set search_path = public, pg_temp;
