-- 마지막 수집 시각 RPC · 보안 묶음 C(INVOKER 함수 search_path 고정) (2026-10-13 · 우편함 「코드 — 국면 B′ ③ 지방공사」 3 · 백로그 「Supabase 보안 점검 지적」 묶음 C).
--
-- ① get_last_collected_at() — 출처별 마지막 「성공」 수집 시각. 화면 표제란 「기준」을 목록을 불러온 날짜가 아니라 실제 수집 시각으로 바꾸려는 재료다
--    (화면 반영은 표시층 다음 판 — 이 파일은 RPC 까지). collection_run_log·sh_collection_run_log 는 anon 이 읽지 못해 SECURITY DEFINER 로 시각만 내보낸다.
--    「성공」(2026-10-13 실측으로 정함 — 런 기록 한 행 = 수집 한 번 · run_at = 런 끝 시각):
--      LH     = collection_run_log 에서 lh_upserted > 0 인 런(목록을 받아 행을 썼다 — 카테고리 일부 실패·상세 마감 초과는 errors 에 남아도 목록은 들어왔다)
--      MYHOME = 같은 표에서 myhome_upserted > 0 인 런(LH·MYHOME 이 한 런 한 행에 같이 적혀 출처별로 가른다)
--      SH     = sh_collection_run_log 에서 upserted > 0 ∧ pages_failed = 0 ∧ errors 가 비었다(sh_close_missing 의 「목록을 다 봤다」와 같은 축)
--    🔴 주기 문구를 돌려주지 않는다 — LH·MYHOME 10분 수집은 KST 09~18시뿐(밤은 따로)이고 SH 는 하루 4번이라, 주기를 말하면 시간대에 따라 틀린다. 시각만.
--    🔴 성공 런이 없으면 그 출처 줄의 시각은 NULL 이다(지어내지 않는다). 권한: 실행만(anon · authenticated · service_role) · PUBLIC 회수 · search_path 고정.
-- ② 묶음 C — SECURITY INVOKER 함수 8개의 search_path 를 public, pg_temp 로 고정한다(본문에 확장 스키마 함수·이름 없는 다른 스키마 참조 0 — 2026-10-13 rpc 사본 grep).
--    🔴 get_announcements_deduped 는 뺐다 — 롤백 전용 시험(anon · 3초 한도)에서 그 함수 하나에 SET 을 붙이면 목록이 약 200ms → 370ms 로 늘었다
--       (집합 반환 SQL 함수에 SET 절이 붙으면 인라인되지 않는다). 나머지 8개만 고정하면 목록 약 200 → 225ms. 그 함수는 회신으로 판단을 받는다.
--    ALTER … SET 은 정의 글자(pg_get_functiondef 의 SET 줄)만 바꾸고 ACL·SECURITY 는 그대로다 — 사본 8개를 함께 바꾼다.
-- 되돌리기: drop function public.get_last_collected_at(); alter function … reset search_path;(8개)
-- zipfit:function get_last_collected_at() acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=true
-- zipfit:function get_announcement_blocks(text) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function get_announcement_sites(text) acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=false
-- zipfit:function get_document_templates_for(text,text) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function get_reanalysis_queue() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function get_rental_stats_summary() acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function announcement_dedup_key(text) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function sh_close_missing(integer,boolean) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function zipfit_ops.original_lh_id(text) acl={postgres=X/postgres} secdef=false
-- zipfit:anon select * from get_last_collected_at()
-- zipfit:anon select count(*) from get_announcements_deduped()
-- zipfit:anon select count(*) from get_announcement_sites('2015122300020838')
-- zipfit:anon select count(*) from get_announcement_blocks('2015122300020838')

create function public.get_last_collected_at()
 returns table(source text, last_collected_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
-- 출처별 마지막 성공 수집 시각(2026-10-13 · 마이그레이션 2026-10-13_01 머리 주석이 「성공」의 정의) — 주기 문구는 돌려주지 않는다.
select 'LH'::text, (select max(c.run_at) from public.collection_run_log c where coalesce(c.lh_upserted, 0) > 0)
union all
select 'MYHOME'::text, (select max(c.run_at) from public.collection_run_log c where coalesce(c.myhome_upserted, 0) > 0)
union all
select 'SH'::text, (select max(s.run_at) from public.sh_collection_run_log s
                     where coalesce(s.upserted, 0) > 0 and coalesce(s.pages_failed, 0) = 0
                       and (s.errors is null or s.errors = '[]'::jsonb))
$function$;
revoke all on function public.get_last_collected_at() from public, anon, authenticated;
grant execute on function public.get_last_collected_at() to anon, authenticated, service_role;
comment on function public.get_last_collected_at() is '출처별(LH·MYHOME·SH) 마지막 성공 수집 시각 — 화면 「기준」 재료 · 시각만(주기 문구 없음) · 2026-10-13 국면 B′ ③';

alter function public.get_announcement_blocks(text) set search_path = public, pg_temp;
alter function public.get_announcement_sites(text) set search_path = public, pg_temp;
alter function public.get_document_templates_for(text, text) set search_path = public, pg_temp;
alter function public.get_reanalysis_queue() set search_path = public, pg_temp;
alter function public.get_rental_stats_summary() set search_path = public, pg_temp;
alter function public.announcement_dedup_key(text) set search_path = public, pg_temp;
alter function public.sh_close_missing(integer, boolean) set search_path = public, pg_temp;
alter function zipfit_ops.original_lh_id(text) set search_path = public, pg_temp;
