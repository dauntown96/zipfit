# /done — 작업 완료 처리

작업이 완료되면 아래를 순서대로 실행하세요:

## 1. CLAUDE.md 업데이트
- 완료된 버그: ✅ ~~취소선~~ + `(완료 YYYY-MM-DD)` 추가
- 상단 `마지막 업데이트` 날짜 갱신
- 완료 작업 이력 테이블에 한 줄 추가
- 새로 발견된 버그 있으면 목록에 추가

## 2. git push
```bash
git add index.html CLAUDE.md
git commit -m "fix: [작업 내용 한 줄 요약]"
git push origin main
```

## 3. 완료 보고
다운님께 아래 형식으로 보고:
```
✅ [작업명] 완료

변경 내용:
- index.html: [수정 내용]
- CLAUDE.md: 진척도 업데이트

배포: https://dauntown96.github.io/zipfit
다음: /bug3 또는 /status 로 확인
```
