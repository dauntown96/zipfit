#!/usr/bin/env bash
# 병합 리허설 — 가지들을 주어진 순서대로 main 위에 머지해 보고 충돌 파일만 출력한다(원격 변경 0).
# 2026-10-26(우편함 「코드·운영 — 지방공사 받기 … + 병합 리허설 스크립트」 4 · 「런칭 날 병합 리허설」 검증 ⑦-2) — 런칭 날(S0) 쓴다.
#
# 쓰는 법(저장소 뿌리에서):
#   bash scripts/merge-rehearsal.sh <가지> [<가지> …]          # 가지 이름(origin/ 생략 가능) · 머지 순서대로
#   bash scripts/merge-rehearsal.sh --base origin/main #729 #682   # PR 번호(#N)도 된다 — refs/pull/N/head 를 가져온다
# 출력: 한 줄에 하나 「<가지> 충돌 0」 또는 「<가지> 충돌 N: 파일 …」 · 끝에 「합계 충돌 N」.
#   충돌이 난 머지는 되돌리고(abort) 다음 가지로 간다 — 「그 가지를 그 자리에 넣으면 충돌」을 보는 것이라, 뒤 가지는 그 가지 없이 이어 본다.
#   🔵 2026-10-29(우편함 「코드·운영 — 런칭 전날」 3) — 머지가 된 가지마다 아래에 「  └ sw.js vN(직전 vM)」 한 줄 ·
#   그 단계에서 index.html 이 바뀌었는데 판이 그대로면 「  ⚠️ index.html 이 바뀌었는데 sw.js 판 그대로(vN)」 한 줄(원칙 9 ·
#   2026-10-28 v256 이 둘 합쳐진 사례) · 끝에 「판 경고 N」. 판 경고는 종료 코드에 넣지 않는다(충돌만 센다 — 종전 그대로).
#   🔵 2026-10-30(우편함 「코드·운영 — #762 DB 묶음 병합」 덧 2) — --squash: 가지를 실제 병합과 같은 꼴로 얹는다(git merge --squash 뒤 커밋).
#   main 은 PR 을 squash 로 받는다 — 앞 가지를 머지 커밋으로 얹으면 그 가지를 품은 다음 가지가 깨끗하게 머지되지만, squash 로 얹으면
#   같은 내용이어도 충돌이 날 수 있다(2026-10-30 #682 squash 뒤 #776 — index.html 1곳 · 일반 리허설은 못 잡았다).
#   가지 자리에 커밋 sha(7자 이상 · 이 저장소에 있는 것)도 받는다 — 지난 상태를 재현할 때.
#   예: bash scripts/merge-rehearsal.sh --squash --base 70a910c^ '#682' b7311de
#   🔵 2026-10-30(우편함 「코드·운영 — 런칭 날 마감: … 리허설 규칙 넓힘」 A 2ⓐ · #781 계기) — 가지마다 두 단계를 더 본다.
#   ① 몸 대조(cmp): 그 단계가 실제로 바꾼 것(직전 → 머지 결과 · 충돌 파일은 뺀다)과 가지 몸(기준점 → 가지)을 파일마다
#      `git diff -U0` 의 patch-id(--stable · 줄 번호·문맥 무시)로 견준다 — 다르면 「  ❌ 몸 대조 다름: 파일 …」.
#      git 3방향 머지는 squash 자국 자리에서 충돌 표시 없이 블록을 겹쳐 붙일 수 있다(2026-10-30 #781 — open-gaps.mjs
#      ROUND_MIX_SQL 이 두 번 · README 충돌만 보였다). 충돌이 난 단계도 충돌 밖 파일은 대조한다.
#      기준점: 「가지@기준점」으로 준다(쌓인 가지 — 앞 PR 이 squash 로 들어간 뒤면 앞 PR head 를 기준점으로). 안 주면 merge-base(가지, 기준).
#      🔴 쌓인 가지를 기준점 없이 돌리면 앞 PR 몫까지 몸으로 잡혀 「다름」이 난다 — 그때는 기준점을 주고 다시 돈다.
#   ② 문법 검사: 그 단계에서 바뀐 .js·.mjs·.cjs 는 `node --check` · .html 은 인라인 <script>(src 없음 · JSON 제외)를 떠내 `node --check`
#      — 실패면 「  ❌ 문법 오류: 파일 …」(겹쳐 붙은 `export const` 둘은 모듈 파싱에서 걸린다).
#   예(#781 재현): bash scripts/merge-rehearsal.sh --squash --base 3e4640e c8a3604@87cd76d
# 종료 코드: 충돌 0 ∧ 몸 대조 다름 0 ∧ 문법 오류 0 이면 0 · 하나라도 있으면 1 · 사용법·가져오기 실패는 2(판 경고는 넣지 않는다).
# 🔴 원격에 아무것도 올리지 않는다(fetch 만) · 임시 작업트리(mktemp)에서만 머지한다 · 끝나면(오류여도) 작업트리를 지운다 ·
#   지금 작업트리·가지·인덱스는 건드리지 않는다.
set -euo pipefail

