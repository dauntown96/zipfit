-- 같은 회차 ID RPC(2026-10-29 · 우편함 「코드·운영(브랜치만 · 병합 0) — 런칭 뒤 묶음」 1 · 백로그 「회차 거르기 규칙을 한 벌로」 ① · 조사 10-27 ⓑ).
--
-- get_announcement_round_ids(카드 id, 카드 접수 끝) → (announcement_id, same_round) — 묶음(get_announcement_group_ids)의 ID 마다 「카드와 같은 회차인가」.
--   🔴 목록 RPC(get_announcements_deduped)는 건드리지 않는다 — 반환형을 바꾸면 DROP 이고 응답 크기·anon 시간이 는다. 곁 RPC 하나(카드를 펼칠 때 1회).
--   🔴 get_announcement_group_ids 도 그대로(반환형 변경 = DROP · 호출부 열 곳). 이 함수가 그것을 감싼다.
--   규칙(화면 zfRoundRows · zfSplitByCardRound 와 같은 축): 다른 회차 = ID 의 announcements.apply_end 를 알고 카드 접수 끝과 다름 ·
--   카드 접수 끝을 모르면 전부 같은 회차 · 같은 회차 ID 가 0 이면 전부 같은 회차(정정으로 마감이 바뀐 공고).
--   화면이 쓰는 일은 표시층 몫(이 파일은 RPC 까지) — 화면은 산물 행 단위 「이번 회차 행 0 → 거르지 않음」을 그대로 둔다.
--   되돌리기 전용 시험(2026-10-29 11:21 KST · 관리 API): 열린 카드 67 · 그룹 ID 집합 = get_announcement_group_ids 67/67 ·
--   same_round = 화면 두 규칙(zfRoundRows · zfSplitByCardRound) 차이 0 · 다른 회차 ID 57(카드 6) · anon 카드마다 평균 14ms · 최대 24ms.
-- 권한: 실행만(anon · authenticated · service_role) · PUBLIC 회수 · SECURITY INVOKER(읽는 표는 anon 이 이미 읽는다 — 그룹 함수만 DEFINER).
-- 되돌리기: drop function public.get_announcement_round_ids(text, date);
-- zipfit:function get_announcement_round_ids(text,date) acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=false
-- zipfit:anon select count(*) from get_announcement_round_ids('2015122300020886')
-- zipfit:anon select count(*) from get_announcement_round_ids('2015122300020886', date '2026-10-30')

create function public.get_announcement_round_ids(p_announcement_id text, p_apply_end date default null)
 returns table(announcement_id text, same_round boolean)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
-- 같은 회차 ID(2026-10-29 · 우편함 「코드·운영 — 런칭 뒤 묶음」 1 · 백로그 「회차 거르기 규칙을 한 벌로」 ① · 조사 10-27 ⓑ).
-- 묶음(get_announcement_group_ids — 제목 키 · 같은 게시물 링크)의 ID 마다 「카드와 같은 회차인가」를 붙인다. 화면 zfSplitByCardRound · zfRoundRows 와 같은 축:
--   다른 회차 = 그 ID 의 announcements.apply_end 를 알고 그것이 카드 접수 끝과 다르다 · 카드 접수 끝을 모르면 전부 같은 회차 ·
--   같은 회차 ID 가 하나도 없으면(apply_end 를 아는 ID 가 전부 카드와 다름 — 정정으로 마감이 바뀐 공고) 전부 같은 회차(거르지 않음).
-- p_apply_end = 카드 접수 끝(화면은 목록 RPC 의 apply_end 를 넘긴다 — 확정값·best_schedule 이 announcements.apply_end 와 다를 수 있다).
--   NULL 이면 p_announcement_id 행의 announcements.apply_end.
-- 🔴 산물 행 단위의 「이번 회차 행 0 → 거르지 않음」(zfSplitByCardRound)은 ID 단위로 옮길 수 없다 — 화면에 그대로 둔다.
with g as (
  select gi.announcement_id from public.get_announcement_group_ids(p_announcement_id) gi
),
ce as (
  select coalesce(p_apply_end, (select max(a.apply_end) from public.announcements a where a.announcement_id = p_announcement_id)) as d
),
r as (
  select g.announcement_id, (select max(a.apply_end) from public.announcements a where a.announcement_id = g.announcement_id) as e
  from g
)
select r.announcement_id,
       ce.d is null or r.e is null or r.e = ce.d
         or not exists (select 1 from r r2 where r2.e = ce.d)
from r cross join ce;
$function$;

revoke all on function public.get_announcement_round_ids(text, date) from public, anon, authenticated;
grant execute on function public.get_announcement_round_ids(text, date) to anon, authenticated, service_role;
comment on function public.get_announcement_round_ids(text, date) is
  '같은 회차 ID(2026-10-29) — 묶음 ID 마다 same_round(카드 접수 끝과 같은 회차인가). 화면 회차 거르기 한 벌의 재료 · 마이그레이션 2026-10-29_01 머리 주석이 규칙';
