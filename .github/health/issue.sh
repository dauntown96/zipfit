#!/usr/bin/env bash
# 자동 점검 알림 — 결과 파일(health-result.json)을 읽어 라벨별 이슈를 하나만 유지한다.
#   실패 + 열린 이슈 없음 → 새 이슈 · 실패 + 열린 이슈 있음 → 댓글 · 통과 + 열린 이슈 있음 → 회복 댓글 뒤 닫기.
# 인자: $1 라벨(health-screen | health-ops) · $2 이슈 제목 · [$3 점검 불능 라벨 · $4 점검 불능 제목] · 환경: GH_TOKEN(github.token), RUN_URL
# 🔵 2026-10-06(우편함 「코드 — 1-C …」 2) — 점검 불능 라벨($3 · health-ops 는 health-ops-blind):
#   실패가 「점검 실행」(runner) 하나뿐이면 = 점검 도구가 못 돌았다(인증·관리 API 장애) → $3 라벨 이슈(루틴은 막지 않는다 — 루틴 지시 v2.3).
#   그 이슈가 만든 지 6시간 넘게 열려 있으면 같은 이슈에 $1 라벨을 더한다(승격 — 그때부터 루틴을 막는다).
#   실제 실패(runner 밖 항목)가 나면 $1 이슈를 열고/댓글 · 승격 안 된 $3 이슈는 「점검은 다시 돈다」 댓글 뒤 닫는다.
#   통과하면 $1 · $3 두 라벨의 열린 이슈를 모두 닫는다.
# 환경 DRY_RUN=1 이면 GitHub 에 쓰지 않고 할 일만 찍는다(가지 실행 — 판정·라벨 계산 확인용).
set -euo pipefail
LABEL="$1"; TITLE="$2"; BLIND_LABEL="${3:-}"; BLIND_TITLE="${4:-}"
DRY="${DRY_RUN:-}"
BLIND_HOURS=6
if [ ! -f health-result.json ]; then
  # 점검 스크립트가 결과를 남기기 전에 죽었다 — 그것 자체가 실패다.
  echo '{"ok": false, "failed": ["runner"]}' > health-result.json
  printf '## 점검 스크립트가 결과를 남기지 못했다\n\n실행 로그를 볼 것.\n' > health-summary.md
fi
OK=$(python3 -c 'import json; print("true" if json.load(open("health-result.json"))["ok"] else "false")')
RUNNER_ONLY=$(python3 -c 'import json; print("true" if json.load(open("health-result.json")).get("failed") == ["runner"] else "false")')
gh_write() { if [ -n "$DRY" ]; then echo "[DRY_RUN] gh $*"; else gh "$@"; fi; }
if [ -z "$DRY" ]; then
  gh label create "$LABEL" --color D93F0B --description "자동 점검 실패(워크플로가 열고 닫는다)" >/dev/null 2>&1 || true
  if [ -n "$BLIND_LABEL" ]; then gh label create "$BLIND_LABEL" --color FBCA04 --description "자동 점검 불능 — 점검 도구가 못 돌았다(루틴은 막지 않음 · 6시간 넘으면 승격)" >/dev/null 2>&1 || true; fi
fi
OPEN=$(gh issue list --label "$LABEL" --state open --limit 1 --json number --jq '.[0].number' 2>/dev/null || true)
OPEN_BLIND=""; BLIND_AGE_H=0; BLIND_ESCALATED=false
if [ -n "$BLIND_LABEL" ]; then
  read -r OPEN_BLIND BLIND_AGE_H BLIND_ESCALATED < <(gh issue list --label "$BLIND_LABEL" --state open --limit 1 --json number,createdAt,labels \
    | python3 -c '
import json,sys,datetime
x=json.load(sys.stdin)
if not x: print("- 0 false"); sys.exit()
i=x[0]; age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(i["createdAt"].replace("Z","+00:00"))).total_seconds()/3600
print(i["number"], round(age,2), "true" if any(l["name"]==sys.argv[1] for l in i["labels"]) else "false")' "$LABEL" 2>/dev/null || echo "- 0 false")
  if [ "$OPEN_BLIND" = "-" ]; then OPEN_BLIND=""; fi
