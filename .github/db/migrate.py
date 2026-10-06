#!/usr/bin/env python3
"""DB 스키마·함수 변경 — PR 병합 = 적용 (2026-09-30 신설 · 우편함 「운영 — DB 함수·스키마 변경도 PR 병합 = 적용」)

쓰는 법:
  migrate.py check   PR 체크 — 아직 적용 안 된 변경 파일을 **되돌리기 전용** 트랜잭션으로 실제 DB에서 돌린다.
  migrate.py apply   main 병합 뒤 — 아직 적용 안 된 파일을 하나씩, 파일마다 한 트랜잭션으로 적용한다.

규칙(정본은 supabase/migrations/README.md):
  🔴 되돌리기 전용 증명 — check 는 적용 SQL 끝에 결과를 담은 예외를 던져 요청 전체를 롤백시키고(관리 API: 요청 하나 = 트랜잭션 하나),
     전·후 스키마 지문(md5)이 같은지로 「운영 DB가 바뀌지 않았다」를 확인한다. 다르면 실패.
  🔴 한 번만 — 적용 기록은 zipfit_ops.schema_migrations(파일명·sha256). 적용 SQL과 기록 INSERT가 한 트랜잭션이라
     같은 커밋을 다시 돌려도 기록이 있으면 건너뛴다. 기록된 파일이 나중에 바뀌면(sha256 다름) 실패.
  🔴 적용 뒤 대조 — 파일이 건드린 함수마다 DB 정의 md5 = supabase/rpc/<이름>.sql 사본 md5 · ACL·SECURITY DEFINER = 파일 머리의 선언.
비밀값: SUPABASE_ACCESS_TOKEN(기존 Actions Secret) 하나. 어떤 값도 출력하지 않는다.
결과: db-result.json · db-summary.md(작업 요약) · 이슈 알림용 health-result.json/health-summary.md 사본.
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

PROJECT_REF = 'khdpjjyspmlqtzperoqg'
API = f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MIG_DIR = os.path.join(ROOT, 'supabase', 'migrations')
RPC_DIR = os.path.join(ROOT, 'supabase', 'rpc')
INV_FILE = os.path.join(ROOT, 'supabase', 'invariants', 'v3.7.sql')
FILE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}_\d{2}_[a-z0-9_]+\.sql$')
LEDGER = 'zipfit_ops.schema_migrations'
ANON_LIMIT_MS = 3000
CHECK_TAG = 'ZIPFIT_CHECK_RESULT'


# ───────────────────────── 관리 API ─────────────────────────
def query(sql, read_only=False):
    """관리 API 로 SQL 을 보낸다. (http 상태, 본문 텍스트)를 돌려준다 — 400 도 예외로 바꾸지 않는다(check 가 그 메시지를 읽는다)."""
    body = ('set transaction read only;\n' + sql) if read_only else sql
    headers = {'Content-Type': 'application/json'}
    tok = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if tok:
        headers['Authorization'] = 'Bearer ' + tok
    req = urllib.request.Request(API, data=json.dumps({'query': body}).encode('utf-8'), headers=headers, method='POST')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=150) as r:
                return r.status, r.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            txt = e.read().decode('utf-8', 'replace')
            if e.code in (502, 503, 504) and attempt < 2:
                time.sleep(3 * (attempt + 1))
                continue
            return e.code, txt
        except urllib.error.URLError:
            if attempt < 2:
                time.sleep(3 * (attempt + 1))
                continue
            raise


def read(sql):
    st, txt = query(sql, read_only=True)
    if st not in (200, 201):
        raise RuntimeError(f'읽기 실패 {st}: {txt[:400]}')
    return json.loads(txt)


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def dq(s, tag):
    """달러 인용 — 본문에 같은 태그가 있으면 멈춘다(주입 방지)."""
    t = f'${tag}$'
    if t in s:
        raise ValueError(f'SQL 안에 예약 태그 {t} 가 있다')
    return f'{t}{s}{t}'


# ───────────────────────── 파일 규칙 ─────────────────────────
DOLLAR_RE = re.compile(r'\$([A-Za-z_][A-Za-z0-9_]*|)\$.*?\$\1\$', re.S)  # 빈 태그($$)도 그룹이 잡혀야 \1 이 맞는다
LINE_COMMENT_RE = re.compile(r'--[^\n]*')
BLOCK_COMMENT_RE = re.compile(r'/\*.*?\*/', re.S)
STRING_RE = re.compile(r"'(?:[^']|'')*'")
FORBIDDEN = [
    (re.compile(r'(^|;)\s*(begin|commit|rollback|end|abort)\s*(transaction|work)?\s*;', re.I | re.M), '트랜잭션 제어(BEGIN·COMMIT·ROLLBACK·END) — 파일마다 한 트랜잭션은 워크플로가 만든다'),
    (re.compile(r'\b(start\s+transaction|savepoint|release\s+savepoint|prepare\s+transaction)\b', re.I), '트랜잭션 제어'),
    (re.compile(r'\bconcurrently\b', re.I), 'CONCURRENTLY — 트랜잭션 안에서 돌 수 없다'),
    (re.compile(r'\bvacuum\b', re.I), 'VACUUM — 트랜잭션 안에서 돌 수 없다'),
    (re.compile(r'\b(set|reset)\s+(local\s+|session\s+)?(role|session\s+authorization)\b', re.I), '역할 바꾸기 — 검사가 쓰는 자리다'),
    (re.compile(r'\bzipfit\.check\b|\bzipfit_ops\.schema_migrations\b', re.I), '적용 기록·검사 자리를 직접 건드림'),
]
TOUCH_RE = re.compile(r'(?<!execute\s)\b(?:function|procedure)\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(', re.I)
DIRECTIVE_FN_RE = re.compile(r'^--\s*zipfit:function\s+(?:public\.)?([a-z_][a-z0-9_]*\([^)]*\))\s+acl=(\{[^}]*\}|null)\s+secdef=(true|false)\s*$', re.I | re.M)
DIRECTIVE_DROP_RE = re.compile(r'^--\s*zipfit:dropped\s+(?:public\.)?([a-z_][a-z0-9_]*\([^)]*\))\s*$', re.I | re.M)
DIRECTIVE_ANON_RE = re.compile(r'^--\s*zipfit:anon\s+(.+?)\s*$', re.I | re.M)


def code_only(sql):
    s = DOLLAR_RE.sub(' ', sql)
    s = BLOCK_COMMENT_RE.sub(' ', s)
    s = LINE_COMMENT_RE.sub(' ', s)
    return STRING_RE.sub("''", s)


def parse(path):
    name = os.path.basename(path)
    raw = open(path, encoding='utf-8').read()
    errs = []
    if not FILE_RE.match(name):
        errs.append(f'파일 이름이 규칙(YYYY-MM-DD_NN_소문자_이름.sql) 밖이다: {name}')
    code = code_only(raw)
    for rx, why in FORBIDDEN:
        if rx.search(code):
            errs.append(f'{name}: {why}')
    if not code.strip().rstrip().endswith(';'):
        errs.append(f'{name}: 마지막 문장이 ; 로 끝나지 않는다')
    touched = sorted({m.group(1).lower() for m in TOUCH_RE.finditer(code)})
    fns = {}
    for sig, acl, sd in DIRECTIVE_FN_RE.findall(raw):
        sig = re.sub(r'\s+', '', sig).lower()
        fns[sig] = {'acl': None if acl.lower() == 'null' else acl, 'secdef': sd.lower() == 'true'}
    dropped = {re.sub(r'\s+', '', s).lower() for s in DIRECTIVE_DROP_RE.findall(raw)}
    declared = {s.split('(')[0] for s in list(fns) + list(dropped)}
    for t in touched:
        if t not in declared:
            errs.append(f'{name}: 함수 {t} 를 건드리는데 머리에 「-- zipfit:function {t}(인자) acl={{…}} secdef=true|false」 선언이 없다')
    anon = DIRECTIVE_ANON_RE.findall(raw)
    return {'name': name, 'path': path, 'sql': raw, 'sha256': hashlib.sha256(raw.encode('utf-8')).hexdigest(),
            'touched': touched, 'functions': fns, 'dropped': sorted(dropped), 'anon': anon, 'errors': errs}


def rpc_md5(fname):
    p = os.path.join(RPC_DIR, fname + '.sql')
    if not os.path.exists(p):
        return None
    s = open(p, encoding='utf-8').read()
    return {hashlib.md5(s.encode('utf-8')).hexdigest(), hashlib.md5(s.rstrip('\n').encode('utf-8')).hexdigest()}


def invariants_sql():
    q = open(INV_FILE, encoding='utf-8').read().strip()
    q = q.rstrip(';').strip()
    return q


# ───────────────────────── 지문·기록 ─────────────────────────
SNAPSHOT_SQL = r"""
with s as (select oid, nspname from pg_namespace where nspname in ('public','zipfit_ops'))
select md5(coalesce((select string_agg(x, E'\n' order by x) from (
  select 'N|'||s.nspname||'|'||coalesce(n.nspacl::text,'') x from s join pg_namespace n on n.oid=s.oid
  union all
  select 'F|'||s.nspname||'|'||p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))||'|'||coalesce(p.proacl::text,'')||'|'||p.prosecdef::text||'|'||coalesce(p.proconfig::text,'')||'|'||coalesce(obj_description(p.oid,'pg_proc'),'')
    from pg_proc p join s on s.oid=p.pronamespace where p.prokind in ('f','p')
  union all
  select 'R|'||s.nspname||'|'||c.relname||'|'||c.relkind::text||'|'||coalesce(c.relacl::text,'')||'|'||c.relrowsecurity::text||'|'||coalesce(obj_description(c.oid,'pg_class'),'')
    from pg_class c join s on s.oid=c.relnamespace
  union all
  select 'A|'||s.nspname||'|'||c.relname||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||'|'||coalesce(a.attacl::text,'')
    from pg_attribute a join pg_class c on c.oid=a.attrelid join s on s.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attnum>0 and not a.attisdropped
  union all
  select 'P|'||schemaname||'|'||tablename||'|'||policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
    from pg_policies where schemaname in ('public','zipfit_ops')
  union all
  select 'T|'||s.nspname||'|'||t.tgname||'|'||pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join s on s.oid=c.relnamespace where not t.tgisinternal
) z), '')) as fp
"""


def fingerprint():
    return read(SNAPSHOT_SQL)[0]['fp']


# 적용 기록 자리 — 따로 파일을 두지 않고 check·apply 트랜잭션 맨 앞에서 매번 만든다(있으면 그대로).
# 🔴 public 밖(zipfit_ops)에 둔다 — zipfit-backup 의 덤프(--schema=public)·schema_guard 가 보지 않고, REST 로도 노출되지 않는다.
BOOTSTRAP_SQL = f"""create schema if not exists zipfit_ops;
revoke all on schema zipfit_ops from public, anon, authenticated;
create table if not exists {LEDGER} (
  filename text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now(),
  git_commit text,
  run_url text
);
alter table {LEDGER} enable row level security;
revoke all on {LEDGER} from public, anon, authenticated;
"""


def ledger_safe():
    exists = read(f"select to_regclass('{LEDGER}') is not null as e")[0]['e']
    if not exists:
        return {}
    rows = read(f"select filename, sha256, applied_at from {LEDGER} order by filename")
    return {r['filename']: r for r in rows}


def functions_info(names):
    if not names:
        return {}
    arr = 'array[' + ','.join(lit(n) for n in names) + ']::text[]'
    rows = read(f"""select p.proname as name, p.oid::regprocedure::text as sig, md5(pg_get_functiondef(p.oid)) as md5,
        p.proacl::text as acl, p.prosecdef as secdef
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname = any({arr}) order by 2""")
    out = {}
    for r in rows:
        out.setdefault(r['name'], []).append(r)
    return out


# ───────────────────────── 대조 ─────────────────────────
def compare_functions(files, info):
    """info: {이름: [{sig, md5, acl, secdef, def?}]} — 파일 선언·rpc 사본과 대조해 (행 목록, 실패 수)를 돌려준다."""
    rows, fails = [], 0
    want = {}
    dropped = set()
    for f in files:
        want.update(f['functions'])
        dropped.update(f['dropped'])
    names = sorted({s.split('(')[0] for s in list(want) + list(dropped)})
    for n in names:
        got = info.get(n, [])
        rp = rpc_md5(n)
        if len(got) > 1:
            rows.append((n, '❌', f'같은 이름 함수가 {len(got)}개 — rpc/<이름>.sql 한 파일로 대조할 수 없다'))
            fails += 1
            continue
        if not got:
            sig_dropped = any(s.split('(')[0] == n for s in dropped)
            if sig_dropped and rp is None:
                rows.append((n, '✅', '지웠다 · rpc 사본도 없다'))
            else:
                rows.append((n, '❌', '함수가 없다' + (' — rpc 사본은 남아 있다(지웠으면 사본도 지운다)' if rp else '')))
                fails += 1
            continue
        g = got[0]
        sig = re.sub(r'\s+', '', g['sig']).lower().replace('public.', '')
        problems = []
        if rp is None:
            problems.append(f'supabase/rpc/{n}.sql 이 없다(새 함수면 적용 뒤 정의를 사본으로 둔다)')
        elif g['md5'] not in rp:
            problems.append(f'DB 정의 md5 {g["md5"][:8]}… ≠ rpc 사본')
        w = want.get(sig)
        if w is None:
            problems.append(f'선언된 인자 목록과 DB 시그니처 {g["sig"]} 가 다르다')
        else:
            if (w['acl'] or None) != (g['acl'] or None):
                problems.append(f'ACL {g["acl"]} ≠ 선언 {w["acl"]}')
            if w['secdef'] != g['secdef']:
                problems.append(f'SECURITY DEFINER {g["secdef"]} ≠ 선언 {w["secdef"]}')
        if problems:
            fails += 1
            rows.append((n, '❌', ' · '.join(problems)))
        else:
            rows.append((n, '✅', f'md5 {g["md5"][:8]}… = rpc 사본 · ACL·SECURITY DEFINER = 선언'))
    return rows, fails, names


# ───────────────────────── 결과 남기기 ─────────────────────────
def report(kind, title, ok, lines, data):
    md = f'## {title} — {"통과" if ok else "실패"}\n\n' + '\n'.join(lines) + '\n'
    result = dict(data, kind=kind, ok=ok, at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                  run_url=(f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
                           if os.environ.get('GITHUB_RUN_ID') else None),
                  failed=[] if ok else ['db-' + kind])
    for f in ('db-result.json', 'health-result.json'):
        json.dump(result, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    for f in ('db-summary.md', 'health-summary.md'):
        open(f, 'w', encoding='utf-8').write(md)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8').write(md)
    print(md)
    print('DB_RESULT_JSON=' + json.dumps({'kind': kind, 'ok': ok}, ensure_ascii=False))
    return 0 if ok else 1


def load_files():
    if not os.path.isdir(MIG_DIR):
        return []
    return [parse(os.path.join(MIG_DIR, n)) for n in sorted(os.listdir(MIG_DIR)) if n.endswith('.sql')]


def split_pending(files, led):
    pending, errs = [], []
    for f in files:
        rec = led.get(f['name'])
        if rec is None:
            pending.append(f)
        elif rec['sha256'] != f['sha256']:
            errs.append(f'{f["name"]}: 이미 적용된 파일이 바뀌었다(기록 sha256 {rec["sha256"][:12]}… ≠ 지금 {f["sha256"][:12]}…) — 적용된 파일은 고치지 말고 새 파일을 더한다')
    return pending, errs


# ───────────────────────── check ─────────────────────────
def build_check_sql(pending, inv_base):
    names = sorted({t for f in pending for t in f['touched']} | {s.split('(')[0] for f in pending for s in list(f['functions']) + f['dropped']})
    arr = 'array[' + ','.join(lit(n) for n in names) + ']::text[]'
    inv = invariants_sql()
    parts = []
    parts.append(BOOTSTRAP_SQL)
    for f in pending:
        parts.append(f'-- ▼ {f["name"]}\n{f["sql"].rstrip()}\n')
    parts.append(f"""
