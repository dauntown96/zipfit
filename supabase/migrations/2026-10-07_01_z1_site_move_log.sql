-- Z-1 ③ 이전 기록 표(2026-10-07 · 우편함 「코드 — Z-1 ③ 블록 ID 산물 → 원문 ID 이전(LH 102) …」 2).
--   블록 ID(MYHOME 분할 행)에 있던 산물을 원문(LH) ID 로 옮기거나(move) 원문 ID 의 같은 내용 공통 행으로 합칠 때(merge — 블록 행을 지움)
--   행마다 한 줄 — 옛 ID · 새 ID · 표 · 행 원본 jsonb(옮기기 전 그대로). 되돌리기는 이 표만으로 한다:
--     move  → update <표> set announcement_id = old_announcement_id, site_label = (row_before->>'site_label') where id = row_id
--     merge → insert into <표> select * from jsonb_populate_record(null::<표>, row_before)
--   데이터 이전 자체는 관리 API 한 트랜잭션(데이터 쓰기 — 원칙 32 밖)이고, 이 파일은 표만 만든다.
--   🔴 zipfit_ops 스키마 — 공개 역할(PUBLIC·anon·authenticated) 권한 0(스키마 사용 권한도 없다) · REST·백업 덤프(--schema=public)에 보이지 않는다.
--      이전 직전 상태 전체는 zipfit-backup 2026-10-06 정기 덤프(zipfit_20261006.dump)가 따로 갖고 있다.
--   되돌리기(표): drop table zipfit_ops.z1_site_move_log;
CREATE TABLE zipfit_ops.z1_site_move_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  moved_at timestamptz NOT NULL DEFAULT now(),
  tbl text NOT NULL CHECK (tbl IN ('housing_units', 'eligibility_criteria', 'announcement_policies', 'announcement_apply_routes', 'announcement_extras')),
  row_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('move', 'merge')),
  old_announcement_id text NOT NULL,
  new_announcement_id text NOT NULL,
  site_label_set text,
  merged_into text,
  row_before jsonb NOT NULL,
  CHECK ((action = 'merge') = (merged_into IS NOT NULL))
);
COMMENT ON TABLE zipfit_ops.z1_site_move_log IS 'Z-1 ③ 이전 기록 — 블록 ID 산물 → 원문 ID(move) · 원문 ID 공통 행으로 합침(merge). 행 원본 jsonb 로 되돌린다(2026-10-07).';
COMMENT ON COLUMN zipfit_ops.z1_site_move_log.row_id IS '옮긴(지운) 행의 id — uuid 표는 uuid 문자열 · 경로 표는 bigint 문자열';
COMMENT ON COLUMN zipfit_ops.z1_site_move_log.new_announcement_id IS '옮긴 곳(원문 ID) — merge 면 합친 공통 행이 사는 원문 ID';
COMMENT ON COLUMN zipfit_ops.z1_site_move_log.site_label_set IS '옮기며 채운 site_label(= 그 블록 세대 building_name) — 세대·unit_key 이미지·merge 는 NULL';
COMMENT ON COLUMN zipfit_ops.z1_site_move_log.merged_into IS 'merge 일 때 남긴 원문 ID 공통 행의 id';
COMMENT ON COLUMN zipfit_ops.z1_site_move_log.row_before IS '옮기기(지우기) 전 행 전체(to_jsonb)';
REVOKE ALL ON TABLE zipfit_ops.z1_site_move_log FROM PUBLIC, anon, authenticated;
