CREATE OR REPLACE FUNCTION public.complex_geo_targets(p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 단지 도로명·좌표 자동 채움 대상(2026-11-17 · 우편함 「코드·운영 — 2장 …」 본 2) — EF complex-geo-fill 이 런마다 부른다.
  -- 대상 = 세대 행 주소(원문 그대로) 중 complex_id 빈칸 ∧ 숫자 있음 ∧ 도로명 키 NULL(잇기 함수와 같은 시도 — 세대 행 · 없으면 공고) ∧ complex_geo 에 없음
  --   ∧ 시도 기록이 막지 않음(picked · multi(사람 판정) 는 다시 안 함 · none 은 30일 · error 는 50분 뒤 다시).
  -- 반환 [{address, names(세대 building_name · 공고 제목 — 여러 결과 고르기 재료), ann_ids}] · 오래된 주소부터 p_limit(1~20).
  select coalesce(jsonb_agg(jsonb_build_object('address', t.address, 'names', t.names, 'ann_ids', t.ann_ids) order by t.first_at, t.address), '[]'::jsonb)
    from (select h.address, min(h.created_at) as first_at,
                 array_remove(array_agg(distinct nullif(btrim(h.building_name), '')), null)
                   || array_remove(array_agg(distinct nullif(btrim(a.title), '')), null) as names,
                 array_agg(distinct h.announcement_id) as ann_ids
            from public.housing_units h
            left join lateral (select a1.sido_nm, a1.title from public.announcements a1 where a1.announcement_id = h.announcement_id
                                order by a1.source limit 1) a on true
           where h.complex_id is null and h.address ~ '[0-9]'
             and public.complex_road_key(h.address, coalesce(h.sido_nm, a.sido_nm)) is null
             and not exists (select 1 from public.complex_geo g where g.matched_from = h.address)
             and not exists (select 1 from public.complex_geo_attempts t where t.matched_from = h.address
                               and (t.outcome in ('picked', 'multi')
                                    or (t.outcome = 'none' and t.tried_at > now() - interval '30 days')
                                    or (t.outcome = 'error' and t.tried_at > now() - interval '50 minutes')))
           group by h.address
           order by min(h.created_at), h.address
           limit greatest(1, least(coalesce(p_limit, 6), 20))) t
$function$
