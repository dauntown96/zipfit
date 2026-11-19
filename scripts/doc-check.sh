#!/usr/bin/env bash
# 문서 검사 한 벌 — PR check(db-migrations.yml check 「문서 검사」)와 git pre-push 훅(.githooks/pre-push)이 같은 이 파일을 부른다
#   (2026-11-19 · 우편함 「코드·운영 — 12장」 · 조사 「병렬 PR 실패」 — 빨간 check 중 이력 표 칸 `|` 10 + 꼴 1을 push 전에 잡는다).
# 보는 것(DB 를 부르지 않는다 · 읽기만 · 몇 초):
#   ① Pages Liquid 글자 — base 이후 새로 더한 .md 줄의 {{ · {% (scripts/pages-liquid-check.sh · #785)
#   ② CLAUDE.md 「최근 작업 이력」 꼴(그 절 머리 아래 표 한 벌 · 3행 · 행당 600B · 최신부터) — .claude/hooks/rule-check.py --history
#   ③ 표 칸 수(CLAUDE.md · docs/history.md — 셀 안 `|` 는 `\|` · 행 끝 `|`) — .claude/hooks/rule-check.py --table-cols
#   ④ 고지 문서(privacy.html · terms.html · notices.json) 자리 표시 「{{」
# 쓰는 법: BASE_SHA=<기준 sha> bash scripts/doc-check.sh [HEAD 참조 — 기본 HEAD]
#   BASE_SHA 가 비면 ①을 건너뛴다(훅이 기준점을 못 찾을 때 — 얕은 클론 등). ②~④는 작업 트리 파일을 본다.
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

# ② ③ 이력 표 꼴 · 표 칸 수
for args in "--history CLAUDE.md" "--table-cols CLAUDE.md docs/history.md"; do
  # shellcheck disable=SC2086
  if ! out=$(python3 .claude/hooks/rule-check.py $args 2>&1); then
    printf '%s\n' "$out" | sed '/^$/d' | while IFS= read -r l; do say "$l"; done
    fail=1
  fi
done

# ④ 고지 문서 자리 표시
hits=$(grep -n '{{' privacy.html terms.html notices.json 2>/dev/null || true)
if [ -n "$hits" ]; then
  printf '%s\n' "$hits" | while IFS= read -r l; do say "고지 문서 자리 표시 「{{」 — $l"; done
  fail=1
fi

liq=봄; [ -n "${BASE_SHA:-}" ] || liq=건너뜀
if [ "$fail" = 0 ]; then echo "문서 검사 — 통과(Liquid $liq · 이력 표 꼴 · 표 칸 · 고지 「{{」)"; fi
exit "$fail"
