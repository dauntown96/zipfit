#!/usr/bin/env python3
"""notion-move.py의 네트워크 없는 시험 — python3 scripts/notion-move.test.py"""
import importlib.util
import os
import sys

spec = importlib.util.spec_from_file_location('nm', os.path.join(os.path.dirname(__file__), 'notion-move.py'))
nm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nm)

T = lambda s, **a: dict({'type': 'text', 'plain_text': s, 'text': {'content': s, 'link': None}}, **({'annotations': a} if a else {}))
P = lambda *r, ty='paragraph', **k: dict({'id': k.pop('id', 'x'), 'type': ty, ty: {'rich_text': list(r), 'color': 'default'}}, **k)
fails = 0


def ok(c, msg):
    global fails
    if not c:
        fails += 1
        print('실패:', msg)


# 1 글자 · 블록 수
b = P(T('가나'), T('다'), _children=[P(T('라'))])
ok(nm.text_of(b) == '가나다' and nm.chars([b]) == 4 and nm.count([b]) == 2, '글자·블록 셈')
# 2 2000자 넘는 조각 가르기
r = nm.runs([T('가' * 4500)])
ok([len(x['text']['content']) for x in r] == [2000, 2000, 500], '2000자 가르기')
# 3 norm: 같은 서식 합치고 기본 서식 지움 → 쪼개진 것과 하나인 것이 같다
plain = {'bold': False, 'italic': False, 'strikethrough': False, 'underline': False, 'code': False, 'color': 'default'}
a = nm.norm(nm.runs([T('가', **plain), T('나', **plain)]))
c = nm.norm(nm.runs([T('가나')]))
ok(a == c, 'norm 합치기')
bold = dict(plain, bold=True)
ok(nm.norm(nm.runs([T('가', **bold), T('나')])) != c, 'norm 서식 다르면 다름')
# 4 oversized
ok(nm.oversized(P(*[T(str(i), **(bold if i % 2 else plain)) for i in range(101)])), '101 조각 = 넘음')
ok(not nm.oversized(P(*[T(str(i)) for i in range(100)])), '100 조각 = 안 넘음')
# 5 first_diff: 한 글자 차이를 잡는다 · 같으면 None
x = [P(T('거둬졌을'), id='a')]
y = [P(T('거뒀을'), id='b')]
ok(nm.first_diff(x, x) is None and nm.first_diff(x, y) is not None, 'first_diff')
ok(nm.first_diff(x, x + y) is not None, 'first_diff 블록 수')
# 6 덩어리 가르기
order = list('abcdefg')
ok(nm._runs_of_ids(order, ['b', 'c', 'f']) == [('a', ['b', 'c']), ('e', ['f'])], '덩어리')
# 7 옮길 수 없는 종류
try:
    nm.clean({'id': 'z', 'type': 'child_database', 'child_database': {}})
    ok(False, 'child_database는 멈춰야 함')
except SystemExit:
    pass
# 8 sections: 머리 ~ 다음 머리 앞 · 하위 페이지에서 끊음
t = [P(T('머리말')), P(T('A'), ty='heading_2', id='h1'), P(T('a1'), id='p1'),
     P(T('B'), ty='heading_2', id='h2'), P(T('b1'), id='p2'), {'id': 'cp', 'type': 'child_page', 'child_page': {'title': 'c'}}]
s = nm.sections_of(t)
ok([x['blocks'] for x in s] == [['h1', 'p1'], ['h2', 'p2']], 'sections')
print('통과' if not fails else f'실패 {fails}')
sys.exit(1 if fails else 0)
