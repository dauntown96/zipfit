-- 같은 게시물에 링크로 접힌 별개 공고문 표지(2026-11-11 · 우편함 「코드·운영 — ㎡당 나군 식(6공고) · … 링크로 접힌 별개 공고문 표지 …」 3 ·
--   역전파 8회차 회신 ⑦ 1 · claude.ai 판정 「규약 29 예외 인정 — 링크로 접힌 별개 공고문의 상태 행은 그 블록 ID 에 둔다」).
-- 뷰 zipfit_ops.linked_separate_notices — 읽기만. 한 줄 = MYHOME 행 하나(linked_announcement_id)가
--   ① announcement_post_links 로 같은 게시물의 LH 행에 이어져 있고 ② 둘의 접수 마감일(apply_end)이 둘 다 있고 서로 다르다.
--   = 같은 게시물(LH panId)에 링크로 접힌, 마감일이 다른 별개 공고문(영암용앙1 20829_2 · 영암학산1 20830_15 ↔ LH …20393).
--   이 꼴의 분석 상태 행(announcement_analysis)은 원문 LH ID 로 옮기지 않고 그 블록 ID 에 둔다 — 옮기면 그 카드의 「분석됨」이 사라진다
--   (8회차 되돌리기 전용 시험 — 가격 요약 analysis_done 참 → 거짓).
--   🔴 마감일이 하나라도 NULL 이면 넣지 않는다(다르다고 말할 수 없다) · 링크 규칙(rule_version)은 가리지 않는다.
-- 쓰는 곳: 불변식 v3.29 V26(블록 ID 상태 행 — 이 뷰 행은 예외) · 분석·재확인 스킬의 상태 행 자리 판정.
-- 권한: GRANT 0(zipfit_ops 스키마는 anon·authenticated 에 USAGE 없음 · 관리 API postgres 로만 읽는다).
-- 되돌리기: drop view zipfit_ops.linked_separate_notices;
create view zipfit_ops.linked_separate_notices as
select l.linked_announcement_id,
       l.lh_announcement_id,
       m.apply_end  as linked_apply_end,
       lh.apply_end as lh_apply_end,
       l.rule_version,
       l.evidence
  from public.announcement_post_links l
  join public.announcements m  on m.announcement_id  = l.linked_announcement_id and m.source <> 'LH'
  join public.announcements lh on lh.announcement_id = l.lh_announcement_id   and lh.source = 'LH'
 where m.apply_end is not null and lh.apply_end is not null
   and m.apply_end <> lh.apply_end;
comment on view zipfit_ops.linked_separate_notices is
  '같은 게시물에 링크로 접힌 별개 공고문(2026-11-11) — announcement_post_links 로 LH 행에 이어진 MYHOME 행 중 접수 마감일이 서로 다른 것(둘 다 있음). 이 행의 분석 상태 행은 블록 ID 에 둔다(규약 29 예외 · claude.ai 판정 2026-11-11). GRANT 0.';
revoke all on table zipfit_ops.linked_separate_notices from public, anon, authenticated, service_role;
