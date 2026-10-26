#!/usr/bin/env python3
"""PreToolUse(Bash) 규칙 훅 — 경고만 한다(막지 않는다). 2026-10-12 · 우편함 「코드 — Claude Code 장비 정비」 3.

① `git push --force*` 앞: 원격 브랜치 head ↔ origin/main 의 diff 가 비었는지(원칙 13 — squash 병합 뒤 같은 브랜치 재사용).
② `git commit` 앞(CLAUDE.md 가 커밋에 실릴 때): 「최근 작업 이력」 표가 그 절 머리 아래 한 벌 · 3행 · 행당 600B 안 ·
   날짜가 최신부터인지(원칙 21 · #430 꼴).

경고는 모델 문맥(additionalContext)과 사람 화면(systemMessage)에 함께 내고, /tmp/zipfit-rule-hook.log 에 한 줄 남긴다.
🔴 훅은 경고만 한다(언제나 exit 0 · 훅이 스스로 죽어도 명령은 그대로 간다). 막는 쪽은 PR check 다 — `db-migrations.yml` 「CLAUDE.md 이력 표 꼴」이
   같은 ② 검사를 2026-10-20(HISTORY_FAIL_FROM)부터 실패로 낸다(아래 --history · --table-cols).
🔴 두 저장소가 함께 붙은 세션(루틴 포함)에서는 저장소 .claude/settings.json 의 훅이 돌지 않는다 — 회신 참조.
시험: echo '{"tool_input":{"command":"git commit -m x"},"cwd":"/home/user/zipfit"}' | python3 .claude/hooks/rule-check.py
🔵 2026-10-13(우편함 「코드 — 카드 머리 세대수」 0장 2) — PR check 도 같은 ② 검사를 부른다:
   python3 .claude/hooks/rule-check.py --history CLAUDE.md   → 문제 없으면 exit 0 · 있으면 줄마다 출력하고 exit 1
   python3 .claude/hooks/rule-check.py --table-cols CLAUDE.md docs/history.md   → 표 행마다 칸 구분자 수 = 표 머리(같은 출력·종료 꼴)
   (표준 라이브러리만 · 훅 경로와 같은 history_problems() 한 벌 — 사본 없음. 경고/실패는 워크플로가 정한다.)
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

LOG = '/tmp/zipfit-rule-hook.log'


def log(line):
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {line}\n")
    except OSError:
        pass


def git(repo, *args, timeout=20):
    r = subprocess.run(['git', '-C', repo, *args], capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout


def repo_of(cmd, cwd):
    """명령이 가리키는 저장소 — `git -C 경로` · `cd 경로 &&` · 아니면 훅 입력의 cwd."""
    m = re.search(r'git\s+-C\s+("[^"]+"|\'[^\']+\'|\S+)', cmd) or re.search(r'\bcd\s+("[^"]+"|\'[^\']+\'|\S+)\s*(&&|;)', cmd)
    path = m.group(1).strip('"\'') if m else cwd
    if path and not os.path.isabs(path):
        path = os.path.join(cwd or '/', path)
    code, top = git(path or '.', 'rev-parse', '--show-toplevel')
    return top.strip() if code == 0 else None


def check_force_push(cmd, repo):
    seg = re.search(r'git\b[^;&|]*\bpush\b([^;&|]*)', cmd)
    args = seg.group(1) if seg else ''
    m = re.search(r'--force-with-lease=([^:\s]+)', args)
    branch = m.group(1) if m else None
    if not branch:
        refs = [a for a in args.split() if not a.startswith('-') and a != 'origin']
        branch = refs[-1].split(':')[-1] if refs else git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')[1].strip()
    branch = branch.replace('refs/heads/', '')
    git(repo, 'fetch', '-q', 'origin', 'main', branch, timeout=30)
    code, _ = git(repo, 'rev-parse', '--verify', '-q', f'origin/{branch}')
    if code != 0:
        return None   # 원격에 없는 가지 — 덮을 것이 없다
    code, out = git(repo, 'diff', '--stat', f'origin/{branch}', 'origin/main')
    if code == 0 and not out.strip():
        return None
    n = len([l for l in out.splitlines() if '|' in l])
    return (f'원칙 13 — force push 전에 `git diff origin/{branch} origin/main`이 비어야 한다(squash 병합 뒤 같은 가지 재사용). '
            f'지금 {n}개 파일이 다르다 — 원격 가지에 main에 없는 커밋이 있으면 덮어 잃는다. 비지 않으면 원격 head = 이미 병합된 PR의 head sha'
            f'(pull_request_read · merged: true)임을 증명한 뒤에만 origin/main에서 다시 떠서 --force-with-lease={branch}:<원격 head> · 증명이 안 서면 밀지 않는다.')


def history_problems(text):
    lines = text.split('\n')
    h = next((i for i, l in enumerate(lines) if l.startswith('## ') and '최근 작업 이력' in l), None)
    if h is None:
        return ['「최근 작업 이력」 절 머리가 없다']
    end = next((i for i in range(h + 1, len(lines)) if lines[i].startswith('## ')), len(lines))
    row_re = re.compile(r'^\|\s*(\d{4}-\d{2}-\d{2})\s*\|')
    probs = []
    heads = [i for i in range(h + 1, end) if re.match(r'^\|\s*날짜\s*\|\s*내용\s*\|', lines[i])]
    if len(heads) != 1:
        probs.append(f'절 안 표 머리(| 날짜 | 내용 |)가 {len(heads)}벌')
        return probs
    i = heads[0] + 2
    rows = []
    while i < end and row_re.match(lines[i]):
        rows.append(lines[i]); i += 1
    stray = [j + 1 for j, l in enumerate(lines) if row_re.match(l) and not (heads[0] + 2 <= j < heads[0] + 2 + len(rows))]
    if stray:
        probs.append(f'표 밖에 이력 꼴 행이 있다(줄 {", ".join(map(str, stray[:5]))}) — 표 머리 위·다른 절에 끼었는가(#430 꼴)')
    if len(rows) != 3:
        probs.append(f'이력 행이 {len(rows)}개 — 3개여야 한다(넘친 것은 docs/history.md 로)')
    for r in rows:
        b = len(r.encode('utf-8'))
        if b > 600:
            probs.append(f'{row_re.match(r).group(1)} 행이 {b}B — 600B 안')
        if re.search(r'\|\s*-{3,}\s*$', r):
            probs.append(f'{row_re.match(r).group(1)} 행 끝에 「|---」가 붙었다 — 절 구분선은 행 뒤 빈 줄 다음 줄에(행을 갈아 끼우며 꼬리가 옮겨 다닌다 · 2026-10-21)')
    dates = [row_re.match(r).group(1) for r in rows]
    if dates != sorted(dates, reverse=True):
        probs.append(f'날짜가 최신부터가 아니다({" → ".join(dates)})')
    return probs


def table_cell_problems(text):
    """표 블록마다 각 행의 칸 구분자(이스케이프 안 된 `|`) 수가 표 머리와 같은가(2026-10-18 · 우편함 「G8 확정 고침」 7).

    셀 안의 `|`는 백틱 안이어도 칸을 가른다(GFM) — `\\|`로 쓴다. 닫는 `|`가 빠진 행도 여기서 잡힌다.
    docs/history.md 에서 6행이 이렇게 깨져 있었다(22 · 53 · 132 · 176 · 179 · 184).
    """
    probs = []
    head = None
    for n, line in enumerate(text.split('\n'), 1):
        if not line.startswith('|'):
            head = None
            continue
        k = len(re.findall(r'(?<!\\)\|', line))
        if head is None:
            head = k
        elif k != head:
            probs.append(f'줄 {n}: 칸 구분자 {k}개 — 표 머리는 {head}개(셀 안 | 는 \\| · 행 끝 | 빠짐)')
    return probs


def check_commit(cmd, repo):
    code, staged = git(repo, 'diff', '--cached', '--name-only')
    names = set(staged.split())
    all_flag = re.search(r'\bcommit\b.*\s(--all|-[a-zA-Z]*a[a-zA-Z]*)(\s|$)', cmd)   # -a · -am · --all
    if all_flag:
        names |= set(git(repo, 'diff', '--name-only')[1].split())
    if 'CLAUDE.md' not in names:
        return None
    code, text = git(repo, 'show', ':CLAUDE.md')
    if code != 0 or all_flag:
        try:
            text = open(os.path.join(repo, 'CLAUDE.md'), encoding='utf-8').read()
        except OSError:
            return None
    probs = history_problems(text)
    if not probs:
        return None
    return '원칙 21 — CLAUDE.md 「최근 작업 이력」: ' + ' · '.join(probs) + '. 새 줄은 맨 위에 먼저 넣고 넘친 행을 아래에서 빼 docs/history.md 로.'


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    cmd = (data.get('tool_input') or {}).get('command') or ''
    cwd = data.get('cwd') or os.getcwd()
    kinds = []
    if re.search(r'\bgit\b[^;&|]*\bpush\b[^;&|]*(--force|\s-f\b)', cmd):
        kinds.append('force_push')
    if re.search(r'\bgit\b[^;&|]*\bcommit\b', cmd):
        kinds.append('commit')
    if not kinds:
        return
    repo = repo_of(cmd, cwd)
    if not repo:
        return
    warns = []
    for k in kinds:
        try:
            w = check_force_push(cmd, repo) if k == 'force_push' else check_commit(cmd, repo)
        except Exception as e:   # 훅이 죽어도 명령은 간다
            log(f'{k} {repo} 검사 실패: {e}')
            continue
        log(f'{k} {repo} {"경고" if w else "통과"}' + (f' — {w}' if w else ''))
        if w:
            warns.append(w)
    if warns:
        msg = '⚠️ 규칙 훅(경고만 · 막지 않음): ' + ' / '.join(warns)
        print(json.dumps({'systemMessage': msg,
                          'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'additionalContext': msg}}, ensure_ascii=False))


def history_cli(path):
    with open(path, encoding='utf-8') as f:
        probs = history_problems(f.read())
    for p in probs:
        print(f'{path} 「최근 작업 이력」: {p}')
    return 1 if probs else 0


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--history':
        sys.exit(history_cli(sys.argv[2]))
    if len(sys.argv) >= 3 and sys.argv[1] == '--table-cols':
        bad = 0
        for path in sys.argv[2:]:
            with open(path, encoding='utf-8') as f:
                for p in table_cell_problems(f.read()):
                    print(f'{path} 표 칸: {p}'); bad = 1
        sys.exit(bad)
    try:
        main()
    except Exception as e:
        log(f'훅 실패: {e}')
    sys.exit(0)
