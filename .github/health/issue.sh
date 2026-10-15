#!/usr/bin/env bash
# 자동 점검 알림 — 결과 파일(health-result.json)을 읽어 라벨별 이슈를 하나만 유지한다.
#   실패 + 열린 이슈 없음 → 새 이슈 · 실패 + 열린 이슈 있음 → 댓글 · 통과 + 열린 이슈 있음 → 회복 댓글 뒤 닫기.
# 인자: $1 라벨(health-screen | health-ops) · $2 이슈 제목 · [$3 점검 불능 라벨 · $4 점검 불능 제목] · [$5 안 멈춤 라벨 · $6 안 멈춤 제목]
#   환경: GH_TOKEN(github.token), RUN_URL
# 🔵 2026-10-06(우편함 「코드 — 1-C …」 2) — 점검 불능 라벨($3 · health-ops 는 health-ops-blind):
#   「점검 실행」(runner)이 실패 = 점검 도구가 못 돌았다(인증·관리 API 장애) → $3 라벨 이슈(루틴은 막지 않는다 — 루틴 지시 v2.3).
#   그 이슈가 만든 지 6시간 넘게 열려 있으면 같은 이슈에 $1 라벨을 더한다(승격 — 그때부터 루틴을 막는다).
# 🔵 2026-10-15(우편함 「코드 — … 0단계 관문 항목별 …」 4) — 안 멈춤 라벨($5 · health-ops 는 health-ops-soft):
#   결과 파일에 failed_hard 가 있으면(ops — gate.mjs) 실패를 셋으로 가른다 — 멈춤(failed_hard) → $1 · 점검 불능(runner) → $3 ·
#   나머지(안 멈춤) → $5. 세 이슈는 서로 따로 열리고 따로 닫힌다(그 갈래의 실패가 없어지면 닫는다).
#   루틴 v2.6 은 $1(health-ops)·health-screen·db-apply 가 열려 있으면 멈추고 $3·$5 는 통과한다 — 루틴 지시를 바꾸지 않고 효과가 난다.
#   failed_hard 가 없으면(health-screen · 옛 결과 파일) 종전대로 runner 밖 실패는 전부 $1 이다.
#   다운님 직접 언급: $1·$3 은 열 때와 실패 댓글마다 · $5 는 열 때만(30분마다 언급하면 알림이 읽히지 않는다).
# 환경 DRY_RUN=1 이면 GitHub 에 쓰지 않고 할 일만 찍는다(가지 실행 — 판정·라벨 계산 확인용).
set -euo pipefail
LABEL="$1"; TITLE="$2"; BLIND_LABEL="${3:-}"; BLIND_TITLE="${4:-}"; SOFT_LABEL="${5:-}"; SOFT_TITLE="${6:-}"
DRY="${DRY_RUN:-}"
BLIND_HOURS=6
if [ ! -f health-result.json ]; then
  # 점검 스크립트가 결과를 남기기 전에 죽었다 — 그것 자체가 실패다.
  echo '{"ok": false, "failed": ["runner"]}' > health-result.json
  printf '## 점검 스크립트가 결과를 남기지 못했다\n\n실행 로그를 볼 것.\n' > health-summary.md
fi
# 갈래 계산 — HARD SOFT RUNNER 세 칸(true/false). 점검 불능 라벨이 없으면 runner 는 멈춤이다(health-screen).
read -r HARD SOFT RUNNER < <(python3 - "$BLIND_LABEL" "$SOFT_LABEL" <<'PY'
import json, sys
blind, soft_label = sys.argv[1], sys.argv[2]
r = json.load(open("health-result.json"))
failed = r.get("failed") or []
runner = bool(blind) and "runner" in failed
rest = [x for x in failed if not (runner and x == "runner")]
if soft_label and "failed_hard" in r:
    hard = [x for x in rest if x in r["failed_hard"]]
    soft = [x for x in rest if x not in r["failed_hard"]]
else:
    hard, soft = rest, []
b = lambda v: "true" if v else "false"
print(b(hard), b(soft), b(runner))
PY
)
gh_write() { if [ -n "$DRY" ]; then echo "[DRY_RUN] gh $*"; else gh "$@"; fi; }
if [ -z "$DRY" ]; then
  gh label create "$LABEL" --color D93F0B --description "자동 점검 실패(워크플로가 열고 닫는다)" >/dev/null 2>&1 || true
  if [ -n "$BLIND_LABEL" ]; then gh label create "$BLIND_LABEL" --color FBCA04 --description "자동 점검 불능 — 점검 도구가 못 돌았다(루틴은 막지 않음 · 6시간 넘으면 승격)" >/dev/null 2>&1 || true; fi
  if [ -n "$SOFT_LABEL" ]; then gh label create "$SOFT_LABEL" --color FEF2C0 --description "자동 점검 실패 — 루틴을 멈추지 않는 항목(수집·이미지·백업·화면·발송 지연 등 · .github/health/gate.mjs)" >/dev/null 2>&1 || true; fi
