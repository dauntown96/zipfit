#!/usr/bin/env python3
# 소급 자격 행 원문화 분류표의 「지금」 칸을 운영 DB 현재값으로 다시 뽑는다.
# (2026-11-03 · 우편함 「분석 묶음 — 원문화 5회차」 4 · 4회차 ⑦ 2 — 회차마다 셈을 다시 짜지 않게)
#
# 하는 일
#   1. 분류표(docs/reverify/2026-11-03-soguep-vr-classification.json)의 행 id 전부를
#      관리 API(읽기 · SELECT 한 번)로 eligibility_criteria 에서 읽는다 — verification_requirements · car_limit · exempt 둘.
#   2. 키마다 「지금」을 다시 쓴다 — 1회차 BEFORE 값(`1회차_값`)과 현재 vr 의 같은 키를 대조:
#        키가 없음 → 「키 없음(원문 키로 바뀜)」 · 값이 같음 → 「남음·값 같음」 · 값이 다름 → 「남음·값 바뀜」
#      행마다 car_limit_지금 · income_limit_exempt_지금 · asset_limit_exempt_지금 도 다시 쓴다.
#      DB 에 없는 행(지워짐)은 「행 없음」.
#   3. 「합계」의 판정×지금 표 · 남은 요약/원문 밖 키 수 · 「지금_기준」 시각을 다시 쓴다.
#   🔴 1회차 판정 · 원문 위치 · 인용 · 다시 쓴 회차(vr_다시쓴_회차) · 칸_변경 · 회차 설명은 건드리지 않는다(사람이 회차마다 적는다).
#
# 쓰는 법(컨테이너 · 관리 API 인증은 프록시가 넣는다 · 밖에서는 SUPABASE_ACCESS_TOKEN 이 있으면 헤더로)
#   python3 scripts/soguep-vr-status.py            # 미리 보기 — 합계와 남은 키 목록만 찍는다(파일 그대로)
#   python3 scripts/soguep-vr-status.py --write    # 분류표 파일을 고쳐 쓴다(회차 끝에 돌려 커밋)
#   --file <경로>                                   # 다른 분류표
#
# DB 쓰기 0 · 공고 자격 행만 읽는다(이용자 정보 없음).
import argparse
import collections
import datetime as dt
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

PROJECT = "khdpjjyspmlqtzperoqg"
QUERY_URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
CA = "/root/.ccr/ca-bundle.crt"
DEFAULT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "reverify", "2026-11-03-soguep-vr-classification.json")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
KST = dt.timezone(dt.timedelta(hours=9))

GONE = "키 없음(원문 키로 바뀜)"
SAME = "남음·값 같음"
CHANGED = "남음·값 바뀜"
NO_ROW = "행 없음"


def sql(query):
    ctx = ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()
    op = urllib.request.build_opener(urllib.request.ProxyHandler(), urllib.request.HTTPSHandler(context=ctx))
    headers = {"Content-Type": "application/json"}
    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]
    req = urllib.request.Request(QUERY_URL, data=json.dumps({"query": query}).encode("utf-8"), headers=headers, method="POST")
    try:
        with op.open(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"관리 API {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")


def current(ids):
    for i in ids:
        if not UUID_RE.match(i):
            sys.exit(f"행 id 꼴이 아님: {i}")
    arr = "{" + ",".join(ids) + "}"
    rows = sql(
        "select json_agg(json_build_object('id',id,'vr',verification_requirements,'car',car_limit,"
        "'ie',income_limit_exempt,'ae',asset_limit_exempt)) as j "
        f"from eligibility_criteria where id = any('{arr}'::uuid[])"
    )
    return {r["id"]: r for r in (rows[0]["j"] or [])}


def main():
    ap = argparse.ArgumentParser(description="소급 자격 행 분류표 「지금」 칸 다시 뽑기")
    ap.add_argument("--file", default=DEFAULT_FILE)
    ap.add_argument("--write", action="store_true", help="분류표 파일을 고쳐 쓴다")
    a = ap.parse_args()

    with open(a.file, encoding="utf-8") as f:
        doc = json.load(f)
    cur = current([r["id"] for r in doc["행"]])

    verdicts = collections.Counter()
    cross = collections.Counter()
    left = collections.defaultdict(list)  # 판정 → [(공고, 행 앞 8, 키)]
    for r in doc["행"]:
        c = cur.get(r["id"])
        vr = (c or {}).get("vr") or {}
        r["car_limit_지금"] = c["car"] if c else None
        r["income_limit_exempt_지금"] = c["ie"] if c else None
        r["asset_limit_exempt_지금"] = c["ae"] if c else None
        for k in r["키"]:
            if c is None:
                now = NO_ROW
            elif k["키"] not in vr:
                now = GONE
            elif vr[k["키"]] == k.get("1회차_값"):
                now = SAME
            else:
                now = CHANGED
            k["지금"] = now
            verdicts[k["1회차_판정"]] += 1
            cross[(k["1회차_판정"], now)] += 1
            if now == SAME and k["1회차_판정"] in ("원문 요약", "원문 밖 말"):
                left[k["1회차_판정"]].append((r["announcement_id"], r["id"][:8], k["키"]))

    stamp = dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M KST")
    doc["지금_기준"] = f"{stamp} 운영 DB 값 — 1회차 BEFORE(키마다 1회차_값)와 대조 · scripts/soguep-vr-status.py"
    doc["합계"] = {
        "행": len(doc["행"]),
        "키": sum(len(r["키"]) for r in doc["행"]),
        "1회차_판정": dict(verdicts),
        "판정×지금": {f"{p} / {n}": v for (p, n), v in sorted(cross.items())},
        "남은_요약_값같음": len(left["원문 요약"]),
        "남은_원문밖_값같음": len(left["원문 밖 말"]),
    }

    print(json.dumps(doc["합계"], ensure_ascii=False, indent=1))
    per = collections.Counter(a for a, _, _ in left["원문 요약"])
    print("남은 요약(공고별):", ", ".join(f"…{a[-5:]} {n}" for a, n in per.most_common()))
    print("남은 원문 밖:", ", ".join(f"…{a[-5:]} {i}·{k}" for a, i, k in left["원문 밖 말"]))
    missing = [r["id"][:8] for r in doc["행"] if r["id"] not in cur]
    if missing:
        print("DB 에 없는 행:", ", ".join(missing))
    if a.write:
        with open(a.file, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        print("씀:", os.path.relpath(a.file))


if __name__ == "__main__":
    main()
