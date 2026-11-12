-- 새 분석 공고 단지 잇기 자동 호출(2026-11-12 · 우편함 「코드·운영 — Visual 갱신 뒤 승인 멈춤 안 C 시험 + 새 분석 공고 단지 잇기 자동 호출 …」 2).
-- zipfit_ops.complex_link_pending() — 세대 행 complex_id 가 비고 도로명 키가 있는 공고 + 지난 2일 안 세대 행이 생긴 공고를 complex_link_announcements 로 부른다(최대 2,000 · 대상 0 이면 안 부름).
-- pg_cron zipfit-complex-link-pending '41 * * * *'(매시 41분 UTC = KST xx:41 · 부하 줄 :20~:24·:50~:54 밖). 시크릿 없음.
-- 수집 EF 도 쓴 공고마다 잇기 함수를 부르지만(그 런에 쓴 공고만) 분석이 세대 행을 쓴 공고가 그 런에 없으면 비었다 — 이 잡이 안전망(스킬 v11.6 전까지 · 뒤에도 무해).
-- 되돌리기: select cron.unschedule('zipfit-complex-link-pending'); drop function zipfit_ops.complex_link_pending();
-- zipfit:function zipfit_ops.complex_link_pending() acl={postgres=X/postgres} secdef=false
CREATE OR REPLACE FUNCTION zipfit_ops.complex_link_pending()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 새 분석 공고 단지 잇기(2026-11-12 · 우편함 「코드·운영 — Visual 갱신 뒤 승인 멈춤 안 C 시험 + 새 분석 공고 단지 잇기 자동 호출 …」 2).
--   분석이 세대 행을 쓴 뒤 complex_link_announcements 를 아무도 부르지 않아 새 공고 세대 행 complex_id 가 비었다(…21051 0/2 · run 427).
--   pg_cron zipfit-complex-link-pending 이 매시 부른다: 대상 = ① complex_id 가 비고 도로명 키가 있는 세대 행의 공고 ② 지난 2일 안에 세대 행이 생긴 공고
--   (코드 고르기 · 이름 채움 재료) · 최대 2,000 · 대상 0 이면 잇기 함수를 부르지 않는다. 쓰기는 잇기 함수 규칙 그대로(원문 값만 · 이름으로 합치지 않음).
declare ids text[]; r jsonb;
begin
  ids := array(select distinct x from (
      select h.announcement_id x from public.housing_units h
       where h.complex_id is null and h.address is not null and public.complex_road_key(h.address, h.sido_nm) is not null
      union
      select h.announcement_id from public.housing_units h where h.created_at > now() - interval '2 days') z
    where x is not null order by 1 limit 2000);
  if cardinality(ids) = 0 then return jsonb_build_object('ids', 0); end if;
  r := public.complex_link_announcements(ids);
  return r;
end
$function$;
revoke all on function zipfit_ops.complex_link_pending() from public, anon, authenticated, service_role;
select cron.schedule('zipfit-complex-link-pending', '41 * * * *', $cmd$select zipfit_ops.complex_link_pending()$cmd$);