fi
# 열린 이슈 — 라벨마다 하나. 멈춤 이슈는 점검 불능 라벨이 없는 것만(승격된 점검 불능 이슈는 두 라벨을 다 단다).
open_of() {  # $1 라벨 · $2 이 라벨을 단 이슈는 뺀다(선택) → "번호 경과시간 승격여부" 또는 "- 0 false"
  gh issue list --label "$1" --state open --limit 20 --json number,createdAt,labels 2>/dev/null | python3 -c '
import json,sys,datetime
x=json.load(sys.stdin); ex=sys.argv[1]; up=sys.argv[2]
x=[i for i in x if not (ex and any(l["name"]==ex for l in i["labels"]))]
if not x: print("- 0 false"); sys.exit()
i=sorted(x, key=lambda i: i["number"])[0]
age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(i["createdAt"].replace("Z","+00:00"))).total_seconds()/3600
print(i["number"], round(age,2), "true" if any(l["name"]==up for l in i["labels"]) else "false")' "${2:-}" "$LABEL" 2>/dev/null || echo "- 0 false"
}
read -r OPEN _ _ < <(open_of "$LABEL" "$BLIND_LABEL"); [ "$OPEN" = "-" ] && OPEN=""
OPEN_BLIND=""; BLIND_AGE_H=0; BLIND_ESCALATED=false
if [ -n "$BLIND_LABEL" ]; then read -r OPEN_BLIND BLIND_AGE_H BLIND_ESCALATED < <(open_of "$BLIND_LABEL"); [ "$OPEN_BLIND" = "-" ] && OPEN_BLIND=""; fi
OPEN_SOFT=""
if [ -n "$SOFT_LABEL" ]; then read -r OPEN_SOFT _ _ < <(open_of "$SOFT_LABEL"); [ "$OPEN_SOFT" = "-" ] && OPEN_SOFT=""; fi
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
echo "판정: 멈춤=$HARD · 안 멈춤=$SOFT · 점검 불능=$RUNNER · 열린 $LABEL=#${OPEN:-없음} · 열린 ${BLIND_LABEL:-(불능 라벨 없음)}=#${OPEN_BLIND:-없음}(경과 ${BLIND_AGE_H}시간 · 승격=$BLIND_ESCALATED) · 열린 ${SOFT_LABEL:-(안 멈춤 라벨 없음)}=#${OPEN_SOFT:-없음}"

# 열기·댓글 — $1 번호(없으면 새로) · $2 라벨 · $3 제목 · $4 댓글 본문 파일
raise() {
  if [ -n "$1" ]; then gh_write issue comment "$1" --body-file "$4"; echo "라벨 $2 · 기존 이슈 #$1 에 댓글"
  elif [ -n "$DRY" ]; then echo "[DRY_RUN] gh issue create --title \"$3\" --label $2"
  else echo "새 이슈($2): $(gh issue create --title "$3" --label "$2" --body-file /tmp/issue_alert.md)"; fi
}
# 닫기 — $1 번호 · $2 댓글 머리
settle() {
  { echo "$2"; echo; cat /tmp/issue_body.md; } > /tmp/issue_close.md
  gh_write issue comment "$1" --body-file /tmp/issue_close.md
  gh_write issue close "$1" --reason completed
  echo "이슈 #$1 닫음"
}

# ① 멈춤($1)
if [ "$HARD" = "true" ]; then raise "$OPEN" "$LABEL" "$TITLE" /tmp/issue_alert.md
elif [ -n "$OPEN" ]; then
  if [ "$SOFT" = "true" ]; then settle "$OPEN" "### ✅ 멈추는 실패 회복 — 이번 실행에 루틴을 멈추는 실패가 없다. 남은 실패는 안 멈춤(\`$SOFT_LABEL\`) 이슈로 옮긴다. 워크플로가 이 이슈를 닫는다."
  else settle "$OPEN" "### ✅ 회복 — 이번 실행은 통과했다. 워크플로가 이 이슈를 닫는다."; fi
fi
# ② 점검 불능($3)
if [ -n "$BLIND_LABEL" ]; then
  if [ "$RUNNER" = "true" ]; then
    raise "$OPEN_BLIND" "$BLIND_LABEL" "$BLIND_TITLE" /tmp/issue_alert.md
    if [ -n "$OPEN_BLIND" ] && [ "$BLIND_ESCALATED" = "false" ] && python3 -c "import sys; sys.exit(0 if float('$BLIND_AGE_H') > $BLIND_HOURS else 1)"; then
      gh_write issue edit "$OPEN_BLIND" --add-label "$LABEL"
      { [ -n "$MENTION" ] && echo "$MENTION"; echo "### ⬆️ 승격 — 점검 불능이 ${BLIND_HOURS}시간 넘게 이어졌다(${BLIND_AGE_H}시간). 라벨 \`$LABEL\`을 더한다 — 이제 루틴 착수를 막는다."; } > /tmp/issue_up.md
      gh_write issue comment "$OPEN_BLIND" --body-file /tmp/issue_up.md
      echo "승격: #$OPEN_BLIND 에 $LABEL 라벨"
    fi
  elif [ -n "$OPEN_BLIND" ]; then settle "$OPEN_BLIND" "### ✅ 점검이 다시 돈다 — 이번 실행은 「점검 실행」이 끝까지 돌았다. 워크플로가 이 점검 불능 이슈를 닫는다."
  fi
fi
# ③ 안 멈춤($5) — 댓글에는 언급을 넣지 않는다(열 때만)
if [ -n "$SOFT_LABEL" ]; then
  if [ "$SOFT" = "true" ]; then raise "$OPEN_SOFT" "$SOFT_LABEL" "$SOFT_TITLE" /tmp/issue_body.md
  elif [ -n "$OPEN_SOFT" ]; then settle "$OPEN_SOFT" "### ✅ 회복 — 이번 실행에 안 멈추는 실패가 없다. 워크플로가 이 이슈를 닫는다."
  fi
fi
if [ "$HARD$SOFT$RUNNER" = "falsefalsefalse" ] && [ -z "$OPEN$OPEN_BLIND$OPEN_SOFT" ]; then echo "통과 · 열린 이슈 없음"; fi
