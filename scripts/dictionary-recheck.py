#!/usr/bin/env python3
"""📚 주거 사전 재계산 — docs/dictionary/*.sql 전부를 운영 DB에 읽기로 돌리고 기준선과 비교한다.

사용법(저장소 뿌리에서):
  python3 scripts/dictionary-recheck.py                      # 전부 실행 → 기준선과 차이 표(마크다운)를 찍는다
  python3 scripts/dictionary-recheck.py --write-baseline     # 이번 결과를 docs/dictionary/recheck-baseline.json으로 저장
  python3 scripts/dictionary-recheck.py --only rent-per-sqm  # 파일 일부만(이름 앞부분)
  python3 scripts/dictionary-recheck.py --from-run R.json    # 관리 API를 다시 부르지 않고 저장해 둔 실행 결과로 비교만
  python3 scripts/dictionary-recheck.py --dump-old ../zipfit-backup/dumps/zipfit_YYYYMMDD.dump
                                                             # 줄어든 줄을 그 덤프(기준선 무렵)와 가장 새 덤프로 로컬 대조 → 줄인 공고 ID
  python3 scripts/dictionary-recheck.py --run-on-dump ../zipfit-backup/dumps/zipfit_YYYYMMDD.dump --save-run old.json
                                                             # 관리 API 대신 지난 덤프로 실행 → 그날 기준선(--baseline old.json으로 비교)
  끝 상태: 오류·시간 초과가 하나라도 있으면 1.

- 읽기만 한다: 파일마다 관리 API `POST /v1/projects/<ref>/database/query`에 파일 내용을 그대로 싣는다(SELECT 한 문장 —
  README). 이 스크립트는 쓰기 호출을 하지 않는다. 쓰기 낱말(insert·update·delete·alter·drop·create·grant·truncate)이
  주석 밖에 있는 파일은 실행하지 않고 「오류(쓰기 낱말)」로 적는다.
- 인증: 클라우드 세션은 프록시가 붙인다(헤더 없음). 다른 곳에서는 환경변수 SUPABASE_ACCESS_TOKEN만 읽는다 — 값은 찍지 않는다.
  프로젝트는 SUPABASE_PROJECT_REF(기본 = supabase/config.toml project_id).
- 부하 분(:x0 · :x5 · :20~:24 · :50~:54)에는 다음 허용 분까지 기다렸다 부른다(--no-wait로 끔).
- 비교 축: 결과 JSON을 잎(경로 → 값)으로 편다. 문자열 목록(…_ex 예시 ID)은 예시라 비교하지 않는다.
  객체 목록은 문자열 칸들로 이름을 붙인다(예 by_std_sido의 std·sido). 숫자 잎은 기본이 「셈」이고,
  이름이 값 꼴(med·lo·hi·rate·pct 등 — VALUE_KEY)이거나 기준선 파일별 value_keys 정규식에 맞으면 「값」이다.
  날짜 꼴 문자열(대조 기간의 끝 등)은 움직여도 판정에 넣지 않고 「날짜」로만 적는다.
  판정 순서: 오류 > 값·결론이 바뀜(값 잎·문자열 잎이 바뀜 · 값 잎이 사라짐 · 0이던 셈이 0이 아니게 됨) > 줄어듦(셈 잎이 줄거나 사라짐)
  > 수만 늘어남(셈 잎이 늘거나 새 잎) > 같음.
- 덤프 대조(--dump-old): 로컬 PostgreSQL(16 · 아래 준비)에 두 덤프의 쓰이는 표만 old·new 스키마로 올리고(pgdumplib),
  줄어든 잎마다 「old에서 공고 X의 행만 new 것으로 바꾸면 그 잎이 주는가」를 후보마다 본다(트랜잭션 롤백).
  후보 = old에 있던 공고 중 쓰이는 표의 행이(시각 칸 빼고) 두 덤프 사이에 바뀐 공고 · 64개씩 무리째 바꿔 보고 줄면 반으로 나눈다.
  새로 생긴 공고가 바꾼 값(중앙값 등)은 이 대조가 답하지 않는다. 개인정보 표는 쓰이지 않는다(덤프에도 데이터 없음).
  get_announcements_deduped()를 부르는 파일은 로컬 대조를 하지 않는다(함수가 public 표를 본다).
  로컬 서버 준비(한 번 · root 컨테이너):
    install -d -o postgres /tmp/rcpg && su postgres -c '/usr/lib/postgresql/16/bin/initdb -D /tmp/rcpg/data -A trust'
    su postgres -c '/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/rcpg/data -o "-p 55432 -k /tmp/rcpg" -l /tmp/rcpg/log start'
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL_DIR = ROOT / "docs" / "dictionary"
BASELINE = SQL_DIR / "recheck-baseline.json"
# 🔵 2026-11-19(우편함 「코드·운영 — 서울 이전 준비 ①」) — 프로젝트 ref 는 supabase/config.toml 의 project_id 한 곳에서 읽는다.
def _project_ref(root):
    m = re.search(r'^project_id\s*=\s*"([a-z0-9]+)"\s*$', open(os.path.join(root, 'supabase', 'config.toml'), encoding='utf-8').read(), re.M)
    if not m:
        raise SystemExit('supabase/config.toml 에 project_id 가 없다')
    return m.group(1)
REF = os.environ.get("SUPABASE_PROJECT_REF") or _project_ref(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
API = f"https://api.supabase.com/v1/projects/{REF}/database/query"
KST = dt.timezone(dt.timedelta(hours=9))
WRITE_WORDS = re.compile(r"\b(insert|update|delete|alter|drop|create|grant|revoke|truncate|copy|vacuum|call)\b", re.I)
VALUE_KEY = re.compile(r"(^|_)(med|median|avg|mean|lo|hi|min|max|rate|pct|ratio|v)$|중앙|이율|비율|금액|배$", re.I)


# ── 실행 ─────────────────────────────────────────────────────────────
def strip_comments(sql: str) -> str:
    return "\n".join(l for l in sql.splitlines() if not l.lstrip().startswith("--"))


def blocked_minute(now: dt.datetime) -> bool:
    m = now.minute
    return m % 5 == 0 or 20 <= m <= 24 or 50 <= m <= 54


def wait_allowed():
    while blocked_minute(dt.datetime.now(KST)):
        time.sleep(15)


def run_sql(sql: str, timeout: float) -> dict:
    import requests  # 클라우드 컨테이너: HTTPS_PROXY · REQUESTS_CA_BUNDLE을 저절로 쓴다

    headers = {"Content-Type": "application/json"}
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    t0 = time.time()
    for attempt in range(3):  # 연결이 끊기면(프록시 reset 등) 두 번까지 다시 — 읽기만이라 되풀이해도 안전하다
        try:
            r = requests.post(API, data=json.dumps({"query": sql}, ensure_ascii=False).encode("utf-8"),
                              headers=headers, timeout=timeout)
            break
        except requests.exceptions.Timeout:
            return {"status": "timeout", "seconds": round(time.time() - t0, 1)}
        except requests.exceptions.ConnectionError as e:
            if attempt == 2:
                return {"status": "error", "seconds": round(time.time() - t0, 1),
                        "error": f"연결 실패 3회: {type(e).__name__}"}
            time.sleep(10 * (attempt + 1))
    sec = round(time.time() - t0, 1)
    if r.status_code == 502 or (r.status_code >= 500 and "upstream" in r.text):
        return {"status": "timeout", "seconds": sec, "error": f"HTTP {r.status_code}"}
    if r.status_code != 201 and r.status_code != 200:
        return {"status": "error", "seconds": sec, "error": f"HTTP {r.status_code}: {r.text[:300]}"}
    rows = r.json()
    if isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict) and len(rows[0]) == 1:
        result = next(iter(rows[0].values()))
    else:
        result = rows
    return {"status": "ok", "seconds": sec, "result": result}


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "?"


def run_all(files: list[Path], wait: bool, timeout: float) -> dict:
    out = {}
    for f in files:
        sql = f.read_text(encoding="utf-8")
        if WRITE_WORDS.search(strip_comments(sql)):
            out[f.name] = {"status": "error", "error": "쓰기 낱말 — 실행하지 않음", "sha256": sha(sql)}
            print(f"  {f.name}: 쓰기 낱말 — 건너뜀", file=sys.stderr)
            continue
        if wait:
            wait_allowed()
        res = run_sql(sql, timeout)
        res["sha256"] = sha(sql)
        res["ran_at"] = dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S KST")
        out[f.name] = res
        print(f"  {f.name}: {res['status']} {res.get('seconds')}s", file=sys.stderr)
    return out


# ── 펴기·비교 ────────────────────────────────────────────────────────
def is_num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


DATE_LIKE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def id_fields(d: dict) -> list[str]:
    """객체 목록 한 칸의 이름이 되는 문자열 칸 — 날짜·숫자 꼴·긴 글(메모)은 뺀다(회차마다 움직인다)."""
    return [f"{k}={v}" for k, v in sorted(d.items())
            if isinstance(v, str) and not DATE_LIKE.match(v) and not re.fullmatch(r"-?\d+(\.\d+)?", v) and len(v) <= 40]


def flatten(v, path="", leaves=None, examples=None):
    if leaves is None:
        leaves, examples = {}, {}
    if isinstance(v, dict):
        for k, x in v.items():
            flatten(x, f"{path}.{k}" if path else str(k), leaves, examples)
    elif isinstance(v, list):
        if all(not isinstance(x, (dict, list)) for x in v):
            if all(is_num(x) for x in v) and v:
                for i, x in enumerate(v):
                    leaves[f"{path}[{i}]"] = x
            else:
                examples[path] = v
        elif all(isinstance(x, dict) for x in v) and v and all(id_fields(x) for x in v):
            for x in v:
                p = f"{path}[{'|'.join(id_fields(x))}]"
                for k, y in x.items():
                    if not (isinstance(y, str) and f"{k}={y}" in id_fields(x)):
                        flatten(y, f"{p}.{k}", leaves, examples)
        else:
            examples[path] = v  # 이름 없는 객체 목록(순위표 top N 등)은 예시로 본다
    else:
        if isinstance(v, str) and re.fullmatch(r"-?\d+(\.\d+)?", v):
            v = float(v) if "." in v else int(v)  # 관리 API는 bigint를 문자열로 돌려준다 — 로컬 실행과 맞춘다
        leaves[path or "."] = v
    return leaves, examples


def is_value_path(path: str, extra: re.Pattern | None) -> bool:
    last = re.sub(r"\[[^\]]*\]", "", path).split(".")[-1]
    return bool(VALUE_KEY.search(last)) or bool(extra and extra.search(path))


def compare(base_res, now_res, value_keys: str | None = None) -> dict:
    extra = re.compile(value_keys) if value_keys else None
    b, _ = flatten(base_res)
    n, _ = flatten(now_res)
    up, down, changed, added, removed, dates = [], [], [], [], [], []
    for p in sorted(set(b) | set(n)):
        if any(isinstance(x.get(p), str) and DATE_LIKE.match(x.get(p)) for x in (b, n)):
            if b.get(p) != n.get(p):
                dates.append((p, b.get(p), n.get(p)))
            continue
        if p not in n:
            (changed if (not is_num(b[p]) or is_value_path(p, extra)) else removed).append((p, b[p], None))
        elif p not in b:
            added.append((p, None, n[p]))
        elif b[p] != n[p]:
            if is_num(b[p]) and is_num(n[p]) and not is_value_path(p, extra):
                if b[p] == 0:
                    changed.append((p, b[p], n[p]))  # 「0」(없음)이던 셈이 생김 — 「없다」는 결론이 깨진다
                else:
                    (up if n[p] > b[p] else down).append((p, b[p], n[p]))
            else:
                changed.append((p, b[p], n[p]))
    if changed:
        verdict = "값·결론이 바뀜"
    elif down or removed:
        verdict = "줄어듦"
    elif up or added:
        verdict = "수만 늘어남"
    else:
        verdict = "같음"
    return {"verdict": verdict, "up": up, "down": down + removed, "changed": changed, "added": added, "dates": dates}


def fmt(x) -> str:
    if x is None:
        return "∅"
    if isinstance(x, float) and x.is_integer():
        x = int(x)
    return str(x)


def short(items, limit=6) -> str:
    s = " · ".join(f"{p} {fmt(a)}→{fmt(c)}" for p, a, c in items[:limit])
    return s + (f" 외 {len(items) - limit}" if len(items) > limit else "")


def head_values(res, limit=6) -> str:
    leaves, _ = flatten(res)
    top = [(p, v) for p, v in leaves.items() if "." not in p and "[" not in p]
    pick = top or list(leaves.items())
    s = " · ".join(f"{p} {fmt(v)}" for p, v in pick[:limit])
    return s + (" …" if len(pick) > limit else "")


def report(now: dict, base: dict | None) -> tuple[str, dict]:
    rows, verdicts = [], {}
    bfiles = (base or {}).get("files", {})
    for name in sorted(now):
        r = now[name]
        if r["status"] != "ok":
            v = "오류" if r["status"] == "error" else "시간 초과"
            rows.append(f"| {name} | {v} | {fmt(r.get('seconds'))} | {r.get('error', '')[:120]} | — |")
            verdicts[name] = {"verdict": v}
            continue
        bf = bfiles.get(name)
        if not bf or bf.get("status") != "ok":
            rows.append(f"| {name} | 기준선 없음 | {fmt(r['seconds'])} | {head_values(r['result'])} | — |")
            verdicts[name] = {"verdict": "기준선 없음"}
            continue
        c = compare(bf["result"], r["result"], bf.get("value_keys"))
        note = []
        if bf.get("sha256") != r.get("sha256"):
            note.append("⚠️ 파일 바뀜")
        if c["changed"]:
            note.append("값 " + short(c["changed"]))
        if c["down"]:
            note.append("줄어듦 " + short(c["down"]))
        if c["dates"]:
            note.append("날짜 " + short(c["dates"], 2))
        if c["up"] or c["added"]:
            note.append(f"늘어남 {len(c['up'])} · 새 잎 {len(c['added'])}")
        rows.append(f"| {name} | {c['verdict']} | {fmt(r['seconds'])} | {head_values(r['result'])} | {' / '.join(note) or '—'} |")
        verdicts[name] = c
    md = ["| SQL 파일 | 차이 | 초 | 지금 핵심 값(맨 위 잎) | 바뀐 잎 |", "|---|---|---|---|---|", *rows]
    tally = {}
    for v in verdicts.values():
        tally[v["verdict"]] = tally.get(v["verdict"], 0) + 1
    md.append("")
    md.append("합계: " + " · ".join(f"{k} {n}" for k, n in sorted(tally.items())))
    return "\n".join(md), verdicts


# ── 덤프 대조 ─────────────────────────────────────────────────────────
def psql(port: int, sql: str, db="rc", check=True) -> str:
    p = subprocess.run(["psql", "-h", "/tmp/rcpg", "-p", str(port), "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1",
                        "-qAt", "-f", "-"], input=sql, text=True, capture_output=True)
    if check and p.returncode != 0:
        raise RuntimeError(p.stderr[-800:])
    return p.stdout


def copy_text(v) -> str:
    if v is None:
        return r"\N"
    s = str(v)
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def plain_table_ddl(defn: str, schema: str, tag: str, keep_generated=True) -> tuple[str, list[str]]:
    """덤프의 CREATE TABLE에서 칸 이름·형만 남긴다(기본값·제약은 로컬 대조에 필요 없고 함수에 기댄다).
    생성 칸(GENERATED … STORED)은 식째 남긴다 — 덤프 데이터에 없으므로 COPY 칸 목록에서 뺀다."""
    body = defn[defn.index("(") + 1: defn.rindex(")")]
    cols, copy_cols = [], []
    for line in body.splitlines():
        s = line.strip().rstrip(",")
        if not s or s.startswith("CONSTRAINT"):
            continue
        name = s.split()[0]
        if " GENERATED ALWAYS AS " in s:
            if keep_generated:
                cols.append(re.sub(r"\s+NOT NULL\s*$", "", s))
            continue
        cols.append(re.split(r"\s+(DEFAULT|NOT NULL|GENERATED|COLLATE|CONSTRAINT)\b", s)[0])
        copy_cols.append(name)
    return f"create table {schema}.{tag} (\n  " + ",\n  ".join(cols) + "\n);", copy_cols


def load_dump(port: int, dump: Path, schema: str, tables: set[str]) -> None:
    import pgdumplib

    d = pgdumplib.load(str(dump))
    psql(port, f"drop schema if exists {schema} cascade; create schema {schema};")
    # 생성 칸이 부르는 함수(예 public.announcement_dedup_key)는 public에 덤프 정의 그대로 먼저 만든다
    tdefs = " ".join(e.defn for e in d.entries if e.desc == "TABLE" and e.namespace == "public" and e.tag in tables)
    fnames = set(re.findall(r"public\.([a-z_][a-z0-9_]*)\(", tdefs))
    for e in d.entries:
        if e.desc == "FUNCTION" and e.namespace == "public" and e.tag.split("(")[0] in fnames:
            psql(port, "create schema if not exists public;\n" + e.defn.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1),
                 check=False)
    for e in d.entries:
        if e.desc == "TABLE" and e.namespace == "public" and e.tag in tables:
            ddl, copy_cols = plain_table_ddl(e.defn, schema, e.tag)
            try:
                psql(port, ddl)
            except RuntimeError:
                ddl, copy_cols = plain_table_ddl(e.defn, schema, e.tag, keep_generated=False)
                psql(port, ddl)
            buf = "\n".join("\t".join(copy_text(x) for x in row) for row in d.table_data("public", e.tag))
            p = subprocess.run(["psql", "-h", "/tmp/rcpg", "-p", str(port), "-U", "postgres", "-d", "rc", "-v",
                                "ON_ERROR_STOP=1", "-c", f"copy {schema}.{e.tag}({','.join(copy_cols)}) from stdin"],
                               input=buf + ("\n" if buf else ""), text=True, capture_output=True)
            if p.returncode != 0:
                raise RuntimeError(f"{e.tag}: {p.stderr[-400:]}")


def sql_tables(sql: str, known: set[str]) -> set[str]:
    words = set(re.findall(r"\b[a-z_][a-z0-9_]*\b", strip_comments(sql).lower()))
    return words & known


def dump_tables(dump: Path) -> set[str]:
    import pgdumplib

    d = pgdumplib.load(str(dump))
    return {e.tag for e in d.entries if e.desc == "TABLE" and e.namespace == "public"}


def run_local(port: int, sql: str, schema: str, swap: list[str] | None = None, cols: dict | None = None) -> object:
    """swap: old 스키마에서 이 공고들의 행만 new 것으로 바꾼 상태로 실행하고 되돌린다(트랜잭션 롤백)."""
    pre = f"set search_path={schema},public;\n"
    if swap:
        ids = "array[" + ",".join("'" + x.replace("'", "''") + "'" for x in swap) + "]"
        pre = "begin;\n" + pre
        for t, cl in cols.items():
            c = ",".join(cl)
            pre += (f"delete from old.{t} where announcement_id::text = any({ids});\n"
                    f"insert into old.{t}({c}) select {c} from new.{t} where announcement_id::text = any({ids});\n")
    body = strip_comments(sql).strip().rstrip(";")
    q = pre + f"select coalesce(json_agg(x), '[]') from ({body}) x;\n" + ("rollback;\n" if swap else "")
    rows = json.loads(psql(port, q))  # -q: 앞 문장은 아무것도 찍지 않는다 · json_agg는 여러 줄
    if len(rows) == 1 and isinstance(rows[0], dict) and len(rows[0]) == 1:
        return next(iter(rows[0].values()))  # 관리 API 결과와 같은 꼴(run_sql)
    return rows


def dump_compare(port: int, old_dump: Path, new_dump: Path, files: dict[str, str], down: dict[str, list]) -> dict:
    known = dump_tables(new_dump) & dump_tables(old_dump)
    need = set()
    for name in down:
        need |= sql_tables(files[name], known)
    print(f"  덤프 올림: 표 {len(need)} — {old_dump.name} → old · {new_dump.name} → new", file=sys.stderr)
    subprocess.run(["psql", "-h", "/tmp/rcpg", "-p", str(port), "-U", "postgres", "-d", "postgres", "-qAt", "-c",
                    "create database rc"], capture_output=True, text=True)
    load_dump(port, old_dump, "old", need)
    load_dump(port, new_dump, "new", need)
    result = {}
    for name, leaves in down.items():
        sql = files[name]
        tabs = sql_tables(sql, need)
        if "get_announcements_deduped" in strip_comments(sql):
            result[name] = {"error": "함수(get_announcements_deduped)를 불러 로컬 대조 불가"}
            continue
        cols, idq = {}, []
        for t in sorted(tabs):
            info = psql(port, f"select o.column_name, o.data_type, o.is_generated from information_schema.columns o "
                              f"join information_schema.columns n on n.table_schema='new' and n.table_name=o.table_name "
                              f"and n.column_name=o.column_name and n.is_generated=o.is_generated "
                              f"where o.table_schema='old' and o.table_name='{t}' order by o.ordinal_position;")
            info = [l.split("|") for l in info.splitlines() if l]
            cl = [c for c, _, g in info if g == "NEVER"]  # 생성 칸은 넣을 수 없다 — 다시 계산된다
            if "announcement_id" not in cl:
                continue
            cols[t] = cl
            # 바뀜 판정에서 시각 칸(수집이 매 회 바꾸는 updated_at 등)은 뺀다
            hc = ",".join(c for c, ty, _ in info if c in cl and not ty.startswith("timestamp")) or "announcement_id"
            idq.append(f"select announcement_id::text from (select announcement_id, md5(string_agg(r::text, '|' order by r::text)) h "
                       f"from (select announcement_id, ({hc}) r from old.{t}) o group by 1 "
                       f"except select announcement_id, md5(string_agg(r::text, '|' order by r::text)) "
                       f"from (select announcement_id, ({hc}) r from new.{t}) o group by 1) z")
        old_ids = set(psql(port, "select distinct announcement_id::text from old.announcements;").split()) \
            if "announcements" in tabs else None
        cands = sorted(set(psql(port, " union ".join(idq) + ";").split())) if idq else []
        if old_ids is not None:
            cands = [x for x in cands if x in old_ids]  # 새로 생긴 공고는 셈을 줄이지 않는다
        try:
            old_res = run_local(port, sql, "old")
            new_res = run_local(port, sql, "new")
        except RuntimeError as e:
            result[name] = {"error": f"로컬 실행 오류: {str(e)[:200]}"}
            continue
        ol, _ = flatten(old_res)
        nl, _ = flatten(new_res)
        targets = [p for p, _, _ in leaves if is_num(ol.get(p))]
        drops = {p: [] for p, _, _ in leaves}
        errors = []

        def lowered(group):
            try:
                mix, _ = flatten(run_local(port, sql, "old", swap=group, cols=cols))
            except RuntimeError as e:
                errors.append(str(e).strip().splitlines()[-1][:160])
                return set()
            return {p for p in targets if mix.get(p) is None or mix.get(p) < ol[p]}

        def search(group, ps):
            # 무리 시험: 무리째 바꿔 잎이 줄면 반으로 나눠 내려간다(하나가 될 때까지)
            hit = lowered(group) & ps
            if not hit:
                return
            if len(group) == 1:
                for p in hit:
                    drops[p].append(group[0])
                return
            mid = len(group) // 2
            search(group[:mid], hit)
            search(group[mid:], hit)

        for i in range(0, len(cands), 64):
            search(cands[i:i + 64], set(targets))
        result[name] = {"candidates": len(cands), "errors": errors[:3],
                        "leaves": {p: {"old_dump": ol.get(p), "new_dump": nl.get(p), "dropped_by": drops[p]} for p in drops}}
        print(f"  {name}: 후보 {len(cands)} · " + " · ".join(f"{p} {len(v)}" for p, v in drops.items()), file=sys.stderr)
    return result


def run_on_dump(port: int, dump: Path, texts: dict[str, str]) -> dict:
    known = dump_tables(dump)
    need = set().union(*(sql_tables(t, known) for t in texts.values()))
    subprocess.run(["psql", "-h", "/tmp/rcpg", "-p", str(port), "-U", "postgres", "-d", "postgres", "-qAt", "-c",
                    "create database rc"], capture_output=True, text=True)
    print(f"덤프 {dump.name} → 로컬 old 스키마(표 {len(need)})", file=sys.stderr)
    load_dump(port, dump, "old", need)
    out = {}
    for name, sql in sorted(texts.items()):
        t0 = time.time()
        try:
            res = {"status": "ok", "result": run_local(port, sql, "old")}
        except RuntimeError as e:
            res = {"status": "error", "error": "로컬: " + str(e).strip().splitlines()[0][:200]}
        res.update(seconds=round(time.time() - t0, 1), sha256=sha(sql), ran_at=f"덤프 {dump.name}")
        out[name] = res
        print(f"  {name}: {res['status']}", file=sys.stderr)
    return out


# ── 진입 ─────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--write-baseline", action="store_true")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--from-run", type=Path, help="저장해 둔 실행 결과 JSON(관리 API를 부르지 않는다)")
    ap.add_argument("--save-run", type=Path, help="이번 실행 결과 JSON을 이 경로에 저장")
    ap.add_argument("--run-on-dump", type=Path, help="관리 API 대신 이 덤프를 로컬에 올려 실행(지난 날 기준선 만들기 · --pg-port)")
    ap.add_argument("--no-wait", action="store_true")
    ap.add_argument("--timeout", type=float, default=45)
    ap.add_argument("--dump-old", type=Path)
    ap.add_argument("--dump-new", type=Path, help="기본: --dump-old와 같은 폴더의 가장 새 덤프")
    ap.add_argument("--pg-port", type=int, default=55432)
    ap.add_argument("--json-out", type=Path, help="판정·덤프 대조 결과 JSON")
    a = ap.parse_args()

    files = sorted(SQL_DIR.glob("*.sql"))
    if a.only:
        files = [f for f in files if any(f.name.startswith(o) for o in a.only)]
    texts = {f.name: f.read_text(encoding="utf-8") for f in files}

    if a.run_on_dump:
        now = run_on_dump(a.pg_port, a.run_on_dump, texts)
    elif a.from_run:
        src = json.loads(a.from_run.read_text(encoding="utf-8"))
        now = {k: v for k, v in src["files"].items() if k in texts}
    else:
        print(f"실행 {len(files)} 파일 · main {git_sha()}", file=sys.stderr)
        now = run_all(files, wait=not a.no_wait, timeout=a.timeout)
    run_doc = {"version": 1, "generated_at": dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
               "main_sha": git_sha(), "project_ref": REF, "files": now}
    if a.from_run:  # 저장해 둔 실행이면 그때 시각·main을 그대로 둔다
        run_doc.update({k: src[k] for k in ("generated_at", "main_sha") if k in src})
    if a.save_run:
        a.save_run.write_text(json.dumps(run_doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    base = json.loads(a.baseline.read_text(encoding="utf-8")) if a.baseline.exists() else None
    md, verdicts = report(now, base)
    if base:
        print(f"기준선: {a.baseline.name} · {base.get('generated_at')} · main {base.get('main_sha')}\n")
    print(md)

    extra = {}
    if a.dump_old:
        down = {n: v["down"] for n, v in verdicts.items() if v.get("down")}
        if down:
            new_dump = a.dump_new or sorted(a.dump_old.parent.glob("zipfit_*.dump"))[-1]
            extra = dump_compare(a.pg_port, a.dump_old, new_dump, texts, down)
            print("\n덤프 대조(줄어든 잎을 줄인 공고):")
            for n, r in extra.items():
                if "error" in r:
                    print(f"- {n}: {r['error']}")
                    continue
                for p, x in r["leaves"].items():
                    print(f"- {n} · {p}: 덤프 {fmt(x['old_dump'])}→{fmt(x['new_dump'])} · 줄인 공고 {', '.join(x['dropped_by']) or '없음(개별로는 못 찾음)'}")
        else:
            print("\n덤프 대조: 줄어든 줄 없음")
    if a.json_out:
        a.json_out.write_text(json.dumps({"verdicts": verdicts, "dump_compare": extra}, ensure_ascii=False, indent=1,
                                         default=str) + "\n", encoding="utf-8")

    if a.write_baseline:
        keep = (base or {}).get("files", {})
        if a.only:  # 일부만 돌렸으면 나머지 파일의 기준선은 그대로 둔다
            run_doc["files"] = {**keep, **now}
        for k, v in now.items():
            if keep.get(k, {}).get("value_keys"):
                v["value_keys"] = keep[k]["value_keys"]
        a.baseline.write_text(json.dumps(run_doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"\n기준선 저장: {a.baseline.relative_to(ROOT)}", file=sys.stderr)
    if any(v.get("status") != "ok" for v in now.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
