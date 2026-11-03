#!/usr/bin/env python3
"""스킬 🔴 줄 군 꼬리 점검(읽기 전용) — 2026-11-03 우편함 「코드·운영 — 결론 낱말 ⚠️ 넓힘 · 스킬 🔴 군 꼬리 점검 스크립트」 2.

왜: 원칙 장부(3·4회차)가 스킬의 🔴 줄마다 「어느 불변 군에 기대는가」를 줄 끝 꼬리 〔G###〕 로 달기로 했다(analysis v11.2 · reverify 다음 판).
    스킬은 저장소 밖(claude.ai 스킬 설치본)이라 PR check 로 못 막는다 — 교체 확인 때 이 스크립트 결과를 claude.ai 가 받아 판정한다.

입력: 스킬 폴더(여럿 · 그 아래 *.md 전부) · 불변 군 목록(기본 docs/principles/immutable-groups.txt).
보는 것: 🔴 이 든 줄마다
  ① 꼬리 없음       — 줄 끝에 〔…〕 가 없다
  ② 목록 밖 군      — 꼬리 형식은 맞는데 군이 불변 목록에 없다
  ③ 꼬리 형식 틀림  — 줄 끝 〔…〕 안이 G + 숫자 셋(+ 소문자 하나) 꼴이 아니다 · 또는 〔G… 가 줄 끝이 아닌 자리에만 있다
  꼬리 하나에 군 여럿은 「·」·「,」로 가른다(〔G002 · G008〕) — 하나라도 틀리면 그 줄이 ②·③.
출력: 갈래별 파일:행 목록 + 합계 · 셋 다 0 이면 「통과」(종료 코드 0) · 아니면 종료 코드 1. --json 이면 같은 내용을 JSON 한 덩어리로.
DB·네트워크·파일 쓰기 0.

예: python3 scripts/skill-red-tails.py /root/.claude/skills/synced/<id>/zipfit-notice-analysis /root/.claude/skills/synced/<id>/zipfit-notice-reverify
"""
import argparse
import json
import os
import re
import sys

RED = '🔴'
TAIL = re.compile(r'〔([^〔〕]*)〕\s*$')      # 줄 끝 꼬리
GROUP = re.compile(r'^G\d{3}[a-z]?$')
ANY_G = re.compile(r'〔\s*G')                  # 줄 안 어디든 군 꼬리 꼴


def load_groups(path):
    out = set()
    with open(path, encoding='utf-8') as f:
        for line in f:
            g = line.split('#', 1)[0].strip()
            if g:
                if not GROUP.match(g):
                    sys.exit(f'불변 군 목록 형식 틀림: {path}: {g!r}')
                out.add(g)
    return out


def md_files(root):
    if os.path.isfile(root):
        yield root
        return
    for d, _, fs in os.walk(root):
        for f in sorted(fs):
            if f.endswith('.md'):
                yield os.path.join(d, f)


def check_line(line, groups):
    """('ok' | 'none' | 'unknown' | 'malformed', 꼬리 원문 · 군 목록)"""
    m = TAIL.search(line)
    if not m:
        return ('malformed', None) if ANY_G.search(line) else ('none', None)
    parts = [p.strip() for p in re.split(r'[·,]', m.group(1))]
    if not parts or any(not GROUP.match(p) for p in parts):
        return ('malformed', m.group(0).strip())
    if any(p not in groups for p in parts):
        return ('unknown', m.group(0).strip())
    return ('ok', m.group(0).strip())


def main():
    ap = argparse.ArgumentParser(description='스킬 🔴 줄 군 꼬리 점검(읽기 전용)')
    ap.add_argument('paths', nargs='+', help='스킬 폴더 또는 .md 파일')
    ap.add_argument('--groups', default=os.path.join(os.path.dirname(__file__), '..', 'docs', 'principles', 'immutable-groups.txt'))
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--limit', type=int, default=0, help='갈래별로 찍을 줄 수 상한(0 = 전부)')
    a = ap.parse_args()

    groups = load_groups(a.groups)
    found = {'none': [], 'unknown': [], 'malformed': []}
    per_file = {}
    red_total = ok_total = 0
    for root in a.paths:
        if not os.path.exists(root):
            sys.exit(f'경로 없음: {root}')
        for fp in md_files(root):
            with open(fp, encoding='utf-8') as f:
                for n, line in enumerate(f, 1):
                    if RED not in line:
                        continue
                    red_total += 1
                    per_file[fp] = per_file.get(fp, 0) + 1
                    kind, tail = check_line(line.rstrip('\n'), groups)
                    if kind == 'ok':
                        ok_total += 1
                    else:
                        found[kind].append({'file': fp, 'line': n, 'tail': tail, 'text': line.strip()[:80]})

    bad = sum(len(v) for v in found.values())
    res = {'groups': len(groups), 'red_lines': red_total, 'ok': ok_total,
           'none': len(found['none']), 'unknown': len(found['unknown']), 'malformed': len(found['malformed']),
           'pass': bad == 0, 'per_file': per_file, 'items': found}
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=1))
    else:
        names = {'none': '① 꼬리 없음', 'unknown': '② 목록 밖 군', 'malformed': '③ 꼬리 형식 틀림'}
        for k, label in names.items():
            items = found[k]
            print(f'## {label} — {len(items)}')
            for it in (items[:a.limit] if a.limit else items):
                print(f"{it['file']}:{it['line']}" + (f"  {it['tail']}" if it['tail'] else '') + f"  | {it['text']}")
        print('## 파일별 🔴 줄')
        for fp, c in per_file.items():
            print(f'{fp}: {c}')
        print(f"## 합계 — 불변 군 {len(groups)} · 🔴 줄 {red_total} · 꼬리 맞음 {ok_total} · ① {len(found['none'])} · ② {len(found['unknown'])} · ③ {len(found['malformed'])}"
              + (' — 통과' if bad == 0 else ''))
    sys.exit(0 if bad == 0 else 1)


if __name__ == '__main__':
    main()
