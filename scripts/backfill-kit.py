#!/usr/bin/env python3
# 소급 회차 틀 — 틀 diff · 원문 대조 · 가드 SQL(반영 · 되돌리기 전용 시험 · 되돌림) 만들기
# (2026-11-19 · 우편함 「코드·운영 — 15장」 · 순위표 docs/ops-check-backlog.md 3위 · 💡 「소급 회차용 틀 diff·원문 대조·롤백 가드 SQL」)
#
# 왜: 소급 회차(역전파 · 쉽게 쓴 말 · 원문화)가 회차마다 같은 셋 — 틀 행 diff · 원문 대조 · BEFORE md5 가드 SQL — 을
#     세션 scratchpad 에서 다시 짰다(국면 C 7·8·9회차 · 2026-11-02 — 세 회차 연속). 꼴을 저장소에 고정한다.
# 첫 사용처: 쉽게 쓴 말 소급(분석 스킬 v11.8 뒤) — 예시 계획 scripts/testdata/backfill-plain-plan.example.json.
#
# 하위 명령(관리 API 는 읽기만 — 🔴 이 스크립트는 apply 를 스스로 돌리지 않는다 · run 은 사람이 고른 파일 하나만 보낸다):
#   diff <공고 A> <공고 B> [--plan-out 계획.json]
#       틀 diff — 두 공고의 정책 행을 category 로 짝지어 원문(content_raw) md5 가 같음 · 다름 · 한쪽만을 센다.
#       --plan-out: B 의 행 중 「A 에 원문 md5 가 같은 행이 있고 A 행은 쉽게 쓴 말이 있고 B 행은 비었음」을 복사 계획으로 쓴다(값은 A 그대로 · 검사 판도 A 그대로).
#   check <계획.json>   (⚠범위 줄임 경고 행은 계획 행에 "scope_checked": "<근거>" 표지가 없으면 걸림 — 6회차)
#       원문 대조 — 계획의 content_plain 을 DB content_raw 와 짝지어 scripts/plain-check.mjs 로 본다
#       (content_plain_check 가 「plain-check v3 요점」이면 --point · 아니면 v2). 걸린 행 수 > 0 이면 종료 코드 1.
#   gen <계획.json> --out <폴더>
#       가드 SQL 셋 + BEFORE 스냅숏을 만든다(관리 API 로 지금 값 SELECT 한 번):
#         before.json   행마다 가드 칸 md5 · 바꿀 칸의 지금 값
#         test.sql      첫 줄 set statement_timeout · DO 안에서 가드 → 반영 → 행 수 확인 → raise exception 'RESULT …'(되돌리기 전용 시험 — 쓰기 0)
#         apply.sql     같은 DO · 끝 예외 없음(커밋 — 사람이 고른 때 run 으로 보낸다)
#         rollback.sql  지금 값이 계획 값과 같은 행만 BEFORE 값으로 되돌린다(행 수 확인)
#       가드 = 행마다 md5(가드 칸) = BEFORE · 바꿀 칸이 BEFORE 값 그대로(다른 회차가 그사이 바꿨으면 멈춤) · 고친 행 수 = 계획 행 수.
#   run <파일.sql>
#       관리 API 로 파일 하나를 보낸다(요청 하나 = 트랜잭션 하나). test.sql 은 400 + 「RESULT …」가 정상이다.
#
# 계획 파일 꼴(JSON):
#   { "table": "announcement_policies", "guard": "content_raw", "note": "…",
#     "rows": [ { "id": "<uuid>", "set": { "content_plain": "…", "content_plain_at": {"sql": "now()"}, "content_plain_check": "plain-check v3 요점" } } ] }
#   표는 아래 TABLES 만 · 칸은 그 표의 실제 칸만(information_schema 로 확인) · 값은 글자 · 수 · null · {"sql": "now()"} 만.
# 🔴 이용자 정보 표는 다루지 않는다(TABLES 밖) · 키·토큰 값을 찍지 않는다 · 인증은 프록시가 넣는다(밖에서는 SUPABASE_ACCESS_TOKEN 이 있으면 헤더로).
#   🔵 2026-11-23(우편함 「코드·운영 — 여덟째 묶음」 4) — 데이터 소급(접수 경로 target_text 등)도 받게 넓힘:
#     표에 announcement_apply_routes(정수 id) · 계획 선택 칸 셋(빠지면 종전 그대로):
#       "source_substring": ["칸", …]  — 그 칸의 새 값이 같은 공고(행의 announcement_id)의 announcement_policies.content_raw 어느 한 행의 부분 문자열이어야 한다(원문 글자 그대로)
#       "other_cols_same": true          — 바꾸는 칸 밖 모든 칸(행 전체 jsonb − 바꾸는 칸)의 md5 가 반영 전후 같아야 한다(대상 행 · id 순)
#       "other_rows_same": "announcement_id" — 🔵 2026-11-23(아홉째 묶음 2) 같은 묶음 칸(보통 announcement_id) 값을 가진 **대상 밖** 행 전체의 md5 가 반영 전후 같아야 한다
#                                          (트리거·실수로 이웃 행이 함께 바뀌면 멈춤 · 2회차 손 가드 「14공고 경로 행 다른 칸 md5 전후 같음」과 같은 뜻)
#       "open_only": true                — 대상 행의 공고가 열려 있어야 한다(announcements.status 공고중·접수중·정정공고중 — health-ops 「열린 공고」와 같은 셋)
#     gen 은 history.md(이력 파일 틀 — docs/history.d 꼴 첫 줄 · 행 수 · 가드 목록 · 되돌리기 한 줄)도 함께 쓴다(SQL 은 만들기만 · 보내기는 사람이 run 으로).
# 시험: python3 scripts/backfill-kit.test.py (DB 없이 SQL 만들기만 본다)
import argparse
import hashlib
import json
import os
import re
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TABLES = {"announcement_policies", "eligibility_criteria", "housing_units", "announcement_schedule", "announcement_apply_routes"}
OPEN_STATUS = ("공고중", "접수중", "정정공고중")
INT_RE = re.compile(r"^[0-9]{1,18}$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
COL_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
ANN_RE = re.compile(r"^[A-Za-z0-9_가-힣.\-]+$")
CA = "/root/.ccr/ca-bundle.crt"
POINT = "plain-check v3 요점"


def _project_ref():
    m = re.search(r'^project_id\s*=\s*"([a-z0-9]+)"\s*$', open(os.path.join(ROOT, "supabase", "config.toml"), encoding="utf-8").read(), re.M)
    if not m:
        raise SystemExit("supabase/config.toml 에 project_id 가 없다")
    return m.group(1)


def api(query, expect_error=False):
    url = f"https://api.supabase.com/v1/projects/{_project_ref()}/database/query"
    ctx = ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()
    op = urllib.request.build_opener(urllib.request.ProxyHandler(), urllib.request.HTTPSHandler(context=ctx))
    headers = {"Content-Type": "application/json"}
    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]
    req = urllib.request.Request(url, data=json.dumps({"query": query}).encode("utf-8"), headers=headers, method="POST")
    try:
        with op.open(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        if expect_error:
            return e.code, body
        sys.exit(f"관리 API {e.code}: {body[:400]}")


def q1(query):
    _, rows = api(query)
    return rows[0][list(rows[0].keys())[0]] if rows else None


def dq(value):
    """달러 인용 — 값 안에 없는 꼬리표를 고른다."""
    s = str(value)
    tag = "zfv"
    while f"${tag}$" in s:
        tag += "x"
    return f"${tag}${s}${tag}$"


def lit(v, typ):
    if v is None:
        return f"null::{typ}"
    if typ in ("jsonb", "json") and v != {"sql": "now()"}:
        return f"{dq(json.dumps(v, ensure_ascii=False))}::{typ}"
    if isinstance(v, (dict, list)):
        if v != {"sql": "now()"}:
            raise SystemExit(f"값 꼴 밖: {v} — 글자 · 수 · null · {{\"sql\": \"now()\"}} 만")
        return f"now()::{typ}"
    if isinstance(v, bool):
        return f"{'true' if v else 'false'}::{typ}"
    if isinstance(v, (int, float)):
        return f"{v}::{typ}"
    return f"{dq(v)}::{typ}"


def load_plan(path):
    plan = json.load(open(path, encoding="utf-8"))
    t = plan.get("table")
    if t not in TABLES:
        raise SystemExit(f"표 {t!r} 는 다루지 않는다 — {sorted(TABLES)}")
    g = plan.get("guard")
    if g is not None and not COL_RE.match(g):
        raise SystemExit(f"가드 칸 이름 꼴 밖: {g!r}")
    rows = plan.get("rows") or []
    if not rows:
        raise SystemExit("계획 행 0")
    seen = set()
    for r in rows:
        if not (UUID_RE.match(str(r.get("id", ""))) or INT_RE.match(str(r.get("id", "")))):
            raise SystemExit(f"행 id 꼴 밖: {r.get('id')!r}")
        r["id"] = str(r["id"])
        if r["id"] in seen:
            raise SystemExit(f"같은 행 두 번: {r['id']}")
        seen.add(r["id"])
        if not r.get("set"):
            raise SystemExit(f"바꿀 칸 없음: {r['id']}")
        for c in r["set"]:
            if not COL_RE.match(c) or c == "id" or c == g:
                raise SystemExit(f"바꿀 칸 꼴 밖(또는 id · 가드 칸): {c!r}")
    orc = plan.get("other_rows_same")
    if orc is not None and not (isinstance(orc, str) and COL_RE.match(orc)):
        raise SystemExit(f"other_rows_same 칸 이름 꼴 밖: {orc!r}")
    for c in plan.get("source_substring") or []:
        if not COL_RE.match(c):
            raise SystemExit(f"source_substring 칸 이름 꼴 밖: {c!r}")
    return plan


def col_types(table):
    j = q1("select json_object_agg(column_name, format_type(a.atttypid, a.atttypmod)) from information_schema.columns c "
           "join pg_attribute a on a.attrelid = ('public.' || c.table_name)::regclass and a.attname = c.column_name "
           f"where c.table_schema = 'public' and c.table_name = {dq(table)}")
    return j or {}


def ids_arr(ids, typ="uuid"):
    return "'{" + ",".join(ids) + "}'::" + typ + "[]"


def id_lit(i, typ):
    return f"'{i}'::{typ}"


# ── SQL 만들기(DB 없이 — 시험이 이것만 본다) ──
def build_sql(plan, types, before, label):
    t, g = plan["table"], plan.get("guard")
    rows = plan["rows"]
    cols = sorted({c for r in rows for c in r["set"]})
    it = types.get("id", "uuid")
    subs = list(plan.get("source_substring") or [])
    for c in subs:
        if c not in cols:
            raise SystemExit(f"source_substring 칸 {c!r} 은 바꾸는 칸이 아니다")
    if (subs or plan.get("open_only")) and "announcement_id" not in types:
        raise SystemExit(f"{t} 에 announcement_id 칸이 없어 source_substring · open_only 를 못 건다")
    for c in cols + ([g] if g else []):
        if c not in types:
            raise SystemExit(f"{t} 에 칸 {c!r} 없음")
    n = len(rows)
    # 가드: 행마다 md5(가드 칸) = BEFORE · 바꿀 칸 = BEFORE 값(행이 바꾸는 칸만)
    def guard_pred(r, b, alias="t"):
        p = [f"{alias}.id = {id_lit(r['id'], it)}"]
        if g:
            p.append(f"md5({alias}.{g}::text) is not distinct from {dq(b['guard_md5']) if b['guard_md5'] is not None else 'null'}")
        for c in r["set"]:
            p.append(f"{alias}.{c} is not distinct from {lit(b['cur'].get(c), types[c])}")
        return "(" + " and ".join(p) + ")"
    def after_pred(r, alias="t"):
        p = [f"{alias}.id = {id_lit(r['id'], it)}"]
        for c, v in r["set"].items():
            if isinstance(v, dict):   # now() — 되돌림 가드에서는 시각 칸을 보지 않는다(언제 썼는지 모름)
                continue
            p.append(f"{alias}.{c} is not distinct from {lit(v, types[c])}")
        return "(" + " and ".join(p) + ")"
    guards = "\n      or ".join(guard_pred(r, before[r["id"]]) for r in rows)
    updates = []
    for r in rows:
        sets = ", ".join(f"{c} = {lit(v, types[c])}" for c, v in r["set"].items())
        updates.append(f"  update public.{t} t set {sets} where {guard_pred(r, before[r['id']])};\n  get diagnostics k = row_count; n := n + k;")
    body = "\n".join(updates)
    extra = []   # 2026-11-23 선택 가드
    ids_sql = ids_arr([r["id"] for r in rows], it)
    if subs:
        preds = []
        for r in rows:
            for c in subs:
                if c in r["set"] and not isinstance(r["set"][c], dict) and r["set"][c] is not None:
                    preds.append(f"(t.id = {id_lit(r['id'], it)} and exists (select 1 from public.announcement_policies p where p.announcement_id = t.announcement_id and strpos(p.content_raw, {dq(r['set'][c])}) > 0))")
        if preds:
            extra.append(("pre", f"  select count(*) into s from public.{t} t where " + "\n      or ".join(preds) + ";\n"
                          f"  if s <> {len(preds)} then raise exception '원문 가드 실패: 같은 공고 정책 행 원문에 값 글자가 있는 행 %/{len(preds)}', s; end if;\n"))
    if plan.get("open_only"):
        st = ", ".join(dq(x) for x in OPEN_STATUS)
        extra.append(("pre", f"  select count(*) into s from public.{t} t join public.announcements a on a.announcement_id = t.announcement_id where t.id = any({ids_sql}) and a.status in ({st});\n"
                      f"  if s <> {n} then raise exception '열린 공고 가드 실패: 열린 공고 행 %/{n}', s; end if;\n"))
    if plan.get("other_cols_same"):
        drop = "array[" + ", ".join(dq(c) for c in cols) + "]"
        m = f"select md5(coalesce(string_agg((to_jsonb(t) - {drop})::text, E'\\n' order by t.id), '')) from public.{t} t where t.id = any({ids_sql})"
        extra.append(("pre", f"  {m} into m0;\n"))
        extra.append(("post", f"  {m} into m1;\n  if m1 is distinct from m0 then raise exception '다른 칸 가드 실패: 바꾸는 칸 밖 md5 전후 다름'; end if;\n"))
    orc = plan.get("other_rows_same")
    if orc:
        if orc not in types:
            raise SystemExit(f"{t} 에 other_rows_same 칸 {orc!r} 없음")
        mo = (f"select md5(coalesce(string_agg(to_jsonb(o)::text, E'\\n' order by o.id), '')) from public.{t} o "
              f"where o.{orc} in (select t.{orc} from public.{t} t where t.id = any({ids_sql})) and not (o.id = any({ids_sql}))")
        extra.append(("pre", f"  {mo} into m2;\n"))
        extra.append(("post", f"  {mo} into m3;\n  if m3 is distinct from m2 then raise exception '다른 행 가드 실패: 같은 {orc} 의 대상 밖 행 md5 전후 다름'; end if;\n"))
    pre = "".join(x for w, x in extra if w == "pre")
    post = "".join(x for w, x in extra if w == "post")
    gnames = [f"BEFORE 같은 행 = {n}", f"반영 행 = {n}"] + (["가드 칸 md5"] if g else []) + ([f"원문 부분 문자열({', '.join(subs)})"] if subs else []) \
        + (["열린 공고"] if plan.get("open_only") else []) + (["다른 칸 md5 전후 같음"] if plan.get("other_cols_same") else []) \
        + ([f"같은 {plan['other_rows_same']} 대상 밖 행 md5 전후 같음"] if plan.get("other_rows_same") else [])
    head = f"-- {label} · 표 {t} · 행 {n} · 칸 {', '.join(cols)} · 가드 {g or '없음'} · 가드 목록 {' · '.join(gnames)} · scripts/backfill-kit.py gen"
    def do(final):
        return (f"do $zfdo$\ndeclare n int := 0; k int; g int; s int; m0 text; m1 text; m2 text; m3 text;\nbegin\n"
                f"  select count(*) into g from public.{t} t where {guards};\n"
                f"  if g <> {n} then raise exception '가드 실패: BEFORE 와 같은 행 %/{n} — 그사이 바뀐 행이 있다', g; end if;\n"
                f"{pre}{body}\n"
                f"  if n <> {n} then raise exception '반영 행 수 %/{n}', n; end if;\n"
                f"{post}{final}end $zfdo$;\n")
    test = f"set statement_timeout = '60s';\n{head} · 되돌리기 전용 시험(쓰기 0)\n" + do(
        f"  raise exception 'RESULT 반영 % 행 · 가드 통과 — 되돌리기 전용 시험(쓰기 0)', n;\n")
    apply = f"{head} · 반영(커밋)\n" + do("")
    rb_upd = []
    for r in rows:
        b = before[r["id"]]
        sets = ", ".join(f"{c} = {lit(b['cur'].get(c), types[c])}" for c in r["set"])
        rb_upd.append(f"  update public.{t} t set {sets} where {after_pred(r)};\n  get diagnostics k = row_count; n := n + k;")
    rollback = (f"{head} · 되돌림(지금 값 = 계획 값인 행만 BEFORE 로)\n"
                f"do $zfdo$\ndeclare n int := 0; k int;\nbegin\n" + "\n".join(rb_upd) +
                f"\n  if n <> {n} then raise exception '되돌린 행 수 %/{n} — 계획 값과 다른 행이 있다', n; end if;\nend $zfdo$;\n")
    build_sql.guard_names = gnames
    return test, apply, rollback


def history_stub(plan, label, gnames, rows_n):
    """이력 파일 틀(docs/history.d 꼴) — 빈칸(〈…〉)은 사람이 채운다."""
    import datetime
    kst = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)
    t = plan["table"]
    cols = sorted({c for r in plan["rows"] for c in r["set"]})
    ids = ",".join(r["id"] for r in plan["rows"])
    return (f"# {kst:%Y-%m-%d} — 〈회차 이름〉\n\n우편함 같은 이름 · 〈판정 규칙 · 스킬 판〉.\n\n"
            f"- **운영 DB 데이터 쓰기(관리 API · 〈HH:MM〉 KST 한 트랜잭션)** — `{t}.{', '.join(cols)}` {rows_n}행. 원문 = 〈공고문 · 쪽〉.\n"
            f"- 가드: {' · '.join(gnames)} · 롤백 전용 시험 먼저(〈HH:MM〉 · test.sql RESULT).\n"
            f"- 되돌리기: rollback.sql(지금 값 = 계획 값인 행만 BEFORE 로 · 행 수 {rows_n}) · 대상 id {ids}.\n"
            f"- 계획 파일 {label} · scripts/backfill-kit.py gen.\n")


