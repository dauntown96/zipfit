#!/usr/bin/env python3
# announcement_extras.content_sha256 채움 — 원본 위치(source_url)가 있는데 해시가 빈 갤러리 행을 메운다.
# (2026-11-03 · 우편함 「코드·운영 — content_sha256 채움 스크립트를 저장소로(extras_sha_null ⚠️ 대비)」 ·
#  처음 채움(2,011행 · 우편함 「… 이미지 같은 파일 공유」 B 2)은 scratchpad 스크립트였고 컨테이너 재시작에 사라졌다 — 그래서 저장소로)
#
# 🔴 health-ops `extras_sha_null` ⚠️ 가 뜨면: 이 스크립트를 `--since 7d --write` 로 돌린다(Drive 크기 표를 먼저 만든다 — 아래 「Drive 크기 표」).
#
# 하는 일
#   1. DB(관리 API · 읽기)에서 대상 행: source_url 있음 ∧ content_sha256 NULL [∧ created_at ≥ --since]
#   2. 원본(source_url)을 받아 sha256 · 바이트 수만 센다 — 파일을 저장하지 않는다 · 동시 4 · UA ZipFitBot
#   3. 그 행 file_url 의 Drive 파일 크기(Drive 크기 표)와 원본 크기가 **같을 때만** 쓸 후보 — 다르면 NULL 그대로 + 목록
#      원본이 HTML 쪽이거나(LH 가 내린 파일 · 200 으로 옴) Content-Length 보다 짧게 받혔으면(잘림) 「못 받음」 — 해시하지 않는다.
#   4. --dry-run(기본): 표만 찍는다 · --write: 관리 API 한 요청(한 트랜잭션) · 행마다 `content_sha256 is null` 가드
#      --rollback: 쓰기 경로를 되돌리기 전용으로 시험(DO 블록 안에서 쓰고 센 뒤 예외로 롤백 · 운영 데이터 변경 0)
#
# Drive 크기 표(--drive-sizes 파일 · 한 줄 `<Drive 파일 id>\t<바이트>`)
#   컨테이너는 Drive API 를 직접 못 부른다(OAuth 없음 · drive.usercontent 403) — Drive 커넥터로 만든다:
#   `search_files`(query `owner = 'me' and mimeType != 'application/vnd.google-apps.folder'` · pageSize 1000 · 쪽 넘김)의 id·fileSize,
#   빠진 id 는 `get_file_metadata`. 표에 없는 id 의 행은 「Drive 크기 없음」으로 쓰지 않는다(크기 대조 없이 쓰지 않는다).
#   `--need-drive-ids <파일>` 은 대상 행의 Drive id 목록만 뽑아 적는다(커넥터로 그 id 만 채우면 된다).
#
# 쓰는 법(컨테이너 · 관리 API 인증은 프록시가 넣는다 · Actions 등에서는 SUPABASE_ACCESS_TOKEN 이 있으면 헤더로)
#   python3 scripts/extras-sha-fill.py --since 7d --need-drive-ids /tmp/ids.txt           # 1) 대상 Drive id 목록
#   python3 scripts/extras-sha-fill.py --since 7d --drive-sizes /tmp/drive_sizes.tsv      # 2) 미리 보기(dry-run)
#   python3 scripts/extras-sha-fill.py --since 7d --drive-sizes /tmp/drive_sizes.tsv --write
#   python3 scripts/extras-sha-fill.py --only-id <uuid> --drive-sizes … --rollback        # 쓰기 경로 시험(이미 채운 행도 그 안에서 비우고 다시 씀)
#   --since: 7d · 36h · 2026-11-01(KST 날짜) · 없으면 전체
#
# 출력: 대상 · 원본 받음 · 씀(후보) · 사유별 못 씀(원본 못 받음 · Drive 크기 없음 · 크기 다름) — 행 id · 공고 id · 원본 fileid 만(이용자 정보 없음).
# 🔴 DB 쓰기는 이 표 한 칸(content_sha256)뿐 · file_url·Drive 파일은 건드리지 않는다.
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import os
import re
import ssl
import sys
import urllib.request

PROJECT = "khdpjjyspmlqtzperoqg"
QUERY_URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
UA = "ZipFitBot/1.0 (+https://kkokzip.com)"
CA = "/root/.ccr/ca-bundle.crt"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


def opener():
    ctx = ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()
    return urllib.request.build_opener(urllib.request.ProxyHandler(), urllib.request.HTTPSHandler(context=ctx))


