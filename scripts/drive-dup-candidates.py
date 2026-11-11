#!/usr/bin/env python3
# Drive 공고 폴더의 「같은 바이트 사본 · 참조 0」 휴지통 후보 목록 — 읽기만(지우지 않는다).
# (2026-11-11 · 우편함 「코드·운영 — ㎡당 나군 식(6공고) · … Drive 사본 sha 고르기」 5 · #978 회신 ⑦ 2)
#
# 왜: #978 Drive 정리에서 「참조 0 · 참조 있는 파일과 같은 바이트」 사본은 sha 를 못 견줘 남겨 두었다 —
#     Drive 커넥터 목록은 체크섬을 주지 않는다. fetch-attachment `mode=list_folder` 가 Drive 계산값(sha256Checksum)을 돌려준다.
#
# 하는 일
#   1. DB(관리 API · 읽기): 공고 폴더 = announcement_analysis.drive_folder_id(공고 id 와 함께) · 참조 =
#      ① announcement_extras.file_url 안의 Drive 파일 id ② announcement_policies · housing_units 의 source_file 이름(전 DB — 넓게 잡는다)
#   2. 폴더마다 fetch-attachment `mode=list_folder` 를 DB 의 net.http_post 로 부른다(비밀값 = Vault cron_secret_v2 · 컨테이너에 비밀 0) ·
#      응답 행(net._http_response)은 **읽는 같은 문장에서 지운다** · 한 번에 --batch 폴더(기본 10).
#   3. 폴더마다: 참조 있는 파일(id 가 ①에 있거나 이름이 ②에 있음)의 sha256 집합 → 참조 0 파일 중 sha256 이 그 집합에 든 것 = 후보.
#      sha256 이 없는 파일(구글 문서 등)은 후보가 되지 않는다 · 하위 폴더는 보지 않는다.
#   4. 출력: 요약(폴더 · 파일 · 참조 · 후보 수) + --out TSV(공고 id · 폴더 id · 후보 파일 id · 이름 · 바이트 · 같은 sha 의 참조 파일 id).
# 🔴 쓰기 0 — DB 는 읽기(net.http_post 요청 · 응답 행 지움은 pg_net 큐 정리일 뿐) · Drive 는 목록만. 휴지통은 사람이(Drive 커넥터 trash_file) 목록을 보고 한다.
# 🔴 부하 줄(:20~:24 · :50~:54 UTC 분)에는 DB 요청을 보내지 않고 기다린다(우편함 공통 조건).
#
# 쓰는 법(컨테이너 · 관리 API 인증은 프록시가 넣는다 · 그 밖에서는 SUPABASE_ACCESS_TOKEN)
#   python3 scripts/drive-dup-candidates.py --out /tmp/cand.tsv                # 전 폴더
#   python3 scripts/drive-dup-candidates.py --only 2015122300020393 --out -    # 공고 하나(같은 공고 폴더 전부)
#   python3 scripts/drive-dup-candidates.py --limit 30                         # 앞 30 폴더만(시험)
import argparse
import datetime as dt
import json
import os
import re
import ssl
import sys
import time
import urllib.request

PROJECT = "khdpjjyspmlqtzperoqg"
QUERY_URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
EF = f"https://{PROJECT}.supabase.co/functions/v1/fetch-attachment?mode=list_folder&folder_id="
CA = "/root/.ccr/ca-bundle.crt"
FOLDER_RE = re.compile(r"^[A-Za-z0-9_-]{10,80}$")
DRIVE_ID_RE = re.compile(r"[A-Za-z0-9_-]{25,}")


def opener():
    ctx = ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()
    return urllib.request.build_opener(urllib.request.ProxyHandler(), urllib.request.HTTPSHandler(context=ctx))


OP = opener()


def wait_window():
    while True:
        m = dt.datetime.now(dt.timezone.utc).minute
        if not (19 <= m <= 25 or 49 <= m <= 55):
            return
        time.sleep(15)