def fetch_before(plan, it="uuid"):
    t, g = plan["table"], plan.get("guard")
    ids = [r["id"] for r in plan["rows"]]
    cols = sorted({c for r in plan["rows"] for c in r["set"]})
    parts = [f"'id', id"] + ([f"'guard_md5', md5({g}::text)"] if g else []) + [f"'cur', jsonb_build_object({', '.join(f'{dq(c)}, {c}' for c in cols)})"]
    j = q1(f"select json_agg(json_build_object({', '.join(parts)})) from public.{t} where id = any({ids_arr(ids, it)})")
    got = {str(r["id"]): {"guard_md5": r.get("guard_md5"), "cur": r["cur"]} for r in (j or [])}
    missing = [i for i in ids if i not in got]
    if missing:
        raise SystemExit(f"DB 에 없는 행 {len(missing)}: {missing[:3]}")
    return got


def cmd_gen(a):
    plan = load_plan(a.plan)
    types = col_types(plan["table"])
    before = fetch_before(plan, types.get("id", "uuid"))
    label = os.path.basename(a.plan)
    test, apply, rollback = build_sql(plan, types, before, label)
    os.makedirs(a.out, exist_ok=True)
    hist = history_stub(plan, label, build_sql.guard_names, len(plan["rows"]))
    for name, body in (("test.sql", test), ("apply.sql", apply), ("rollback.sql", rollback), ("history.md", hist)):
        open(os.path.join(a.out, name), "w", encoding="utf-8").write(body)
    json.dump({"plan": label, "table": plan["table"], "guard": plan.get("guard"), "rows": before}, open(os.path.join(a.out, "before.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    md = {n: hashlib.md5(open(os.path.join(a.out, n), "rb").read()).hexdigest()[:12] for n in ("test.sql", "apply.sql", "rollback.sql")}
    print(f"행 {len(plan['rows'])} · {a.out}/ test.sql {md['test.sql']} · apply.sql {md['apply.sql']} · rollback.sql {md['rollback.sql']} · before.json · history.md(이력 틀)")
    print(f"다음: python3 scripts/backfill-kit.py run {a.out}/test.sql   # 400 + RESULT 가 정상(쓰기 0)")


def cmd_run(a):
    body = open(a.file, encoding="utf-8").read()
    status, out = api(body, expect_error=True)
    if isinstance(out, str):
        m = re.search(r"RESULT[^\"\\]*", out)
        print(f"HTTP {status} · " + (m.group(0) if m else out[:400]))
        sys.exit(0 if m else 1)
    print(f"HTTP {status} · {json.dumps(out, ensure_ascii=False)[:400]}")


def cmd_diff(a):
    for x in (a.a, a.b):
        if not ANN_RE.match(x):
            raise SystemExit(f"공고 id 꼴 밖: {x!r}")
    j = q1("select json_agg(json_build_object('ann', announcement_id, 'id', id, 'cat', category, 'seq', seq, 'm', md5(content_raw), "
           "'head', left(content_raw, 40), 'plain', content_plain, 'chk', content_plain_check) order by announcement_id, seq) "
           f"from public.announcement_policies where announcement_id in ({dq(a.a)}, {dq(a.b)})")
    rows = j or []
    A = [r for r in rows if r["ann"] == a.a]
    B = [r for r in rows if r["ann"] == a.b]
    if not A or not B:
        raise SystemExit(f"정책 행 — A {len(A)} · B {len(B)}(둘 다 있어야 한다)")
    am = {}
    for r in A:
        am.setdefault(r["m"], []).append(r)
    acat = {r["cat"] for r in A}
    same = [r for r in B if r["m"] in am]
    changed = [r for r in B if r["m"] not in am and r["cat"] in acat]
    only_b = [r for r in B if r["m"] not in am and r["cat"] not in acat]
    bcat = {r["cat"] for r in B}
    only_a = [r for r in A if r["cat"] not in bcat]
    print(f"틀 diff — A {a.a} {len(A)}행 · B {a.b} {len(B)}행")
    print(f"  원문 같음 {len(same)} · 같은 칸 원문 다름 {len(changed)} · B 에만 칸 {len(only_b)} · A 에만 칸 {len(only_a)}")
    for lab, xs in (("같은 칸 원문 다름", changed), ("B 에만", only_b), ("A 에만", only_a)):
        for r in xs[:8]:
            print(f"  {lab}: [{r['cat']}] {r['head']!r}")
        if len(xs) > 8:
            print(f"  {lab}: … 외 {len(xs) - 8}")
    if a.plan_out:
        cp = []
        for r in same:
            src = next((x for x in am[r["m"]] if x["plain"]), None)
            if src and not r["plain"] and not (r["cat"] or "").startswith("⚠"):
                cp.append({"id": r["id"], "from": src["id"], "set": {"content_plain": src["plain"], "content_plain_at": {"sql": "now()"}, "content_plain_check": src["chk"]}})
        json.dump({"table": "announcement_policies", "guard": "content_raw", "note": f"틀 복사 — {a.a} → {a.b} · 원문 md5 같은 행만", "rows": cp},
                  open(a.plan_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  복사 계획 {len(cp)}행 → {a.plan_out}(다음: check → gen)")


def cmd_check(a):
    plan = load_plan(a.plan)
    if plan["table"] != "announcement_policies":
        raise SystemExit("check 는 announcement_policies 계획만(content_raw ↔ content_plain)")
    rows = [r for r in plan["rows"] if "content_plain" in r["set"] and r["set"]["content_plain"] is not None]
    if not rows:
        print("쉽게 쓴 말을 쓰는 행 0 — 볼 것 없음"); return
    j = q1(f"select json_object_agg(id, json_build_object('raw', content_raw, 'cat', category)) from public.announcement_policies where id = any({ids_arr([r['id'] for r in rows])})")
    raw = j or {}
    bad = 0
    for ver, point in ((POINT, True), (None, False)):
        grp = [r for r in rows if (r["set"].get("content_plain_check") == POINT) == point]
        if not grp:
            continue
        pairs = []
        for r in grp:
            if r["id"] not in raw:
                print(f"  ✗ DB 에 없는 행 {r['id']}"); bad += 1; continue
            if (raw[r["id"]]["cat"] or "").startswith("⚠"):
                print(f"  ✗ ⚠️ 행에는 쉽게 쓴 말을 쓰지 않는다 {r['id']}"); bad += 1; continue
            pairs.append({"id": r["id"], "raw": raw[r["id"]]["raw"], "plain": r["set"]["content_plain"]})
        if not pairs:
            continue
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(pairs, f, ensure_ascii=False); tmp = f.name
        cmd = ["node", os.path.join(ROOT, "scripts", "plain-check.mjs")] + (["--point"] if point else []) + ["--json", tmp]
        p = subprocess.run(cmd, capture_output=True, text=True)
        os.unlink(tmp)
        print(f"  {'v3 요점' if point else 'v2'} {len(pairs)}행 — plain-check 종료 {p.returncode}")
        if p.returncode != 0:
            bad += 1
            print("\n".join("    " + x for x in (p.stdout + p.stderr).strip().splitlines()[:20]))
        if point:
            warned = warned_ids(p.stdout)
            unchecked = scope_gate(grp, warned)
            if warned:
                print(f"  ⚠범위 줄임 경고 {len(warned)}행 · 사람 확인 표지(scope_checked) 있음 {len(warned) - len(unchecked)} · 없음 {len(unchecked)}")
            for i in unchecked:
                print(f"    ✗ 경고 행에 사람 확인 표지 없음 {i}"); bad += 1
    print("원문 대조 — " + ("통과" if bad == 0 else f"걸림 {bad}"))
    sys.exit(0 if bad == 0 else 1)


# 🔵 2026-11-20(요점 소급 6회차 0장 3) — 「또는 범위 줄임」 경고 문지기.
#    plain-check 가 ⚠범위 줄임(실패 아님)을 낸 행은 계획 행에 사람 확인 표지 "scope_checked": "<원문과 맞춰 본 근거 한 줄>" 이
#    있어야 check 를 통과한다(set 밖 칸이라 DB 에 쓰이지 않는다). 표지 없이 남으면 걸림 → gen·apply 전에 멈춘다.
def warned_ids(stdout):
    """plain-check CLI 출력에서 ⚠범위 줄임 경고가 붙은 행 id 집합."""
    out, cur = set(), None
    for line in stdout.splitlines():
        m = re.match(r"^[✓✗] (?:통과|실패) (\S+)", line)
        if m:
            cur = m.group(1); continue
        if cur and line.strip().startswith("⚠범위 줄임"):
            out.add(cur)
    return out


def scope_gate(rows, warned):
    """경고 행 가운데 사람 확인 표지가 없는 행 id(계획 순서)."""
    return [r["id"] for r in rows if r["id"] in warned and not str(r.get("scope_checked") or "").strip()]


def main():
    ap = argparse.ArgumentParser(description="소급 회차 틀 — 틀 diff · 원문 대조 · 가드 SQL")
    sp = ap.add_subparsers(dest="cmd", required=True)
    d = sp.add_parser("diff"); d.add_argument("a"); d.add_argument("b"); d.add_argument("--plan-out"); d.set_defaults(f=cmd_diff)
    c = sp.add_parser("check"); c.add_argument("plan"); c.set_defaults(f=cmd_check)
    g = sp.add_parser("gen"); g.add_argument("plan"); g.add_argument("--out", required=True); g.set_defaults(f=cmd_gen)
    r = sp.add_parser("run"); r.add_argument("file"); r.set_defaults(f=cmd_run)
    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
