-- 자격 행 칸 this_round_open — 「이번 회차에 이 순위 행을 받는가」(2026-11-25 · 우편함 「코드·운영 — 스물셋째: 「금회 한정 순위」」 할 일 1 ·
--   백로그 3e28aaa7e15581789d1a 「금회 한정 순위를 담는 축이 없다」 · claude.ai 판정 안 ① · 검증 1 「칸 뜻은 넓히지 않는다」).
--   true  = 원문이 이번 회차에 이 순위(행 rank)를 받는다고 말한다(예 「※ 금회모집은 1순위에 한합니다」의 1순위 행)
--   false = 원문이 이번 회차에 이 순위는 받지 않는다고 말한다(같은 문장의 2순위 행 · 「2, 3순위는 접수받지 않습니다」)
--   NULL  = 원문이 말하지 않음 · 행에 rank 가 없음(기본값 · 지금 거의 모든 행).
--   🔴 순위의 지역 조건(「해당 주택건설지역 또는 연접지역 거주」)은 이 칸 밖이다 — 새 기능이라 다운님 승인 뒤 따로(검증 1 ⑤ ②).
--   🔴 조건부 한정(「선순위 초과 시 …」)은 쓰지 않는다. 화면은 아직 읽지 않는다(표시층 판에서 다운님 승인 뒤).
--   RLS·권한은 표 단위 그대로(공개 역할 SELECT 정책 · 칸 단위 GRANT 없음) — 칸 하나를 더해도 읽는 길이 같다.
--   백업: eligibility_criteria 는 재생산 불가 표(데이터 담음) — 데이터 제외 목록 영향 0 · 스키마 이름 대조에 COLUMN 추가 한 줄(통과).
-- 되돌리기: alter table public.eligibility_criteria drop column this_round_open;
alter table public.eligibility_criteria add column this_round_open boolean;
comment on column public.eligibility_criteria.this_round_open is
  '이번 회차에 이 순위(rank) 행을 받는가 — true 받음 · false 안 받음(원문 「금회 모집은 n순위에 한함」 꼴) · NULL 원문이 말하지 않음 또는 rank 없음. 순위의 지역 조건은 담지 않는다. 2026-11-25 스물셋째.';
