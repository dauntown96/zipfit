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
declare ids text[]; r jsonb;
begin
  ids := array(select distinct x from (
      select h.announcement_id x from public.housing_units h
       where h.complex_id is null and h.address is not null and public.complex_road_key(h.address, h.sido_nm) is not null
      union
      select h.announcement_id from public.housing_units h where h.created_at > now() - interval '2 days') z
    where x is not null order by 1 limit 2000);
  if cardinality(ids) = 0 then r := jsonb_build_object('ids', 0);
  else r := public.complex_link_announcements(ids); end if;
  insert into zipfit_ops.complex_link_runs(result) values (r);
  delete from zipfit_ops.complex_link_runs where at < now() - interval '30 days';
  return r;
end
$function$
