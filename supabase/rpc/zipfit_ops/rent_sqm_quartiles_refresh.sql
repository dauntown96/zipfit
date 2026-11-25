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
