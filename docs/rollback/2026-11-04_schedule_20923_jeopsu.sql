-- 되돌림 — 2026-11-04 운영 「열린 공고 3건 일정 표에 「접수」 행이 없어 카드에 마감 시각이 안 뜬다」 A(15:01 KST 쓰기)
-- 실행하지 않는다 — 되돌릴 때만(관리 API 데이터 쓰기 · CLAUDE.md 환경 메모). 쓴 것: …20923 접수 행 1(id 1646 · 정책 행 d9870256 p.5 「신청접수」)
--   + 같은 공고 일정 행 다섯(id 972~976)의 sort_order 만 +1(내용 칸 0 변경).
delete from public.announcement_schedule where id = 1646 and announcement_id = '2015122300020923' and stage = '접수';
update public.announcement_schedule set sort_order = sort_order - 1 where announcement_id = '2015122300020923' and id in (972, 973, 974, 975, 976);
