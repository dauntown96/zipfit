-- zipfit:function zipfit_ops.rent_sqm_quartiles_refresh() acl={postgres=X/postgres} secdef=false
-- zipfit:function get_rent_per_sqm_quartiles() acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=true
-- zipfit:anon select * from get_rent_per_sqm_quartiles()
-- ㎡당 월세 시·도 × 유형 사분위 스냅숏(2026-11-25 · 우편함 「코드·운영 — 스무째: ㎡당 월세 시·도×유형 사분위 RPC 하나(열린 + 닫힌 분석 1년 · 표본 n)」 ·
--   백로그 「㎡당 비교 표본에 『이미 분석된 닫힌 공고(지난 1년)』를 넣는다」 · 판 E 항목 2 멈춤(PR #1255 — 화면이 닫힌 1년을 받으면 +286KB · anon 1.4초)).
--   🔴 요청은 「함수 하나」였다 — 그 자리에서 셈하면 목록 함수 360ms + 가격 요약 864ms ≈ 1.25초(2026-11-25 실측)라 목표(1.4초의 1/10)에 못 닿고
--      화면을 열 때마다 그만큼 서버 CPU 가 더 든다 → 다운님 판정 2026-11-25 「스냅숏 표 + 30분 cron」.
--   ① 표 zipfit_ops.rent_sqm_quartiles(GRANT 0) ② 채움 zipfit_ops.rent_sqm_quartiles_refresh()(postgres · cron) ③ 읽기 public.get_rent_per_sqm_quartiles()(anon · 정의자)
--   ④ cron zipfit-rent-sqm-quartiles '19,49 * * * *'(30분 · 비어 있는 분) ⑤ 첫 채움 한 번. 화면이 읽는 것은 다음 표시층 판.
-- 되돌리기: select cron.unschedule('zipfit-rent-sqm-quartiles');
--   drop function public.get_rent_per_sqm_quartiles(), zipfit_ops.rent_sqm_quartiles_refresh(); drop table zipfit_ops.rent_sqm_quartiles;
DO $$ begin
  if exists (select 1 from cron.job where jobname = 'zipfit-rent-sqm-quartiles') then raise exception 'GUARD job exists'; end if;
end $$;
create table zipfit_ops.rent_sqm_quartiles (
  housing_type_std text not null,
  basis text,
  sido_nm text,
  n integer not null,
  n_open integer not null,
  n_closed integer not null,
  q1 double precision,
  med double precision,
  q3 double precision,
  refreshed_at timestamptz not null default now()
);
comment on table zipfit_ops.rent_sqm_quartiles is
  '㎡당 월세 비교 표본 사분위 스냅숏(2026-11-25) — zipfit_ops.rent_sqm_quartiles_refresh() 가 30분마다 통째로 갈아 끼운다 · public.get_rent_per_sqm_quartiles() 가 읽는다 · sido_nm NULL = 전국. GRANT 0.';
revoke all on table zipfit_ops.rent_sqm_quartiles from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION zipfit_ops.rent_sqm_quartiles_refresh()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-25(우편함 「코드·운영 — 스무째: ㎡당 월세 시·도×유형 사분위 RPC」 · 다운님 판정 2026-11-25 「스냅숏 표 + 30분 cron」) —
--   ㎡당 월세 비교 표본을 시·도 × 표준 유형(영구임대 나군은 나군끼리)마다 사분위로 셈해 zipfit_ops.rent_sqm_quartiles 를 통째로 갈아 끼운다.
--   cron zipfit-rent-sqm-quartiles 가 30분마다(매 시 19·49분) 부른다. 쓴 행 수를 돌려준다.
--   🔴 그 자리에서 셈하지 않는 까닭 — 목록 함수 360ms + 가격 요약(1,003건) 864ms ≈ 1.25초(2026-11-25 실측)를 화면이 열릴 때마다 더 쓰게 된다.
--   표본(공고 하나 = 목록 대표 하나 · 같은 공고 두 번 세지 않음):
--     대표 = get_announcements_deduped() 행 · 마감(apply_end)이 오늘(KST) − 365일 안 · 취소공고(제목 키 머리 「[취소공고]」 — 화면 zfIsCancelRow) 뺌.
--     열림 = 마감 ≥ 오늘(KST) ∧ 제목에 「조기…마감」 없음(G2 식 — 화면 isHiddenAsClosed 의 근사 · 경로 창·LH 상태 판정은 화면에만 있다).
--     닫힘 = 그 밖 ∧ 같은 회차 분석 완료(가격 요약 analysis_done — 완료 계열 · 같은 apply_end 구성원).
--   값 = get_announcement_price_summary() 의 rent_per_sqm_med(이번 회차 round_state 'current' 만 — 화면 zfLoadRentStats 와 같은 거름) · 정의를 다시 짜지 않는다.
--   유형 = housing_type_map(announcements · source · housing_type) std_type, 없으면 원값(화면 zfRentTypeKey) · basis = rent_basis('na' = 영구임대 나군).
--   시·도 = 대표 sido_nm 첫 마디의 옛 이름을 지금 이름으로(화면 ZF_SIDO_ALIASES · zfCanonSido 거울 — 그 표를 바꾸면 여기도) · NULL 행 = 전국(유형 전체).
--   사분위 = percentile_cont(선형 보간 — 화면 zfQuantile 과 같은 식) · 표본 문턱(5곳)은 화면이 n 으로 건다.
declare
  v_n integer;
begin
  delete from zipfit_ops.rent_sqm_quartiles;
  with d as (select (now() at time zone 'Asia/Seoul')::date as today),
  l as (
    select x.announcement_id, x.source, x.housing_type, x.sido_nm,
           (x.apply_end >= d.today and x.title not like '%조기%마감%') as is_open
    from public.get_announcements_deduped() x, d
    where x.apply_end >= d.today - 365
      and public.announcement_dedup_key(x.title) not like '[취소공고]%'
  ),
  s as (
    select * from public.get_announcement_price_summary((select array_agg(l.announcement_id) from l))
  ),
  v as (
    select coalesce(m.std_type, nullif(l.housing_type, '')) as type_std,
           s.rent_basis as basis,
           nullif(array_to_string(case
             when t.a[1] in ('광주광역시', '전라남도') then array['전남광주통합특별시'] || t.a[2:]
             when t.a[1] = '강원도' then array['강원특별자치도'] || t.a[2:]
             when t.a[1] = '전라북도' then array['전북특별자치도'] || t.a[2:]
             else t.a end, ' '), '') as sido,
           l.is_open,
           s.rent_per_sqm_med::numeric as val
    from l
    join s on s.announcement_id = l.announcement_id
    left join public.housing_type_map m
      on m.source_table = 'announcements' and m.source = l.source and m.housing_type = l.housing_type
    cross join lateral (select regexp_split_to_array(btrim(coalesce(l.sido_nm, '')), '\s+') as a) t
    where s.round_state = 'current' and s.rent_per_sqm_med is not null and (l.is_open or s.analysis_done)
  )
  insert into zipfit_ops.rent_sqm_quartiles (housing_type_std, basis, sido_nm, n, n_open, n_closed, q1, med, q3)
  select v.type_std, v.basis, v.sido,
         count(*), count(*) filter (where v.is_open), count(*) filter (where not v.is_open),
         percentile_cont(0.25) within group (order by v.val),
         percentile_cont(0.5) within group (order by v.val),
         percentile_cont(0.75) within group (order by v.val)
  from v
  where v.type_std is not null
  group by grouping sets ((v.type_std, v.basis, v.sido), (v.type_std, v.basis));
  get diagnostics v_n = row_count;
  return v_n;
end
$function$
;
revoke all on function zipfit_ops.rent_sqm_quartiles_refresh() from public;
CREATE OR REPLACE FUNCTION public.get_rent_per_sqm_quartiles()
 RETURNS TABLE(housing_type_std text, basis text, sido_nm text, n integer, n_open integer, n_closed integer, q1 double precision, med double precision, q3 double precision, refreshed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-25(우편함 「코드·운영 — 스무째: ㎡당 월세 시·도×유형 사분위 RPC」) — ㎡당 월세 비교 표본의 시·도 × 표준 유형 사분위(스냅숏 읽기).
--   표본 정의·셈은 zipfit_ops.rent_sqm_quartiles_refresh()(30분마다 · cron zipfit-rent-sqm-quartiles) — 이 함수는 그 표를 읽기만 한다(인자 없음 · 100행 안팎).
--   sido_nm NULL = 전국(그 유형 전체) · basis 'na' = 영구임대 나군 · n = 표본(열린 n_open + 닫힌 분석 완료 n_closed · 마감 1년 안) · refreshed_at = 셈한 때.
--   🔴 정의자인 까닭: 스냅숏 표(zipfit_ops)는 클라이언트 권한 0 — 내보내는 것은 유형·시·도별 집계 숫자뿐(공고 id·개인정보 0). search_path 고정.
  select q.housing_type_std, q.basis, q.sido_nm, q.n, q.n_open, q.n_closed, q.q1, q.med, q.q3, q.refreshed_at
  from zipfit_ops.rent_sqm_quartiles q
  order by q.housing_type_std, q.basis, q.sido_nm nulls first;
$function$
;
revoke all on function public.get_rent_per_sqm_quartiles() from public, anon, authenticated;
grant execute on function public.get_rent_per_sqm_quartiles() to service_role;
grant execute on function public.get_rent_per_sqm_quartiles() to anon;
grant execute on function public.get_rent_per_sqm_quartiles() to authenticated;
select zipfit_ops.rent_sqm_quartiles_refresh();
select cron.schedule('zipfit-rent-sqm-quartiles', '19,49 * * * *', $cmd$select zipfit_ops.rent_sqm_quartiles_refresh()$cmd$);
