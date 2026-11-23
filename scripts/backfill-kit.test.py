#!/usr/bin/env python3
# scripts/backfill-kit.py 시험 — DB 없이 SQL 만들기만 본다(2026-11-19 · 15장). 쓰는 법: python3 scripts/backfill-kit.test.py
import importlib.util, os, sys
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("kit", os.path.join(here, "backfill-kit.py"))
kit = importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
ok = 0; bad = 0
def t(name, cond):
    global ok, bad
    if cond: ok += 1
    else: bad += 1; print("✗", name)
A = "11111111-1111-1111-1111-111111111111"; B = "22222222-2222-2222-2222-222222222222"
plan = {"table": "announcement_policies", "guard": "content_raw", "rows": [
    {"id": A, "set": {"content_plain": "요점 $zfv$ 한 줄", "content_plain_at": {"sql": "now()"}, "content_plain_check": "plain-check v3 요점"}},
    {"id": B, "set": {"content_plain": "둘째", "content_plain_at": {"sql": "now()"}, "content_plain_check": "plain-check v3 요점"}}]}
types = {"id": "uuid", "content_raw": "text", "content_plain": "text", "content_plain_at": "timestamp with time zone", "content_plain_check": "text"}
before = {A: {"guard_md5": "aa", "cur": {"content_plain": None, "content_plain_at": None, "content_plain_check": None}},
          B: {"guard_md5": "bb", "cur": {"content_plain": None, "content_plain_at": None, "content_plain_check": None}}}
test, apply, rb = kit.build_sql(plan, types, before, "t.json")
t("시험 첫 줄 = statement_timeout", test.splitlines()[0].startswith("set statement_timeout"))
t("시험 끝 = RESULT 예외", "raise exception 'RESULT" in test)
t("반영에는 RESULT 없음", "RESULT" not in apply)
t("가드 md5 둘", test.count("md5(t.content_raw::text) is not distinct from") >= 4)
t("행 수 확인 2", "g <> 2" in apply and "n <> 2" in apply)
t("값 안 $zfv$ 는 다른 꼬리표", "$zfvx$요점 $zfv$ 한 줄$zfvx$" in apply)
t("now() 캐스트", "now()::timestamp with time zone" in apply)
t("되돌림은 BEFORE(null)로", "content_plain = null::text" in rb)
t("되돌림 가드는 계획 값", "t.content_plain is not distinct from $zfv$둘째$zfv$::text" in rb)
t("되돌림 가드에 시각 칸 없음", "t.content_plain_at is not distinct" not in rb)
t("jsonb 값", kit.lit({"a": 1}, "jsonb") == '$zfv${"a": 1}$zfv$::jsonb')
# 계획 꼴 거름
import json, tempfile
def bad_plan(p):
    f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False); json.dump(p, f); f.close()
    try: kit.load_plan(f.name); return False
    except SystemExit: return True
    finally: os.unlink(f.name)
t("표 밖 거름", bad_plan({"table": "user_profiles", "rows": [{"id": A, "set": {"x": 1}}]}))
t("id 꼴 거름", bad_plan({"table": "announcement_policies", "rows": [{"id": "1; drop", "set": {"x": 1}}]}))
t("칸 이름 꼴 거름", bad_plan({"table": "announcement_policies", "rows": [{"id": A, "set": {"x;--": 1}}]}))
t("가드 칸 바꾸기 거름", bad_plan({"table": "announcement_policies", "guard": "content_raw", "rows": [{"id": A, "set": {"content_raw": "x"}}]}))
t("같은 행 두 번 거름", bad_plan({"table": "announcement_policies", "rows": [{"id": A, "set": {"x": 1}}, {"id": A, "set": {"x": 2}}]}))
try: kit.lit({"sql": "drop table x"}, "text"); t("sql 값 거름", False)
except SystemExit: t("sql 값 거름", True)
# ── 2026-11-20 요점 소급 6회차 0장 3 — 경고 문지기(⚠범위 줄임 + 사람 확인 표지 scope_checked). plain-check 를 실제로 부른다(DB 없음).
import subprocess
SEP = "• 신청자의 직계존속 : 신청자와 세대별 주민등록표상에 함께 등재되어 있는 사람 및 신청자의 분리배우자와 세대별 주민등록표상에 함께 등재되어 있는 사람에 한함"
pairs = [{"id": A, "raw": SEP, "plain": "직계존속은 함께 등재된 사람에 한해요."},          # 경고
         {"id": B, "raw": SEP, "plain": "직계존속은 신청자 또는 분리배우자와 함께 등재된 사람에 한해요."}]  # 경고 없음