base=origin/main
squash=0
refs=()
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="${2:?--base 다음에 기준 ref}"; shift 2 ;;
    --squash) squash=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) refs+=("$1"); shift ;;
  esac
done
[ ${#refs[@]} -gt 0 ] || { echo "사용법: bash scripts/merge-rehearsal.sh [--base origin/main] [--squash] <가지|#PR|sha>[@기준점] …" >&2; exit 2; }

root=$(git rev-parse --show-toplevel)
cd "$root"

# 가져오기 — 기준과 각 가지(원격 추적 ref 로만 · 지역 가지를 만들지 않는다)
case "$base" in origin/*) git fetch -q origin "${base#origin/}" || { echo "기준을 가져오지 못함: $base" >&2; exit 2; } ;; esac
targets=()
for rr in "${refs[@]}"; do
  r=${rr%@*}; bb=""; [ "$r" != "$rr" ] && bb=${rr##*@}
  if [ -n "$bb" ]; then git rev-parse --verify --quiet "$bb^{commit}" >/dev/null || { echo "기준점을 찾지 못함: $bb" >&2; exit 2; }; fi
  if [[ "$r" =~ ^[0-9a-f]{7,40}$ ]] && git rev-parse --verify --quiet "$r^{commit}" >/dev/null; then targets+=("$r|$r|$bb"); continue; fi
  case "$r" in
    \#*) n=${r#\#}; git fetch -q origin "+refs/pull/$n/head:refs/remotes/origin/pr/$n" || { echo "PR #$n 을 가져오지 못함" >&2; exit 2; }
         targets+=("origin/pr/$n|#$n|$bb") ;;
    origin/*) git fetch -q origin "${r#origin/}" || { echo "가져오지 못함: $r" >&2; exit 2; }; targets+=("$r|${r#origin/}|$bb") ;;
    *) git fetch -q origin "$r" || { echo "가져오지 못함: $r" >&2; exit 2; }; targets+=("origin/$r|$r|$bb") ;;
  esac
done

wt=$(mktemp -d "${TMPDIR:-/tmp}/merge-rehearsal.XXXXXX")
cleanup() { git worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"; git worktree prune >/dev/null 2>&1 || true; }
trap cleanup EXIT
git worktree add -q --detach "$wt" "$base"

ver() { git -C "$wt" show "HEAD:sw.js" 2>/dev/null | sed -nE "s/^const CACHE_NAME = 'zipfit-v([0-9]+)';.*/\1/p" | head -1; }
# ① 몸 대조 — $1 직전 커밋 · $2 가지 ref · $3 기준점 · $4 충돌 파일(공백 구분) → 다른 파일 이름들을 출력
pid() { git -C "$wt" patch-id --stable 2>/dev/null | cut -d' ' -f1; }
body_cmp() {
  local before=$1 ref=$2 bb=$3 skip=" $4 " f a b out=""
  for f in $( { git -C "$wt" diff --name-only "$before" --; git -C "$wt" diff --name-only "$bb" "$ref" --; } | sort -u ); do
    case "$skip" in *" $f "*) continue ;; esac
    a=$(git -C "$wt" diff -U0 "$before" -- "$f" | pid); b=$(git -C "$wt" diff -U0 "$bb" "$ref" -- "$f" | pid)
    [ "$a" = "$b" ] || out="$out $f"
  done
  printf '%s' "${out# }"
}
# ② 문법 검사 — $1 직전 커밋 · $2 충돌 파일 → 실패 파일 이름들을 출력
syntax_check() {
  local before=$1 skip=" $2 " f out="" tmp
  command -v node >/dev/null 2>&1 || { printf '%s' ""; return; }
  for f in $(git -C "$wt" diff --name-only --diff-filter=AM "$before" --); do
    case "$skip" in *" $f "*) continue ;; esac
    case "$f" in
      *.js|*.mjs|*.cjs) node --check "$wt/$f" >/dev/null 2>&1 || out="$out $f" ;;
      *.html)
        tmp=$(mktemp -d "${TMPDIR:-/tmp}/rehearsal-js.XXXXXX")
        python3 - "$wt/$f" "$tmp" <<'PY' || true
