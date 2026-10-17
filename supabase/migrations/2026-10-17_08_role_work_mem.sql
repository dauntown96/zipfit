-- 목록 RPC 가볍게 2(2026-10-17 · 우편함 「코드·운영 — 목록 RPC 가볍게 …」 · 안 나②) — 역할 단위 work_mem 4 MB(anon · authenticated).
--   직전 회신 실측: 목록 함수는 work_mem 2,184 kB 에서 호출마다 temp 쓰기 875 · 읽기 7,463블록(넘친 CTE 를 다시 읽음) · 4 MB 부터 0.
--   🔴 함수 SET 절이 아니다(PR #507 → #508 — 함수에 SET 을 걸면 SQL 함수 인라인이 막힌다). PostgREST 는 요청마다 역할 설정을 적용한다(statement_timeout=3s 와 같은 길) —
--   적용 뒤 pg_stat_statements 의 화면 꼴 호출 temp 쓰기로 실제 적용을 확인한다(안 떨어지면 되돌린다).
--   메모리 상한: work_mem 은 정렬·해시 노드마다 쓰는 상한(해시는 hash_mem_multiplier 2배)이라 늘어나는 최악은 (4 − 2.13) MB × 노드 수 × 동시 실행 수다(회신에 셈).
-- 되돌리기: alter role anon reset work_mem; alter role authenticated reset work_mem;
alter role anon set work_mem = '4MB';
alter role authenticated set work_mem = '4MB';
