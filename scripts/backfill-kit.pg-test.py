#!/usr/bin/env python3
# backfill-kit 가짜 표 시험(2026-11-23 · 우편함 「코드·운영 — 아홉째 묶음」 2) — 운영 DB 0.
#   컨테이너의 PostgreSQL 서버(/usr/lib/postgresql/<판>/bin)로 임시 클러스터를 띄워, 가짜 표 셋(announcements · announcement_policies ·
#   announcement_apply_routes)에 backfill-kit 이 만든 apply.sql 을 돌린다:
#     ① 그대로 → 통과(반영 n · 커밋) ② 같은 공고의 대상 밖 행을 건드리는 트리거를 건 뒤 → 「다른 행 가드 실패」로 멈춤(롤백)
#     ③ 값이 원문에 없는 계획 → 「원문 가드 실패」 ④ 닫힌 공고 → 「열린 공고 가드 실패」.
#     ⑤ 합치기(바꿈 1 + 지움 1) → 장부 한 줄 · 되돌림 ⑥ 빈 회차 → 멈춤 ⑦ 지울 행이 그사이 바뀜 → 가드 실패(열셋째 묶음 2).
#   쓰는 법: python3 scripts/backfill-kit.pg-test.py  (root 면 postgres 사용자로 서버를 띄운다 · 끝나면 클러스터를 지운다)
#   서버가 없으면 「건너뜀」으로 끝난다(종료 코드 0) — DB 없이 SQL 꼴만 보는 시험은 backfill-kit.test.py.
import glob, importlib.util, os, shutil, subprocess, sys, tempfile, time

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("kit", os.path.join(here, "backfill-kit.py"))
kit = importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
bins = sorted(glob.glob("/usr/lib/postgresql/*/bin/initdb"))
if not bins:
    print("backfill-kit pg 시험 — 건너뜀(PostgreSQL 서버 없음)"); sys.exit(0)
B = os.path.dirname(bins[-1])
root = os.geteuid() == 0
d = tempfile.mkdtemp(prefix="zf-kit-pg-")
os.chmod(d, 0o777)
data, sock = os.path.join(d, "data"), d
def as_pg(cmd, **kw):
    if root:
        cmd = ["su", "postgres", "-s", "/bin/sh", "-c", " ".join(f"'{c}'" for c in cmd)]
    return subprocess.run(cmd, capture_output=True, text=True, **kw)
ok = 0; bad = 0
def t(name, cond, extra=""):
    global ok, bad
    if cond: ok += 1
    else: bad += 1; print("✗", name, extra[:300])
