# /sync — claude.ai와 동기화 확인

claude.ai가 최신 상태를 읽을 수 있도록 CLAUDE.md가 main 브랜치에 반영됐는지 확인합니다.

## 체크리스트
1. `git status` — 커밋되지 않은 변경사항 없는지 확인
2. `git log --oneline -3` — 최근 3개 커밋 확인
3. CLAUDE.md 상단 `마지막 업데이트` 날짜가 오늘인지 확인

## 동기화가 안 됐다면
```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 진척도 업데이트"
git push origin main
```

## claude.ai에서 확인하는 URL
https://raw.githubusercontent.com/dauntown96/zipfit/main/CLAUDE.md
