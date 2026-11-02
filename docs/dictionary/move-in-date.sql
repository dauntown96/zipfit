-- 📚 꼭집 주거 사전 — 단지 입주 시기: 카드 「단지 입주예정월 (LH 공급정보)」 ↔ 공고문 「최초입주 · 입주 개시」 · 공통 · 열린 카드
-- 재계산 SQL(관리 API에서 그대로 실행 · 읽기만). 2026-11-02 신설(우편함 「코드·운영 — 점검 빈틈 묶음 …」 B) — 10-20 조사(우편함 「조사 — 카드 『단지 입주예정월 (LH 공급정보)』는 무엇인가」)는
--   LH 공고 페이지 38장을 받아 같은 단지끼리 손으로 맞췄고 SQL 본문을 남기지 않았다(📚 행 내부 메모 「재계산 불가」의 까닭) → 그 판정 축을 정책 행 정규식으로 옮긴 근사다.
-- 범위: get_announcements_deduped() 중 status ∈ {공고중, 접수중} ∧ move_in_date 있음(= 10-20 모수 정의) · 카드 값 = move_in_date(수집 sbds[0].MVIN_XPC_YM — LH 공급정보 첫 단지).
-- 공고문 값: 그 카드의 공고 묶음(get_announcement_group_ids — 정정본 산물이 원공고 id 에 있는 경우를 잡는다) 정책 행 content_raw 에서
--   (ㄱ) 「최초입주 [:(지정기간)] ’YY.MM / YYYY.MM / YYYY년 MM월」 (ㄴ) 「YYYY.MM월(…)에 입주 개시 / 입주를 시작」 꼴의 연월(두 자리 연도는 50 이상 = 19xx).
-- 갈래: 공고문 연월 중 하나라도 카드 연월과 같음 = 일치 · 연월은 있으나 같은 것 없음 = 다름 · 없음 = 공고문에 없음(정책 행에 없음 — 원문 표 칸에만 있을 수 있다).
-- 🔴 근사의 한계(10-20 손 대조와 다른 점): ① 같은 단지끼리가 아니라 「묶음 안 아무 단지」와 맞춘다 — 다단지 공고에서 다른 단지 연월이 카드 연월과 우연히 같으면 일치로 센다
--   ② 「사용승인일」만 적은 공고(…20453 꼴)는 공고문에 없음으로 떨어진다(10-20 은 사용승인 연월 = LH 값을 「공고문에 없음」으로 둔 것과 같다) ③ 표 꼴 「최초입주」 열이 정책 행에서 줄바꿈으로 갈리면 놓친다.
-- 확인 2026-11-02 14:5x KST · 실행 2초 상한 안(statement_timeout 2s 통과) · 결과:
-- {"cards": 35, "with_doc": 25, "match": 14, "differ": 11, "no_doc": 10} — 10-20 손 대조(38장 · 공고문 값 27 · 일치 17 · 다름 10)와 모수가 다르다(그 뒤 열린 카드가 바뀜 · …20977~…20981 영구임대 다섯이 새로 들어와 다름에 셈).
with c as (select d.announcement_id, d.move_in_date mv,
             regexp_replace(substring(d.move_in_date from '([0-9]{4})'), '\s', '') || '-' ||
             lpad(substring(d.move_in_date from '[0-9]{4}\D+([0-9]{1,2})'), 2, '0') ym
             from get_announcements_deduped() d
            where d.status in ('공고중', '접수중') and d.move_in_date is not null),
p as (select c.announcement_id, m
        from c cross join lateral get_announcement_group_ids(c.announcement_id) g
        join announcement_policies x on x.announcement_id = g.announcement_id
        cross join lateral regexp_matches(x.content_raw,
          '(?:최초\s*입주[^0-9’‘''\n]{0,12}[’‘'']?([0-9]{2}|[0-9]{4})\s*[.년]\s*([0-9]{1,2})|([0-9]{4}|[’‘''][0-9]{2})\s*[.년]\s*([0-9]{1,2})\s*월?[^.\n]{0,20}?입주\s*(?:개시|를\s*시작))', 'g') m),
y as (select announcement_id,
             (case when length(yy) = 2 then (case when yy::int >= 50 then '19' else '20' end) || yy else yy end) || '-' || lpad(mm, 2, '0') ym
        from (select announcement_id, regexp_replace(coalesce(m[1], m[3]), '[’‘'']', '', 'g') yy, coalesce(m[2], m[4]) mm from p) q
       where mm ~ '^[0-9]{1,2}$' and mm::int between 1 and 12),
k as (select c.announcement_id, c.mv, c.ym,
             case when not exists (select 1 from y where y.announcement_id = c.announcement_id) then '공고문에 없음'
                  when exists (select 1 from y where y.announcement_id = c.announcement_id and y.ym = c.ym) then '일치'
                  else '다름' end cat,
             (select string_agg(distinct y.ym, ' · ') from y where y.announcement_id = c.announcement_id) doc
        from c)
select json_build_object(
  'cards', (select count(*) from k),
  'with_doc', (select count(*) from k where cat <> '공고문에 없음'),
  'match', (select count(*) from k where cat = '일치'),
  'differ', (select count(*) from k where cat = '다름'),
  'no_doc', (select count(*) from k where cat = '공고문에 없음'),
  'differ_ex', (select json_agg(json_build_object('id', announcement_id, 'card', mv, 'doc', doc) order by announcement_id) from k where cat = '다름')) j;