DO {dq(f'''
declare n bigint; smp jsonb; fns jsonb;
begin
  execute {dq('select count(*) from (' + inv + ') x', 'zz_inv')} into n;
  execute {dq('select coalesce(jsonb_agg(to_jsonb(y)), ' + "'[]'::jsonb" + ') from (select * from (' + inv + ') x limit 3) y', 'zz_inv2')} into smp;
  select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'sig',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)),
           'acl',p.proacl::text,'secdef',p.prosecdef) order by p.oid::regprocedure::text),'[]'::jsonb)
    into fns
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public' and p.proname = any({arr});
  perform set_config('zipfit.check', jsonb_build_object('invariants', n, 'invariants_before', {inv_base}, 'invariants_sample', smp, 'functions', fns, 'anon', '[]'::jsonb)::text, true);
end
''', 'zz_pg')};
""")
    anon_all = [q for f in pending for q in f['anon']]
    if anon_all:
        parts.append("set local role anon;\nset local statement_timeout = '3s';\n")
        for i, q in enumerate(anon_all):
            parts.append(f"""DO {dq(f'''
declare t0 timestamptz := clock_timestamp(); n bigint; c jsonb := current_setting('zipfit.check')::jsonb;
begin
  execute {dq('select count(*) from (' + q + ') x', 'zz_q' + str(i))} into n;
  c := jsonb_set(c, '{{anon}}', (c->'anon') || jsonb_build_array(jsonb_build_object('query', {dq(q, 'zz_t' + str(i))}, 'rows', n, 'ms', round(extract(epoch from clock_timestamp()-t0)*1000))));
  perform set_config('zipfit.check', c::text, true);
end
''', 'zz_a' + str(i))};
""")
        parts.append('reset statement_timeout;\nreset role;\n')
    parts.append(f"DO $zz_end$ begin raise exception '{CHECK_TAG} %', current_setting('zipfit.check'); end $zz_end$;\n")
    return '\n'.join(parts), names


def cmd_check():
    files = load_files()
    lines, data = [], {'files': [f['name'] for f in files]}
    errs = [e for f in files for e in f['errors']]
    led = ledger_safe()
    pending, e2 = split_pending(files, led)
    errs += e2
    data['pending'] = [f['name'] for f in pending]
    lines.append(f'- 변경 파일 {len(files)}개 · 적용 기록 {len(led)}개 · **이번에 적용될 것 {len(pending)}개**: ' + (', '.join(f'`{f["name"]}`' for f in pending) or '없음'))
    if errs:
        lines += ['', '### 파일 규칙 위반', *[f'- ❌ {e}' for e in errs]]
        return report('check', 'DB 변경 PR 체크', False, lines, data)
    if not pending:
        lines.append('- 적용할 파일이 없다 — 통과')
        return report('check', 'DB 변경 PR 체크', True, lines, data)
    inv_base = read(f'select count(*)::int as n from ({invariants_sql()}) x')[0]['n']
    fp0 = fingerprint()
    sql, names = build_check_sql(pending, inv_base)
    t0 = time.time()
    st, txt = query(sql)
    ms = int((time.time() - t0) * 1000)
    fp1 = fingerprint()
    data.update(fingerprint_before=fp0, fingerprint_after=fp1, http=st, elapsed_ms=ms)
    ok = True
    lines.append(f'- 되돌리기 전용 실행: HTTP {st} · {ms}ms')
    try:
        msg = json.loads(txt).get('message', '')
    except (ValueError, AttributeError):
        msg = txt
    m = re.search(CHECK_TAG + r' (\{[^\n]*\})', msg)
    if st != 400 or not m:
        lines.append(f'- ❌ 적용 SQL이 끝까지 돌지 못했다(결과 표식 없음): `{txt[:500]}`')
        ok = False
        res = None
    else:
        res = json.loads(m.group(1))
    if fp0 != fp1:
        lines.append(f'- ❌ **운영 DB 지문이 바뀌었다** {fp0[:12]}… → {fp1[:12]}… — 되돌리기 전용이 아니었다. 즉시 확인할 것')
        ok = False
    else:
        lines.append(f'- ✅ 운영 DB 지문 전후 같음 `{fp0[:12]}…` — 체크가 DB를 바꾸지 않았다')
    if res is not None:
        data['check'] = res
        inv_n, inv_b = res['invariants'], res['invariants_before']
        if inv_n > inv_b:
            ok = False
            lines.append(f'- ❌ 불변식 v3.7 위반 {inv_b} → {inv_n}: `{json.dumps(res["invariants_sample"], ensure_ascii=False)[:400]}`')
        else:
            lines.append(f'- ✅ 불변식 v3.7 위반 {inv_b} → {inv_n}')
        for a in res.get('anon', []):
            good = a['ms'] < ANON_LIMIT_MS
            ok = ok and good
            lines.append(f'- {"✅" if good else "❌"} anon 역할 {a["ms"]}ms · {a["rows"]}행 — `{a["query"][:160]}` (한도 {ANON_LIMIT_MS}ms · statement_timeout 3s 안에서 돌렸다)')
        if not res.get('anon'):
            lines.append('- ℹ️ anon 확인 줄(`-- zipfit:anon …`) 없음 — 화면이 부르는 함수를 바꿨다면 더한다')
        info = {}
        for r in res['functions']:
            info.setdefault(r['name'], []).append(r)
        rows, fails, _ = compare_functions(pending, info)
        if rows:
            lines += ['', '| 함수 | | 적용 뒤 모습(되돌리기 전용 트랜잭션 안) |', '|---|---|---|', *[f'| `{a}` | {b} | {c} |' for a, b, c in rows]]
        if fails:
            ok = False
    return report('check', 'DB 변경 PR 체크', ok, lines, data)


# ───────────────────────── apply ─────────────────────────
def cmd_apply():
    files = load_files()
    lines, data = [], {'files': [f['name'] for f in files], 'applied': [], 'skipped': []}
    errs = [e for f in files for e in f['errors']]
    led = ledger_safe()
    pending, e2 = split_pending(files, led)
    errs += e2
    data['skipped'] = [n for n in led if n in {f['name'] for f in files}]
    lines.append(f'- 변경 파일 {len(files)}개 · 이미 적용 {len(data["skipped"])}개(건너뜀) · **적용할 것 {len(pending)}개**')
    if errs:
        lines += ['', '### 파일 규칙 위반 — 아무것도 적용하지 않았다', *[f'- ❌ {e}' for e in errs]]
        return report('apply', 'DB 변경 적용', False, lines, data)
    if not pending:
        lines.append('- 적용할 파일이 없다(같은 커밋 재실행이면 정상) — 통과')
        return report('apply', 'DB 변경 적용', True, lines, data)
    commit = os.environ.get('GITHUB_SHA', '')
    run_url = (f"{os.environ.get('GITHUB_SERVER_URL')}/{os.environ.get('GITHUB_REPOSITORY')}/actions/runs/{os.environ.get('GITHUB_RUN_ID')}"
               if os.environ.get('GITHUB_RUN_ID') else '')
    inv = invariants_sql()
    ok = True
    for f in pending:
        inv_base = read(f'select count(*)::int as n from ({inv}) x')[0]['n']
        fp0 = fingerprint()
        guard = f"""