fi
{
  cat health-summary.md
  echo
  echo "실행: ${RUN_URL:-}"
  echo
  echo "결과 파일은 이 실행의 아티팩트 \`health-result\`(health-result.json)에 있다."
} > /tmp/issue_body.md
# 🔵 2026-10-08(우편함 「코드 — 운영 기반 후속」 3) — 열 때·실패 재발 댓글에는 다운님 직접 언급을 맨 앞에 둔다.
#    봇이 연 이슈의 Watching 알림은 휴대폰에 오지 않았다(#407) — 언급 알림은 앱 푸시 기본값이 켜져 있다. 회복 닫힘 댓글에는 넣지 않는다(알림 피로).
MENTION="${ISSUE_MENTION-@dauntown96}"
{ [ -n "$MENTION" ] && { echo "$MENTION 자동 점검 알림"; echo; }; cat /tmp/issue_body.md; } > /tmp/issue_alert.md
echo "판정: ok=$OK · runner만=$RUNNER_ONLY · 열린 $LABEL=#${OPEN:-없음} · 열린 ${BLIND_LABEL:-(불능 라벨 없음)}=#${OPEN_BLIND:-없음}(경과 ${BLIND_AGE_H}시간 · 승격=$BLIND_ESCALATED)"
if [ "$OK" = "false" ] && [ "$RUNNER_ONLY" = "true" ] && [ -n "$BLIND_LABEL" ] && [ -z "$OPEN" -o "$OPEN" = "$OPEN_BLIND" ]; then
  # 점검 불능 — 실제 실패 이슈가 따로 열려 있지 않을 때만(열려 있으면 아래 일반 갈래가 그 이슈에 댓글).
  if [ -n "$OPEN_BLIND" ]; then
    gh_write issue comment "$OPEN_BLIND" --body-file /tmp/issue_alert.md
    echo "라벨 $BLIND_LABEL · 기존 이슈 #$OPEN_BLIND 에 댓글"
    if [ "$BLIND_ESCALATED" = "false" ] && python3 -c "import sys; sys.exit(0 if float('$BLIND_AGE_H') > $BLIND_HOURS else 1)"; then
      gh_write issue edit "$OPEN_BLIND" --add-label "$LABEL"
      { [ -n "$MENTION" ] && echo "$MENTION"; echo "### ⬆️ 승격 — 점검 불능이 ${BLIND_HOURS}시간 넘게 이어졌다(${BLIND_AGE_H}시간). 라벨 \`$LABEL\`을 더한다 — 이제 루틴 착수를 막는다."; } > /tmp/issue_up.md
      gh_write issue comment "$OPEN_BLIND" --body-file /tmp/issue_up.md
      echo "승격: #$OPEN_BLIND 에 $LABEL 라벨"
    fi
  else
    if [ -n "$DRY" ]; then echo "[DRY_RUN] gh issue create --title \"$BLIND_TITLE\" --label $BLIND_LABEL"; else
      URL=$(gh issue create --title "$BLIND_TITLE" --label "$BLIND_LABEL" --body-file /tmp/issue_alert.md)
      echo "새 이슈(점검 불능): $URL"
    fi
  fi
elif [ "$OK" = "false" ]; then
  if [ -n "$OPEN" ]; then
    gh_write issue comment "$OPEN" --body-file /tmp/issue_alert.md
    echo "기존 이슈 #$OPEN 에 댓글"
  else
    if [ -n "$DRY" ]; then echo "[DRY_RUN] gh issue create --title \"$TITLE\" --label $LABEL"; else
      URL=$(gh issue create --title "$TITLE" --label "$LABEL" --body-file /tmp/issue_alert.md)
      echo "새 이슈: $URL"
    fi
  fi
  if [ -n "$OPEN_BLIND" ] && [ "$BLIND_ESCALATED" = "false" ] && [ "$RUNNER_ONLY" = "false" ]; then
    { echo "### 점검이 다시 돈다 — 이번 실행은 「점검 실행」 밖 항목이 실패했다(라벨 \`$LABEL\` 이슈로 옮긴다). 이 점검 불능 이슈는 닫는다."; echo; echo "실행: ${RUN_URL:-}"; } > /tmp/issue_blind_close.md
    gh_write issue comment "$OPEN_BLIND" --body-file /tmp/issue_blind_close.md
    gh_write issue close "$OPEN_BLIND" --reason completed
    echo "점검 불능 이슈 #$OPEN_BLIND 닫음(점검 재개 · 실제 실패로 옮김)"
  fi
else
  { echo "### ✅ 회복 — 이번 실행은 통과했다. 워크플로가 이 이슈를 닫는다."; echo; cat /tmp/issue_body.md; } > /tmp/issue_close.md
  CLOSED=""
  for N in $OPEN $OPEN_BLIND; do
    case " $CLOSED " in *" $N "*) continue ;; esac
    gh_write issue comment "$N" --body-file /tmp/issue_close.md
    gh_write issue close "$N" --reason completed
    echo "이슈 #$N 닫음(회복)"
    CLOSED="$CLOSED $N"
  done
  if [ -z "$CLOSED" ]; then echo "통과 · 열린 이슈 없음"; fi
fi
