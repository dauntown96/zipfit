#!/usr/bin/env bash
# CACHE 판 검사(2026-10-29 · 우편함 「코드·운영 — 런칭 전날」 2 · CLAUDE.md 원칙 9).
# index.html 또는 sw.js 를 바꾼 PR 은 head sw.js 의 CACHE_NAME 숫자가 base 숫자 + 1 이어야 한다.
#   - base = PR 의 base 끝(BASE_SHA · 지금 main) — 그사이 main 이 판을 올렸으면 head 가 main 을 머지하고 다시 +1 해야 통과한다
#     (2026-10-28 갤러리 v256 = #760 v256 이 조용히 합쳐진 사례 — 같은 숫자 둘이 병합되면 브라우저 캐시가 갱신되지 않는다).
#   - 두 파일 다 안 바꾼 PR(문서·점검만)은 건너뛴다.
# 쓰는 법: BASE_SHA=<sha> bash scripts/cache-bump-check.sh [HEAD 참조 — 기본 HEAD]
# 결과: 통과 0 · 실패 1 · 건너뜀 0. 읽기만 한다(git show · git diff).
set -euo pipefail
base="${BASE_SHA:?BASE_SHA 필요}"
head="${1:-HEAD}"

changed=$(git diff --name-only "$base"..."$head" -- index.html sw.js)
if [ -z "$changed" ]; then
  echo "CACHE 판 검사 — 건너뜀(index.html · sw.js 변경 없음)"; exit 0
fi

ver() { git show "$1:sw.js" 2>/dev/null | sed -nE "s/^const CACHE_NAME = 'zipfit-v([0-9]+)';.*/\1/p" | head -1; }
b=$(ver "$base"); h=$(ver "$head")
if [ -z "$b" ] || [ -z "$h" ]; then
  echo "::error::CACHE 판 검사 — sw.js 첫 줄에서 CACHE_NAME 숫자를 못 읽음(base '${b:-없음}' · head '${h:-없음}')"; exit 1
fi
files=$(printf '%s' "$changed" | paste -sd ' ' -)
if [ "$h" -eq $((b + 1)) ]; then
  echo "CACHE 판 검사 — 통과(base v$b → head v$h · 바뀐 파일: $files)"; exit 0
fi
echo "::error::CACHE 판 검사 — head v$h ≠ base v$b + 1 (바뀐 파일: $files). main 을 머지한 뒤 sw.js CACHE_NAME 을 v$((b + 1)) 로(원칙 9)"
exit 1
