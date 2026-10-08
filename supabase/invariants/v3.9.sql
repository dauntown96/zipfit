-- ZipFit 불변식 검사 (v3.9 · 2026-10-08)
--   v2:   V1이 컬럼 단위 GRANT를 못 보던 구멍을 메움 · usage_events 허용목록 추가
--   v3:   V8 보관 기간 감시 신설(삭제 잡 jobid 14가 조용히 죽는 것을 잡는다)
--   v3.1: allow_exec_funcs 에 get_announcement_price_summary 추가 — 그 한 줄뿐이다.
--         🔴 실제 문제가 아니라 허용목록이 낡았던 것이다. 카드 1층 요약이 anon 으로 부르므로
--            열려 있는 것이 맞다(2026-09-14 신설, supabase/rpc/get_announcement_price_summary.sql).
--   v3.2: V7에서 기본기준 매입임대/전세형 한 행(id 39d44cc1-…)의 car_limit NULL만 예외로 둔다 — V7의 조건과 detail 두 곳뿐이다.
--         🔴 조건을 넓히지 않았다. 그 행의 asset_limit NULL, 다른 행의 car_limit NULL은 여전히 위반이다.
--            근거와 예외 조건은 V7 주석에 있다(2026-09-23 B22).
--         🔴 v3.1·v3 파일은 v7 과 v8 사이에 쉼표가 없어 그대로는 42601(syntax error at or near "v8")로 죽는다.
--            v3.2에서 쉼표를 넣었다. 옛 파일은 README 규약대로 고치지 않고 둔다(2026-09-23 B22 실측).
--   v3.3: 공고 분석 스킬 v9.3 불변식 10·11을 DB 전체 검사로 더한다(2026-09-29 EF 회차 6).
--         V9  = 불변식 10 — announcement_extras.unit_key 가 같은 announcement_id 세대 행 묶음
--               (건물 머리 키 또는 「건물 머리 키::주택형」)에 닿는가.
--         V10a = 불변식 11 — 경로 표 행의 period·site·phase·note_text 가 근거 정책 행 content_raw 의 부분 문자열인가 ·
--               근거 행이 있고 category 가 「모집일정」인가(스킬 규칙 12-2) · route 3값.
--         V10c = 불변식 11 「갈리는 공고에 경로 0행」의 근사 — 🔴 단지 축만 본다: 같은 그룹 모집일정 행에
--               「단지명 :」 줄이 서로 다른 값 둘 이상인데 그룹에 경로 행이 0인 활성 공고. 순위·경로 축은 원문 문장이
--               제각각이라 SQL로 가르지 않았다(과잉 탐지를 막으려 좁혔다 — 이 검사가 0이어도 순위 축 누락은 남을 수 있다).
--   v3.4: 공고 분석 스킬 v9.4 불변식 12를 DB 전체 검사로 더한다(2026-09-29 B66).
--         V12 = 완료 계열(announcement_analysis.status 가 「완료」로 시작) 공고 중 announcement_promo_files 행이 있는데
--               같은 그룹(get_announcement_group_ids)의 announcement_extras 가 0인 공고. 🔴 고치지 않고 목록만 낸다 —
--               연결은 분석 회차 몫이다. 그룹으로 세는 까닭: 규약 29로 세대 행(과 이미지)이 블록 ID에 살 수 있다.
--   v3.5: V12 를 「목록 주소에 맞는 홍보물」로 좁힌다(2026-10-01 · B73 검증 — 다운님·claude.ai 판정).
--         홍보물 행 주소(dng_hs_adr, 없으면 row_address)와 같은 그룹 세대 행 주소(housing_units.address)를 맞춰,
--         맞는 홍보물이 하나라도 있는데 그룹 이미지가 0인 공고만 센다. 목록 밖 건물의 홍보물(제주 …0835 소노빌 ·
--         외도일동 — 세대 행은 이도일동 벨라시티프리미어)은 위반이 아니다(잇지 않는 것이 맞다 — B68 판정 두 번째 적용).
--         맞추는 키 = 첫 「(」 앞 도로명 주소에서 공백을 모두 뺀 것(「서울특별시강남구언주로69길23-4」). 괄호 안 동·건물명과
--         끝 공백·띄어쓰기 차이는 보지 않는다. 🔴 주소 꼴이 달라 맞지 않는 홍보물(지번만 적힌 행 등)은 이 검사에서 빠진다 —
--         넓게 잡던 v3.4 보다 덜 잡는 쪽으로 좁혔다(목록 세대 행 주소가 없는 공고는 V12 대상이 아니다).
--   v3.6: allow_exec_funcs 에 get_revision_analysis_done 추가 — 그 한 줄뿐이다(2026-10-01 · 우편함 「코드 — 발송기 진전 없는 되돌림 막기 ·
--         정정본 분석 그룹의 거짓 「정정 전」 배너」 2). 정정 카드의 「정정 전 공고 기준」 배너 판정 재료로 화면이 anon 으로 부른다
--         (SECURITY DEFINER · 참/거짓 하나 — 마이그레이션 2026-10-01_05 · supabase/rpc/get_revision_analysis_done.sql). v3.1 과 같은 꼴이다.
--   v3.7: (2026-10-06 · 우편함 「코드 — Z-1 원문 키 사이클(DB) …」 PR-B ① 칸만) 두 가지.
--         ① allow_exec_funcs 에 get_announcement_sites 추가 — 카드 상세 단지 목록을 화면이 anon 으로 부른다(v3.1·v3.6 과 같은 꼴 ·
--            마이그레이션 2026-10-06_03 · supabase/rpc/get_announcement_sites.sql).
--         ② V13 「산물 있는 블록 ID」 — LH 원문(panId)이 있는 MYHOME 분할 행에 산물(세대·자격·정책·경로·이미지)이 있으면 위반.
--            제외: 이전 제외 목록 v13_keep(단지명을 정할 수 없는 블록 6 — 2026-10-06 실측) · LH 원문 없는 MYHOME(지방공사 — 원문 ID 가 없다).
--            🔴 **꺼 둔 채로 쓴다**(v13_on = false). ③ 이전 전까지는 블록 ID 산물이 정상이라 켜면 수백 행이 위반이 된다 —
--            ③ 병합과 함께 v3.8 에서 켜고, 그때 제외 목록을 ③ 실측으로 다시 쓴다(claude.ai 판정 2026-10-06).
--   v3.8: (2026-10-07 · 우편함 「코드 — Z-1 ③ 블록 ID 산물 → 원문 ID 이전(LH 102) …」 3) V13 을 켠다(v13_on = true) · 제외 목록을 다시 쓴다.
--         ③ 이전(관리 API 한 트랜잭션 · 기록 zipfit_ops.z1_site_move_log)으로 LH 원문이 있는 MYHOME 분할 행의 산물을 원문 ID 로 옮겼다.
--         제외 목록 v13_keep 은 이전 실측(claude.ai 판정 (가))으로 다시 썼다 — 54블록: 단지명을 정할 수 없는 블록 6(v3.7 그대로) ·
--         url panId 의 LH 행이 같은 카드 그룹 밖인 블록 8 · 옮기면 단지 모양 화면이 바뀌는 카드 그룹 40(Z-2 의 RPC 고침 뒤 옮긴다).
--         새 분석이 블록 ID 에 쓰면(스킬 v9.7 규약 29 위반) 이 줄이 잡는다.
--   v3.9: (2026-10-08 · 우편함 「코드 — Z-2 원문 ID 한 정의 · …」 ② 이전) 제외 목록 v13_keep 을 54 → 6 으로 줄인다 — 그 한 곳뿐이다.
--         Z-2 ① PR-A(원문 ID 한 정의 zipfit_ops.original_lh_id · 단지 모양 회차 거름·주소 정규화) · PR-B(같은 게시물 panId 링크) 뒤
--         ② 이전(관리 API · 카드 그룹마다 한 트랜잭션 · 기록 zipfit_ops.z1_site_move_log)으로 남은 48블록을 원문 ID 로 옮겼다 —
--         단지 모양 카드 그룹 40 + 앞 회차 panId 3(→ …20712) + 영암 2(→ …20393 · 링크 뒤) + 당진·예산 3(→ …20198 · 숨김 해제와 한 트랜잭션).
--         남는 6 = 단지명을 정할 수 없는 블록(v3.7 그대로 — 원문을 보고 단지를 정해야 한다 · 분석 회차 몫).
-- 읽기 전용. 위반이 있으면 그 행만 나온다. 아무 행도 안 나오면 통과.
with
allow_write_tables(relname, privs) as (
  values ('saved_announcements', 'DELETE,INSERT'),
         ('usage_events',        'INSERT')          -- 화면이 직접 쓰는 로그 (컬럼 단위 GRANT)
),
-- 정책 0이어도 괜찮은 테이블 (내부 로그 — 화면이 읽지 않는다)
--   ⚠️ 비워 두면 V6가 collection_run_log를 잡는다. 넣을지는 아래 주석 참조
allow_empty_policy(relname) as (
  select null::text where false   -- 지금은 비어 있다(=예외 없음)
),
allow_exec_funcs(proname) as (
  values
    ('announcement_dedup_key'), ('get_announcements_deduped'),
    ('get_announcement_group_ids'), ('get_announcement_blocks'),
    ('get_document_templates_for'), ('get_rental_stats_summary'),
    ('compute_announcement_flags'), ('protect_created_at'),
    ('protect_detail_columns'), ('set_revised_at'), ('update_updated_at'),
    ('get_announcement_price_summary'), ('get_revision_analysis_done'),
    ('get_announcement_sites')
),

-- ① public 테이블 쓰기 권한이 허용목록 밖
v1 as (
  select 'V1 테이블 쓰기' as check_name,
         c.relname as subject,
         string_agg(distinct g.priv, ',' order by g.priv) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (select unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as priv) p
  cross join lateral (
    -- 🔴 INSERT·UPDATE는 컬럼 단위 GRANT가 있을 수 있어 has_any_column_privilege로 본다.
    --    has_table_privilege는 컬럼 단위를 못 보고 false를 돌려준다(2026-09-14 실측).
    --    DELETE·TRUNCATE는 컬럼 권한이 없어 has_any_column_privilege가 22023으로 죽는다.
    select p.priv
    where case when p.priv in ('INSERT','UPDATE')
               then has_any_column_privilege('anon', c.oid, p.priv)
                 or has_any_column_privilege('authenticated', c.oid, p.priv)
               else has_table_privilege('anon', c.oid, p.priv)
                 or has_table_privilege('authenticated', c.oid, p.priv) end
  ) g(priv)
  where n.nspname = 'public' and c.relkind in ('r','p')
  group by c.relname
  having c.relname not in (select relname from allow_write_tables)
      or string_agg(distinct g.priv, ',' order by g.priv)
         is distinct from (select privs from allow_write_tables a where a.relname = c.relname)
),

-- ② public 함수 EXECUTE가 허용목록 밖
v2 as (
  select 'V2 함수 EXECUTE' as check_name,
         p.proname as subject,
         case when p.prosecdef then 'SECURITY DEFINER' else 'INVOKER' end as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (select proname from allow_exec_funcs)
),

-- ③ 시퀀스 권한
v3 as (
  select 'V3 시퀀스 권한' as check_name,
         c.relname as subject,
         string_agg(distinct g.priv, ',' order by g.priv) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (select unnest(array['SELECT','UPDATE','USAGE']) as priv) p
  cross join lateral (
    select p.priv
    where has_sequence_privilege('anon', c.oid, p.priv)
       or has_sequence_privilege('authenticated', c.oid, p.priv)
  ) g(priv)
  where n.nspname = 'public' and c.relkind = 'S'
  group by c.relname
),

-- ④ storage 버킷 (생기면 storage 기본 권한을 먼저 닫는다)
v4 as (
  select 'V4 storage 버킷' as check_name, b.name as subject,
         case when b.public then 'public' else 'private' end as detail
  from storage.buckets b
),

-- ⑤ RLS 없는 public 테이블
v5 as (
  select 'V5 RLS 미적용' as check_name, c.relname as subject, 'relrowsecurity=false' as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),

-- ⑥ RLS는 켰는데 정책이 0개 + anon에 SELECT가 열려 있다 (읽기가 조용히 빈다)
--    🔴 anon SELECT가 없으면 정책 0은 정상이다 — 두 조건이 함께여야 증상이다
v6 as (
  select 'V6 RLS 정책 0' as check_name, c.relname as subject,
         'policies=0 + anon SELECT' as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and has_table_privilege('anon', c.oid, 'SELECT')
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    and c.relname not in (select relname from allow_empty_policy)
),

-- ⑦ 기본기준 행에 한도가 비었는데 수기확인 메모도 없다
v7 as (
  select 'V7 기본기준 한도' as check_name,
         coalesce(housing_type,'(null)') || '/' || coalesce(supply_form,'(null)') || '/' || coalesce(rank::text,'-') as subject,
         concat_ws(' ',
           case when asset_limit is null then 'asset_limit=NULL' end,
           case when car_limit   is null
                     and not (id = '39d44cc1-1ba2-4282-9cfd-15a5b53a99c4'
                              and housing_type = '매입임대' and supply_form = '전세형')
                then 'car_limit=NULL' end) as detail
  from eligibility_criteria
  where announcement_id is null
    and manual_check_note is null
    and (asset_limit is null
         -- 🔴 v3.2 예외 — 기본기준 매입임대/전세형 한 행만. 원문에 자동차 개별 기준이 없다:
         --    basis 「2.신혼·신생아Ⅱ입주자모집공고문(2026.06.30).pdf」 p.4 「총자산 36,200만원 이하,」 ·
         --    p.5 「• 총자산가액 = 부동산가액+자동차가액+ 금융자산가액+기타자산가액-부채 / • 자동차가액은 총자산에 합산」.
         --    그 basis 공고(2015122300020255)의 기준 행도 car_limit NULL이다(2026-09-23 B22, 다운님 판정).
         --    id 로 특정한다 — housing_type·supply_form 만으로 걸면 같은 이름의 행이 새로 생겼을 때 예외가 번진다.
         or (car_limit is null
             and not (id = '39d44cc1-1ba2-4282-9cfd-15a5b53a99c4'
                      and housing_type = '매입임대' and supply_form = '전세형')))
),
-- ⑧ 보관 기간 — usage_events 최고령 행이 1년 + 유예(7일)보다 오래됐으면 위반
--   🔵 having이 0행 문제를 저절로 푼다: 표가 비면 min()이 NULL이고 NULL < x 는 NULL이라 행이 안 나온다.
--   ⚠️ 유예는 삭제(정확히 1년)가 아니라 감시에 둔다 — 삭제에 유예를 두면 처리방침이 약속한 1년을 넘겨 보관하게 된다.
v8 as (
  select 'V8 보관기간' as check_name,
         min(occurred_at)::text as subject,
         (now() - min(occurred_at))::text as detail
  from public.usage_events
  having min(occurred_at) < now() - interval '1 year 7 days'
),
-- ⑨ unit_key 가 같은 공고 세대 행 묶음에 닿지 않는다 (스킬 불변식 10)
v9 as (
  select 'V9 unit_key 닿지 않음' as check_name,
         x.announcement_id || ' · ' || x.id::text as subject,
         'unit_key=' || x.unit_key || ' · source=' || coalesce(x.unit_key_source,'(null)') as detail
  from announcement_extras x
  where x.unit_key is not null
    and not exists (
      select 1 from housing_units h
      where h.announcement_id = x.announcement_id
        and x.unit_key in (
          coalesce(nullif(btrim(h.building_name),''), h.address, '주소 정보 없음'),
          coalesce(nullif(btrim(h.building_name),''), h.address, '주소 정보 없음') || '::' || coalesce(h.unit_group, h.unit_type)))
),
-- ⑩-a 경로 표 행이 근거 모집일정 행의 부분 문자열이 아니다 (스킬 불변식 11)
v10a as (
  select 'V10a 경로 부분문자열' as check_name,
         r.announcement_id || ' · ' || r.id::text as subject,
         concat_ws(' ',
           case when p.id is null then 'policy_id 없음' end,
           case when p.id is not null and p.category <> '모집일정' then 'category=' || p.category end,
           case when p.id is not null and strpos(p.content_raw, r.period_text) = 0 then 'period_text' end,
           case when p.id is not null and r.site_text  is not null and strpos(p.content_raw, r.site_text)  = 0 then 'site_text' end,
           case when p.id is not null and r.phase_text is not null and strpos(p.content_raw, r.phase_text) = 0 then 'phase_text' end,
           case when p.id is not null and r.note_text  is not null and strpos(p.content_raw, r.note_text)  = 0 then 'note_text' end,
           case when r.route not in ('인터넷·모바일','현장','전체') then 'route=' || r.route end) as detail
  from announcement_apply_routes r
  left join announcement_policies p on p.id = r.policy_id
  where p.id is null or p.category <> '모집일정'
     or strpos(p.content_raw, r.period_text) = 0
     or (r.site_text  is not null and strpos(p.content_raw, r.site_text)  = 0)
     or (r.phase_text is not null and strpos(p.content_raw, r.phase_text) = 0)
     or (r.note_text  is not null and strpos(p.content_raw, r.note_text)  = 0)
     or r.route not in ('인터넷·모바일','현장','전체')
),
-- ⑩-c 단지별 일정인데 경로 0행 — 단지 축 근사(위 머리 주석)
sites as (
  select p.announcement_id, (regexp_match(p.content_raw, '^단지명\s*:\s*(.+)$', 'n'))[1] as site
  from announcement_policies p
  where p.category = '모집일정'
),
cand as (
  select distinct s.announcement_id from sites s where s.site is not null
),
grp as (
  select c.announcement_id rep, g gid from cand c cross join lateral get_announcement_group_ids(c.announcement_id) g
),
v10c as (
  select 'V10c 단지별 일정인데 경로 0행' as check_name,
         min(grp.rep) as subject,
         string_agg(distinct s.site, ' | ') as detail
  from grp join sites s on s.announcement_id = grp.gid and s.site is not null
  join announcements a on a.announcement_id = grp.rep
  where coalesce(a.apply_end_confirmed, a.apply_end) >= current_date
  group by grp.rep
  having count(distinct s.site) >= 2
     and not exists (select 1 from announcement_apply_routes r join get_announcement_group_ids(grp.rep) gg on gg = r.announcement_id)
),
-- ⑫ 완료 계열 매입 공고에 목록 세대 행 주소와 맞는 홍보물이 있는데 이미지 0 (스킬 불변식 12 · v3.5)
-- 그룹 ID 는 공고마다 한 번만 펼친다(홍보물 행마다 부르면 수백 번이다 — v3.4 V12 주석의 관리 API 한도).
promo_addr as (
  select distinct pa.announcement_id, regexp_replace(split_part(hu.address, '(', 1), '\s', '', 'g') as k
  from (select distinct announcement_id from announcement_promo_files) pa
  cross join lateral get_announcement_group_ids(pa.announcement_id) g(gid)
  join housing_units hu on hu.announcement_id = g.gid
  where hu.address is not null
),
promo as (
  select pf.announcement_id, count(*) as files from announcement_promo_files pf
  join promo_addr ad on ad.announcement_id = pf.announcement_id
   and ad.k = regexp_replace(split_part(coalesce(nullif(btrim(pf.dng_hs_adr), ''), pf.row_address, ''), '(', 1), '\s', '', 'g')
  group by pf.announcement_id
),
v12 as (
  select 'V12 목록 주소 홍보물 있는데 이미지 0' as check_name,
         pr.announcement_id as subject,
         'status=' || aa.status || ' · 목록 주소 홍보물 ' || pr.files || '파일 · 접수마감 ' || coalesce(a.apply_end_confirmed, a.apply_end)::text as detail
  from promo pr
  join announcement_analysis aa on aa.announcement_id = pr.announcement_id and aa.status like '완료%'
  join announcements a on a.announcement_id = pr.announcement_id
  where not exists (
    -- 그룹 ID 를 먼저 펼친 뒤 id 같음으로 찾는다 — `x.announcement_id in (select get_…(…))` 꼴은
    -- 표 전체를 돌며 함수를 부르게 돼 관리 API 한도를 넘겼다(2026-09-29 실측).
    select 1 from get_announcement_group_ids(pr.announcement_id) g(gid)
    join announcement_extras x on x.announcement_id = g.gid)
),
-- ⑬ 산물 있는 블록 ID (v3.7 신설 · v3.8 켬 · 위 머리 주석)
--    블록 ID = LH 원문 행(announcement_id = MYHOME url 의 panId)이 있는 MYHOME 행. 그 ID 에 산물이 있으면 「원문 ID 하나에 둔다」(Z) 위반.
v13_on(on_) as (
  values (true)
),
v13_keep(aid) as (   -- Z-2 ② 이전 뒤 실측(2026-10-08) — 6블록. 단지명을 정할 수 없는 블록(비세대 산물 ∧ 블록 세대 단지명 ≠ 1)
  values
  ('20652_1_서울특별시_영등포구'),
  ('20686_2_경기도_김포시'),
  ('20686_3_경기도_김포시'),
  ('20690_2_경기도_김포시'),
  ('20690_3_경기도_김포시'),
  ('21187_경상남도')
),
v13 as (
  select 'V13 산물 있는 블록 ID' as check_name,
         x.aid as subject,
         string_agg(x.tbl || ' ' || x.n, ' · ' order by x.tbl) as detail
  from (
    select announcement_id as aid, 'housing_units' as tbl, count(*) as n from housing_units group by 1
    union all select announcement_id, 'eligibility_criteria', count(*) from eligibility_criteria group by 1
    union all select announcement_id, 'announcement_policies', count(*) from announcement_policies group by 1
    union all select announcement_id, 'announcement_apply_routes', count(*) from announcement_apply_routes group by 1
    union all select announcement_id, 'announcement_extras', count(*) from announcement_extras group by 1
  ) x
  join announcements m on m.announcement_id = x.aid and m.source = 'MYHOME'
  where (select on_ from v13_on)
    and x.aid not in (select aid from v13_keep)
    and exists (select 1 from announcements l
                where l.source = 'LH' and l.announcement_id = substring(m.url from 'panId=([0-9]+)'))
  group by x.aid
)
select * from v1
union all select * from v2
union all select * from v3
union all select * from v4
union all select * from v5
union all select * from v6
union all select * from v7
union all select * from v8
union all select * from v9
union all select * from v10a
union all select * from v10c
union all select * from v12
union all select * from v13
order by 1, 2;