def sql(query):
    wait_window()
    headers = {"Content-Type": "application/json"}
    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]
    req = urllib.request.Request(QUERY_URL, data=json.dumps({"query": query}).encode("utf-8"), headers=headers, method="POST")
    with OP.open(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def lit(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="공고 id 하나(그 공고의 폴더만)")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--batch", type=int, default=10)
    ap.add_argument("--out", help="후보 TSV 경로(- = 표준 출력)")
    a = ap.parse_args()

    where = "drive_folder_id is not null" + (f" and announcement_id = {lit(a.only)}" if a.only else "")
    folders = sql(f"select distinct on (drive_folder_id) drive_folder_id as f, announcement_id as aid from announcement_analysis where {where} order by drive_folder_id, announcement_id")
    folders = [r for r in folders if FOLDER_RE.match(r["f"] or "")]
    if a.limit:
        folders = folders[: a.limit]
    ref_ids = set()
    for r in sql("select file_url from announcement_extras where file_url is not null"):
        ref_ids.update(DRIVE_ID_RE.findall(r["file_url"]))
    ref_names = {r["n"] for r in sql("select distinct source_file n from announcement_policies where source_file is not null "
                                     "union select distinct source_file from housing_units where source_file is not null")}
    print(f"폴더 {len(folders)} · 참조 Drive id {len(ref_ids)} · 참조 이름 {len(ref_names)}", file=sys.stderr)

    listing, failed = {}, []
    for i in range(0, len(folders), a.batch):
        part = folders[i: i + a.batch]
        sends = " union all ".join(
            f"select {lit(r['f'])} f, net.http_post(url := {lit(EF + r['f'])}, body := '{{}}'::jsonb,"
            " headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',"
            " (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_v2')),"
            " timeout_milliseconds := 60000) id" for r in part)
        ids = {r["id"]: r["f"] for r in sql(sends)}
        until = time.time() + 90
        while ids and time.time() < until:
            time.sleep(3)
            got = sql(f"with d as (delete from net._http_response where id in ({','.join(str(k) for k in ids)}) returning id, status_code, content, error_msg) select * from d")
            for g in got:
                f = ids.pop(g["id"])
                try:
                    body = json.loads(g["content"] or "null")
                except ValueError:
                    body = None
                if g["status_code"] == 200 and body and body.get("ok") and not body.get("truncated"):
                    listing[f] = body["files"]
                else:
                    failed.append((f, g["status_code"], (body or {}).get("error") or g["error_msg"]))
        failed += [(f, None, "응답 없음") for f in ids.values()]
        print(f"  {min(i + a.batch, len(folders))}/{len(folders)} 폴더 · 실패 {len(failed)}", file=sys.stderr)

    aid_of = {r["f"]: r["aid"] for r in folders}
    n_files = n_ref = 0
    cands = []
    for f, files in listing.items():
        refd = [x for x in files if x.get("id") in ref_ids or x.get("name") in ref_names]
        n_files += len(files)
        n_ref += len(refd)
        sha_ref = {}
        for x in refd:
            if x.get("sha256Checksum"):
                sha_ref.setdefault(x["sha256Checksum"], x["id"])
        for x in files:
            if x in refd or not x.get("sha256Checksum"):
                continue
            if x["sha256Checksum"] in sha_ref:
                cands.append((aid_of[f], f, x["id"], x.get("name", ""), x.get("size", ""), sha_ref[x["sha256Checksum"]]))

    print(f"폴더 목록 받음 {len(listing)} · 못 받음 {len(failed)} · 파일 {n_files} · 참조 있음 {n_ref} · 후보(참조 0 ∧ 같은 sha 의 참조 파일 있음) {len(cands)}")
    for f, st, err in failed[:20]:
        print(f"  못 받음 {f} · {st} · {str(err)[:120]}")
    if a.out:
        out = sys.stdout if a.out == "-" else open(a.out, "w", encoding="utf-8")
        out.write("announcement_id\tfolder_id\tfile_id\tname\tbytes\tsame_sha_referenced_file_id\n")
        for c in sorted(cands):
            out.write("\t".join(str(v).replace("\t", " ") for v in c) + "\n")
        if out is not sys.stdout:
            out.close()


if __name__ == "__main__":
    main()
