#!/usr/bin/env bash
# Pages(Jekyll Liquid) 빌드를 막는 글자 검사(2026-10-30 · 우편함 「코드·운영 — #762 DB 묶음 병합」 덧 · #785 계기).
# GitHub Pages 는 저장소 .md 를 Jekyll 로 렌더한다(머리말 없어도 — optional front matter) · 그때 Liquid 가 `{{` · `{%` 를 해석해
# 짝이 안 맞으면 빌드가 실패하고 배포가 멈춘다(2026-10-30 #682 이력 줄 · 약 10분 · #785 로 고침). 빌드는 병합 뒤에만 돌아 PR check 에 안 걸렸다.
# 그래서 PR 이 **새로 더한 줄**만 본다 — Pages 가 렌더하는 .md/.markdown(점으로 시작하는 폴더 밖)에 `{{` 또는 `{%` 가 있으면 실패.
#   옛 줄은 보지 않는다(docs/history.md 571행 `{{ .Token }}` 은 짝이 맞아 빌드를 깨지 않는다 — 지금 깨지 않는 것을 막지 않는다).
#   피하는 법: 그 글자를 코드 표시 안에 두어도 Liquid 는 해석한다 — 중괄호 사이를 띄우거나(`{ {`) 말로 풀어 쓴다.
# 쓰는 법: BASE_SHA=<sha> bash scripts/pages-liquid-check.sh [HEAD 참조 — 기본 HEAD] · 통과 0 · 실패 1 · 읽기만.
set -euo pipefail
base="${BASE_SHA:?BASE_SHA 필요}"
head="${1:-HEAD}"
hits=$(git diff -U0 "$base"..."$head" -- '*.md' '*.markdown' ':(exclude).*/**' ':(exclude).*' \
  | awk '/^\+\+\+ b\//{f=substr($0,7); next} /^\+/ && !/^\+\+\+/ && ($0 ~ /\{\{/ || $0 ~ /\{%/) {print f ": " substr($0,2,160)}')
if [ -z "$hits" ]; then
  echo "Pages Liquid 글자 검사 — 통과(새로 더한 .md 줄에 {{ · {% 없음)"; exit 0
fi
printf '%s\n' "$hits" | while IFS= read -r l; do echo "::error::Pages Liquid 글자 — $l"; done
echo "새 줄의 {{ 또는 {% 가 GitHub Pages(Jekyll) 빌드를 깰 수 있다 — 중괄호 사이를 띄우거나 말로 풀어 쓴다(#785)"
exit 1
