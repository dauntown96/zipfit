-- search_path 고정 묶음 B + 권한 정리(2026-10-11 · 우편함 「코드 — 고지 회차 2」 9 · 백로그 「Supabase 보안 점검 지적 37건」 ② 묶음 B · 「문서 현행화 회차가 찾은 코드·권한 정리 거리」 ③ · 묶음 A 회신의 get_announcement_group_ids 잔재).
--   1) search_path 가 열려 있던 plpgsql 함수 17 — 묶음 A 와 같은 값(public, pg_temp)으로 고정한다. 본문 변경 0 · ACL 변경 0(ALTER … SET 은 권한을 건드리지 않는다).
--      본문 대조(rpc 사본): public 밖 객체는 전부 스키마를 붙여 부른다(net.http_post · net._http_response · vault.decrypted_secrets) · 확장 함수(extensions 스키마)를 이름만으로 부르는 곳 0.
--      plpgsql 은 인라인되지 않으므로 실행 계획이 바뀌지 않는다. 트리거 함수 7(compute_announcement_flags 등)도 같다.
--   2) get_announcement_group_ids(text) — PUBLIC EXECUTE 잔재를 걷는다(anon · authenticated · service_role 은 그대로 · 화면 영향 0).
--   3) category_discovery_log · data_categories — anon · authenticated 의 SELECT 를 걷는다. 읽는 곳 0(index.html · .github · EF · public 함수 본문 grep · 2026-10-11).
--      정책(「public read …」)은 남긴다 — 정책을 지우면 백업 schema_guard 가 「사라진 POLICY」로 백업을 멈춘다(승인 실행 필요 · 회신 ②).
--   4) user_profiles — anon 의 SELECT 를 걷는다. anon 에 맞는 정책이 없어 늘 0행이던 죽은 권한이다(화면은 EF save-user-profile 경유 · REST 직접 읽기 0).
--      죽은 정책(own profile insert · own profile update — GRANT 없음)은 3과 같은 이유로 남긴다.
--   되돌리기: alter function … reset search_path · grant execute on function public.get_announcement_group_ids(text) to public ·
--             grant select on public.category_discovery_log, public.data_categories to anon, authenticated · grant select on public.user_profiles to anon (새 마이그레이션 + 사본 되돌림).
-- zipfit:function analysis_dispatch_tick(boolean) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_followup_request(text,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_queue_claim() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_queue_finish(bigint,text[],text,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function analysis_run_release(bigint,text) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function compute_announcement_flags() acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function ops_dispatch_log_fill() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function ops_health_dispatch() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function ops_health_record(jsonb) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function ops_screen_dispatch() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function protect_created_at() acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function protect_detail_columns() acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function refresh_announcement_post_links() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function set_revised_at() acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function sh_run_log_fill_started_at() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function track_attachment_history() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function update_updated_at() acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function get_announcement_group_ids(text) acl={postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=true
-- zipfit:anon select count(*) from get_announcement_group_ids('2015122300020726')
-- zipfit:anon select count(*) from get_announcements_deduped()
alter function public.analysis_dispatch_tick(boolean) set search_path = public, pg_temp;
alter function public.analysis_followup_request(text, text) set search_path = public, pg_temp;
alter function public.analysis_queue_claim() set search_path = public, pg_temp;
alter function public.analysis_queue_finish(bigint, text[], text, text) set search_path = public, pg_temp;
alter function public.analysis_run_release(bigint, text) set search_path = public, pg_temp;
alter function public.compute_announcement_flags() set search_path = public, pg_temp;
alter function public.ops_dispatch_log_fill() set search_path = public, pg_temp;
alter function public.ops_health_dispatch() set search_path = public, pg_temp;
alter function public.ops_health_record(jsonb) set search_path = public, pg_temp;
alter function public.ops_screen_dispatch() set search_path = public, pg_temp;
alter function public.protect_created_at() set search_path = public, pg_temp;
alter function public.protect_detail_columns() set search_path = public, pg_temp;
alter function public.refresh_announcement_post_links() set search_path = public, pg_temp;
alter function public.set_revised_at() set search_path = public, pg_temp;
alter function public.sh_run_log_fill_started_at() set search_path = public, pg_temp;
alter function public.track_attachment_history() set search_path = public, pg_temp;
alter function public.update_updated_at() set search_path = public, pg_temp;
revoke execute on function public.get_announcement_group_ids(text) from public;
revoke select on table public.category_discovery_log, public.data_categories from anon, authenticated;
revoke select on table public.user_profiles from anon;
