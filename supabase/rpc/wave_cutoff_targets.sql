CREATE OR REPLACE FUNCTION public.wave_cutoff_targets(p_now timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Seoul'::text))
 RETURNS TABLE(announcement_id text, win integer, prev_to date, win_from date, region_office text, title_dep text, title text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 선순위 마감 공지 맞춤 대상(2026-11-24 · 우편함 「코드·운영 — 열여섯째 묶음」 1) — 카드·창 정의는 wave_notice_targets() 그대로(한 정의 · 여기서 다시 짜지 않는다).
--   대상 = wave_notice_targets(p_now) 의 카드(둘째 이후 창 · scope 마다 여러 행이면 하나로) 중
--     prev_to(앞 창 끝) = 그 카드 창들 공고 id 경로 행 중 end_date < win_from 의 최댓값 — 창은 겹치지 않고 차례라 이것이 바로 앞 창의 끝이다
--     ∧ p_now 날짜 > prev_to(앞 창이 끝남) ∧ 그 id 들 정책 행에 분류 「⚠️」 ∧ 「선순위」 ∧ 「마감」 행 없음(이미 반영 — …20972 선례).
--   맞춤 기간 = (prev_to, win_from) — 앞 창 끝 다음 날부터 이 창 시작 전날까지 게시된 공지.
-- 부르는 곳: EF collect-lh-notices(받을 기간 정하기) · lh_notice_ingest(맞춤) · health-ops lh_cutoff_notice(대상 수).
with t as (select distinct on (w.announcement_id) w.announcement_id, w.win, w.win_from, w.region_office, w.title_dep, w.all_ids
             from public.wave_notice_targets(p_now) w order by w.announcement_id, w.scope_text nulls last),
p as (select t.*, (select max(x.end_date) from public.announcement_apply_routes x
                    where x.announcement_id = any(t.all_ids) and x.end_date < t.win_from) prev_to
        from t)
select p.announcement_id, p.win, p.prev_to, p.win_from, p.region_office, p.title_dep,
       (select a.title from public.announcements a where a.announcement_id = p.announcement_id)
  from p
 where p.prev_to is not null and p_now::date > p.prev_to
   and not exists (select 1 from public.announcement_policies q
                    where q.announcement_id = any(p.all_ids) and q.category like '⚠️%' and q.category like '%선순위%' and q.category like '%마감%')
 order by p.prev_to, p.announcement_id;
$function$
