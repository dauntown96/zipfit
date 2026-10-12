#!/usr/bin/env bash
# 세션 시작 때 공고 분석·덤프 조사에 쓰는 파이썬 패키지를 버전 고정으로 맞춘다(2026-10-12 · 우편함 「코드 — Claude Code 장비 정비」 2).
# 왜: 컨테이너 이미지마다 있는 것이 달랐다 — 2026-09-22엔 pdfplumber 없음 · 2026-10-12엔 pdfplumber 있음·pgdumplib 없음·python-hwpx 없음.
#     「있다/없다」를 CLAUDE.md에 적어 두면 다음 컨테이너에서 틀린다(원칙 28) — 그래서 적지 않고 여기서 맞춘다.
# 🔴 이미 있으면 몇 초 안에 끝난다(import 만 해 보고 빠진 것만 설치) · 실패해도 세션을 막지 않는다(언제나 exit 0).
# 🔴 두 저장소가 함께 붙은 세션(루틴 포함)에서는 저장소 .claude/settings.json 의 SessionStart 훅이 돌지 않는다(Claude Code 문서 ·
#    2026-10-12 실측) — 그때는 이 파일을 손으로 한 번 돌린다: bash /home/user/zipfit/.claude/hooks/session-setup.sh
LOG=/tmp/zipfit-session-setup.log
PY=/usr/bin/python3
{
  echo "== $(date -u +%FT%TZ) session-setup"
  need=()
  "$PY" -c 'import pdfplumber' 2>/dev/null || need+=(pdfplumber==0.11.10 cffi==2.1.1)
  "$PY" -c 'import pgdumplib' 2>/dev/null || need+=(pgdumplib==4.0.0)
  "$PY" -c 'import hwpx.hwp5.package' 2>/dev/null || need+=(python-hwpx==6.8.0)
  if [ ${#need[@]} -eq 0 ]; then
    echo "이미 있음: pdfplumber pgdumplib python-hwpx"
  else
    echo "설치: ${need[*]}"
    timeout 120 "$PY" -m pip install -q --disable-pip-version-check "${need[@]}" 2>&1 | grep -v 'Running pip as the' || true
    "$PY" -c 'import pdfplumber, pgdumplib, hwpx.hwp5.package; print("확인: 셋 다 import 됨")' 2>&1
  fi
} >>"$LOG" 2>&1
exit 0
