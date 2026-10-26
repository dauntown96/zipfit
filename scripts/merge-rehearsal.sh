#!/usr/bin/env bash
# 병합 리허설 — 가지들을 주어진 순서대로 main 위에 머지해 보고 충돌 파일만 출력한다(원격 변경 0).
# 2026-10-26(우편함 「코드·운영 — 지방공사 받기 … + 병합 리허설 스크립트」 4 · 「런칭 날 병합 리허설」 검증 ⑦-2) — 런칭 날(S0) 쓴다.
#
# 쓰는 법(저장소 뿌리에서):
#   bash scripts/merge-rehearsal.sh <가지> [<가지> …]          # 가지 이름(origin/ 생략 가능) · 머지 순서대로
#   bash scripts/merge-rehearsal.sh --base origin/main #729 #682   # PR 번호(#N)도 된다 — refs/pull/N/head 를 가져온다
# 출력: 한 줄에 하나 「<가지> 충돌 0」 또는 「<가지> 충돌 N: 파일 …」 · 끝에 「합계 충돌 N」.
#   충돌이 난 머지는 되돌리고(abort) 다음 가지로 간다 — 「그 가지를 그 자리에 넣으면 충돌」을 보는 것이라, 뒤 가지는 그 가지 없이 이어 본다.
# 종료 코드: 충돌 0 이면 0 · 하나라도 있으면 1 · 사용법·가져오기 실패는 2.
# 🔴 원격에 아무것도 올리지 않는다(fetch 만) · 임시 작업트리(mktemp)에서만 머지한다 · 끝나면(오류여도) 작업트리를 지운다 ·
#   지금 작업트리·가지·인덱스는 건드리지 않는다.
set -euo pipefail

base=origin/main
refs=()
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="${2:?--base 다음에 기준 ref}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) refs+=("$1"); shift ;;
  esac
done
[ ${#refs[@]} -gt 0 ] || { echo "사용법: bash scripts/merge-rehearsal.sh [--base origin/main] <가지|#PR> …" >&2; exit 2; }

root=$(git rev-parse --show-toplevel)
cd "$root"

# 가져오기 — 기준과 각 가지(원격 추적 ref 로만 · 지역 가지를 만들지 않는다)
case "$base" in origin/*) git fetch -q origin "${base#origin/}" || { echo "기준을 가져오지 못함: $base" >&2; exit 2; } ;; esac
targets=()
for r in "${refs[@]}"; do
  case "$r" in
    \#*) n=${r#\#}; git fetch -q origin "+refs/pull/$n/head:refs/remotes/origin/pr/$n" || { echo "PR #$n 을 가져오지 못함" >&2; exit 2; }
         targets+=("origin/pr/$n|#$n") ;;
    origin/*) git fetch -q origin "${r#origin/}" || { echo "가져오지 못함: $r" >&2; exit 2; }; targets+=("$r|${r#origin/}") ;;
    *) git fetch -q origin "$r" || { echo "가져오지 못함: $r" >&2; exit 2; }; targets+=("origin/$r|$r") ;;
  esac
done

wt=$(mktemp -d "${TMPDIR:-/tmp}/merge-rehearsal.XXXXXX")
cleanup() { git worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"; git worktree prune >/dev/null 2>&1 || true; }
trap cleanup EXIT
git worktree add -q --detach "$wt" "$base"

echo "기준 $base $(git rev-parse --short "$base")"
total=0
for t in "${targets[@]}"; do
  ref=${t%%|*}; name=${t#*|}
  if git -C "$wt" -c user.name=rehearsal -c user.email=rehearsal@localhost merge -q --no-edit "$ref" >/dev/null 2>&1; then
    echo "$name($(git rev-parse --short "$ref")) 충돌 0"
  else
    files=$(git -C "$wt" diff --name-only --diff-filter=U | tr '\n' ' ')
    n=$(printf '%s' "$files" | wc -w)
    if [ "$n" -eq 0 ]; then echo "$name — 머지 실패(충돌 파일 없음 · 다른 오류)"; n=1; else echo "$name($(git rev-parse --short "$ref")) 충돌 $n: $files"; fi
    total=$((total + n))
    git -C "$wt" merge --abort >/dev/null 2>&1 || git -C "$wt" reset -q --hard HEAD
  fi
done
echo "합계 충돌 $total"
[ "$total" -eq 0 ]
