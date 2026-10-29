-- 회차 링크 후보 — 단지명 토큰 조인 판(읽기만 · 2026-10-29 · 우편함 「코드·운영(브랜치만 · 병합 0) — 회차 링크 표 B′」 3).
-- 쓰는 곳: 분석·국면 C 회차가 🔎 ① 「지난 회차(같은 단지) 대비」를 찾을 때 — 후보를 보고 두 회차 원문(공고문 · LH 공고 페이지)으로
--   같은 단지임을 확인한 쌍만 announcement_round_links 에 한 줄 넣는다(앞 회차 = 공고일 이른 쪽). 🔴 이 결과를 그대로 넣지 않는다 — 후보일 뿐이다.
-- 규칙(조사 「다른 키 회차 잇기」 C 조인 판 · claude.ai 2026-10-29 B′ 채택 「후보 생성 SQL 로만」):
--   카드 = get_announcements_deduped() · 열린 카드(apply_end ≥ 오늘 KST) ↔ 닫힌 카드(apply_end < 오늘) · 같은 housing_type ∧ 같은 sido_nm ·
--   제목 토큰(앞 [ … ] 머리 뗀 뒤 한글·영숫자·- 덩어리)이 하나라도 같다. 토큰에서 빼는 것: 숫자·- 만 · 한글 두 글자 이하 ·
--   시도·시군구·region 이름(끝 시·군·구·도 뗀 꼴 포함) · 「…시/군/구」 꼴 다섯 글자 이하 · 일반어(모집·공고·입주자·임대·주택·자격·완화·정정·예비 포함) ·
--   카드 넷 이상에 나오는 토큰(흔한 말). 이미 링크된 쌍은 뺀다.
--   🔵 2026-10-29 덧(분석 묶음 「회차 쌍 넷 더 원문 확인」 ② 제안 · claude.ai 채택) — 두 제목에 구·시·군 이름(「…시/군/구」 꼴 다섯 글자 이하 토큰)이
--   둘 다 있고 겹치는 것이 하나도 없으면 뺀다: SH 「도전숙」은 사업 이름이라 노원구·구로구 ↔ 성북구가 토큰 「도전숙」 하나로 잡혔다(다른 단지 — 원문 확인).
-- 잰 값(정답 = 조사 회신 정답 14쌍 · 열린↔닫힌 카드 대표 id):
--   조사 회신의 조인 판(파이썬 · 그 세션 scratchpad — 저장소에 없음)       : 정답 14쌍 중 10 · 거짓 양성 3(거창 다자녀↔거창 일반 · 화성동탄↔화성시 행복 둘)
--   이 SQL(2026-10-29 14:1x KST · 카드 985 · 위 규칙 — 조사 규칙 + 시군구꼴·일반어·흔한 토큰 빼기 셋) : 정답 14쌍 중 12 · 정답 밖 5(판단 필요 — 회신 표)
--     못 잇는 2: …20903 홍성군 영구 ↔ …19505(제목에 단지 토큰 없음 「홍성군 영구임대 예비자 모집공고」) · …20918 군산 든든전세 ↔ …20038(지역·유형 말뿐)
--   → 못 잇는 꼴(제목에 단지 이름이 없음)은 원문 단지 표로 찾는다 — 이 SQL 의 몫 밖.
-- 덧 뒤(2026-10-29 15:2x KST · 같은 카드 묶음): 정답 14쌍 중 12 · 정답 밖 3(…19241↔…20824 전주평화1 — 일부만 겹침 · …20905↔…20054 담양삼만 — 같은 단지 ·
--   …20963↔…20475 포항블루밸리 — 같은 단지 · 앞 둘은 원문 확인 끝(분석 묶음 두 회차)) — 도전숙 둘(다른 단지)이 빠졌다.
-- 비용: 목록 RPC 1회 + 토큰 조인 · 한 번 돌림(분석 회차 착수 때) — 화면·점검이 부르지 않는다.
with d as materialized (
  select announcement_id, title, housing_type, sido_nm, sigungu_nm, region, apply_end from public.get_announcements_deduped()
),
reg as materialized (
  select distinct x from d
    cross join lateral (values (d.sido_nm), (d.sigungu_nm)) v(y)
    cross join lateral (values (trim(v.y)), (regexp_replace(trim(v.y), '(특별자치도|특별자치시|광역시|특별시|도|시|군|구)$', ''))) w(x)
   where coalesce(trim(v.y), '') <> ''
  union
  select distinct x from d
    cross join lateral regexp_matches(coalesce(d.region, ''), '[가-힣]+', 'g') m(a)
    cross join lateral (values (m.a[1]), (regexp_replace(m.a[1], '(시|군|구|도)$', ''))) w(x)
),
tk as (
  select distinct d.announcement_id, m.w[1] tok
    from d cross join lateral regexp_matches(regexp_replace(coalesce(d.title, ''), '^(\[[^]]*\])+', ''), '[가-힣A-Za-z0-9-]+', 'g') m(w)
),
tk2 as materialized (
  select tk.* from tk
   where tk.tok !~ '^[0-9-]+$' and tk.tok !~ '^[가-힣]{1,2}$'
     and tk.tok not in (select x from reg) and regexp_replace(tk.tok, '(시|군|구)$', '') not in (select x from reg)
     and tk.tok !~ '^[가-힣]{1,4}(시|군|구)$'
     and tk.tok !~ '모집|공고|입주자|임대|주택|자격|완화|정정|예비'
),
t as (select tk2.* from tk2 where tk2.tok in (select tok from tk2 group by tok having count(*) <= 3)),
rg as (select tk.announcement_id, array_agg(distinct tk.tok) as toks from tk where tk.tok ~ '^[가-힣]{1,4}(시|군|구)$' group by tk.announcement_id)
select o.announcement_id as open_id, c.announcement_id as closed_id, string_agg(distinct t1.tok, ' · ') as tokens,
       o.apply_end as open_end, c.apply_end as closed_end, o.title as open_title, c.title as closed_title
  from d o
  join t t1 on t1.announcement_id = o.announcement_id
  join t t2 on t2.tok = t1.tok and t2.announcement_id <> t1.announcement_id
  join d c on c.announcement_id = t2.announcement_id
  left join rg ro on ro.announcement_id = o.announcement_id
  left join rg rc on rc.announcement_id = c.announcement_id
 where not (ro.toks is not null and rc.toks is not null and not (ro.toks && rc.toks))
   and o.apply_end >= (now() at time zone 'Asia/Seoul')::date
   and c.apply_end <  (now() at time zone 'Asia/Seoul')::date
   and o.housing_type is not distinct from c.housing_type and o.sido_nm is not distinct from c.sido_nm
   and not exists (select 1 from public.announcement_round_links l
                    where least(l.earlier_announcement_id, l.later_announcement_id) = least(o.announcement_id, c.announcement_id)
                      and greatest(l.earlier_announcement_id, l.later_announcement_id) = greatest(o.announcement_id, c.announcement_id))
 group by o.announcement_id, c.announcement_id, o.apply_end, c.apply_end, o.title, c.title
 order by o.announcement_id, c.announcement_id;
