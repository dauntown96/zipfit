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
-- 🔵 2026-11-17(우편함 「코드·운영 — 4장 …」 본 1 4) — 부를 때마다 끝에 public.complex_lh_code_fill()(단지 ↔ LH 단지 번호 채움 · 대상 0이면 쓰기 0)을 부르고
--   그 결과를 r 의 lh_fill 칸에 함께 남긴다(새 단지가 생겨도 같은 규칙으로 채워진다).
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
  r := r || jsonb_build_object('lh_fill', public.complex_lh_code_fill());
  insert into zipfit_ops.complex_link_runs(result) values (r);
  delete from zipfit_ops.complex_link_runs where at < now() - interval '30 days';
  return r;
end
$function$