try:
    r = as_pg([f"{B}/initdb", "-D", data, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"])
    if r.returncode: raise SystemExit("initdb 실패: " + r.stderr[-300:])
    r = as_pg([f"{B}/pg_ctl", "-D", data, "-o", f"-k {sock} -c listen_addresses=''", "-w", "start", "-l", os.path.join(d, "log")])
    if r.returncode: raise SystemExit("서버 시작 실패: " + r.stderr[-300:])
    def psql(sql):
        return subprocess.run([f"{B}/psql", "-h", sock, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], input=sql, capture_output=True, text=True)
    def reset():
        r = psql("""
drop table if exists public.announcement_apply_routes, public.announcement_policies, public.announcements cascade;
drop function if exists public.zf_touch_neighbor() cascade;
create table public.announcements (announcement_id text primary key, status text);
create table public.announcement_policies (id serial primary key, announcement_id text, content_raw text);
create table public.announcement_apply_routes (id bigint generated always as identity (start 100) primary key, announcement_id text, route text, target_text text, note_text text);
insert into public.announcements values ('A', '접수중'), ('B', '마감');
insert into public.announcement_policies (announcement_id, content_raw) values ('A', '현장 접수: 65세 이상 고령자, 장애인 등 정보취약계층'), ('B', '현장 접수: 고령자등');
insert into public.announcement_apply_routes overriding system value values (1, 'A', '현장', null, null), (2, 'A', '인터넷', null, '이웃'), (3, 'B', '현장', null, null);
""")
        assert r.returncode == 0, r.stderr
    types = {"id": "bigint", "announcement_id": "text", "route": "text", "target_text": "text", "note_text": "text"}
    base = {"table": "announcement_apply_routes", "guard": None, "source_substring": ["target_text"], "open_only": True,
            "other_cols_same": True, "other_rows_same": "announcement_id"}
    def gen(rows):
        plan = dict(base, rows=rows)
        before = {r["id"]: {"guard_md5": None, "cur": {"target_text": None}} for r in rows}
        return kit.build_sql(plan, types, before, "pg-test.json")
    good = [{"id": "1", "set": {"target_text": "65세 이상 고령자, 장애인"}}]
    # ① 그대로 → 통과
    reset(); _, apply, rollback = gen(good)
    r = psql(apply)
    t("① 그대로 → 통과", r.returncode == 0, r.stderr)
    t("① 값이 들어감", psql("select target_text from public.announcement_apply_routes where id = 1").stdout.strip() == "65세 이상 고령자, 장애인")
    r = psql(rollback)
    t("① 되돌림 → 빈칸", r.returncode == 0 and psql("select coalesce(target_text, '∅') from public.announcement_apply_routes where id = 1").stdout.strip() == "∅", r.stderr)
    # ② 같은 공고 대상 밖 행을 건드리는 트리거 → 다른 행 가드로 멈춤 · 롤백
    reset()
    psql("""create function public.zf_touch_neighbor() returns trigger language plpgsql as $$ begin
  update public.announcement_apply_routes set note_text = '바뀜' where announcement_id = new.announcement_id and id <> new.id and note_text is distinct from '바뀜';
  return new; end $$;
create trigger zf_touch after update of target_text on public.announcement_apply_routes for each row execute function public.zf_touch_neighbor();""")
    r = psql(apply)
    t("② 이웃 행이 바뀌면 멈춤", r.returncode != 0 and "다른 행 가드 실패" in r.stderr, r.stderr)
    t("② 멈추면 롤백(값·이웃 그대로)",
      psql("select string_agg(coalesce(target_text, '∅') || '|' || coalesce(note_text, '∅'), ',' order by id) from public.announcement_apply_routes where id in (1, 2)").stdout.strip() == "∅|∅,∅|이웃")
    # ③ 원문에 없는 값 → 원문 가드
    reset(); _, apply3, _ = gen([{"id": "1", "set": {"target_text": "원문에 없는 글자"}}])
    r = psql(apply3)
    t("③ 원문에 없는 값 → 멈춤", r.returncode != 0 and "원문 가드 실패" in r.stderr, r.stderr)
    # ④ 닫힌 공고 → 열린 공고 가드
    reset(); _, apply4, _ = gen([{"id": "3", "set": {"target_text": "고령자등"}}])
    r = psql(apply4)
    t("④ 닫힌 공고 → 멈춤", r.returncode != 0 and "열린 공고 가드 실패" in r.stderr, r.stderr)
    # ⑤~⑦ 지우기·합치기 + 의도된 감소 장부(2026-11-23 · 열셋째 묶음 2) — 표는 마이그레이션 2026-11-23_02 와 같은 꼴 · 지운 행 표는 identity(운영과 같게)
    LEDGER_DDL = """create schema if not exists zipfit_ops;
drop table if exists zipfit_ops.intended_drops;
create table zipfit_ops.intended_drops (id bigint generated always as identity primary key, at timestamptz not null default now(),
  table_name text not null check (table_name ~ '^[a-z_][a-z0-9_]*$'), expected_drop integer not null check (expected_drop > 0),
  round text not null check (length(btrim(round)) > 0), note text);"""
    import json as _j
    def snap(i):
        x = psql(f"select json_build_object('row', to_jsonb(t), 'row_md5', md5(to_jsonb(t)::text), 'grp', t.announcement_id) from public.announcement_apply_routes t where id = {i}").stdout.strip()
        return _j.loads(x)
    def gen_merge(round_):
        rows = [{"id": "1", "set": {"target_text": "65세 이상 고령자, 장애인"}}, {"id": "2", "delete": True}]
        plan = dict(base, rows=rows)
        before = {"1": {"guard_md5": None, "cur": {"target_text": None}, "grp": "A"}, "2": {"guard_md5": None, "cur": {}, **snap(2)}}
        return kit.build_sql(plan, types, before, "pg-merge.json", round_), before
    reset(); assert psql(LEDGER_DDL).returncode == 0
    (test5, apply5, rb5), b5 = gen_merge("시험 — 합치기")
    r = psql(test5)
    t("⑤ 시험 판 = RESULT(반영 1 · 지움 1) · 쓰기 0", r.returncode != 0 and "RESULT 반영 1 행 · 지움 1 행" in r.stderr
      and psql("select count(*) from public.announcement_apply_routes").stdout.strip() == "3"
      and psql("select count(*) from zipfit_ops.intended_drops").stdout.strip() == "0", r.stderr)
    r = psql(apply5)
    t("⑤ 합치기 반영 — 행 3 → 2 · 장부 1줄(표 · 1 · 회차)", r.returncode == 0
      and psql("select count(*) from public.announcement_apply_routes").stdout.strip() == "2"
      and psql("select table_name || '|' || expected_drop || '|' || round from zipfit_ops.intended_drops").stdout.strip() == "announcement_apply_routes|1|시험 — 합치기", r.stderr)
    r = psql(rb5)
    t("⑤ 되돌림 — 지운 행이 BEFORE 행 전체 md5 그대로 · 장부 줄은 남음", r.returncode == 0
      and psql("select md5(to_jsonb(t)::text) from public.announcement_apply_routes t where id = 2").stdout.strip() == b5["2"]["row_md5"]
      and psql("select coalesce(target_text, '∅') from public.announcement_apply_routes where id = 1").stdout.strip() == "∅"
      and psql("select count(*) from zipfit_ops.intended_drops").stdout.strip() == "1", r.stderr)
    # ⑥ 회차 인자 비면 멈춤(SQL 을 짓지 않는다)
    reset()
    try: gen_merge("  "); t("⑥ 빈 회차 → 멈춤", False)
    except SystemExit as e: t("⑥ 빈 회차 → 멈춤", "--round" in str(e))
    # ⑦ 지울 행이 그사이 바뀜 → 가드 실패(지움 0 · 장부 0)
    reset(); assert psql(LEDGER_DDL).returncode == 0
    (_, apply7, _), _ = gen_merge("시험 — 합치기")
    psql("update public.announcement_apply_routes set note_text = '그사이 바뀜' where id = 2")
    r = psql(apply7)
    t("⑦ 지울 행이 바뀜 → 가드 실패 · 장부 0", r.returncode != 0 and "가드 실패" in r.stderr
      and psql("select count(*) from zipfit_ops.intended_drops").stdout.strip() == "0", r.stderr)
finally:
    as_pg([f"{B}/pg_ctl", "-D", data, "-m", "immediate", "stop"])
    shutil.rmtree(d, ignore_errors=True)
print(f"backfill-kit pg 시험 {ok}/{ok + bad}")
sys.exit(1 if bad else 0)
