#!/usr/bin/env python3
# 꼭집 「지도로 보기」 경계 파일 만들기 — 행정구역 개편(판 갈이) 때 한 번 돌린다(2026-10-16 · 우편함 「표시층 — 지도 2026-07-01 개편 반영」).
#
# 원자료: vuski/admdongkor 의 행정동 경계 GeoJSON(WGS84) — 통계청 SGIS 행정동 경계(공공누리 1유형)에 개편 이력을 보정한 판 · CC BY 4.0.
#   예) https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson
# 도구: mapshaper(npm · 저장소 밖에 설치 — 원칙 6 은 화면 코드 이야기다) — 투영(UTM-K)·단순화·합치기·안쪽 경계선만.
#
# 쓰는 법:  python3 scripts/geo-build.py <행정동.geojson> <mapshaper 실행 파일> <판 이름(예 2026-07)> <판 날짜(예 2026-07-01)>
#   → geo/kr-<판>.json            첫 화면(시·도 윤곽 · 시·도 가운데 · 시·군·구 가운데) — 화면이 처음 지도를 열 때 받는다
#     geo/kr-<판>/sgg-<시도>.json  그 시·도의 시·군·구 사이 경계선(확대 2단계에서만 받는다)
#     geo/kr-<판>/emd-<시도>.json  그 시·도의 읍면동 사이 경계선(확대 3단계에서만 받는다)
# 판을 바꾸면 index.html 의 ZF3_GEO(파일 이름) · 캡션 줄 · sw.js CACHE_NAME 을 함께 고친다.
#
# 🔴 화면 좌표는 아래 AFF(UTM-K 미터 → viewBox 0 0 461 565) 하나로 정한다 — 판이 바뀌어도 같은 값을 쓴다(확대 배율·당긴 점 자리가 그대로).
#    값은 2025 판(SGIS 2025년 2분기 · 옛 geo/kr-2025.json)의 시·군·구 가운데 248곳에 맞춘 최소제곱(가운데값 오차 0.87).
import json, os, subprocess, sys, tempfile, gzip

AFF = (0.000903006, -660.6237, 1870.9749)   # x = a·E + b · y = -a·N + c
VB = [0, 0, 461, 565]
PROJ = '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m'
SIDO_PCT, SIDO_ISLAND = '0.8%', 4000000     # 첫 화면 윤곽 — 옛 파일과 비슷한 무게 · 4㎢ 밖 작은 섬 생략
LINE_PCT = '10%'                            # 시·군·구 · 읍면동 선 — 시도당 gzip 3.5 KB · 16.5 KB 안팎(2026-07 판 실측)


def T(p):
    a, b, c = AFF
    return (round(a * p[0] + b, 1), round(-a * p[1] + c, 1))


def num(v):
    s = '%.1f' % v
    if s.endswith('.0'):
        s = s[:-2]
    if s.startswith('0.'):
        s = s[1:]
    elif s.startswith('-0.'):
        s = '-' + s[2:]
    return s


def pts_of(ring):
    q = []
    for p in ring:
        t = T(p)
        if not q or q[-1] != t:
            q.append(t)
    return q


def d_abs(ring):
    # 첫 화면 윤곽은 절대 좌표 — 화면 zf3ProvBox 가 글자에서 숫자 쌍을 바로 읽는다
    q = pts_of(ring)
    if len(q) > 1 and q[0] == q[-1]:
        q.pop()
    # 그림(viewBox) 밖에 통째로 있는 섬(울릉도·독도)은 윤곽에서 뺀다 — 가운데 점만 화면이 안쪽 끝으로 당긴다(zf3InVb)
    if len(q) < 3 or min(x for x, _ in q) > VB[2] or min(y for _, y in q) > VB[3]:
        return ''
    return 'M' + 'L'.join('%.1f,%.1f' % t for t in q) + 'Z'


