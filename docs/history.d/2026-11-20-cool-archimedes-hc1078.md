# 2026-11-20 — 코드·운영 — 13장(규칙 회차): 이력을 PR마다 새 파일(docs/history.d/)

우편함 같은 이름 · 다운님 승인 2026-11-19 14:38 · 근거 조사 「병렬 PR 실패」(#1134 — 14일 PR 안 머지 충돌 46 중 `docs/history.md` 42 · `CLAUDE.md` 40 · 표 칸 `|` 빨간 check 10) · `index.html`·`sw.js`·DB 안 건드림.

- 이력 = PR마다 `docs/history.d/YYYY-MM-DD-<가지>.md` 새 파일 하나(이 파일이 첫 파일) · 표가 아닌 꼴 · 읽기 = `ls -r docs/history.d | head`(`ls -t`는 새 클론에서 수정 시각이 모두 같아 쓰지 않음).
- `docs/history.md`는 내용 그대로 · 맨 위 표지 한 줄(「이 날 뒤는 history.d/」) · 모으기 봇 없음.
- `CLAUDE.md`: 「최근 작업 이력」 3행 표를 걷고 한 줄로(걷은 3행은 `docs/history.md` 맨 위 세 행에 전문이 있다) · 원칙 13 「누적 파일 먼저 머지」 단계 걷음(규칙 줄 고치는 회차만 남김) · 원칙 21을 「상한 있는 목록」에서 「이력은 PR마다 새 파일」로 · 머리말·소관 표·환경 메모 한 줄씩.
- 검사(`scripts/doc-check.sh` · `.claude/hooks/rule-check.py`): `CLAUDE.md` 이력 꼴 표 행 0 · 새 이력 파일 이름·첫 줄 꼴 · `docs/history.md`에 더한 표 행 0 · 이미 있던 이력 파일 고침·지움 0 · 표 칸 검사 대상 = base 이후 바뀐 `.md` 전부(12장 ⑦ 덧).
