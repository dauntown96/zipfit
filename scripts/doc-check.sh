#!/usr/bin/env bash
# 문서 검사 한 벌 — PR check(db-migrations.yml check 「문서 검사」)와 git pre-push 훅(.githooks/pre-push)이 같은 이 파일을 부른다
#   (2026-11-19 · 우편함 「코드·운영 — 12장」 · 조사 「병렬 PR 실패」 — 빨간 check 중 이력 표 칸 `|` 10 + 꼴 1을 push 전에 잡는다).
# 보는 것(DB 를 부르지 않는다 · 읽기만 · 몇 초):
#   ① Pages Liquid 글자 — base 이후 새로 더한 .md 줄의 {{ · {% (scripts/pages-liquid-check.sh · #785)
#   ② 이력 새 꼴(원칙 21 · 2026-11-20 「코드·운영 — 13장」 — 이력은 docs/history.d/ 에 PR마다 새 파일):
#      CLAUDE.md 에 이력 꼴 표 행 0(rule-check.py --history) · base 이후 더한 docs/history.d/ 파일의 이름·첫 줄 꼴(--history-files) ·
#      base 이후 docs/history.md 에 더한 표 행 0 · base 에 있던 docs/history.d/ 파일을 고치거나 지우지 않음(다른 PR의 파일 — 충돌 자리)
#   ③ 표 칸 수(셀 안 `|` 는 `\|` · 행 끝 `|`) — .claude/hooks/rule-check.py --table-cols · 대상 = base 이후 바뀐 .md 전부
#      (2026-11-20 · 12장 ⑦ — 종전 CLAUDE.md · docs/history.md 둘. BASE_SHA 가 비면 CLAUDE.md 하나)
#   ④ 고지 문서(privacy.html · terms.html · notices.json) 자리 표시 「{{」
# 쓰는 법: BASE_SHA=<기준 sha> bash scripts/doc-check.sh [HEAD 참조 — 기본 HEAD]
#   BASE_SHA 가 비면 ①과 ②의 base 대조를 건너뛰고 ③은 CLAUDE.md 만 본다(훅이 기준점을 못 찾을 때 — 얕은 클론 등). 파일 내용은 작업 트리를 본다.
#   DOC_CHECK_GH=1 이면 실패 줄을 GitHub Actions ::error:: 꼴로도 낸다(워크플로).
# 통과 0 · 실패 1(실패마다 「파일:줄 — 무엇」 한 줄).
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 0
head="${1:-HEAD}"
fail=0
say() { if [ "${DOC_CHECK_GH:-}" = 1 ]; then echo "::error::$1"; else echo "✗ $1"; fi; }

# ① Liquid
if [ -n "${BASE_SHA:-}" ]; then
  if ! out=$(BASE_SHA="$BASE_SHA" bash scripts/pages-liquid-check.sh "$head" 2>&1); then
    printf '%s\n' "$out" | sed -n 's/^::error::Pages Liquid 글자 — //p' | while IFS= read -r l; do say "Liquid {{ · {% — $l"; done
    fail=1
  fi
fi

# ② 이력 새 꼴 · ③ 표 칸 수
run_rc() {  # rule-check.py 를 불러 실패 줄을 say 로
  local out
  if ! out=$(python3 .claude/hooks/rule-check.py "$@" 2>&1); then
    printf '%s\n' "$out" | sed '/^$/d' | while IFS= read -r l; do say "$l"; done
    fail=1
  fi
}
run_rc --history CLAUDE.md
md_files=CLAUDE.md
if [ -n "${BASE_SHA:-}" ]; then
  # base 이후 더한 이력 파일(A) — 꼴 검사 · base 에 있던 이력 파일을 고치거나 지움(M·D·R) — 실패
  added=$(git diff --name-only --diff-filter=A "$BASE_SHA"..."$head" -- docs/history.d/ 2>/dev/null || true)
  touched=$(git diff --name-only --diff-filter=MDR "$BASE_SHA"..."$head" -- docs/history.d/ 2>/dev/null || true)
  # shellcheck disable=SC2086
  [ -n "$added" ] && run_rc --history-files $(printf '%s\n' "$added" | while IFS= read -r f; do [ -f "$f" ] && echo "$f"; done)
  if [ -n "$touched" ]; then
    printf '%s\n' "$touched" | while IFS= read -r f; do say "$f — 이미 있던 이력 파일을 고치거나 지웠다(다른 PR의 파일 · 새 파일로 쓴다 — 원칙 21)"; done
    fail=1
  fi
  hrows=$(git diff -U0 "$BASE_SHA"..."$head" -- docs/history.md 2>/dev/null | grep -E '^\+\|' | grep -vE '^\+\+\+' || true)
  if [ -n "$hrows" ]; then
    say "docs/history.md 에 표 행을 더했다 — 이 파일에는 더 쓰지 않는다 · 이력은 docs/history.d/YYYY-MM-DD-<가지>.md 새 파일로(원칙 21)"
    fail=1
  fi
  md_files=$(git diff --name-only --diff-filter=AM "$BASE_SHA"..."$head" -- '*.md' 2>/dev/null | while IFS= read -r f; do [ -f "$f" ] && echo "$f"; done)
fi
# shellcheck disable=SC2086
[ -n "$md_files" ] && run_rc --table-cols $md_files

# ④ 고지 문서 자리 표시
hits=$(grep -n '{{' privacy.html terms.html notices.json 2>/dev/null || true)
if [ -n "$hits" ]; then
  printf '%s\n' "$hits" | while IFS= read -r l; do say "고지 문서 자리 표시 「{{」 — $l"; done
  fail=1
fi

liq=봄; [ -n "${BASE_SHA:-}" ] || liq=건너뜀
if [ "$fail" = 0 ]; then echo "문서 검사 — 통과(Liquid $liq · 이력 새 꼴 · 표 칸 · 고지 「{{」)"; fi
exit "$fail"
