CREATE OR REPLACE FUNCTION public.wave_notice_targets(p_now timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Seoul'::text))
 RETURNS TABLE(announcement_id text, win integer, win_from date, win_to date, phases text, scope_text text, post_on date, post_at timestamp without time zone, multi_scope boolean, has_warn boolean, due boolean, region_office text, title_dep text, all_ids text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 매입 순위별 둘째 이후 창의 「대상주택 게시」 판정 — 한 정의(2026-11-05 · 우편함 「코드·운영 — 대상주택 공지 감지 구현 …」 1장).
-- 부르는 곳: health-ops wave_notice_missing(.github/health/wave-notice.mjs) · EF collect-lh-notices(대상 창이 있을 때만 LH 공지 API) ·
--   lh_notice_ingest(맞은 공지 저장) · analysis_dispatch_tick #차수 갈래(켜기 칸 wave_notice_enabled). 🔴 한쪽만 고치지 않는다 — 여기를 고친다.
-- 정의는 화면 그대로다(index.html zfRouteWinsAll · zfRouteDefaultWin · zfWaveIdsOf · zfLoadWaveNotes · zfRouteSchedOf):
--   카드      = get_announcements_deduped() 대표 ∧ apply_end ≥ 오늘(KST) ∧ 매입 ∧ apply_period_check 아님 ∧ 조기 마감 아님(제목 머리 [조기마감] · revision_note)
--   창        = 같은 제목 키 경로 행 중 카드 기간과 겹치는 것 · 겹치거나 하루 차로 붙은 행은 한 창 · 날짜 빈 경로 행이 있으면 그 카드는 보지 않는다 · 창 둘 이상만
--   기본 창 i = 오늘이 든 창 → 없으면 다음 창 → 다 끝났으면 마지막 창 · i ≥ 1(둘째 이후)만 한 행(창마다 그 창 대상주택게시 scope 마다 한 행 · 없으면 scope NULL 한 행)
--   has_warn  = 창들의 경로 행 공고 id ∪ 카드 id 의 정책 행 중 분류가 「⚠️」로 시작 ∧ 「차수」 ∧ 「대상」
--   multi_scope = 그 id 들의 대상주택게시 scope_text 가 둘 이상(순위별)
--   post_at   = 시작일 + period_text 첫 「HH:MM」(「(15:00 이후)」 · 「(10:00)」 꼴) · 시각이 없으면 0시
--   due       = multi_scope ∧ post_at ≤ p_now ∧ p_now 날짜 ≤ 창 끝  — 「공지가 이미 나왔어야 하는 때」
--   대상(공지 찾을 몫) = due ∧ not has_warn
--   region_office = 그 id 들 세대 행 region_office(가장 많은 값) · title_dep = 카드 제목 「[…지역본부]」
-- p_now = 지금(KST 시각 · 시험은 과거·미래 시각을 넣어 재현).
with c as materialized (select d.announcement_id, d.title, d.apply_start s0, d.apply_end e0, public.announcement_dedup_key(d.title) k
        from public.get_announcements_deduped() d
       where d.apply_end >= p_now::date and d.apply_start is not null and d.housing_type like '%매입%'
         and d.apply_period_check is not true
         and d.title !~ '^\s*(\[[^\]]*\]\s*)*\[\s*조기\s*(접수)?\s*마감\s*\]' and coalesce(d.revision_note, '') !~ '조기\s*(접수\s*)?마감'),
r as materialized (select c.announcement_id cid, x.announcement_id rid, x.start_date x0, x.end_date y0, x.phase_text ph
        from c join public.announcements a on public.announcement_dedup_key(a.title) = c.k
        join public.announcement_apply_routes x on x.announcement_id = a.announcement_id
       where a.title is not null),
bad as (select distinct cid from r where x0 is null or y0 is null),
w as (select r.*, case when x0 <= max(y0) over (partition by cid order by x0, y0 rows between unbounded preceding and 1 preceding) + 1 then 0 else 1 end brk
        from r join c on c.announcement_id = r.cid
       where r.cid not in (select cid from bad) and not (r.y0 < c.s0 or r.x0 > c.e0)),
g as (select w.*, sum(brk) over (partition by cid order by x0, y0 rows unbounded preceding) gi from w),
m as (select cid, gi, min(x0) x, max(y0) y, array_agg(distinct ph) filter (where ph is not null) phs, array_agg(distinct rid) ids
        from g group by cid, gi),
mc as (select m.*, count(*) over (partition by cid) n, row_number() over (partition by cid order by x) - 1 i from m),
di as (select cid, coalesce(min(i) filter (where x <= p_now::date and p_now::date <= y), min(i) filter (where x > p_now::date), max(i)) i
         from mc where n >= 2 group by cid),
cw as materialized (select mc.cid, mc.i, mc.x, mc.y, mc.phs,
              (select array_agg(distinct v) from mc z, unnest(z.ids || mc.cid) v where z.cid = mc.cid) allids
         from mc join di using (cid, i) where di.i >= 1),
cx as (select cw.*,
          (select count(distinct s.scope_text) from public.announcement_schedule s
            where s.announcement_id = any(cw.allids) and s.stage = '대상주택게시') >= 2 as multi,
          exists (select 1 from public.announcement_policies p
                   where p.announcement_id = any(cw.allids) and p.category like '⚠️%' and p.category like '%차수%' and p.category like '%대상%') as warn,
          (select h.region_office from public.housing_units h where h.announcement_id = any(cw.allids) and coalesce(h.region_office, '') <> ''
            group by h.region_office order by count(*) desc, h.region_office limit 1) as ro,
          (select substring(c.title from '\[([^\]]*지역본부)\]') from c where c.announcement_id = cw.cid) as tdep
         from cw),
sc as (select cx.cid, s.scope_text, min(s.start_date) post_on,
              min(s.start_date + coalesce(substring(s.period_text from '([0-9]{1,2}:[0-5][0-9])')::time, time '00:00')) post_at
         from cx join public.announcement_schedule s
           on s.announcement_id = any(cx.allids) and s.stage = '대상주택게시' and s.scope_text = any(cx.phs)
        group by cx.cid, s.scope_text)
select cx.cid, (cx.i + 1)::integer, cx.x, cx.y, array_to_string(cx.phs, ' / '), sc.scope_text, sc.post_on, sc.post_at,
       cx.multi, cx.warn,
       (cx.multi and sc.post_at is not null and sc.post_at <= p_now and p_now::date <= cx.y),
       cx.ro, cx.tdep, cx.allids
  from cx left join sc on sc.cid = cx.cid
 order by cx.x, cx.cid, sc.scope_text;
$function$