OP = opener()


def sql(query):
    headers = {"Content-Type": "application/json"}
    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]
    req = urllib.request.Request(QUERY_URL, data=json.dumps({"query": query}).encode("utf-8"), headers=headers, method="POST")
    try:
        with OP.open(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:600]


def since_sql(s):
    if not s:
        return ""
    m = re.fullmatch(r"(\d+)([dh])", s)
    if m:
        return f" and e.created_at >= now() - interval '{int(m.group(1))} {'days' if m.group(2) == 'd' else 'hours'}'"
    d = dt.date.fromisoformat(s)  # 형식이 틀리면 여기서 멈춘다
    return f" and e.created_at >= '{d.isoformat()}'::date::timestamp at time zone 'Asia/Seoul'"


def targets(args):
    if args.only_id:
        bad = [i for i in args.only_id if not UUID_RE.match(i)]
        if bad:
            sys.exit(f"--only-id 형식이 uuid 가 아니다: {bad}")
        where = "e.id in (" + ",".join(f"'{i}'::uuid" for i in args.only_id) + ") and e.source_url is not null"
        if not args.rollback:
            where += " and e.content_sha256 is null"
    else:
        where = "e.source_url is not null and e.content_sha256 is null" + since_sql(args.since)
    q = f"""select coalesce(json_agg(json_build_object('id', e.id, 'aid', e.announcement_id, 't', e.extra_type,
             'src', e.source_url, 'did', substring(e.file_url from '/d/([^/]+)/'), 'had', e.content_sha256) order by e.created_at, e.id), '[]'::json) as j
      from public.announcement_extras e where {where}"""
    st, body = sql("set transaction read only;\n" + q)
    if st not in (200, 201):
        sys.exit(f"대상 읽기 실패 HTTP {st}: {body}")
    j = body[0]["j"]
    return json.loads(j) if isinstance(j, str) else j


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        h, n = hashlib.sha256(), 0
        with OP.open(req, timeout=180) as r:
            st = r.status
            ctype = (r.headers.get("Content-Type") or "").lower()
            clen = r.headers.get("Content-Length")
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                h.update(b)
                n += len(b)
        # 🔴 2026-11-03 실측 두 꼴을 「못 받음」으로 거른다(크기 대조가 막아 주지만 사유를 바로 적는다):
        #   ① LH 가 파일 대신 HTML 쪽을 200 으로 준다(2,541B · fileid 68659203 등 — 원본이 내려갔다)
        #   ② 받기가 중간에 끊겨 짧은 바이트를 해시했다(11-03 첫 채움 49,152 · 270,336 · 565,272B — 다시 받으니 Drive 와 같음)
        if "text/html" in ctype:
            return url, {"ok": False, "status": st, "err": f"HTML 응답({n:,}B · 원본 파일 아님)"}
        if clen and clen.isdigit() and int(clen) != n:
            return url, {"ok": False, "status": st, "err": f"잘림(Content-Length {int(clen):,} ≠ 받은 {n:,})"}
        return url, {"ok": st == 200 and n > 0, "status": st, "sha": h.hexdigest(), "bytes": n}
    except Exception as e:  # 원본을 못 받으면 그 행은 쓰지 않는다
        return url, {"ok": False, "status": "ERR", "err": str(e)[:120]}


def load_sizes(path):
    out = {}
    if not path:
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) >= 2 and p[1].strip().isdigit():
                out[p[0].strip()] = int(p[1])
    return out


