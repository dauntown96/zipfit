CREATE OR REPLACE FUNCTION public.get_announcement_round_ids(p_announcement_id text, p_apply_end date DEFAULT NULL::date)
 RETURNS TABLE(announcement_id text, same_round boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