def d_rel(line):
    # 경계선은 상대 좌표(l) — 짧게
    q = pts_of(line)
    if len(q) < 2:
        return ''
    out = []
    for (x0, y0), (x1, y1) in zip(q, q[1:]):
        dx, dy = round(x1 - x0, 1), round(y1 - y0, 1)
        if dx == 0 and dy == 0:
            continue
        sx, sy = num(dx), num(dy)
        tok = sx + ('' if sy.startswith('-') else ',') + sy
        if out and not tok.startswith('-'):
            tok = ' ' + tok
        out.append(tok)
    x, y = q[0]
    sy = num(y)
    return 'M' + num(x) + ('' if sy.startswith('-') else ',') + sy + 'l' + ''.join(out)


def rings(g):
    cs = g['coordinates']
    return cs if g['type'] == 'Polygon' else [r for p in cs for r in p]


def polys(g):
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']


def ring_ac(r):
    a = cx = cy = 0.0
    for i in range(len(r) - 1):
        x0, y0 = r[i]
        x1, y1 = r[i + 1]
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    a /= 2
    return (a, (cx / (6 * a), cy / (6 * a))) if a else (0, tuple(r[0]))


def poly_ac(p):
    A = X = Y = 0.0
    for j, r in enumerate(p):
        a, (cx, cy) = ring_ac(r)
        a = abs(a) * (1 if j == 0 else -1)
        A += a
        X += cx * a
        Y += cy * a
    return A, (X / A, Y / A)


def inside(pt, p):
    x, y = pt
    ins = False
    for r in p:
        for i in range(len(r) - 1):
            x0, y0 = r[i]
            x1, y1 = r[i + 1]
            if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
                ins = not ins
    return ins


def center(g):
    # 면 중심 — 바다에 떨어지면(섬이 많은 군) 가장 큰 땅의 중심
    ps = polys(g)
    acs = [poly_ac(p) for p in ps]
    A = sum(a for a, _ in acs)
    c = (sum(a * c[0] for a, c in acs) / A, sum(a * c[1] for a, c in acs) / A)
    if not any(inside(c, p) for p in ps):
        c = max(acs, key=lambda x: x[0])[1]
    return list(T(c))


def chain(lines):
    # 안쪽 경계선 조각을 끝점 차수 2 인 곳에서 이어 붙인다
    from collections import defaultdict
    segs = [[tuple(p) for p in l] for l in lines if len(l) > 1]
    adj = defaultdict(list)
    for i, s in enumerate(segs):
        adj[s[0]].append(i)
        adj[s[-1]].append(i)
    used = [False] * len(segs)
    out = []

    def extend(path):
        while True:
            end = path[-1]
            cand = [i for i in adj[end] if not used[i]]
            if len(adj[end]) != 2 or not cand:
                return path
            i = cand[0]
            used[i] = True
            s = segs[i]
            path += s[1:] if s[0] == end else s[::-1][1:]

    for i, s in enumerate(segs):
        if used[i]:
            continue
        used[i] = True
        p = extend(list(s))
        p = extend(p[::-1])
        out.append(p)
    return out


def lines_d(gc):
    gs = gc.get('geometries') or [f['geometry'] for f in gc.get('features', [])]
    ls = [g['coordinates'] for g in gs if g['type'] == 'LineString'] + [c for g in gs if g['type'] == 'MultiLineString' for c in g['coordinates']]
    return ''.join(d_rel(p) for p in chain(ls))


def ms(bin_, *args):
    subprocess.run([bin_, *args, '-quiet'], check=True)