def main():
    ap = argparse.ArgumentParser(description="announcement_extras.content_sha256 채움")
    ap.add_argument("--since", help="created_at 하한 — 7d · 36h · 2026-11-01(KST)")
    ap.add_argument("--only-id", nargs="+", help="이 행 id(uuid)만")
    ap.add_argument("--drive-sizes", help="Drive 크기 표(id\\t바이트)")
    ap.add_argument("--need-drive-ids", help="대상 행의 Drive id 목록을 이 파일에 적고 끝낸다")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--write", action="store_true", help="쓴다(관리 API 한 요청)")
    g.add_argument("--rollback", action="store_true", help="쓰기 경로를 되돌리기 전용으로 시험(--only-id 필요)")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    if args.rollback and not args.only_id:
        sys.exit("--rollback 은 --only-id 와 함께")

    rows = targets(args)
    print(f"대상 {len(rows)}행(원본 {len({r['src'] for r in rows})}개 · Drive 파일 {len({r['did'] for r in rows if r['did']})}개)")
    if args.need_drive_ids:
        with open(args.need_drive_ids, "w", encoding="utf-8") as f:
            f.write("\n".join(sorted({r["did"] for r in rows if r["did"]})) + "\n")
        print(f"Drive id {len({r['did'] for r in rows if r['did']})}개 → {args.need_drive_ids}")
        return 0
    if not rows:
        print("할 것 없음")
        return 0

    sizes = load_sizes(args.drive_sizes)
    with concurrent.futures.ThreadPoolExecutor(max(1, min(args.workers, 4))) as ex:
        got = dict(ex.map(fetch, sorted({r["src"] for r in rows})))

    write, skip = [], {"원본 못 받음(HTML·잘림·오류)": [], "Drive 크기 없음": [], "크기 다름(Drive ≠ 원본)": []}
    for r in rows:
        x = got[r["src"]]
        tag = f"{r['id']} · {r['aid']} · {r['t']} · fileid {r['src'].rsplit('=', 1)[-1]}"
        if not x["ok"]:
            skip["원본 못 받음(HTML·잘림·오류)"].append(f"{tag} · {x.get('status')} {x.get('err', '')}".rstrip())
            continue
        ds = sizes.get(r["did"] or "")
        if ds is None:
            skip["Drive 크기 없음"].append(tag)
            continue
        if ds != x["bytes"]:
            skip["크기 다름(Drive ≠ 원본)"].append(f"{tag} · Drive {ds:,} · 원본 {x['bytes']:,}")
            continue
        assert SHA_RE.match(x["sha"])
        write.append((r["id"], x["sha"], r.get("had")))

    print(f"원본 받음 {sum(1 for v in got.values() if v['ok'])}/{len(got)} · 씀(후보) {len(write)}")
    for i, s_, _ in write:
        r = next(x for x in rows if x["id"] == i)
        print(f"  씀 후보 — {i} · {r['aid']} · {r['t']} · fileid {r['src'].rsplit('=', 1)[-1]} · sha {s_[:12]}")
    for k, v in skip.items():
        print(f"못 씀 — {k}: {len(v)}")
        for line in v[:50]:
            print("  " + line)
    if not write:
        print("쓸 것 없음 — DB 변경 0")
        return 0

    vals = ",".join(f"('{i}'::uuid,'{s}')" for i, s, _ in write)
    if args.rollback:
        # 되돌리기 전용: 고른 행을 트랜잭션 안에서 비우고 → 같은 쓰기 문장으로 다시 쓰고 → 원래 값과 같은지 세고 → 예외로 롤백
        had = ",".join(f"('{i}'::uuid,{('NULL' if h is None else repr(h))}::text)" for i, _, h in write)
        q = f"""set statement_timeout = '60s';
do $zf$
declare n_upd int; n_same int; n_had int;
begin
  create temp table zf_had on commit drop as select * from (values {had}) v(id, had);
  update public.announcement_extras e set content_sha256 = null from zf_had h where e.id = h.id;
  with u as (update public.announcement_extras e set content_sha256 = v.sha from (values {vals}) v(id, sha)
              where e.id = v.id and e.content_sha256 is null returning e.id, e.content_sha256)
  select count(*), count(*) filter (where h.had = u.content_sha256), count(h.had) into n_upd, n_same, n_had
    from u join zf_had h on h.id = u.id;
  raise exception 'ZF_ROLLBACK_RESULT updated=% same_as_before=% had_before=%', n_upd, n_same, n_had;
end $zf$;"""
        st, body = sql(q)
        m = re.search(r"ZF_ROLLBACK_RESULT[^\"\\]*", str(body))
        print(f"롤백 시험 HTTP {st} · {m.group(0) if m else body}")
        return 0 if m else 1
    if not args.write:
        print("dry-run — 쓰려면 --write")
        return 0
    q = f"""with u as (update public.announcement_extras e set content_sha256 = v.sha
                  from (values {vals}) v(id, sha)
                 where e.id = v.id and e.content_sha256 is null returning 1)
select count(*) as updated from u;"""
    st, body = sql(q)
    if st not in (200, 201):
        print(f"쓰기 실패 HTTP {st}: {body}")
        return 1
    print(f"씀 {body[0]['updated']}행(후보 {len(write)} · 그사이 다른 쪽이 채운 행은 가드로 건너뜀)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