import re, sys
src = open(sys.argv[1], encoding='utf-8', errors='replace').read()
i = 0
for m in re.finditer(r'<script\b([^>]*)>(.*?)</script\s*>', src, re.S | re.I):
    attrs, body = m.group(1), m.group(2)
    if re.search(r'\bsrc\s*=', attrs, re.I) or re.search(r'type\s*=\s*["\']?(application/(ld\+)?json|importmap|text/template)', attrs, re.I) or not body.strip():
        continue
    ext = '.mjs' if re.search(r'type\s*=\s*["\']?module', attrs, re.I) else '.js'
    i += 1
    open(f'{sys.argv[2]}/s{i}{ext}', 'w', encoding='utf-8').write(body)
PY
        for j in "$tmp"/*; do [ -e "$j" ] || continue; node --check "$j" >/dev/null 2>&1 || { out="$out $f"; break; }; done
        rm -rf "$tmp" ;;
    esac
  done
  printf '%s' "${out# }"
}
echo "기준 $base $(git rev-parse --short "$base")$([ "$squash" = 1 ] && echo ' · --squash(실제 병합 꼴)')"
echo "  └ sw.js v$(ver)"
total=0; warn=0; cmpbad=0; synbad=0
for t in "${targets[@]}"; do
  ref=${t%%|*}; rest=${t#*|}; name=${rest%%|*}; bb=${rest#*|}
  before=$(git -C "$wt" rev-parse HEAD); v0=$(ver)
  [ -n "$bb" ] || bb=$(git merge-base "$ref" "$base" 2>/dev/null || echo "$base")
  if [ "$squash" = 1 ]; then
    ok=0; git -C "$wt" merge -q --squash "$ref" >/dev/null 2>&1 && git -C "$wt" -c user.name=rehearsal -c user.email=rehearsal@localhost commit -q --allow-empty -m "squash $name" >/dev/null 2>&1 && ok=1
  else
    ok=0; git -C "$wt" -c user.name=rehearsal -c user.email=rehearsal@localhost merge -q --no-edit "$ref" >/dev/null 2>&1 && ok=1
  fi
  if [ "$ok" = 1 ]; then
    echo "$name($(git rev-parse --short "$ref")) 충돌 0"
    v1=$(ver); echo "  └ sw.js v${v1:-?}(직전 v${v0:-?})"
    if ! git -C "$wt" diff --quiet "$before" HEAD -- index.html && [ "$v1" = "$v0" ]; then
      echo "  ⚠️ index.html 이 바뀌었는데 sw.js 판 그대로(v${v1:-?})"; warn=$((warn + 1))
    fi
    d=$(body_cmp "$before" "$ref" "$bb" ""); if [ -n "$d" ]; then echo "  ❌ 몸 대조 다름(기준점 $(git rev-parse --short "$bb")): $d"; cmpbad=$((cmpbad + 1)); else echo "  └ 몸 대조 같음(기준점 $(git rev-parse --short "$bb"))"; fi
    e=$(syntax_check "$before" ""); if [ -n "$e" ]; then echo "  ❌ 문법 오류: $e"; synbad=$((synbad + 1)); fi
  else
    files=$(git -C "$wt" diff --name-only --diff-filter=U | tr '\n' ' ')
    n=$(printf '%s' "$files" | wc -w)
    if [ "$n" -eq 0 ]; then echo "$name — 머지 실패(충돌 파일 없음 · 다른 오류)"; n=1; else
      echo "$name($(git rev-parse --short "$ref")) 충돌 $n: $files"
      d=$(body_cmp "$before" "$ref" "$bb" "$files"); if [ -n "$d" ]; then echo "  ❌ 몸 대조 다름 — 충돌 밖 파일(기준점 $(git rev-parse --short "$bb")): $d"; cmpbad=$((cmpbad + 1)); else echo "  └ 충돌 밖 파일 몸 대조 같음(기준점 $(git rev-parse --short "$bb"))"; fi
      e=$(syntax_check "$before" "$files"); if [ -n "$e" ]; then echo "  ❌ 문법 오류 — 충돌 밖 파일: $e"; synbad=$((synbad + 1)); fi
    fi
    total=$((total + n))
    git -C "$wt" merge --abort >/dev/null 2>&1 || git -C "$wt" reset -q --hard HEAD
  fi
done
echo "합계 충돌 $total"
echo "판 경고 $warn"
echo "몸 대조 다름 $cmpbad · 문법 오류 $synbad"
[ "$total" -eq 0 ] && [ "$cmpbad" -eq 0 ] && [ "$synbad" -eq 0 ]
