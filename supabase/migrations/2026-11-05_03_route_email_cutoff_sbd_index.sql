-- 경로 표 route 에 「이메일」 · lh_cutoff_scores sbd_lgo_no 색인(2026-11-05 · 우편함 「코드·운영 — 대상주택 공지 감지 설계 · 접수 경로 이메일 · 커트라인 사슬 규칙 두 곳 대조 · sbd_lgo_no 색인」 2·4장).
-- ① route CHECK 에 '이메일' 을 더한다 — 이메일로만(또는 현장과 함께) 받는 공고(제주 법환 20857_1 · 21442_1 · 파주 기관공급 …21004)가
--    경로 행을 못 갖거나 「전체」로 접혔다(백로그 「이메일로만 받는 공고는 카드에 접수 방법 줄이 없다」). 값을 더할 뿐 기존 행은 건드리지 않는다.
--    불변식은 같은 PR 의 v3.19(경로 값 목록에 '이메일'). 행 쓰기는 적용 뒤 데이터 쓰기(원문 부분 문자열 규칙 V10a).
-- ② get_announcement_cutoff_rounds 의 history 가 sbd_lgo_no in (…) 로 표를 고른다 — 색인이 없어 표 전체(약 3.3만 행)를 훑었다(#896 회신 ②).
-- 되돌리기: drop index public.lh_cutoff_scores_sbd_lgo_no; 와 CHECK 를 2026-10-12_04 의 네 값으로(이메일 행이 있으면 먼저 지운다).
-- zipfit:anon select count(*) from get_announcement_cutoff_rounds((select array_agg(announcement_id) from (select announcement_id from get_announcements_deduped(null,null,null) where apply_end >= current_date) x))
alter table public.announcement_apply_routes drop constraint announcement_apply_routes_route_check;
alter table public.announcement_apply_routes add constraint announcement_apply_routes_route_check
  check (route = any (array['인터넷·모바일'::text, '현장'::text, '전체'::text, '우편'::text, '이메일'::text]));
create index lh_cutoff_scores_sbd_lgo_no on public.lh_cutoff_scores (sbd_lgo_no);
