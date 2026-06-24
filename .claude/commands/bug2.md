# /bug2 — 알림 설정 저장 버그 수정

## 컨텍스트
- 증상: 전체알림·신규공고알림·마케팅알림 토글 값이 저장 안 됨
- 원인: `onSettingChange()` 호출 시 `currentUser` 일부 필드 누락으로 덮어쓰기 발생
- 관련 함수: `onSettingChange()`, `saveSettings()`, `applySettingsToUI()`

## 작업 순서
1. index.html에서 `onSettingChange` 함수 현재 코드 확인
2. `currentUser` 필드 누락 부분 파악
3. 최소 변경으로 수정 (함수 전체 교체 금지)
4. 수정 후 `/done` 실행