DO {dq(f'''
declare n bigint;
begin
  execute {dq('select count(*) from (' + inv + ') x', 'zz_inv')} into n;
  if n > {inv_base} then raise exception 'ZIPFIT_APPLY_GUARD 불변식 v3.7 위반 % → %', {inv_base}, n; end if;
end
''', 'zz_g')};
"""
        anon = ''
        if f['anon']:
            anon = "set local role anon;\nset local statement_timeout = '3s';\n" + ''.join(
                f"select count(*) from ({q}) zz_x;\n" for q in f['anon']) + 'reset statement_timeout;\nreset role;\n'
        sql = (f'{BOOTSTRAP_SQL}\n-- ▼ {f["name"]}\n{f["sql"].rstrip()}\n{guard}\n{anon}'
               f"insert into {LEDGER}(filename, sha256, git_commit, run_url) values ({lit(f['name'])}, {lit(f['sha256'])}, {lit(commit)}, {lit(run_url)})\n"
               f"returning filename, applied_at;\n")
        st, txt = query(sql)
        if st not in (200, 201):
            ok = False
            lines.append(f'- ❌ `{f["name"]}` 적용 실패(HTTP {st}) — 트랜잭션 전체가 롤백됐다: `{txt[:500]}`')
            break
        fp1 = fingerprint()
        info = functions_info(sorted({s.split('(')[0] for s in list(f['functions']) + f['dropped']}))
        rows, fails, _ = compare_functions([f], info)
        data['applied'].append({'file': f['name'], 'fingerprint_before': fp0, 'fingerprint_after': fp1, 'rows': rows})
        lines.append(f'- ✅ `{f["name"]}` 적용 · 기록 `{LEDGER}` · 지문 {fp0[:12]}… → {fp1[:12]}…')
        if rows:
            lines += ['', f'| `{f["name"]}` 함수 | | 적용 뒤 DB(관리 API로 다시 읽음) |', '|---|---|---|', *[f'| `{a}` | {b} | {c} |' for a, b, c in rows], '']
        if fails:
            ok = False
            lines.append(f'- ❌ `{f["name"]}` 적용 뒤 대조 실패 — DB에는 이미 들어갔다. 되돌리기는 README 「긴급 되돌리기」')
            break
    return report('apply', 'DB 변경 적용', ok, lines, data)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode == 'check':
        sys.exit(cmd_check())
    if mode == 'apply':
        sys.exit(cmd_apply())
    if mode == 'lint':
        fs = load_files()
        es = [e for f in fs for e in f['errors']]
        print(json.dumps([{k: f[k] for k in ('name', 'touched', 'functions', 'dropped', 'anon', 'errors')} for f in fs], ensure_ascii=False, indent=1))
        sys.exit(1 if es else 0)
    print(__doc__)
    sys.exit(2)
