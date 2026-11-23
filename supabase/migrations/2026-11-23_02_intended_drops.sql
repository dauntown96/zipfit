-- 의도된 감소 장부(2026-11-23 · 우편함 「코드·운영 — 열두째 묶음」 A · 백로그 「백업 경보가 「의도된 감소」를 모른다」 · zipfit-backup #40).
--   zipfit_ops.intended_drops — 정리 회차(행 합치기·삭제가 있는 데이터 쓰기)가 「어느 public 표가 몇 행 줄어드는가」를 한 줄씩 남긴다.
--   🔵 정리와 **같은 트랜잭션**에서 쓴다(관리 API 파일 실행 한 요청) — 정리가 롤백되면 장부 줄도 함께 사라진다. 쓰는 법 = docs/intended-drops.md.
--   zipfit-backup 생존 신호(heartbeat_report.py)는 DB 에 붙지 않는다 — 이 표는 매일 밤 따로 뜨는 zipfit_ops 덤프에 실리고, 생존 신호가 그 덤프에서
--   「직전 신호 뒤에 쓰인 줄」을 표별로 합쳐 그날 감소와 견준다(같으면 🟡 · 다르거나 없으면 🔴 그대로).
--   개인정보 0(표 이름 · 수 · 회차 이름) · 덧붙이기만 하는 기록(zipfit-backup ops_scope.APPEND_ONLY — 줄면 경보) · GRANT 0(쓰기는 관리 API = postgres).
-- 되돌리기: drop table zipfit_ops.intended_drops;
create table zipfit_ops.intended_drops (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  table_name text not null check (table_name ~ '^[a-z_][a-z0-9_]*$'),
  expected_drop integer not null check (expected_drop > 0),
  round text not null check (length(btrim(round)) > 0),
  note text
);
comment on table zipfit_ops.intended_drops is
  '의도된 감소 장부(2026-11-23) — 정리 회차가 같은 트랜잭션에서 「public 표 · 예상 감소 행 수 · 회차(우편함 회차 이름 또는 PR)」를 한 줄 남긴다 · zipfit-backup 생존 신호가 ops 덤프에서 읽어 그날 감소와 같으면 🟡 · 쓰는 법 docs/intended-drops.md · 덧붙이기만 · GRANT 0.';
revoke all on table zipfit_ops.intended_drops from public, anon, authenticated, service_role;
