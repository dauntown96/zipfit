CREATE OR REPLACE FUNCTION zipfit_ops.original_lh_id(p_id text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
-- 🔴 2026-10-07(Z-2 ① PR-A — 우편함 「코드 — Z-2 …」 1) 원문 ID 한 정의. 산물(세대·정책·자격·이미지·경로)이 살 LH 원문 행의 ID를 돌려준다.
--   분석 스킬 규약 29 · 감지 루틴 · 재확인 스킬 · 이전 회차가 모두 이 함수 하나를 부른다(관리 API · postgres) — 사본을 짓지 않는다.
--   p_id 가 LH 행이면 그 자신. MYHOME(그 밖) 행이면:
--     ① 같은 카드 그룹(get_announcement_group_ids) ∩ LH ∩ 같은 apply_end(이번 회차) 후보 중
--        url 의 panId 가 후보 안에 있으면 그것 → 아니면 created_at 최신(id 큰 것)
--     ② 후보가 없으면 url 의 panId LH 행이 같은 그룹에 있을 때 그것(같은 게시물 링크로 붙은 공고문 — 접수일이 달라도 같은 게시물)
--     ③ 그래도 없으면 NULL — 원문 LH 가 없다(지방공사 · 숨긴 LH · 링크 없는 다른 제목 게시물). 산물은 그 행 자신에 둔다.
--   🔴 url panId 만 믿지 않는다 — MYHOME 21197_* 의 url 은 앞 회차 …20344 를 가리킨다(같은 그룹 ∧ 같은 apply_end 인 …20712 가 원문).
--   ⚠️ 숨긴 LH(hidden_from_listing)·제목 없는 LH 는 그룹 함수가 빼므로 원문이 되지 않는다(당진·예산 …20198 — 다운님 판정 대기).
--   화면 권한 없음 — zipfit_ops 스키마는 anon·authenticated 에 USAGE 가 없고, 함수 EXECUTE 도 PUBLIC 에서 걷었다.
WITH me AS (
  SELECT a.source, a.apply_end, substring(a.url FROM 'panId=([0-9]+)') AS pan
  FROM public.announcements a
  WHERE a.announcement_id = p_id
  ORDER BY CASE WHEN a.source = 'LH' THEN 0 ELSE 1 END, a.created_at DESC, a.id DESC
  LIMIT 1
),
grp_lh AS (
  SELECT l.announcement_id, l.apply_end, l.created_at, l.id
  FROM public.get_announcement_group_ids(p_id) g
  JOIN public.announcements l ON l.announcement_id = g.announcement_id AND l.source = 'LH'
)
SELECT CASE
  WHEN (SELECT me.source FROM me) = 'LH' THEN p_id
  ELSE COALESCE(
    (SELECT c.announcement_id FROM grp_lh c, me WHERE c.apply_end = me.apply_end AND c.announcement_id = me.pan),
    (SELECT c.announcement_id FROM grp_lh c, me WHERE c.apply_end = me.apply_end ORDER BY c.created_at DESC, c.id DESC LIMIT 1),
    (SELECT c.announcement_id FROM grp_lh c, me WHERE c.announcement_id = me.pan))
END;
$function$
