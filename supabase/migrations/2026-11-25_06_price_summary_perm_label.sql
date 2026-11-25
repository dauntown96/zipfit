-- 가격 요약 영구 ㎡당 갈래 셋 + 이름표 칸(2026-11-25 · 우편함 「코드·운영 — 스물여섯째」 덧 1 할 일 4 · claude.ai 판정 원칙 37 · 다운님 16:44 권장 ①).
--
-- 영구임대 ㎡당 중앙값을 셋으로 가른다(가격 있는 행 = 면적 > 0 ∧ 월세 > 0):
--   ① 「나군」 글자 행이 있으면 그 행만 — 종전 그대로 · rent_basis 'na' · 이름표 「나군」
--   ② 없고 supply_target 이 둘 이상으로 갈리며 「수급자」 갈래(「수급자 외」 아님)와 그 밖이 둘 다 있으면 그 밖 행만 · rent_basis 'perm' · 이름표 = 그 행 supply_target 원문
--   ③ 대상 글자로 안 갈리는 한 등급 → 가격 있는 전 행 · rent_basis 'perm' · 이름표 NULL
-- 더하는 칸(반환 끝에 하나 · 기존 열네 칸은 이름·순서 그대로): rent_basis_label text.
-- 'perm' 을 따로 둔 까닭: 화면(index.html 6316)이 rent_basis = 'na' 이면 늘 「(나군)」을 붙인다 — ②③에 원문에 없는 「(나군)」이 붙지 않게(화면 0 · 표시층 판 L 이 이름표 칸을 읽는다).
--   판 L 전까지 화면은 'perm' 카드를 따로 세어 표본 5곳 미만이면 그 카드의 ㎡당 줄을 그리지 않는다(지금 열린 'perm' 2).
-- 스냅숏(zipfit_ops.rent_sqm_quartiles_refresh)은 'perm' 을 영구 'na' 묶음에 넣는다(스물다섯째 회신 ⓑ 영향 표).
-- 반환 꼴이 바뀌어 create or replace 로 못 바꾼다 → drop 뒤 create · 권한(ACL 순서까지)·SECURITY DEFINER·search_path 를 그대로 되살린다(2026-11-02_03 선례).
-- 되돌리기 전용 시험(2026-11-25 17:1x KST · 관리 API · 쓰기 0): 목록 대표 1,075 — 다른 열두 칸 차이 0 · 「나군」 공고(종전 'na' 53) 값·갈래 바뀜 0(멈춤 해당 없음) ·
--   영구 아닌 공고 바뀜 0 · 'perm' 6(SH_313610 2,828 「일반 등」 · …21109 3,964 「수급자 외」 · 한 등급 넷) · 열린 카드 ㎡당 값 96 → 98 ·
--   한 등급 닫힌 9: …20233 4,105 · …20246 4,746 · …20247 5,288 · …20249 4,676 · …20300 3,586 · …20308 3,627 · …20335 4,572 · …20801 3,627 · …20822 2,890(이름표 NULL) ·
--   스냅숏(옛 정의로 같은 순간 다시 채운 것과 견줌) 88 → 89행 — 영구 na 전국 53 → 59 · 서울 새 묶음 n 2 · 강원 7 → 8 · 경남 6 → 7 · 전북 10 → 12 · 다른 묶음 0 ·
--   anon(3초 한도) 한 번 부름 목록 대표 전부 1,347 · 1,349 ms(옛 1,288 · 1,284 — 목록 RPC 포함).
-- 되돌리기: 옛 정의는 git show <이 PR 앞 커밋>:supabase/rpc/get_announcement_price_summary.sql — drop 뒤 그 정의 + 같은 grant 넷 · 스냅숏 함수는 그 커밋 판으로 create or replace.
-- zipfit:function get_announcement_price_summary(text[]) acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=true
-- zipfit:function zipfit_ops.rent_sqm_quartiles_refresh() acl={postgres=X/postgres} secdef=false
-- zipfit:anon select count(*) from get_announcement_price_summary((select array_agg(announcement_id) from (select announcement_id from get_announcements_deduped(null,null,null) limit 50) x))

