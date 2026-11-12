#!/usr/bin/env bash
# CI 건너뛰기 표시 검사(2026-11-12 · 우편함 「코드·운영 — 0장 일곱 …」 1 · #1006 사고).
# PR 제목 · 본문 · PR 커밋 메시지에 GitHub 가 「워크플로를 돌리지 마라」로 읽는 낱말이 있으면 실패한다:
#   [skip ci] · [ci skip] · [no ci] · [skip actions] · [actions skip](대소문자 무시).
#   계기: #1006 시험 커밋 제목의 표시가 squash 병합 메시지에 실려 main push 워크플로(DB 적용)가 전부 건너뛰어졌다(수동 적용으로 메움).
#   ⚠️ head 커밋 메시지에 표시가 있으면 PR 실행 자체가 돌지 않아 필수 체크 check 가 생기지 않는다 — 그때는 병합이 「기다림」으로 막힌다(그 자체가 신호).
#   ⚠️ 병합 때 손으로 적는 squash 메시지는 이 검사가 보지 못한다 — 병합하는 쪽이 직전에 본다.
# 쓰는 법: PR_TITLE=… PR_BODY=… BASE_SHA=<sha> bash scripts/skip-ci-check.sh [HEAD 참조 — 기본 HEAD]
# 결과: 통과 0 · 실패 1. 읽기만 한다(git log).
set -euo pipefail
base="${BASE_SHA:?BASE_SHA 필요}"
head="${1:-HEAD}"
re='\[(skip ci|ci skip|no ci|skip actions|actions skip)\]'
bad=0
hit() { # $1 = 자리 이름 · stdin = 글
  local m
  m=$(grep -noiE "$re" || true)
  if [ -n "$m" ]; then
    printf '%s\n' "$m" | while IFS= read -r l; do echo "::error::CI 건너뛰기 표시 — $1 ${l}"; done
    return 1
  fi
  return 0
}
printf '%s\n' "${PR_TITLE:-}" | hit "PR 제목" || bad=1
printf '%s\n' "${PR_BODY:-}" | hit "PR 본문(줄)" || bad=1
# PR 커밋 범위 — pull_request 실행의 HEAD 는 병합 시험 커밋(부모 1 = 지금 base 끝 · 부모 2 = PR head)이라 「부모 2 에서 부모 1 을 뺀 것」.
#   BASE_SHA(이벤트의 base.sha)는 오래된 PR 에서 낡아 그사이 main 에 들어온 커밋까지 세었다(2026-11-12 Dependabot #436 거짓 실패 — #1006 옛 커밋).
#   병합 커밋이 아니면(로컬 시험) 종전대로 base..head.
if git rev-parse -q --verify "$head^2" >/dev/null; then range=("$head^2" "^$head^1"); else range=("$base..$head"); fi
for c in $(git rev-list --no-merges "${range[@]}"); do
  git log -1 --format=%B "$c" | hit "커밋 ${c:0:7}(줄)" || bad=1
done
if [ "$bad" = 0 ]; then echo "CI 건너뛰기 표시 0 — 통과(제목 · 본문 · 커밋 $(git rev-list --no-merges --count "${range[@]}")개)"; exit 0; fi
echo "CI 건너뛰기 표시가 있다 — 지우고 다시(커밋 메시지는 새 커밋으로 덮이지 않으니 squash 메시지에서 빼고 병합하거나 가지를 다시 뜬다)"
exit 1