def main():
    src, bin_, ed, day = sys.argv[1:5]
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'geo')
    out_dir = os.path.join(root, 'kr-' + ed)
    os.makedirs(out_dir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        P = lambda n: os.path.join(tmp, n)
        ms(bin_, '-i', src, '-proj', PROJ, '-o', 'format=geojson', 'precision=1', P('emd.json'))
        ms(bin_, '-i', P('emd.json'), '-dissolve', 'sgg', 'copy-fields=sido,sidonm,sggnm', '-o', 'format=geojson', 'precision=1', P('sgg.json'))
        ms(bin_, '-i', P('emd.json'), '-dissolve', 'sido', 'copy-fields=sidonm', '-o', 'format=geojson', 'precision=1', P('sido_full.json'))
        ms(bin_, '-i', P('emd.json'), '-simplify', SIDO_PCT, 'keep-shapes', '-dissolve', 'sido', 'copy-fields=sidonm',
           '-filter-islands', 'min-area=%d' % SIDO_ISLAND, '-o', 'format=geojson', 'precision=1', P('sido.json'))
        os.makedirs(P('il_emd'))
        os.makedirs(P('il_sgg'))
        ms(bin_, '-i', P('emd.json'), '-simplify', LINE_PCT, 'keep-shapes', '-split', 'sido', '-innerlines', '-o', 'format=geojson', 'precision=1', P('il_emd') + '/')
        ms(bin_, '-i', P('emd.json'), '-simplify', LINE_PCT, 'keep-shapes', '-dissolve', 'sgg', 'copy-fields=sido', '-split', 'sido', '-innerlines',
           '-o', 'format=geojson', 'precision=1', P('il_sgg') + '/')
        load = lambda n: json.load(open(P(n), encoding='utf-8'))
        sido = sorted(load('sido.json')['features'], key=lambda f: f['properties']['sido'])
        full = {f['properties']['sido']: f for f in load('sido_full.json')['features']}
        sgg = sorted(load('sgg.json')['features'], key=lambda f: f['properties']['sgg'])
        base = {
            'about': (f'꼭집 지도로 보기 — 시·도 윤곽 {len(sido)}(단순화) · 시·군·구 가운데 {len(sgg)}. 경계 {day} 기준. '
                      '원자료: 통계청 SGIS 행정구역 경계(공공누리 1유형) · 가공: vuski/admdongkor(CC BY 4.0 — 개편 이력 보정). '
                      '좌표는 화면용으로 줄인 값이다(UTM-K 를 이 viewBox 에 맞춘 1차 변환 · 윤곽 단순화 · 작은 섬 생략). '
                      '시·군·구 가운데는 면 중심이고, 중심이 바다에 떨어지는 곳(섬이 많은 군)은 가장 큰 땅의 중심을 쓴다. '
                      '점은 단지 위치가 아니라 시·군·구 가운데다. 확대하면 같은 판의 시·군·구(sgg-) · 읍면동(emd-) 경계선을 시·도별로 따로 받는다.'),
            'ed': day,
            'vb': VB,
            'paths': [{'code': f['properties']['sido'], 'name': f['properties']['sidonm'], 'd': ''.join(d_abs(r) for r in rings(f['geometry']))} for f in sido],
            'prov': {c: center(f['geometry']) for c, f in sorted(full.items())},
            'cent': {f"{f['properties']['sido']}|{f['properties']['sggnm'].replace(' ', '')}": center(f['geometry']) for f in sgg},
        }
        with open(os.path.join(root, f'kr-{ed}.json'), 'w', encoding='utf-8') as fp:
            json.dump(base, fp, ensure_ascii=False, separators=(',', ':'))
        for lay in ('sgg', 'emd'):
            for fn in sorted(os.listdir(P('il_' + lay))):
                code = fn.split('.')[0]
                d = lines_d(json.load(open(os.path.join(P('il_' + lay), fn), encoding='utf-8')))
                body = json.dumps({'code': code, 'd': d}, separators=(',', ':'))
                with open(os.path.join(out_dir, f'{lay}-{code}.json'), 'w', encoding='utf-8') as fp:
                    fp.write(body)
                print(lay, code, len(body), 'B · gzip', len(gzip.compress(body.encode(), 9)), 'B')
    print('base', os.path.getsize(os.path.join(root, f'kr-{ed}.json')), 'B')


if __name__ == '__main__':
    main()
