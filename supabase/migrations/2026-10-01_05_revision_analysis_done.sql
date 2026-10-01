-- 코드 — 정정본 분석 그룹의 거짓 「정정 전」 배너(2026-10-01 · 우편함 「코드 — 발송기 진전 없는 되돌림 막기 · 정정본 분석 그룹의 거짓 「정정 전」 배너」 2)
--   화면(index.html zfRowsSameRoundAsCard)이 정정 카드의 「정정 전 공고 기준」 배너를 끌지 정할 때 묻는 참/거짓 하나.
--   참 = 카드가 정정 행이고, 같은 그룹 · 같은 마감(apply_end)의 정정 행(정정 표시 또는 카드 공고일 이후 행)에
--        완료 계열 분석이 있으며, 그 분석 시각이 카드의 정정 시각(revised_at — 없으면 공고일) 이후다.
--        🔴 「완료(소급)」은 세지 않는다 — 그 analyzed_at 은 소급 기록 시각이라 분석이 정정 뒤였는지 말하지 않는다(서울대방 …0297).
--        → 정정본으로 분석했고 산물이 규약 29 로 정정 게시 전에 수집된 블록 ID 에 살아도 정정 전 내용이 아니다(춘천·홍천 …0779).
--   🔴 SECURITY DEFINER — announcement_analysis 는 anon·authenticated 에 SELECT 가 없다(pending_fields 등 내부 기록 — 열지 않는다).
--      내보내는 것은 공고 하나에 참/거짓 하나뿐이다(get_announcement_price_summary.analysis_done 과 같은 판단).
-- zipfit:function get_revision_analysis_done(text) acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=true
-- zipfit:anon select get_revision_analysis_done('2015122300020779')
-- zipfit:anon select get_revision_analysis_done('2015122300020783')

create function public.get_revision_analysis_done(p_id text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- 정정본 분석 여부(2026-10-01) — 화면의 「정정 전 공고 기준」 배너 판정 재료. 정의는 마이그레이션 2026-10-01_05 머리 주석.
  select coalesce((
    select exists (
      select 1
        from public.get_announcement_group_ids(c.announcement_id) g
        join public.announcements m on m.announcement_id = g.announcement_id
        join public.announcement_analysis aa on aa.announcement_id = m.announcement_id
       where m.apply_end is not distinct from c.apply_end
         and (m.is_revised is true or m.announcement_date >= c.announcement_date)
         and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)')  -- 소급 제외: 머리 주석
         and aa.analyzed_at >= coalesce(c.revised_at, c.announcement_date::timestamptz))
      from public.announcements c
     where c.announcement_id = p_id and c.is_revised is true), false)
$function$;

revoke all on function public.get_revision_analysis_done(text) from public;
grant execute on function public.get_revision_analysis_done(text) to anon, authenticated, service_role;
