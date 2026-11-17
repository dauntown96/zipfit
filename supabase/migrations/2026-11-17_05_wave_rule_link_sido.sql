-- 3장(2026-11-17 · 우편함 「코드·운영 — 3장: 광명 302동 한 행 · 경산 단지 시도 셋 + 같은 단지 합치기 · wave_notice_targets 새 창 규칙 · 작은 줄 다섯 — 병합까지」).
-- 바꾸는 것:
--   ① wave_notice_targets — 하루 차로 붙은 경로 행은 같은 대상 순위(phase_text 원문)일 때만 한 창(화면 zfRouteWinsAll · zfSameWave · #1052 와 같은 규칙 ·
--      screen-check.mjs WAVE_G_SQL 과 같은 재귀 꼴). 종전은 하루 차면 순위와 관계없이 한 창이었다(백로그 「DB 함수 wave_notice_targets 가 아직 옛 창 묶기」).
--   ② zipfit_ops.complex_link_pending 대상 ① — 세대 sido_nm 이 비면 공고 sido_nm 으로 물러난다(잇기 함수 ⑤와 같은 꼴 · 2장 회신 ② 제안 · claude.ai 승인).
-- 되돌리기: 두 함수의 앞 커밋 사본(git show <앞 커밋>:supabase/rpc/wave_notice_targets.sql · …/zipfit_ops/complex_link_pending.sql)으로 같은 꼴 새 마이그레이션.
-- zipfit:function wave_notice_targets(timestamp without time zone) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function zipfit_ops.complex_link_pending() acl={postgres=X/postgres} secdef=false
set local lock_timeout = '5s';

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
--   창        = 같은 제목 키 경로 행 중 카드 기간과 겹치는 것 · 겹치는 행은 한 창 · 하루 차로 붙은 행은 같은 대상 순위(phase_text 원문)일 때만 한 창
--               (순위 글자가 빈 행 · 창에 순위 글자가 아직 없으면 종전대로 한 창 — 화면 zfSameWave · #1052 · screen-check WAVE_G_SQL 과 같은 꼴)
--               · 날짜 빈 경로 행이 있으면 그 카드는 보지 않는다 · 창 둘 이상만
--   🔵 2026-11-17(우편함 「코드·운영 — 3장 …」 본 2) — 하루 차 묶기를 순위 조건으로 바꿨다(종전: 하루 차면 순위와 관계없이 한 창).
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
w as (select r.*, row_number() over (partition by r.cid order by r.x0, r.y0, r.rid, r.ph) rn
        from r join c on c.announcement_id = r.cid
       where r.cid not in (select cid from bad) and not (r.y0 < c.s0 or r.x0 > c.e0)),
g as (select w.*, v.gi from w join (
        with recursive q(cid, rn, gi, wy, wph) as (
          select w1.cid, w1.rn, 1, w1.y0, case when nullif(w1.ph, '') is null then '{}'::text[] else array[w1.ph] end from w w1 where w1.rn = 1
          union all
          select w2.cid, w2.rn, q.gi + case when t.sm then 0 else 1 end, case when t.sm then greatest(q.wy, w2.y0) else w2.y0 end,
                 case when t.sm then q.wph || pp.p2 else pp.p2 end
            from q join w w2 on w2.cid = q.cid and w2.rn = q.rn + 1
            cross join lateral (select case when nullif(w2.ph, '') is null then '{}'::text[] else array[w2.ph] end p2) pp
            cross join lateral (select w2.x0 <= q.wy + 1 and (w2.x0 <= q.wy or nullif(w2.ph, '') is null or cardinality(q.wph) = 0 or w2.ph = any(q.wph)) sm) t)
        select q.cid, q.rn, q.gi from q) v on v.cid = w.cid and v.rn = w.rn),
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
$function$;

CREATE OR REPLACE FUNCTION zipfit_ops.complex_link_pending()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 새 분석 공고 단지 잇기(2026-11-12 · 우편함 「코드·운영 — Visual 갱신 뒤 승인 멈춤 안 C 시험 + 새 분석 공고 단지 잇기 자동 호출 …」 2).
--   분석이 세대 행을 쓴 뒤 complex_link_announcements 를 아무도 부르지 않아 새 공고 세대 행 complex_id 가 비었다(…21051 0/2 · run 427).
--   pg_cron zipfit-complex-link-pending 이 매시 부른다: 대상 = ① complex_id 가 비고 도로명 키가 있는 세대 행의 공고 ② 지난 2일 안에 세대 행이 생긴 공고
--   (코드 고르기 · 이름 채움 재료) · 최대 2,000 · 대상 0 이면 잇기 함수를 부르지 않는다. 쓰기는 잇기 함수 규칙 그대로(원문 값만 · 이름으로 합치지 않음).
-- 🔵 2026-11-12(우편함 「코드·운영 — 0장 일곱 …」 5 · #1006 ⑦ 1) — 부를 때마다 결과를 zipfit_ops.complex_link_runs 에 한 행 남긴다(대상 0 포함 ·
--   30일 넘은 행은 같은 자리에서 지운다) — pg_cron 은 반환값을 「1 row」로만 남겨 하루 변경 수를 셀 수 없었다. health-ops ℹ️ complex_link_daily 가 읽는다.
-- 🔵 2026-11-17(우편함 「코드·운영 — 2장 …」 본 1) — 대상 ①에 둘째 키 자리를 더한다: complex_id 가 비고 도로명 키는 NULL 이나
--   주소가 complex_geo.matched_from 과 같은(source pending 밖 · 도로명 있음) 세대 행의 공고.
-- 🔵 2026-11-17(우편함 「코드·운영 — 3장 …」 0장 2) — 대상 ①의 도로명 키 시도가 세대 sido_nm 이 비면 공고 sido_nm(공고 행 source 순 첫 행)으로
--   물러난다(잇기 함수 ⑤와 같은 꼴 — 종전에는 세대 sido 가 빈 행이 2일 뒤 다시 불리지 않았다).
declare ids text[]; r jsonb;
begin
  ids := array(select distinct x from (
      select h.announcement_id x from public.housing_units h
        left join lateral (select a.sido_nm from public.announcements a where a.announcement_id = h.announcement_id order by a.source limit 1) an on true
       where h.complex_id is null and h.address is not null
         and (public.complex_road_key(h.address, coalesce(h.sido_nm, an.sido_nm)) is not null
              or exists (select 1 from public.complex_geo g where g.matched_from = h.address and g.source <> 'pending' and g.road_address is not null))
      union
      select h.announcement_id from public.housing_units h where h.created_at > now() - interval '2 days') z
    where x is not null order by 1 limit 2000);
  if cardinality(ids) = 0 then r := jsonb_build_object('ids', 0);
  else r := public.complex_link_announcements(ids); end if;
  insert into zipfit_ops.complex_link_runs(result) values (r);
  delete from zipfit_ops.complex_link_runs where at < now() - interval '30 days';
  return r;
end
$function$;