drop function public.get_announcement_price_summary(text[]);

CREATE OR REPLACE FUNCTION public.get_announcement_price_summary(p_ids text[])
 RETURNS TABLE(announcement_id text, deposit_min bigint, deposit_max bigint, rent_min bigint, rent_max bigint, area_min numeric, area_max numeric, round_state text, source_round date, analysis_done boolean, has_attachments boolean, unit_places jsonb, rent_per_sqm_med bigint, rent_basis text, rent_basis_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 가볍게 …」 1) — announcements 행의 묶음 키는 title_dedup_key(저장 생성 칸 = announcement_dedup_key(title))를 읽는다(행마다 함수 호출 없음 · 결과 같음).
  -- 🔴 2026-09-29 코드 회차 2 — SECURITY DEFINER 로 바꿨다. analysis_done 이 announcement_analysis 를 읽는데
  --   그 표는 anon·authenticated 에 SELECT 가 없다(RLS 켜짐 · 정책 0 · 권한 service_role 만). INVOKER 그대로 두면
  --   anon 호출이 permission denied 로 죽는다(2026-09-29 적용 직후 실측 → 즉시 되돌렸다).
  --   그 표를 anon 에 열지 않는다(pending_fields 등 내부 기록). 이 함수가 내보내는 것은 공고마다 참/거짓 하나뿐이고,
  --   나머지 재료(announcements · housing_units)는 SELECT 정책이 이미 `to anon, authenticated : true`라 새로 드러나는 것이 없다
  --   (get_announcement_group_ids 와 같은 판단). search_path 는 정의자 함수라 고정한다.
  -- 🔴 그룹을 get_announcement_group_ids()로 id마다 부르지 않는다(집합으로 한 번에 편다).
  -- 그 함수는 호출마다 announcements를 두 번 훑고 announcement_dedup_key()를 전 행에 건다.
  -- 목록 1회분(840건)을 그렇게 부르면 17.3초였다(2026-09-14 EXPLAIN ANALYZE 실측).
  -- 판정 규칙은 그 함수와 글자 그대로 같다 — dedup_key 일치 · title not null · hidden 아님.
  --
  -- 🔴 round_state·source_round 는 2026-09-16에 **더한** 것이다.
  -- 값(보증금·월세·면적) 계산은 한 글자도 바꾸지 않았다 — 어느 회차에서 온 값인지를
  -- 화면이 말할 수 있게 **이름표만** 붙인다.
  --
  -- 🔴 2026-09-17 개정 — 회차 축을 announcement_date 에서 **회차 날짜**로 옮겼다.
  --   한 행의 회차 날짜 = is_revised 이고 first_announcement_date 가 있으면 그것, 아니면 announcement_date.
  --   LH 목록의 PAN_DT(first_announcement_date)가 정정공고에서도 원공고일을 유지하므로,
  --   같은 회차의 정정끼리는 **하나로 모이고** 회차끼리는 갈린다(2026-09-17 tp=06 300행 실측).
  -- 🔴 그래서 `any_revised and date_kinds >= 2 -> 'unknown'` 선판정을 걷었다. 그것은 「정정이 섞이면
  --   날짜로 회차를 가릴 수 없다」는 사실 때문에 있던 것인데, 회차 날짜로는 가려진다.
  --   실측: 세대정보 있는 활성 그룹에서 'unknown' 15건이 전부 current/past 로 갈렸고
  --   기존 current·past 는 한 건도 뒤집히지 않았다.
  -- ⚠️ 'unknown' 은 **대표행의 회차 날짜 자체가 null 일 때만** 남는다(그때는 비교할 축이 없다).
  -- 🔴 이 규칙은 화면 zfNoticeDate() 와 같은 관문이다. 언어가 달라 코드를 공유할 수 없으므로
  --   **두 판정을 전 그룹으로 대조하는 것**이 이 사본의 검증 방법이다(회차마다 다시 돌린다).
  -- 🔴 2026-09-30(코드 — 같은 게시물은 LH 카드 한 장) — 그룹 키 = 링크 표에 있는 MYHOME 행이면 LH 행의 제목 키
  --   (get_announcement_group_ids 와 같은 규칙). LH 카드 요약에 붙은 공고문의 세대 행이 함께 든다.
  -- 🔵 2026-10-28(우편함 「코드·운영 — 런칭 뒤 첫 주 DB 쪽 묶음」 4 · 백로그 「가격 요약 RPC … 익명 … 배열 길이 상한이 없다」 · G8 발견 4) — 배열 상한 2000.
  --   익명이 부를 수 있는 정의자 함수라 배열 길이에 비례해 CPU 를 쓴다(2026-10-28 anon 실측: 가짜 id 2000 → 0.4초 · 10000 → 1.9초 · 화면 실제 977 → 0.3초).
  --   2000 = 지금 화면이 한 번에 넘기는 최대(목록 대표 전부 · 977)의 약 두 배 — 화면을 고치지 않고 걸 수 있는 값이다. 넘으면 오류(22P02 · 메시지에 「2000개 초과」)로
  --   거절한다 — 잘라서 일부만 돌려주면 화면이 나머지를 「세대정보 없음」으로 읽는다(zfEnsurePriceSummaries). 목록이 2000 에 다가가면 화면 나눠 부르기와 함께 다시 본다.
  --   🔴 SQL 함수라 raise 가 없다 — guard 의 cast 가 넘을 때만 실패한다. 두 가지를 지킨다(2026-10-28 단독 SQL 시험):
  --     ① cast 문자열에 배열 길이를 섞는다 — 상수 문자열이면 계획 단계에서 접혀(constant folding) 넘지 않아도 늘 실패했다.
  --     ② ids 가 guard.over 를 조건에서 읽는다 — 안 읽으면 그 칸 계산이 빠져 넘어도 통과했다(977 · 2000 통과 · 2001 오류 · 0 통과 실측).
  --   (plpgsql 로 바꾸면 계획이 달라진다 — 종전 SQL 함수 그대로 둔다.)
  with guard as (
    select case when coalesce(cardinality(p_ids), 0) > 2000
                then cast('p_ids ' || cardinality(p_ids) || '개 — 2000개 초과 · 나눠 부른다' as integer) end as over
  ),
  ids as (
    select distinct x as aid from unnest(p_ids) x, guard where x is not null and guard.over is null
  ),
  link_map as materialized (
    select distinct on (l.linked_announcement_id)
      l.linked_announcement_id as aid, lh.title_dedup_key as lh_key
    from public.announcement_post_links l
    join public.announcements lh on lh.announcement_id = l.lh_announcement_id
    where lh.title is not null and lh.hidden_from_listing is not true
    order by l.linked_announcement_id, l.lh_announcement_id
  ),
  -- 목록에 실릴 수 있는 전 공고의 dedup_key를 한 번만 만든다
  keyed as materialized (
    select a.announcement_id as gid,
           coalesce(lm.lh_key, a.title_dedup_key) as dedup_key,
           (lm.aid is not null) as linked_in,
           case when coalesce(a.is_revised, false) and a.first_announcement_date is not null
                then a.first_announcement_date
                else a.announcement_date
           end as round_date,
           coalesce(a.is_revised, false) as is_revised,
           -- 🔵 2026-09-29 코드 회차 2 — 아래 flags 의 재료. 값 계산(보증금·월세·면적·회차)은 이 칸들을 읽지 않는다.
           a.apply_end,
           (jsonb_typeof(a.attachment_urls) = 'array' and jsonb_array_length(a.attachment_urls) > 0) as has_att,
           exists (select 1 from public.announcement_analysis aa
                   where aa.announcement_id = a.announcement_id
                     and aa.status in ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')) as done
    from public.announcements a
    left join link_map lm on lm.aid = a.announcement_id
    where a.title is not null
      and a.hidden_from_listing is not true
  ),
  -- 🔴 대상 행에는 hidden 필터를 걸지 않는다 — get_announcement_group_ids의 target CTE와 같다
  target as (
    select distinct i.aid, coalesce(lm.lh_key, a.title_dedup_key) as dedup_key, a.apply_end
    from ids i
    join public.announcements a on a.announcement_id = i.aid
    left join link_map lm on lm.aid = a.announcement_id
  ),
  meta as (
    select t.aid, k.gid, k.round_date, k.is_revised
    from target t
    join keyed k on k.dedup_key = t.dedup_key
  ),
  own as (
    select m.aid,
           max(m.round_date) filter (where m.gid = m.aid) as own_date,
           count(distinct m.round_date)                   as date_kinds
    from meta m
    group by m.aid
  ),
  -- ① 이번 회차 후보 — roundInfoFor()의 판정과 같다
  -- 🔵 round_date 를 함께 들고 간다(source_round 재료). gid 가 날짜를 결정하므로
  --    UNION 의 행 집합은 달라지지 않는다.
  -- ⚠️ own_date 가 null 이면 `m.round_date = o.own_date` 가 전부 null(거짓)이라 이 CTE 가 비고,
  --    cur_has 도 비어 아래 ③ 이 그룹 전체를 되돌린다 — 그 상태를 'unknown' 이라 부른다.
  cur as (
    select m.aid, m.gid, m.round_date as gdate
    from meta m
    join own o on o.aid = m.aid
    where o.date_kinds < 2
       or m.round_date = o.own_date
  ),
  -- ② 이번 회차에 실제 세대정보가 있는 공고만 추린다
  cur_has as (
    select distinct c.aid
    from cur c
    join public.housing_units h on h.announcement_id = c.gid
  ),
  -- ③ 이번 회차가 비면 그룹 전체로 되돌린다(loadHousingUnits의 거동과 같다)
  pick as (
    select c.aid, c.gid, c.gdate from cur c where c.aid in (select aid from cur_has)
    union
    select m.aid, m.gid, m.round_date from meta m where m.aid not in (select aid from cur_has)
  ),
  -- 🔵 2026-09-29 코드 회차 2 — 카드 상태 두 칸. 그룹은 위 meta 와 같은 축(dedup_key · title not null · hidden 아님).
  --   analysis_done   = 카드(대표)와 **같은 apply_end** 구성원에 완료 계열 분석이 있는가 — get_reanalysis_queue 의
  --                     「같은 회차 완료분 제외」·⑨ 5장 분석률 분자와 같은 축. 카드 apply_end 가 NULL 이면 거짓.
  --   has_attachments = 그룹 구성원 누구든 attachment_urls 에 파일이 하나라도 있는가.
  flags as (
    select t.aid,
           -- 🔵 2026-09-30 — 같은 게시물로 붙은 공고문(linked_in)은 마감일이 달라도 이 카드의 회차다.
           coalesce(bool_or(k.done and (k.apply_end = t.apply_end or k.linked_in)), false) as analysis_done,
           coalesce(bool_or(k.has_att), false)                            as has_attachments
    from target t
    join keyed k on k.dedup_key = t.dedup_key
    group by t.aid
  ),
  -- 🔵 2026-09-30 코드 회차(카드 첫 줄) — 카드 표지 지역의 재료. **이번 회차에 세대정보가 있는 카드만**
  --   (cur_has) 그 세대 행의 (시도, 시군구)를 세대 수와 함께 돌려준다 — [[「시도 시군구」, 세대 수], …] 세대 수 내림차순.
  --   지난 회차로 되돌아간 카드(round_state past·unknown)는 NULL 이다 — 표지는 이번 공고가 어디인지를 말한다.
  --   값 계산(보증금·월세·면적·회차·flags)은 이 CTE 를 읽지 않는다. 시도 옛 이름(광주광역시 등)은 화면이 맞춘다.
  --   🔴 시군구는 수집(announcements.sigungu_nm)에 실재하는 이름만 받는다(같거나 「이름 + 공백」으로 시작) — 옛 분석분
  --      세대 행에 「경기수원시」·「매입다가구(대구수성구)」 같은 값이 있다(2026-09-30 실측 23쌍 중 시도 옛 이름 아닌 것 전부).
  --   🔵 2026-11-04(우편함 「코드·운영 — 가격 요약 RPC known_sg …」 1) — 「○○시 △△구」(마디 둘 · 뒤가 구 하나) 꼴은 앞 「○○시」가 수집 이름에
  --      실재하면(같거나 「○○시 」로 시작) 받는다 — 새 구(화성시 병점구 등)·공고 행에 없는 구(고양시 일산동구 등)가 원문 주소대로 보이게.
  --      옛 쓰레기 값(「경기수원시」·「매입다가구(…)」·「양산」)은 이 꼴도 아니고 앞 마디도 수집 이름에 없어 종전대로 버린다(2026-11-04 전수 17값 중 새로 받는 것 「화성시 병점구」 하나).
  known_sg as materialized (
    select distinct btrim(sigungu_nm) as sg
    from public.announcements
    where nullif(btrim(sigungu_nm), '') is not null and btrim(sigungu_nm) <> '외'
  ),
  places as (
    select p.aid, btrim(h.sido_nm) as sd, btrim(h.sigungu_nm) as sg, count(*) as n
    from pick p
    join cur_has ch on ch.aid = p.aid
    join public.housing_units h on h.announcement_id = p.gid
    where nullif(btrim(h.sido_nm), '') is not null
      and nullif(btrim(h.sigungu_nm), '') is not null
    group by 1, 2, 3
  ),
  places_agg as (
    select pl.aid, jsonb_agg(jsonb_build_array(pl.sd || ' ' || pl.sg, pl.n) order by pl.n desc, pl.sd || ' ' || pl.sg) as unit_places
    from places pl
    where exists (select 1 from known_sg k where k.sg = pl.sg or k.sg like pl.sg || ' %')
       or exists (select 1 from known_sg k
                   where k.sg = substring(pl.sg from '^(\S+시) \S+구$') or k.sg like substring(pl.sg from '^(\S+시) \S+구$') || ' %')
    group by pl.aid
  ),
  -- 🔵 2026-11-02(우편함 「표시층 — ㎡당 월세 중앙값 …」 A) — rent_per_sqm_med = 위 가격 범위와 같은 pick 행의 monthly_rent / area_sqm 중앙값(원 · 반올림).
  --    주 조건 월세만(rent_priority1 은 섞지 않는다) · 월세 0(전세형)·면적 없음은 뺀다 · 영구임대는 「나군」 표기 행만(가군은 몇 값에 모여 위치가 뜻이 없다).
  --    rent_basis = 'primary'(주 조건) · 'na'(영구임대 나군) · 셀 행이 없으면 둘 다 null.
  --    🔵 2026-11-11 — 「나」군 · 「나 군」 꼴도 나군으로 읽는다(「나」와 「군」 사이 공백·낫표·따옴표 2자까지 — 화면 zfGroupTag 의 NA 와 같은 식).
  perm as (
    select t.aid,
           coalesce(mp.std_type, a.housing_type) = '영구임대' as is_perm
    from (select distinct aid from target) t
    join public.announcements a on a.announcement_id = t.aid
    left join public.housing_type_map mp
      on mp.source_table = 'announcements' and mp.source = a.source and mp.housing_type = a.housing_type
  ),
  -- 🔵 2026-11-25(우편함 「코드·운영 — 스물여섯째」 덧 1 할 일 4 · claude.ai 판정 원칙 37 「값은 셈 · 「나군」 이름은 원문 글자가 있을 때만」 · 다운님 16:44 권장 ①) —
  --    영구임대 ㎡당 갈래를 셋으로(차례대로 · 가격 있는 행 = 면적 > 0 ∧ 월세 > 0):
  --      ① 'na'     — 「나군」 글자 행이 있으면 그 행만(종전 그대로) · 이름표 「나군」
  --      ② 'target' — 없고, supply_target 이 둘 이상으로 갈리며 「수급자」 갈래(「수급자」 든 · 「수급자 외」 아님)와 그 밖 갈래가 둘 다 있으면 그 밖 갈래 행만
  --                   · 이름표 = 그 행 supply_target 원문 글자(여럿이면 「 · 」로 · 예 「일반 등」 · 「수급자 외」)
  --      ③ 'all'    — 대상 글자로 안 갈리는 한 등급 공고 → 가격 있는 전 행 · 이름표 NULL
  --    rent_basis 는 ① 'na' · ②③ 'perm'(새 값 — 화면이 'na'에만 「(나군)」을 붙이므로 ②③에 원문에 없는 「(나군)」이 붙지 않게 · 표시층 판 L 이 rent_basis_label 을 읽을 때까지
  --    화면 비교 키는 'perm' 을 따로 세어 표본 5곳 미만이면 ㎡당 줄을 그리지 않는다) · 스냅숏(rent_sqm_quartiles_refresh)은 'perm' 을 'na' 묶음에 넣는다.
  --    영구 아닌 공고는 종전 그대로('primary' · 이름표 NULL).
  pmode as (
    select p.aid,
           case
             when not coalesce(pm.is_perm, false) then 'primary'
             when count(*) filter (where h.area_sqm > 0 and h.monthly_rent > 0
                                     and concat_ws(' ', h.unit_group, h.supply_target, h.unit_type) ~ '나[\s「」『』''"]{0,2}군') > 0 then 'na'
             when count(distinct nullif(btrim(h.supply_target), '')) filter (where h.area_sqm > 0 and h.monthly_rent > 0) >= 2
              and bool_or(coalesce(h.supply_target, '') ~ '수급자' and coalesce(h.supply_target, '') !~ '수급자\s*외') filter (where h.area_sqm > 0 and h.monthly_rent > 0)
              and bool_or(not (coalesce(h.supply_target, '') ~ '수급자' and coalesce(h.supply_target, '') !~ '수급자\s*외')) filter (where h.area_sqm > 0 and h.monthly_rent > 0)
               then 'target'
             else 'all'
           end as mode,
           string_agg(distinct nullif(btrim(h.supply_target), ''), ' · ')
             filter (where h.area_sqm > 0 and h.monthly_rent > 0
                       and not (coalesce(h.supply_target, '') ~ '수급자' and coalesce(h.supply_target, '') !~ '수급자\s*외')) as target_label
    from pick p
    join public.housing_units h on h.announcement_id = p.gid
    left join perm pm on pm.aid = p.aid
    group by p.aid, pm.is_perm
  ),
  agg as (
  select p.aid,
         -- 🔵 2026-09-29 코드 회차 — 세대 하나에 임대조건 두 벌(deposit/monthly_rent + deposit_priority1/rent_priority1)이면
         --    둘째 벌도 min~max에 넣는다. least/greatest는 NULL을 건너뛰므로 한 벌만 있는 행(supply_target 두 행 포함)은 값이 그대로다.
         min(least(h.deposit, h.deposit_priority1))::bigint as deposit_min, max(greatest(h.deposit, h.deposit_priority1))::bigint as deposit_max,
         min(least(h.monthly_rent, h.rent_priority1))::bigint as rent_min, max(greatest(h.monthly_rent, h.rent_priority1))::bigint as rent_max,
         min(h.area_sqm) as area_min, max(h.area_sqm) as area_max,
         -- 🔴 'unknown' 은 이제 **대표행의 회차 날짜가 없을 때 하나뿐**이다(2026-09-17).
         --    종전의 `any_revised and date_kinds >= 2` 는 「정정이 섞이면 날짜로 못 가린다」였는데,
         --    회차 날짜로는 같은 회차의 정정끼리 하나로 모여 가려진다.
         case
           when o.own_date is null  then 'unknown'
           when ch.aid is not null  then 'current'
           else                          'past'
         end as round_state,
         -- 🔵 'past' 일 때만 값이 온 회차를 적는다. 여기 살아남은 p 행은 세대정보가 실제로 붙은
         --    gid 뿐이라(아래 join), 그 최댓값이 곧 「값을 가져온 회차」다.
         case
           when o.own_date is null or ch.aid is not null then null
           else max(p.gdate)
         end as source_round,
         round(percentile_cont(0.5) within group (order by h.monthly_rent::numeric / h.area_sqm)
               filter (where h.area_sqm > 0 and h.monthly_rent > 0
                         and (md.mode in ('primary', 'all')
                              or (md.mode = 'na' and concat_ws(' ', h.unit_group, h.supply_target, h.unit_type) ~ '나[\s「」『』''"]{0,2}군')
                              or (md.mode = 'target' and not (coalesce(h.supply_target, '') ~ '수급자' and coalesce(h.supply_target, '') !~ '수급자\s*외')))))::bigint as rent_per_sqm_med,
         case
           when count(*) filter (where h.area_sqm > 0 and h.monthly_rent > 0
                                   and (md.mode in ('primary', 'all')
                                        or (md.mode = 'na' and concat_ws(' ', h.unit_group, h.supply_target, h.unit_type) ~ '나[\s「」『』''"]{0,2}군')
                                        or (md.mode = 'target' and not (coalesce(h.supply_target, '') ~ '수급자' and coalesce(h.supply_target, '') !~ '수급자\s*외')))) = 0 then null
           when md.mode = 'primary' then 'primary'
           when md.mode = 'na' then 'na'
           else 'perm'
         end as rent_basis,
         case
           when count(*) filter (where h.area_sqm > 0 and h.monthly_rent > 0) = 0 then null
           when md.mode = 'na' then '나군'
           when md.mode = 'target' then max(md.target_label)
           else null
         end as rent_basis_label
  from pick p
  join public.housing_units h on h.announcement_id = p.gid
  join own o on o.aid = p.aid
  left join cur_has ch on ch.aid = p.aid
  left join pmode md on md.aid = p.aid
  group by p.aid, o.own_date, ch.aid, md.mode
  )
  -- 🔴 2026-09-29 코드 회차 2 — 세대정보가 없는 카드도 한 행을 돌려준다(값 칸은 전부 NULL · round_state NULL).
  --   그래야 analysis_done·has_attachments 가 그 카드에 닿는다. 세대정보가 있는 카드의 값 칸은 종전과 한 글자도 같다.
  --   화면은 값 칸이 전부 NULL 인 행을 종전의 「응답에 없음」과 같게 읽는다(zfSummaryLine 이 빈 문자열).
  select t.aid,
         g.deposit_min, g.deposit_max, g.rent_min, g.rent_max, g.area_min, g.area_max,
         g.round_state, g.source_round,
         coalesce(f.analysis_done, false), coalesce(f.has_attachments, false),
         pa.unit_places,
         g.rent_per_sqm_med, g.rent_basis, g.rent_basis_label
  from (select distinct aid from target) t
  left join agg g   on g.aid = t.aid
  left join flags f on f.aid = t.aid
  left join places_agg pa on pa.aid = t.aid;
$function$;

revoke all on function public.get_announcement_price_summary(text[]) from public, anon, authenticated;
grant execute on function public.get_announcement_price_summary(text[]) to service_role;
grant execute on function public.get_announcement_price_summary(text[]) to anon;
grant execute on function public.get_announcement_price_summary(text[]) to authenticated;

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
           case when s.rent_basis = 'perm' then 'na' else s.rent_basis end as basis,   -- 🔵 2026-11-25(스물여섯째 덧 1) — 영구 ②③('perm' — 나군 글자 없는 영구)도 영구 na 묶음에
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
$function$;
