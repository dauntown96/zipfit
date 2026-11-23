#!/usr/bin/env python3
"""notion-move.py — Notion 블록을 글자 그대로 다른 페이지로 옮긴다(2026-11-23 · 우편함 「조사·정리 — Notion 기록처 정리 2회차」).

네 단계: ① 원본 블록 트리 받기 → ② 새 자리에 붙이기 → ③ 새 자리를 다시 받아 블록마다 대조
         → ④ 전부 같을 때만 원본 블록 삭제(+ 옮긴 자리 한 줄 · 색인 줄 링크 바꾸기).
대조 = 블록마다 (깊이 · 종류 · 글자 · 서식 조각 — 인접한 같은 서식은 합쳐서). 하나라도 다르면 새로 붙인 것을 지우고
원본을 그대로 둔 채 멈춘다(종료 코드 2).

끊겨도 이어 한다: 상태 파일(<계획>.state.json)에 시작 덤프 · 새 자리 · 대조 결과 · 지운 블록을 적어 두고, 다시 부르면
남은 단계부터 한다. 원본 블록이 시작 덤프 뒤에 고쳐졌으면(last_edited_time이 다르면) 멈춘다.

공개 API 한도로 그대로 못 만드는 블록(서식 조각 100개 넘음)은 자리표시 「ZZPH-<원본 블록 id>」로 만들고 목록을 찍은 뒤
종료 코드 3으로 멈춘다 — 그 자리를 Notion MCP(update_content)로 원래 마크다운으로 바꾼 뒤 같은 명령을 다시 부르면
대조부터 잇는다(대조가 옮겨 적기 오타를 잡는다).

토큰: 환경 변수 NOTION_TOKEN(내부 통합)만 읽는다 · 값은 어디에도 찍지 않는다. 표준 라이브러리만 쓴다.

쓰는 법(자세히는 docs/notion-move.md)
  python3 scripts/notion-move.py tree <페이지> [-o 덤프.json]      # 블록 트리 받기 · 블록 수 · 글자
  python3 scripts/notion-move.py sections <페이지> [-o 절.json]    # #·## 머리마다 절(머리 ~ 다음 #·## 앞) 블록 id
  python3 scripts/notion-move.py oversize <페이지>                 # 서식 조각 100 넘는 블록 목록
  python3 scripts/notion-move.py move <계획.json> [--dry-run]      # 옮기기(이어 하기 포함)
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = 'https://api.notion.com/v1'
VERSION = '2022-06-28'
MAX_RUNS = 100          # 공개 API: rich_text 배열 길이 상한
MAX_TEXT = 2000         # 공개 API: text.content 한 조각 상한
BATCH_BLOCKS = 90       # 붙이기 한 번의 윗단 블록 수(상한 100)
BATCH_NESTED = 800      # 붙이기 한 번의 전체 블록 수(상한 1000)
BATCH_BYTES = 250_000   # 붙이기 한 번의 본문 바이트(413 막기)

# 만들 수 있는 블록 종류와 그대로 옮길 칸
KEEP = {
    'paragraph': ['color'], 'bulleted_list_item': ['color'], 'numbered_list_item': ['color'],
    'quote': ['color'], 'toggle': ['color'], 'to_do': ['color', 'checked'], 'callout': ['color', 'icon'],
    'heading_1': ['color', 'is_toggleable'], 'heading_2': ['color', 'is_toggleable'],
    'heading_3': ['color', 'is_toggleable'], 'code': ['language'], 'divider': [], 'equation': ['expression'],
    'table': ['table_width', 'has_column_header', 'has_row_header'], 'table_row': [],
}


# ───────────────────────── API ─────────────────────────
def _token():
    t = os.environ.get('NOTION_TOKEN')
    if not t:
        raise SystemExit('환경 변수 NOTION_TOKEN이 없다(내부 통합 토큰)')
    return t


def call(method, path, body=None):
    """(HTTP 상태, JSON). 429·5xx·연결 오류는 물러섰다 다시 부른다."""
    tok = _token()
    last = None
    for t in range(8):
        req = urllib.request.Request(
            API + path, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization': 'Bearer ' + tok, 'Notion-Version': VERSION,
                     'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            raw = e.read() or b'{}'
            try:
                j = json.loads(raw)
            except ValueError:
                j = {'code': 'non_json', 'status': e.code}
            if e.code in (429, 500, 502, 503, 504) or j.get('code') == 'conflict_error':
                last = (e.code, j)
                time.sleep(float(e.headers.get('Retry-After') or 2 * (t + 1)))
                continue
            return e.code, j
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = (0, {'code': 'conn', 'message': type(e).__name__})
            time.sleep(3 * (t + 1))
    return last or (0, {'code': 'retries'})


def must(s, j, what):
    if s != 200:
        raise SystemExit(f'{what} 실패: HTTP {s} {json.dumps(j, ensure_ascii=False)[:400]}')
    return j


def kids(block_id):
    """블록 트리(자식은 '_children'). 하위 페이지·DB 안으로는 들어가지 않는다."""
    out, cur = [], None
    while True:
        q = f'/blocks/{block_id}/children?page_size=100' + (f'&start_cursor={cur}' if cur else '')
        j = must(*call('GET', q), f'읽기 {block_id}')
        for b in j['results']:
            if b.get('has_children') and b['type'] not in ('child_page', 'child_database'):
                b['_children'] = kids(b['id'])
            out.append(b)
        if not j.get('has_more'):
            return out
        cur = j['next_cursor']


def new_page(parent, title):
    j = must(*call('POST', '/pages', {'parent': {'page_id': parent},
                                      'properties': {'title': {'title': [{'type': 'text', 'text': {'content': title}}]}}}),
             '새 페이지')
    return j['id']


def delete_block(bid):
    s, j = call('DELETE', f'/blocks/{bid}')
    if s == 200 or (s == 400 and 'archived' in json.dumps(j)):   # 이미 지운 것은 지난 실행분
        return
    must(s, j, f'삭제 {bid}')


# ───────────────────────── 글자 · 대조 ─────────────────────────
def text_of(b):
    d = b.get(b['type'], {}) or {}
    s = ''
    for k in ('rich_text', 'caption'):
        s += ''.join(x.get('plain_text', '') for x in d.get(k, []) or [])
    if b['type'] == 'table_row':
        s += ''.join(''.join(x.get('plain_text', '') for x in c) for c in d['cells'])
    if b['type'] == 'child_page':
        s += d.get('title', '')
    if b['type'] == 'equation':
        s += d.get('expression', '')
    return s


def chars(blocks):
    return sum(len(text_of(b)) + chars(b.get('_children', [])) for b in blocks)


def count(blocks):
    return sum(1 + count(b.get('_children', [])) for b in blocks)


def runs(items):
    """읽은 rich_text → 만들 때 쓰는 꼴(plain_text·href 뺌 · 2000자 넘는 조각은 가름)."""
    out = []
    for x in items or []:
        a = x.get('annotations')

        def w(o):
            if a:
                o['annotations'] = a
            return o
        if x['type'] == 'text':
            c, link = x['text']['content'], x['text'].get('link')
            for i in range(0, max(len(c), 1), MAX_TEXT):
                out.append(w({'type': 'text', 'text': {'content': c[i:i + MAX_TEXT], 'link': link}}))
        elif x['type'] == 'mention':
            m = x['mention']
            out.append(w({'type': 'mention', 'mention': {m['type']: m[m['type']]}}))
        elif x['type'] == 'equation':
            out.append(w({'type': 'equation', 'equation': x['equation']}))
    return out


def norm(items):
    """대조용: 인접한 같은 서식·같은 링크 글 조각을 합치고 기본 서식은 지운다."""
    out = []
    for x in items:
        x = json.loads(json.dumps(x))
        if (out and x['type'] == 'text' and out[-1]['type'] == 'text'
                and x.get('annotations') == out[-1].get('annotations')
                and x['text'].get('link') == out[-1]['text'].get('link')):
            out[-1]['text']['content'] += x['text']['content']
        else:
            out.append(x)
    for x in out:
        a = x.get('annotations')
        if not a or (not any(v for k, v in a.items() if k != 'color') and a.get('color', 'default') == 'default'):
            x.pop('annotations', None)
    return out


def clean(b):
    """읽은 블록 → 만들 블록(자식 빼고)."""
    ty = b['type']
    if ty not in KEEP:
        raise SystemExit(f'옮길 수 없는 블록 종류: {ty} ({b.get("id")}) — 계획에서 빼거나 손으로 옮긴다')
    d = b[ty]
    o = {k: d[k] for k in KEEP[ty] if k in d}
    if 'rich_text' in d:
        o['rich_text'] = runs(d['rich_text'])
    if 'caption' in d:
        o['caption'] = runs(d['caption'])
    if ty == 'table_row':
        o['cells'] = [runs(c) for c in d['cells']]
    return {'object': 'block', 'type': ty, ty: o}


def oversized(b):
    d = b.get(b['type'], {}) or {}
    arrs = [d.get('rich_text', []) or []] + (d['cells'] if b['type'] == 'table_row' else [])
    return any(len(runs(a)) > MAX_RUNS for a in arrs)


def flat(blocks, depth=0):
    """대조 열: (깊이, 종류, 글자, 서식 조각)."""
    for b in blocks:
        ty = b['type']
        if ty == 'child_page':
            yield (depth, ty, text_of(b), '')
        else:
            d = clean(b)[ty]
            rt = json.dumps(norm(d.get('rich_text', [])), ensure_ascii=False, sort_keys=True)
            if ty == 'table_row':
                rt = json.dumps([norm(c) for c in d['cells']], ensure_ascii=False, sort_keys=True)
            yield (depth, ty, text_of(b), rt)
        yield from flat(b.get('_children', []), depth + 1)


def first_diff(a, b):
    A, B = list(flat(a)), list(flat(b))
    for i, (x, y) in enumerate(zip(A, B)):
        if x != y:
            return f'{i}번째 블록: 원본 {x[1]} 「{x[2][:60]}」 ↔ 새 자리 {y[1]} 「{y[2][:60]}」'
    if len(A) != len(B):
        return f'블록 수 다름: 원본 {len(A)} ↔ 새 자리 {len(B)}'
    return None


# ───────────────────────── 붙이기 ─────────────────────────
def _deep(b):
    return any(c.get('_children') for c in b.get('_children', []))


def append(parent, blocks, after=None, placeholders=None):
    """blocks를 parent 아래(after 블록 뒤)에 붙이고 새 윗단 id 목록을 돌려준다.
    자식은 한 단까지 같이 싣고, 손주가 있으면 따로 붙인다. 서식 100 넘는 블록은 자리표시로."""
    ids, i = [], 0
    while i < len(blocks):
        batch, later, n, size = [], [], 0, 0
        while i < len(blocks) and len(batch) < BATCH_BLOCKS:
            b = blocks[i]
            c = clean(b)
            if oversized(b):
                c[b['type']]['rich_text'] = [{'type': 'text', 'text': {'content': 'ZZPH-' + b['id']}}]
                if placeholders is not None:
                    placeholders.append(b['id'])
            s = 1
            if b.get('_children') and not _deep(b):
                c[b['type']]['children'] = [clean(x) for x in b['_children']]
                for x, cc in zip(b['_children'], c[b['type']]['children']):
                    if oversized(x):
                        cc[x['type']]['rich_text'] = [{'type': 'text', 'text': {'content': 'ZZPH-' + x['id']}}]
                        if placeholders is not None:
                            placeholders.append(x['id'])
                s += len(b['_children'])
            elif b.get('_children'):
                later.append((len(batch), b['_children']))
            bs = len(json.dumps(c))
            if batch and (n + s > BATCH_NESTED or size + bs > BATCH_BYTES):
                break
            batch.append(c)
            n, size, i = n + s, size + bs, i + 1
        body = {'children': batch}
        if after:
            body['after'] = after
        j = must(*call('PATCH', f'/blocks/{parent}/children', body), '붙이기')
        new = [r['id'] for r in j['results'][:len(batch)]]   # after가 있으면 새 블록 + 그 뒤 블록이 온다 — 앞 len(batch)개가 새것
        for k, ch in later:
            append(new[k], ch, placeholders=placeholders)
        ids += new
        after = new[-1]
    return ids


# ───────────────────────── 명령 ─────────────────────────
def cmd_tree(a):
    t = kids(a.page)
    if a.o:
        json.dump(t, open(a.o, 'w'), ensure_ascii=False)
    print(json.dumps({'top': len(t), 'blocks': count(t), 'chars': chars(t)}, ensure_ascii=False))


def sections_of(t):
    heads = [i for i, b in enumerate(t) if b['type'] in ('heading_1', 'heading_2')]
    out = []
    for k, i in enumerate(heads):
        e = heads[k + 1] if k + 1 < len(heads) else len(t)
        e = min([j for j in range(i, e) if t[j]['type'] == 'child_page'] + [e])
        out.append({'id': t[i]['id'], 'type': t[i]['type'], 'text': text_of(t[i]),
                    'blocks': [t[j]['id'] for j in range(i, e)], 'chars': chars(t[i:e])})
    return out


def cmd_sections(a):
    s = sections_of(kids(a.page))
    if a.o:
        json.dump(s, open(a.o, 'w'), ensure_ascii=False, indent=1)
    for x in s:
        print(f"{x['id']}  {x['type'][-1]}  블록 {len(x['blocks']):>4}  글자 {x['chars']:>7}  {x['text'][:60]}")


def cmd_oversize(a):
    def walk(bs, d=0):
        for b in bs:
            if b['type'] in KEEP and oversized(b):
                print(f"{b['id']}  깊이 {d}  {b['type']}  조각 {len(runs(b[b['type']].get('rich_text', [])))}  「{text_of(b)[:50]}」")
            walk(b.get('_children', []), d + 1)
    walk(kids(a.page))


def _save(path, st):
    tmp = path + '.tmp'
    json.dump(st, open(tmp, 'w'), ensure_ascii=False)
    os.replace(tmp, path)


def _runs_of_ids(order, ids):
    """원본 순서(order)에서 ids가 이어진 덩어리들 → [(앞 블록 id, [ids…])]."""
    pos = {x: i for i, x in enumerate(order)}
    idx = sorted(pos[x] for x in ids)
    out, cur = [], []
    for i in idx:
        if cur and i != cur[-1] + 1:
            out.append(cur)
            cur = []
        cur.append(i)
    if cur:
        out.append(cur)
    return [(order[c[0] - 1] if c[0] > 0 else None, [order[i] for i in c]) for c in out]


def cmd_move(a):
    plan = json.load(open(a.plan))
    sp = plan.get('state') or (a.plan.rsplit('.json', 1)[0] + '.state.json')
    st = json.load(open(sp)) if os.path.exists(sp) else {}
    src, want = plan['src'], plan['blocks']

    # ① 시작 덤프(한 번만) — 이어 할 때는 이것이 원본의 기준이다
    if 'snapshot' not in st:
        top = kids(src)
        by = {b['id']: b for b in top}
        miss = [x for x in want if x not in by]
        if miss:
            raise SystemExit(f'원본에 없는 블록 {len(miss)}개(예 {miss[:3]})')
        bad = [b['id'] for b in top if b['id'] in want and b['type'] not in KEEP]
        if bad:
            raise SystemExit(f'옮길 수 없는 종류의 블록 {bad[:3]}')
        st['snapshot'] = [by[x] for x in want]
        st['order'] = [b['id'] for b in top]
        st['chars'] = chars(st['snapshot'])
        st['blocks'] = count(st['snapshot'])
        if not a.dry_run:
            _save(sp, st)
    snap = st['snapshot']
    ph = []
    if a.dry_run:
        def walk(bs):
            for b in bs:
                if oversized(b):
                    ph.append(b['id'])
                walk(b.get('_children', []))
        walk(snap)
        print(json.dumps({'윗단': len(snap), '블록': st['blocks'], '글자': st['chars'], '덩어리': len(_runs_of_ids(st['order'], want)),
                          '서식100넘음': ph}, ensure_ascii=False))
        return

    # 원본이 시작 덤프 뒤에 고쳐졌는가(아직 지우지 않은 것만)
    if not st.get('deleted_all'):
        cur = {b['id']: b.get('last_edited_time') for b in kids(src)}
        done = set(st.get('deleted', []))
        changed = [b['id'] for b in snap if b['id'] not in done and cur.get(b['id']) != b.get('last_edited_time')]
        if changed:
            raise SystemExit(f'원본 블록 {len(changed)}개가 시작 덤프 뒤에 바뀌었거나 없다(예 {changed[:3]}) — 상태 파일을 지우고 처음부터')

    # ② 붙이기
    dest = plan['dest']
    if 'dest_page' not in st:
        if 'new' in dest:
            st['dest_page'] = new_page(dest['new']['parent'], dest['new']['title'])
            st['dest_new'] = True
        else:
            st['dest_page'] = dest['page']
            st['dest_new'] = False
        _save(sp, st)
    if 'new_ids' not in st:
        after = dest.get('after')
        if plan.get('head'):
            hid = append(st['dest_page'], plan['head'], after=after)
            st['head_ids'] = hid
            after = hid[-1]
        st['new_ids'] = append(st['dest_page'], snap, after=after, placeholders=ph)
        st['placeholders'] = ph
        _save(sp, st)
        if ph:
            print(json.dumps({'자리표시': ph, '새 자리': st['dest_page']}, ensure_ascii=False))
            print('→ 위 블록을 Notion MCP update_content로 「ZZPH-<id>」 → 원래 마크다운으로 바꾼 뒤 같은 명령을 다시 부른다', file=sys.stderr)
            sys.exit(3)

    # ③ 대조
    if not st.get('verified'):
        got_all = kids(st['dest_page'])
        ids = [b['id'] for b in got_all]
        if st['new_ids'][0] not in ids:
            raise SystemExit('새 자리에서 붙인 블록을 못 찾음')
        p = ids.index(st['new_ids'][0])
        got = got_all[p:p + len(snap)]
        diff = first_diff(snap, got)
        if diff:
            if st.get('placeholders') and any(('ZZPH-' + x) in text_of(b) for b in got for x in st['placeholders']):
                raise SystemExit(f'자리표시가 아직 남아 있다 — MCP로 바꾼 뒤 다시 부른다({diff})')
            # 어긋남: 새로 붙인 것을 지우고 원본은 둔다
            if st.get('dest_new'):
                delete_block(st['dest_page'])
            else:
                for x in st.get('head_ids', []) + st['new_ids']:
                    delete_block(x)
            os.replace(sp, sp + '.mismatch')
            print(f'어긋남 — 새 자리를 지우고 원본을 그대로 둠: {diff}', file=sys.stderr)
            sys.exit(2)
        st['verified'] = {'blocks': count(got), 'chars': chars(got)}
        st['map'] = dict(zip([b['id'] for b in snap], st['new_ids']))
        _save(sp, st)
        print(json.dumps({'대조': '같음', '블록': st['blocks'], '글자': st['chars']}, ensure_ascii=False), flush=True)

    # ④ 옮긴 자리 한 줄(원본 덩어리마다 · 지우기 전에 앞 블록 뒤에) → 원본 삭제 → 색인 줄 링크
    pn = st['dest_page'].replace('-', '')
    if plan.get('marker') and not st.get('markers_done'):
        for k, (prev, chunk) in enumerate(_runs_of_ids(st['order'], want)):
            if k in st.get('markers', []):
                continue
            if prev is None:
                raise SystemExit('옮길 덩어리가 원본 맨 앞이라 옮김 줄을 둘 앞 블록이 없다 — 계획에서 marker를 빼고 손으로')
            byid = {b['id']: b for b in snap}
            nh = sum(1 for x in chunk if byid[x]['type'] in ('heading_1', 'heading_2'))
            txt = plan['marker'].replace('{n}', str(nh))   # {n} = 그 덩어리의 #·## 머리 수 · {dest} = 새 자리 멘션
            a_, b_ = (txt.split('{dest}', 1) + [''])[:2]
            segs = [{'type': 'text', 'text': {'content': a_}},
                    {'type': 'mention', 'mention': {'type': 'page', 'page': {'id': st['dest_page']}}},
                    {'type': 'text', 'text': {'content': b_}}]
            blk = {'type': 'paragraph', 'paragraph': {'rich_text': [s for s in segs if s['type'] != 'text' or s['text']['content']]}}
            must(*call('PATCH', f'/blocks/{src}/children', dict({'children': [blk]}, **({'after': prev} if prev else {}))), '옮김 줄')
            st.setdefault('markers', []).append(k)
            _save(sp, st)
        st['markers_done'] = True
        _save(sp, st)
    done = set(st.get('deleted', []))
    for b in snap:
        if b['id'] in done:
            continue
        delete_block(b['id'])
        st.setdefault('deleted', []).append(b['id'])
        if len(st['deleted']) % 25 == 0:
            _save(sp, st)
        if os.environ.get('NOTION_MOVE_STOP_AFTER') and len(st['deleted']) >= int(os.environ['NOTION_MOVE_STOP_AFTER']):
            _save(sp, st)
            raise SystemExit('시험용 멈춤(NOTION_MOVE_STOP_AFTER) — 같은 명령으로 이어 한다')
    st['deleted_all'] = True
    _save(sp, st)
    for line_id, old_head in plan.get('relink', []):
        if line_id in st.get('relinked', []):
            continue
        nid = st['map'].get(old_head)
        if not nid:
            raise SystemExit(f'색인 줄 {line_id}: 옮긴 머리 {old_head}가 계획 블록에 없다')
        lb = must(*call('GET', f'/blocks/{line_id}'), f'색인 줄 {line_id}')
        ty = lb['type']
        r = runs(lb[ty]['rich_text'])
        for x in r:
            if x['type'] == 'text':
                x['text']['link'] = {'url': f'https://www.notion.so/{pn}#{nid.replace("-", "")}'}
        must(*call('PATCH', f'/blocks/{line_id}', {ty: {'rich_text': r}}), f'색인 줄 {line_id}')
        st.setdefault('relinked', []).append(line_id)
        if len(st['relinked']) % 25 == 0:
            _save(sp, st)
    st['done'] = True
    _save(sp, st)
    print(json.dumps({'끝': True, '새 자리': st['dest_page'], '지움': len(st['deleted']), '링크': len(st.get('relinked', []))}, ensure_ascii=False))


def main(argv=None):
    p = argparse.ArgumentParser(description='Notion 블록을 글자 그대로 옮긴다(받기 · 붙이기 · 대조 · 삭제)')
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('tree'); s.add_argument('page'); s.add_argument('-o'); s.set_defaults(f=cmd_tree)
    s = sub.add_parser('sections'); s.add_argument('page'); s.add_argument('-o'); s.set_defaults(f=cmd_sections)
    s = sub.add_parser('oversize'); s.add_argument('page'); s.set_defaults(f=cmd_oversize)
    s = sub.add_parser('move'); s.add_argument('plan'); s.add_argument('--dry-run', action='store_true'); s.set_defaults(f=cmd_move)
    a = p.parse_args(argv)
    a.f(a)


if __name__ == '__main__':
    main()
