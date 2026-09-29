#!/usr/bin/env bash
# 자동 점검 알림 — 결과 파일(health-result.json)을 읽어 라벨별 이슈를 하나만 유지한다.
#   실패 + 열린 이슈 없음 → 새 이슈 · 실패 + 열린 이슈 있음 → 댓글 · 통과 + 열린 이슈 있음 → 회복 댓글 뒤 닫기.
# 인자: $1 라벨(health-screen | health-ops) · $2 이슈 제목 · 환경: GH_TOKEN(github.token), RUN_URL
set -euo pipefail
LABEL="$1"; TITLE="$2"
if [ ! -f health-result.json ]; then
  # 점검 스크립트가 결과를 남기기 전에 죽었다 — 그것 자체가 실패다.
  echo '{"ok": false, "failed": ["runner"]}' > health-result.json
  printf '## 점검 스크립트가 결과를 남기지 못했다\n\n실행 로그를 볼 것.\n' > health-summary.md
fi
OK=$(python3 -c 'import json; print("true" if json.load(open("health-result.json"))["ok"] else "false")')
gh label create "$LABEL" --color D93F0B --description "자동 점검 실패(워크플로가 열고 닫는다)" >/dev/null 2>&1 || true
OPEN=$(gh issue list --label "$LABEL" --state open --limit 1 --json number --jq '.[0].number' 2>/dev/null || true)
{
  cat health-summary.md
  echo
  echo "실행: ${RUN_URL}"
  echo
  echo "결과 파일은 이 실행의 아티팩트 \`health-result\`(health-result.json)에 있다."
} > /tmp/issue_body.md
if [ "$OK" = "false" ]; then
  if [ -n "$OPEN" ]; then
    gh issue comment "$OPEN" --body-file /tmp/issue_body.md
    echo "기존 이슈 #$OPEN 에 댓글"
  else
    URL=$(gh issue create --title "$TITLE" --label "$LABEL" --body-file /tmp/issue_body.md)
    echo "새 이슈: $URL"
  fi
elif [ -n "$OPEN" ]; then
  { echo "### ✅ 회복 — 이번 실행은 통과했다. 워크플로가 이 이슈를 닫는다."; echo; cat /tmp/issue_body.md; } > /tmp/issue_close.md
  gh issue comment "$OPEN" --body-file /tmp/issue_close.md
  gh issue close "$OPEN" --reason completed
  echo "이슈 #$OPEN 닫음(회복)"
else
  echo "통과 · 열린 이슈 없음"
fi