f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8"); json.dump(pairs, f, ensure_ascii=False); f.close()
out = subprocess.run(["node", os.path.join(here, "plain-check.mjs"), "--point", "--json", f.name], capture_output=True, text=True).stdout
os.unlink(f.name)
w = kit.warned_ids(out)
t("경고 행 뽑기", w == {A})
t("경고 + 표지 없음 = 멈춤", kit.scope_gate([{"id": A}, {"id": B}], w) == [A])
t("경고 + 표지 = 통과", kit.scope_gate([{"id": A, "scope_checked": "원문도 한쪽 — 전혼 자녀는 신청자와만"}, {"id": B}], w) == [])
t("빈 표지는 표지 아님", kit.scope_gate([{"id": A, "scope_checked": "  "}], w) == [A])
t("경고 없음 = 통과", kit.scope_gate([{"id": B}], w) == [])
# ── 2026-11-23(여덟째 묶음 4) — 접수 경로 target_text 2회차 21행(정수 id · 원문 부분 문자열 · 열린 공고 · 다른 칸 md5)
rp = kit.load_plan(os.path.join(here, "testdata", "backfill-target-text-r2.example.json"))
rtypes = {"id": "bigint", "announcement_id": "text", "route": "text", "target_text": "text"}
rbefore = {r["id"]: {"guard_md5": None, "cur": {"target_text": None}} for r in rp["rows"]}
rt, ra, rr = kit.build_sql(rp, rtypes, rbefore, "r2.json")
t("정수 id 꼴", "t.id = '787'::bigint" in ra and "::uuid" not in ra)
t("BEFORE 가드 = 빈칸 21행", ra.count("t.target_text is not distinct from null::text") >= 21 and "g <> 21" in ra)
t("원문 부분 문자열 21", ra.count("strpos(p.content_raw,") == 21 and "s <> 21" in ra)
t("원문 가드는 같은 공고 정책 행", "p.announcement_id = t.announcement_id" in ra)
t("열린 공고 가드", "a.status in ($zfv$공고중$zfv$, $zfv$접수중$zfv$, $zfv$정정공고중$zfv$)" in ra and "열린 공고 가드 실패" in ra)
t("다른 칸 md5 전후", "(to_jsonb(t) - array[$zfv$target_text$zfv$])" in ra and "m1 is distinct from m0" in ra)
t("다른 칸 가드는 반영 뒤", ra.index("into m1") > ra.index("update public.announcement_apply_routes"))
t("반영 행 수 21", "n <> 21" in ra)
t("되돌림 = 빈칸으로 21행", rr.count("set target_text = null::text") == 21 and "n <> 21" in rr)
t("시험 판은 RESULT", "raise exception 'RESULT" in rt)
h = kit.history_stub(rp, "r2.json", kit.build_sql.guard_names, 21)
t("이력 틀 첫 줄 꼴", h.startswith("# 20") and " — 〈회차 이름〉" in h.splitlines()[0])
t("이력 틀 가드 목록", "원문 부분 문자열(target_text)" in h and "열린 공고" in h and "다른 칸 md5 전후 같음" in h)
t("다른 행 가드(other_rows_same)", "o.announcement_id in (select t.announcement_id" in ra and "not (o.id = any(" in ra and "m3 is distinct from m2" in ra)
t("다른 행 가드는 반영 뒤", ra.index("into m3") > ra.index("update public.announcement_apply_routes"))
t("other_rows_same 칸 꼴 거름", bad_plan({"table": "announcement_apply_routes", "other_rows_same": "x;--", "rows": [{"id": "1", "set": {"target_text": "a"}}]}))
t("source_substring 은 바꾸는 칸만", bad_plan({"table": "announcement_apply_routes", "source_substring": ["x;"], "rows": [{"id": "1", "set": {"target_text": "a"}}]}))
print(f"backfill-kit 시험 {ok}/{ok + bad}")
sys.exit(1 if bad else 0)
