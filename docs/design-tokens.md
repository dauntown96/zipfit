# 꼭집 디자인 토큰 — 색 뜻 정본(역할 → 토큰) · 날값 매핑표

> 🔴 **정본은 이 파일 + `index.html`의 d3 토큰(`html[data-ui="d3"] body{…}` · 어두움 `body.theme-dark{…}`)이다**(다운님 결정 2026-11-10 · 설계 「📐 12월 재편」 6절 결정 ②). Design System 아티팩트는 보는 창 — 고친 것은 표시층 요청서로만 여기에.
> 이 파일은 **매핑표**다 — 이 회차(12월 재편 ④ ①)의 화면 변화는 대비 미달 둘 고침뿐이고, 날값을 토큰으로 바꾸는 것은 ② 시안 판정 뒤 회차들이 한다.

## 1. 역할 표(설계 10절 색 뜻 표 v0 → 토큰)

| 역할 | 어디에만 | 토큰 | 밝음 | 어두움 | 규칙 |
|---|---|---|---|---|---|
| 유형(7) | 카드 왼쪽 띠 · 유형 이름 옆 점 | `--ln-kuk` | #1F5FBF | #7FA8F0 | 늘 유형 글자와 함께 · 경고·상태·브랜드·포커스와 색상 영역 겹침 0 — ✅ **확정**(2026-11-11 다운님 판정 「A」): 영구(`--ln-young`)는 빨강 계열을 떠나 자두 A(322° · 경고와 41° · 매입 보라와 53°) |
|  |  | `--ln-young` | #9B3C78 | #E39AC6 | (옛 #B5462B / #F09A80) |
|  |  | `--ln-hang` | #1E7B4F | #6FCB9C |  |
|  |  | `--ln-mae` | #7B4BB0 | #B99AE6 |  |
|  |  | `--ln-jeon` | #A35C00 | #E8A453 |  |
|  |  | `--ln-gong` | #0F7C8A | #5CC3D0 |  |
|  |  | `--ln-gi` | #5B616B | #A9AFB8 |  |
| 경고(빨강 하나) | 신청을 막거나 바꾸는 배지만 | `--warn` | #B3261E | #FF8A80 | 빨강은 이 뜻 외 금지 |
|  |  | `--warn-bg` | #FCEDEB | #3A1A18 |  |
|  |  | `--warn-line` | #F5C2C2 | #6B3A3F | 🟡 2026-11-11 신설(날값 1차 · 시안) — 경고 상자·⚠️ 행 테두리 |
| 상태 | 노선 점 · 상태 글자 | `--ink` | #15171B | #ECEDEF | 글자 + 모양 · 상태 전용 색 없음 — ✅ **확정**(2026-11-11): 상태 알약 `.zf3-dpill` 앞 접수 중 「●」 · 예정·마감·미상 「○」(마감 임박 빨강은 경고 뜻이라 그대로) |
|  |  | `--ink-3` | #5A616B | #9EA4AD |  |
| 브랜드(하나) | 로고 · 주요 행동 단추 하나 | `--brand` | #1D9E75 | #1D9E75 | 🟡 2026-11-11 신설(날값 1차 · 시안) — 값은 지금 초록 그대로 · 상표·로고와 함께 확정 · 펼침·분류·선택·링크에 쓰지 않음 |
|  |  | `--brand-ink` | #0F6E56 | #5DCAA5 | 브랜드 위 눌림·글자(흰 바탕 6.20) |
| 포커스 | 키보드·터치 초점 윤곽 | `--focus` | #15171B | #F2F1EC | ✅ **확정**(2026-11-11): `--ln-kuk`와 분리 · 두 겹 윤곽(바깥 `--focus` 2px · 안 `--paper` 2px) · 바탕 대비 15.76~17.94 · 15.84 |
| 보조 글자(회색) | 근거 값 · 원문 머리 | `--ink-3` | #5A616B | #9EA4AD | 흰·회색 바탕 모두 4.5:1 이상 · `#777`·`#888`·`#999` 은퇴 대상 |
| 중립 — 잉크·선·바탕 | 글자 · 테두리 · 카드·면 | `--ink` | #15171B | #ECEDEF | — |
|  |  | `--ink-2` | #3D424A | #C5C9D0 |  |
|  |  | `--line` | #C6C9CF | #3B3F47 |  |
|  |  | `--line-2` | #E2E3E6 | #2A2D33 |  |
|  |  | `--rail` | #CDD1D7 | #3B3F47 |  |
|  |  | `--bg` | #F2F0EB | #0E0F12 |  |
|  |  | `--paper` | #FFFFFF | #16171B |  |
|  |  | `--surface` | #F7F6F2 | #1C1E23 |  |
|  |  | `--surface-2` | #EEECE6 | #23262C |  |
| 전광판 | 인사이트 LED 판 | `--board` | #17181C | #0A0B0D | 판 안에서만(취향 ③ 2026-10-13) |
|  |  | `--board-2` | #24262C | #1A1C21 |  |
|  |  | `--board-ink` | #F2F1EC | — |  |
|  |  | `--board-ink-2` | #B9BCC4 | — |  |
|  |  | `--led` | #FFB21A | — |  |
|  |  | `--led-red` | #FF7A66 | — |  |
|  |  | `--led-green` | #7CF0A8 | — |  |
|  |  | `--led-cyan` | #8FDCFF | — |  |
| 분석 표지 「정리」 | 2층 절 머리 | `(색 없음)` | — | — | 글자·굵기만 |

## 2. 날값 매핑표(자동 분류 · 2026-11-10 `index.html` 전수)

- 셈: 서로 다른 날값 **231종** · 쓰는 곳 **966** (CSS 563 · JS 353 · HTML 속성 50) — 토큰 정의 줄 안의 값은 빼고 셌다 · `#abc`는 `#aabbcc`로, `rgb()`는 16진으로 맞춤 · 투명도가 있으면 `@알파`로 따로 센다.
- 분류 = 색상(hue)·채도·명도 + 가장 많이 쓰인 속성(color/background/border) — **사람이 판정할 값이 아니라 다음 회차의 작업 목록**이다. 「토큰 값과 같음」은 이미 토큰 값인 날값(바로 `var()`로 바꿀 수 있음).

### 경고 / 유형 영구(겹침) — 13종 · 45곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#a32d2d` | --warn · --ln-young | 3 | 20 | 0 | color, style, chip sel |
| `#c0392b` | --warn · --ln-young | 1 | 2 | 5 | btn btn-sec, btn, .zf-ops-hide |
| `#f5c2c2` | --warn · --ln-young | 1 | 3 | 0 | style, .zf-pol-note.warn |
| `#f7c1c1` | --warn · --ln-young | 1 | 0 | 0 | .err |
| `#501313` | --warn · --ln-young | 1 | 0 | 0 | .err .rtitle |
| `#e6d2d0` | --warn · --ln-young | 1 | 0 | 0 | .hu-diff-item |
| `#a3423a` | --warn · --ln-young | 1 | 0 | 0 | .hu-diff-item |
| `#8a4b4b` | --warn · --ln-young | 1 | 0 | 0 | .zf-pol-note.warn .zf-pol-src |
| `#3a2326` | --warn · --ln-young | 1 | 0 | 0 | body.theme-dark .zf-pol-note.warn |
| `#6b3a3f` | --warn · --ln-young | 1 | 0 | 0 | body.theme-dark .zf-pol-note.warn |
| `#f0b4b4` | --warn · --ln-young | 1 | 0 | 0 | body.theme-dark .zf-pol-note.warn |
| `#7b241c` | --warn · --ln-young | 0 | 0 | 1 | style |
| `#994455` | --warn · --ln-young | 0 | 1 | 0 | js |

### 경고 바탕 계열 — 5종 · 5곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#880033` | --warn-bg | 0 | 1 | 0 | js |
| `#993388` | --warn-bg | 0 | 1 | 0 | js |
| `#994477` | --warn-bg | 0 | 1 | 0 | js |
| `#660033` | --warn-bg | 0 | 1 | 0 | js |
| `#992244` | --warn-bg | 0 | 1 | 0 | js |

### 보조 글자(회색) — 18종 · 182곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#888888` | --ink-3 | 21 | 60 | 9 | style, color, ? |
| `#999999` | --ink-3 | 13 | 8 | 3 | style, rdesc, ? |
| `#cccccc` | --ink-3 | 5 | 7 | 0 | style, detail-link, .more-btn |
| `#aaaaaa` | --ink-3 | 7 | 4 | 0 | style, .subtab.done, .step.done |
| `#bbbbbb` | --ink-3 | 4 | 7 | 0 | style, ?, .extras-modal-unavailable |
| `#9aa0aa` | --ink-3 | 9 | 0 | 0 | uilding-desc,body.theme-dark .hu-label,body.theme-dark .hu-group-count, body.theme-dark .diag-hint, body.theme-dark .pol-xref |
| `#777777` | --ink-3 | 9 | 0 | 0 | .maintab, .elig-subrow span:first-child, .hu-past-title |
| `#e8e8e8` | --ink-3 | 5 | 0 | 0 | body.theme-dark, body.theme-dark select,body.theme-dark input, oup-label,body.theme-dark .hu-note-price,body.theme-dark .hu-note-long |
| `#cfcfcf` | --ink-3 | 2 | 0 | 0 | body.theme-dark .zf-pol-note, body.theme-dark .hu-past-title |
| `#d8dbe0` | --ink-3 | 1 | 0 | 0 | body.theme-dark .zf-cls-opts label |
| `#8a8a80` | --ink-3 | 1 | 0 | 0 | .extras-thumb-missing-mark |
| `#8b9099` | --ink-3 | 1 | 0 | 0 | body.theme-dark .extras-thumb-missing-mark |
| `#9fb8b0` | --ink-3 | 1 | 0 | 0 | body.theme-dark .zf-rent-line |
| `#9a9a9a` | --ink-3 | 1 | 0 | 0 | body.theme-dark .zf-pol-note .zf-pol-src |
| `#8a8e97` | --ink-3 | 1 | 0 | 0 | .zf3-sep |
| `#889999` | --ink-3 | 0 | 1 | 0 | js |
| `#767676` | --ink-3 | 0 | 1 | 0 | style |
| `#777799` | --ink-3 | 0 | 1 | 0 | 다름 |

### 브랜드 / 유형 행복 / 분류(겸용) — 29종 · 134곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#1d9e75` | --brand(신설) · --ln-hang | 24 | 20 | 0 | detail-link, chip sel, .hu-recruit-badge |
| `#0f6e56` | --brand(신설) · --ln-hang | 14 | 16 | 1 | style, color, .chip.sel |
| `#5dcaa5` | --brand(신설) · --ln-hang | 14 | 3 | 0 | chip sel, body.theme-dark .maintab.active, body.theme-dark .hu-group-head.hu-group-active |
| `#085041` | --brand(신설) · --ln-hang | 7 | 0 | 0 | .badge, .subtab.active, .step.active |
| `#1f5e4a` | --brand(신설) · --ln-hang | 1 | 3 | 0 | .zf-rent-line b, chip, style |
| `#9fe1cb` | --brand(신설) · --ln-hang | 3 | 0 | 0 | .ok, .dday, .alert-signup-box |
| `#1d6f55` | --brand(신설) · --ln-hang | 3 | 0 | 0 | .pol-xref-btn, .hu-x-chip, .extras-linked-note |
| `#7fd8b5` | --brand(신설) · --ln-hang | 2 | 0 | 0 | body.theme-dark .zf-rent-line b, body.theme-dark .zf-exempt-chip |
| `#449911` | --brand(신설) · --ln-hang | 0 | 0 | 2 | js |
| `#113300` | --brand(신설) · --ln-hang | 0 | 2 | 0 | js |
| `#1d3d33` | --brand(신설) · --ln-hang | 1 | 0 | 0 | body.theme-dark .hu-group-head.hu-group-active |
| `#2f6b57` | --brand(신설) · --ln-hang | 1 | 0 | 0 | body.theme-dark .hu-round-badge |
| `#16352b` | --brand(신설) · --ln-hang | 1 | 0 | 0 | body.theme-dark .zf-cls-opts label:has(input:checked) |
| `#bfeedd` | --brand(신설) · --ln-hang | 1 | 0 | 0 | body.theme-dark .zf-cls-opts label:has(input:checked) |
| `#27500a` | --brand(신설) · --ln-hang | 1 | 0 | 0 | .tag-mix |
| `#c5e8da` | --brand(신설) · --ln-hang | 1 | 0 | 0 | .alert-signup-box input[type=email] |
| `#7fd3b5` | --brand(신설) · --ln-hang | 1 | 0 | 0 | body.theme-dark .pol-xref-btn |
| `#bfe3d4` | --brand(신설) · --ln-hang | 1 | 0 | 0 | .zf-exempt-chip |
| `#173a30` | --brand(신설) · --ln-hang | 1 | 0 | 0 | body.theme-dark .zf-exempt-chip |
| `#2c5a4b` | --brand(신설) · --ln-hang | 1 | 0 | 0 | body.theme-dark .zf-exempt-chip |
| `#445511` | --brand(신설) · --ln-hang | 1 | 0 | 0 | ? |
| `#556611` | --brand(신설) · --ln-hang | 0 | 1 | 0 | js |
| `#117733` | --brand(신설) · --ln-hang | 0 | 1 | 0 | js |
| `#cfe6da` | --brand(신설) · --ln-hang | 0 | 1 | 0 | chip |
| `#117744` | --brand(신설) · --ln-hang | 0 | 1 | 0 | js |
| `#2e7d32` | --brand(신설) · --ln-hang | 0 | 1 | 0 | ZF_OPS_COLOR |
| `#558855` | --brand(신설) · --ln-hang | 0 | 1 | 0 | js |
| `#668855` | --brand(신설) · --ln-hang | 0 | 1 | 0 | js |
| `#448866` | --brand(신설) · --ln-hang | 0 | 1 | 0 | js |

### 유형 공공 — 1종 · 1곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#113333` | --ln-gong | 0 | 1 | 0 | js |

### 유형 국민 / 포커스 / 링크(겹침) — 20종 · 38곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#5a7af7` | --ln-kuk · --focus · --link(신설) | 0 | 10 | 0 | style, barColor, labelColor |
| `#3d5a99` | --ln-kuk · --focus · --link(신설) | 4 | 1 | 0 | .zf-site-chip.on, .pol-site, .zf-site-chip |
| `#7f77dd` | --ln-kuk · --focus · --link(신설) | 0 | 5 | 0 | chip sel, js |
| `#0c447c` | --ln-kuk · --focus · --link(신설) | 2 | 0 | 0 | .tag-apt, .detail-link |
| `#d6deef` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | .zf-site-chip |
| `#26324a` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | body.theme-dark .zf-site-chip |
| `#c3d2f2` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | body.theme-dark .zf-site-chip |
| `#34425f` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | body.theme-dark .zf-site-chip |
| `#5b78b8` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | body.theme-dark .zf-site-chip.on |
| `#3b4a6b` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | .zf-org-sup span |
| `#cfdcea` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | .hu-diff-item.hu-diff-down |
| `#2f5f8f` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | .hu-diff-item.hu-diff-down |
| `#cfd9f0` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | .zf-weak-chip |
| `#2b4c8c` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | .zf-weak-chip |
| `#e3f6ff` | --ln-kuk · --focus · --link(신설) | 1 | 0 | 0 | .zf3-ntc .zf3-nm |
| `#378add` | --ln-kuk · --focus · --link(신설) | 0 | 1 | 0 | js |
| `#113377` | --ln-kuk · --focus · --link(신설) | 0 | 1 | 0 | js |
| `#a0b4fa` | --ln-kuk · --focus · --link(신설) | 0 | 1 | 0 | barColor |
| `#114499` | --ln-kuk · --focus · --link(신설) | 0 | 1 | 0 | js |
| `#113355` | --ln-kuk · --focus · --link(신설) | 0 | 1 | 0 | js |

### 유형 매입 — 3종 · 7곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#7b5ea7` | --ln-mae | 1 | 4 | 0 | chip sel, ? |
| `#3c3489` | --ln-mae | 1 | 0 | 0 | .tag-ofi |
| `#882299` | --ln-mae | 0 | 1 | 0 | 그림 |

### 유형 전세 / 주의 / 전광판 — 23종 · 72곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#ef9f27` | --ln-jeon · --led | 1 | 17 | 0 | chip sel, style, js |
| `#8a5a12` | --ln-jeon · --led | 2 | 8 | 1 | zf-check-note, .zf-wave-slot, .zf-route-line |
| `#d85a30` | --ln-jeon · --led | 1 | 7 | 1 | chip sel, ?, maintab |
| `#fac775` | --ln-jeon · --led | 3 | 1 | 0 | .warn, ?, .map-approx |
| `#6b5320` | --ln-jeon · --led | 3 | 0 | 0 | body.theme-dark .hu-round-badge.hu-round-old, body.theme-dark .zf-round-tag, .stale-src |
| `#854f0b` | --ln-jeon · --led | 3 | 0 | 0 | .warn .rdesc, ?, .map-approx |
| `#8a6a1c` | --ln-jeon · --led | 2 | 1 | 0 | .hu-round-badge.hu-round-old, .zf-round-tag, js |
| `#e0b96a` | --ln-jeon · --led | 2 | 1 | 0 | .hu-round-badge.hu-round-old, .zf-round-tag, js |
| `#3a2f14` | --ln-jeon · --led | 2 | 0 | 0 | body.theme-dark .hu-round-badge.hu-round-old, body.theme-dark .zf-round-tag |
| `#e9c979` | --ln-jeon · --led | 2 | 0 | 0 | body.theme-dark .hu-round-badge.hu-round-old, body.theme-dark .zf-round-tag |
| `#633806` | --ln-jeon · --led | 2 | 0 | 0 | .warn .rtitle, .ccond |
| `#f0d9a0` | --ln-jeon · --led | 1 | 0 | 0 | .stale-src |
| `#7a6533` | --ln-jeon · --led | 1 | 0 | 0 | .stale-src-note |
| `#f0d9a8` | --ln-jeon · --led | 1 | 0 | 0 | .pol-pinned |
| `#ffe27a` | --ln-jeon · --led | 1 | 0 | 0 | mark.zf-hl |
| `#7a5f00` | --ln-jeon · --led | 1 | 0 | 0 | body.theme-dark mark.zf-hl |
| `#8a6d3b` | --ln-jeon · --led | 1 | 0 | 0 | .extras-missing-note |
| `#f0e2c0` | --ln-jeon · --led | 1 | 0 | 0 | .extras-missing-note |
| `#d8c48a` | --ln-jeon · --led | 1 | 0 | 0 | body.theme-dark .extras-missing-note |
| `#994411` | --ln-jeon · --led | 0 | 1 | 0 | js |
| `#b7791f` | --ln-jeon · --led | 0 | 1 | 0 | circle |
| `#d35400` | --ln-jeon · --led | 0 | 1 | 0 | ZF_OPS_COLOR |
| `#9a7d0a` | --ln-jeon · --led | 0 | 1 | 0 | ZF_OPS_COLOR |

### 주의·강조 / 전광판 — 5종 · 5곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#fee500` | --led(전광판) · 신설 후보 | 0 | 0 | 1 | style |
| `#191600` | --led(전광판) · 신설 후보 | 0 | 0 | 1 | style |
| `#888833` | --led(전광판) · 신설 후보 | 0 | 1 | 0 | js |
| `#888822` | --led(전광판) · 신설 후보 | 0 | 1 | 0 | js |
| `#776622` | --led(전광판) · 신설 후보 | 0 | 1 | 0 | 정의 |

### 주황 옅은 바탕 — 유형 전세 바탕 — 5종 · 20곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#fbf0dc` | --ln-jeon · --led | 2 | 7 | 1 | zf-check-note, .zf-wave-slot, .zf-route-line |
| `#faeeda` | --ln-jeon · --led | 4 | 0 | 0 | .warn, .ccond, ? |
| `#fff3d6` | --ln-jeon · --led | 3 | 1 | 0 | .hu-round-badge.hu-round-old, .zf-round-tag, ? |
| `#fff8e6` | --ln-jeon · --led | 1 | 0 | 0 | .stale-src |
| `#fdf6e3` | --ln-jeon · --led | 1 | 0 | 0 | .extras-missing-note |

### 중립 — 그림자·덮개(투명도) — 28종 · 41곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#000000@.12` | --line-2 / 그림자 토큰(신설 후보) | 3 | 0 | 0 | html[data-ui="d3"] #noticeFilterPanel, html[data-ui="d3"] .step.active, .zf3-vseg button[aria-pressed="true"] |
| `#000000@.06` | --line-2 / 그림자 토큰(신설 후보) | 3 | 0 | 0 | ml[data-ui="d3"] :is(#notice-list,#match-result) .hcard.zf3-card:hover, html[data-ui="d3"] .maintabs.zf3-ind-on, .zf3-sticky |
| `#000000@0.07` | --line-2 / 그림자 토큰(신설 후보) | 0 | 3 | 0 | S, SB, js |
| `#000000@0.08` | --line-2 / 그림자 토큰(신설 후보) | 2 | 0 | 0 | .maintabs, .maintab.active |
| `#ffffff@0.3` | --line-2 / 그림자 토큰(신설 후보) | 2 | 0 | 0 | .extras-modal-close, .extras-modal-nav |
| `#000000@0.45` | --line-2 / 그림자 토큰(신설 후보) | 2 | 0 | 0 | .extras-modal-close, .extras-modal-nav |
| `#000000@0.4` | --line-2 / 그림자 토큰(신설 후보) | 2 | 0 | 0 | .extras-modal-close, .extras-modal-nav |
| `#000000@.18` | --line-2 / 그림자 토큰(신설 후보) | 2 | 0 | 0 | .zf-fb-sheet, .zf3-maplbl |
| `#000000@.2` | --line-2 / 그림자 토큰(신설 후보) | 2 | 0 | 0 | .zf-ops-badge, .zf-ops-pop |
| `#ff7a66@.45` | --line-2 / 그림자 토큰(신설 후보) | 2 | 0 | 0 | .zf3-tg.close, .zf3-stat.hot b |
| `#000000@0.04` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .panel |
| `#000000@0.55` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .extras-thumb-label |
| `#000000@0.85` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .extras-modal-overlay |
| `#0a0b0d@.45` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf-fb-ov |
| `#3d424a@.18` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf-ops-dot i |
| `#000000@0.15` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf-totop |
| `#000000@0.5` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | body.theme-dark .zf-totop |
| `#7cf0a8@.4` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf3-tg.start |
| `#f2f1ec@.35` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf3-ntc .zf3-nm |
| `#8fdcff@.55` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf3-ntc |
| `#8fdcff@.10` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf3-ntc |
| `#ffffff@.08` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf3-kc + .zf3-kc |
| `#141412@.78` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf3-whint |
| `#000000@.08` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | .zf3-zoom button |
| `#000000@.14` | --line-2 / 그림자 토큰(신설 후보) | 1 | 0 | 0 | s(#main2:not(.hidden)) #notice-list .zf3-card.zf3-open > [data-ann-id] |
| `#5a7af7@0.08` | --line-2 / 그림자 토큰(신설 후보) | 0 | 1 | 0 | style |
| `#1d9e75@0.08` | --line-2 / 그림자 토큰(신설 후보) | 0 | 1 | 0 | style |
| `#ef9f27@0.08` | --line-2 / 그림자 토큰(신설 후보) | 0 | 1 | 0 | style |

### 중립 — 바탕 — 40종 · 105곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#e1f5ee` | --paper/--surface/--surface-2 | 10 | 0 | 0 | .badge, .subtab.active, .step.active |
| `#f8f8f8` | --paper/--surface/--surface-2 | 5 | 4 | 0 | style, .extras-thumb, .hu-row |
| `#fafaf6` | --paper/--surface/--surface-2 | 6 | 1 | 1 | .building-box, .more-btn, .detail-toggle-btn |
| `#f6f6f2` | --paper/--surface/--surface-2 | 2 | 6 | 0 | js, chip, .hu-wait-badge |
| `#1f2229` | --board/--board-2 | 7 | 0 | 0 | k .docs-group,body.theme-dark .elig-item,body.theme-dark .extras-thumb, body.theme-dark .maintab.active, body.theme-dark .hu-round-badge |
| `#f0f0e8` | --paper/--surface/--surface-2 | 7 | 0 | 0 | .setting-row, .checklist li, .more-btn:hover |
| `#262932` | --board/--board-2 | 5 | 0 | 0 | body.theme-dark select,body.theme-dark input, body.theme-dark .maintabs, body.theme-dark .hu-group-head:hover |
| `#f5f5f0` | --paper/--surface/--surface-2 | 4 | 0 | 0 | body, .subtab.done, .step.done |
| `#fff3f3` | --paper/--surface/--surface-2 | 1 | 3 | 0 | style, .zf-pol-note.warn |
| `#f8f8f4` | --paper/--surface/--surface-2 | 3 | 0 | 0 | .mcard, .detail-link, .poi-item |
| `#eef2fa` | --paper/--surface/--surface-2 | 2 | 1 | 0 | .pol-site, .zf-site-chip, t |
| `#222222` | --board/--board-2 | 3 | 0 | 0 | .zf-sch .zf-sch-tabs button[aria-selected="true"], .zf-sch-route b |
| `#f8f9ff` | --paper/--surface/--surface-2 | 0 | 3 | 0 | style, js |
| `#f4f4f2` | --paper/--surface/--surface-2 | 2 | 0 | 0 | .blk-empty,.blk-round-note, .zf-pol-note |
| `#e6f4ee` | --paper/--surface/--surface-2 | 0 | 2 | 0 | t, zf-target-ok |
| `#f2f9f6` | --paper/--surface/--surface-2 | 0 | 2 | 0 | style, js |
| `#f5f5f5` | --paper/--surface/--surface-2 | 0 | 2 | 0 | style, js |
| `#16181d` | --board/--board-2 | 1 | 0 | 0 | body.theme-dark |
| `#ece9e0` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .maintabs |
| `#fcebeb` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .err |
| `#eeedfe` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .tag-ofi |
| `#fffbf1` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .pol-pinned |
| `#f1f1ec` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .pol-site.pol-common |
| `#e8edf7` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .zf-org-sup span |
| `#f2f2ee` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .extras-thumb-missing |
| `#f4f6f8` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .extras-thumb-nopreview |
| `#24262d` | --board/--board-2 | 1 | 0 | 0 | body.theme-dark .extras-thumb-missing |
| `#23262c` | --board/--board-2 | 1 | 0 | 0 | body.theme-dark .extras-thumb-nopreview |
| `#2a2721` | --board/--board-2 | 1 | 0 | 0 | body.theme-dark .extras-missing-note |
| `#fff4f3` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .hu-diff-item |
| `#f2f7fc` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .hu-diff-item.hu-diff-down |
| `#f0efe9` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .hu-past-only |
| `#e7f5ef` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .zf-exempt-chip |
| `#eef2fb` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .zf-weak-chip |
| `#f1f1ee` | --paper/--surface/--surface-2 | 1 | 0 | 0 | .zf-sch .zf-sch-scope |
| `#fdf3f2` | --paper/--surface/--surface-2 | 0 | 0 | 1 | hidden |
| `#eef6f2` | --paper/--surface/--surface-2 | 0 | 1 | 0 | chip |
| `#f0f3ff` | --paper/--surface/--surface-2 | 0 | 1 | 0 | style |
| `#f0faf5` | --paper/--surface/--surface-2 | 0 | 1 | 0 | style |
| `#fff7f0` | --paper/--surface/--surface-2 | 0 | 1 | 0 | style |

### 중립 — 선 — 15종 · 91곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#e8e8e0` | --line/--line-2 | 25 | 10 | 2 | style, .extras-thumb, chip |
| `#dddddd` | --line/--line-2 | 11 | 0 | 1 | .toggle-slider, .zf-cls-opts label, select,input[type=number],input[type=text],input[type=email] |
| `#e0e0d8` | --line/--line-2 | 6 | 1 | 0 | .subtab, .step, .detail-toggle-btn |
| `#e0e0e0` | --line/--line-2 | 1 | 0 | 5 | style, .pg-btn |
| `#2c2f38` | --line/--line-2 | 5 | 0 | 0 | k .docs-group,body.theme-dark .elig-item,body.theme-dark .extras-thumb, body.theme-dark .hu-note-wrap, body.theme-dark .hu-x-chip |
| `#eeeeee` | --line/--line-2 | 1 | 4 | 0 | style, .hu-ug-row |
| `#3a3e48` | --line/--line-2 | 4 | 0 | 0 | body.theme-dark select,body.theme-dark input, body.theme-dark .zf-cls-opts label, body.theme-dark .pol-xref-btn |
| `#2b2e35` | --line/--line-2 | 4 | 0 | 0 | .zf3-band, .zf3-ico, html[data-ui="d3"] .zf3-card .detail-grid |
| `#d8d8d0` | --line/--line-2 | 2 | 0 | 0 | .pol-search, .zf-totop |
| `#cfd8d3` | --line/--line-2 | 2 | 0 | 0 | .pol-xref-btn, .hu-x-chip |
| `#3a3d47` | --line/--line-2 | 2 | 0 | 0 | body.theme-dark .elig-subrow, body.theme-dark .extras-thumb-missing |
| `#dcede6` | --line/--line-2 | 0 | 2 | 0 | style, js |
| `#d8d4c8` | --line/--line-2 | 1 | 0 | 0 | .building-box |
| `#d3d3ca` | --line/--line-2 | 1 | 0 | 0 | .extras-thumb-missing |
| `#3f3a2c` | --line/--line-2 | 1 | 0 | 0 | body.theme-dark .extras-missing-note |

### 중립 — 잉크 — 5종 · 56곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#333333` | --ink | 16 | 12 | 4 | style, zf-dcell-date, .zf-cls-opts label |
| `#000000` | --ink | 10 | 0 | 0 | .zf3-view, .zf3-chips, html[data-ui="d3"] .poi-tabs |
| `#111111` | --ink | 8 | 1 | 0 | .sort-btn.active, .setting-label, .panel-title |
| `#1a1a1a` | --ink | 3 | 0 | 0 | body, .extras-modal-footer, .zf3-sortsel select option |
| `#0e0f12` | --ink | 0 | 2 | 0 | 막대, theme |

### 중립 — 잉크 2 — 8종 · 68곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#555555` | --ink-2 | 16 | 7 | 1 | style, ?, .label |
| `#666666` | --ink-2 | 8 | 6 | 1 | style, zf-nt-span, .sub |
| `#6b6b63` | --ink-2 | 6 | 7 | 0 | style, js, chip |
| `#444444` | --ink-2 | 5 | 3 | 0 | .building-title, .chip, .pol-group-head |
| `#5f5f57` | --ink-2 | 5 | 0 | 0 | .pol-site.pol-common, .zf-ai-note, ? |
| `#4f6b62` | --ink-2 | 1 | 0 | 0 | .zf-rent-line |
| `#6a6a6a` | --ink-2 | 1 | 0 | 0 | .hu-sqm |
| `#4a4f57` | --ink-2 | 1 | 0 | 0 | html[data-ui="d3"] [id^="map-"] > .poi-loading |

### 초록 옅은 바탕 — 브랜드 바탕 — 1종 · 1곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#eaf3de` | --brand(신설) · --ln-hang | 1 | 0 | 0 | .tag-mix |

### 토큰 값과 같음 — 11종 · 93곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#ffffff` | var(--paper) | 49 | 9 | 7 | style, detail-link, .maintab.active |
| `#15171b` | var(--ink) | 8 | 0 | 0 | .zf-fb-b[aria-pressed="true"],.zf-fb-chip[aria-pressed="true"], .zf-fb-send, .zf-fb-b,.zf-fb-chip,.zf-fb-send,.zf-fb-more |
| `#3d424a` | var(--ink-2) | 6 | 0 | 0 | .zf-fb-react, .zf-fb-done, .zf-ops-badge |
| `#f2f0eb` | var(--bg) | 0 | 2 | 1 | content, 막대, theme |
| `#5a616b` | var(--ink-3) | 3 | 0 | 0 | .zf-fb-opt, .zf-fb-count, .zf-fb-note |
| `#e2e3e6` | var(--line-2) | 0 | 3 | 0 | zf-cut-line, th, td |
| `#1f5fbf` | var(--focus) | 1 | 0 | 0 | [data-zf-tip]:focus-visible |
| `#eeece6` | var(--surface-2) | 1 | 0 | 0 | .zf-fb-about |
| `#b3261e` | var(--warn) | 1 | 0 | 0 | .zf-fb-err |
| `#f7f6f2` | var(--surface) | 0 | 1 | 0 | zf-cut-line |
| `#17181c` | var(--board) | 1 | 0 | 0 | .zf3-tg.notice |

### 파랑 옅은 바탕 — 유형 국민 바탕 — 1종 · 2곳

| 날값 | 바꿀 토큰(제안) | CSS | JS | HTML | 대표 쓰임 |
|---|---|---|---|---|---|
| `#e6f1fb` | --ln-kuk · --focus · --link(신설) | 2 | 0 | 0 | .tag-apt, .detail-link:hover |

## 2-1. 날값 바꾸기 1차(2026-11-11 · 시안 PR — 병합 전)

- 같은 셈법(토큰 정의 줄 제외 · `#abc`→`#aabbcc` · `rgb()`→16진)을 다시 돌린 값: 바꾸기 전 main **233종 · 975곳**(11-10 231종 · 966곳 뒤 이틀 새 늘어난 몫 포함) → 바꾼 뒤 **217종 · 836곳**.
- 바꾼 자리 약 95줄(CSS 규칙 · 인라인 `style` · JS `el.style.color`) — 3절 15종 중 11종이 0이 됐다. 남은 4종은 아래 3절 「남은 자리」.
- 인라인 경고 색은 클래스로 옮김: `.chip.sel.zf-chip-warn`(선착순·취소·선계약 칩 — d3 카드 칩 규칙에 클래스로 이음) · `.zf-warn-box`(중복 탈락·선계약 상자) · `.zf-target-ok`(대상 맞음 줄).

## 3. 🟡 뜻이 둘 이상인 날값(역할로 한 번에 못 묶음 — 판정 거리)

한 날값이 쓰임(선택자·클래스 이름) 기준 두 역할 이상에 걸친 것. 바꿀 때 쓰임마다 다른 토큰으로 갈라야 한다 — 임의로 정하지 않고 ② 시안 판정에 올린다.

> 🔵 **2026-11-11 1차(시안)**: 설계 12절 판정안대로 바꿈 — 아래 표의 「쓰는 곳」은 바꾸기 전 값. 1차 뒤 남은 곳: `#1d9e75` 14 · `#0f6e56` 9 · `#5dcaa5` 5 · `#a32d2d` 1(d3 칩 규칙의 옛 인라인 선택자 문자열) · 나머지 11종 0.
> **남은 자리(쓰임을 표의 역할로 못 가름 — 바꾸지 않음)**: 「원문 보기·원문에서 확인·공사 공고에서 확인·취소공고 원문 보기」 글 링크 5곳(12절 ③이 「원문 보기」를 글 링크에서 뺐고 브랜드는 「단추 하나」라 어느 쪽인지 열림) · 정보 배지(📱 MyMy가능 · 🔓 완화 · 대상 라벨 · 🎁 임대료 면제 · `.zf-exempt-chip` · `.hu-recruit-badge` · `.best`) · 대상 태그 색(신혼·신생아 · 장애인) · 추천 1순위 카드 테두리(`.hcard.top1`) · 칩 올림(`.chip:hover`) · 상세 펼침 단추 글자(`.detail-toggle-btn`) · 위로 가기 단추 글자(`.zf-totop` 밝음·어두움) · 인사이트 숫자(`color:#1D9E75` 둘 — `zf3Recolor`가 `--ln-hang`으로 바꿈) · 주석 1.

| 날값 | 쓰는 곳 | 걸친 역할 | 쓰임 예 |
|---|---|---|---|
| `#1d9e75` | 44 | 링크 · 분류·제목 · 브랜드·행동 · 지도 | .building-progress, .toggle input:checked + .toggle-slider, .zf-cls-opts input, .zf-cls-opts label:has(input:checked) |
| `#0f6e56` | 31 | 링크 · 분류·제목 · 브랜드·행동 | .maintab.active, .btn-primary:hover, .ok .rdesc, .dday-sub |
| `#a32d2d` | 23 | 경고 · 분류·제목 | .err .rdesc, .zf-pol-note.warn, ?, chip sel |
| `#5dcaa5` | 17 | 링크 · 분류·제목 · 브랜드·행동 · 포커스 | body.theme-dark .maintab.active, body.theme-dark .hu-group-head.hu-group-active, body.theme-dark .hu-round-badge, .subtab.active |
| `#f5c2c2` | 4 | 경고 · 분류·제목 | .zf-pol-note.warn, style |
| `#1d6f55` | 3 | 링크 · 분류·제목 · 브랜드·행동 | .pol-xref-btn, .hu-x-chip, .extras-linked-note |
| `#e6f1fb` | 2 | 링크 · 상태 | .tag-apt, .detail-link:hover |
| `#0c447c` | 2 | 링크 · 상태 | .tag-apt, .detail-link |
| `#1d3d33` | 1 | 분류·제목 · 브랜드·행동 | body.theme-dark .hu-group-head.hu-group-active |
| `#c5e8da` | 1 | 경고 · 유형 | .alert-signup-box input[type=email] |
| `#7fd3b5` | 1 | 분류·제목 · 브랜드·행동 | body.theme-dark .pol-xref-btn |
| `#8a4b4b` | 1 | 경고 · 분류·제목 | .zf-pol-note.warn .zf-pol-src |
| `#3a2326` | 1 | 경고 · 분류·제목 | body.theme-dark .zf-pol-note.warn |
| `#6b3a3f` | 1 | 경고 · 분류·제목 | body.theme-dark .zf-pol-note.warn |
| `#f0b4b4` | 1 | 경고 · 분류·제목 | body.theme-dark .zf-pol-note.warn |

## 4. 대비 기록

| 자리 | 전 | 후 | 대비(밝음 · 어두움) | 회차 |
|---|---|---|---|---|
| 근거 글자 `span.zf-rent-basis`(㎡당 줄 「· 기본 임대조건 중앙값」) | `#777` | `var(--ink-3)` · 비-d3 폴백 `#5F5F57` | 4.14 → 5.78 · 3.72 → 6.64 | 2026-11-10 12월 재편 ④ ① |
| 정책 분류 `div.policy-category` | `#1D9E75` | `#0F6E56` · 어두움 `#7FD8B5` | 3.13~3.39 → 5.74~6.20 · 4.70 → 9.39 | 같음 — 초록 유지 여부는 ② |
| 공유 단추 `button.detail-link`(🔗) | `#1D9E75` 글자 | `#0F6E56` 글자(테두리 `#1D9E75` 그대로) | 3.39 → 6.20 · 3.39 → 6.20 | 같음 |
| 저장 단추 `button.detail-link`(🔖) · 저장 토글 JS | `#888`(d3에서 `--ink-3` 덮임) · 저장됨 `#1D9E75` | `#5F5F57` · 저장됨 `#0F6E56` | 6.26 → 6.44 · **2.51 → 6.44**(어두움 — 흰 단추 위 밝은 회색이던 것) | 같음 |
| 정책 분류 `div.policy-category`(초록 뺌) | `#0F6E56` · 어두움 `#7FD8B5` | `var(--ink-2)` | 5.74~6.20 → 9.35 · 9.39 → 9.58 | 2026-11-11 12월 재편 ④ ② 병합 |
| 경로 칩 `p.zf-route-line`(안 `span.zf-route-ex` 등) — 어두움만 | 어두움에서도 `#8A5A12` / `#FBF0DC`(밝은 칩) | 어두움 `var(--ink-2)` / `var(--surface-2)`(밝음 그대로) | 5.24 · 5.24 → 9.13 | 2026-11-11 12월 재편 ④ ② 병합 |
| 날값 1차 — 선택 상태(활성 탭·토글·체크·선택 칩·쪽·지도 탭 — 글자 `--ink`/바탕 `--surface-2` · 채움 칩 글자 `--paper`/바탕 `--ink`) | 초록 `#0F6E56`·`#1D9E75`·`#5DCAA5` | 잉크 + 모양 | 15.19~17.94 · 12.94~15.29 | 2026-11-11 날값 1차(시안) |
| 날값 1차 — 글 링크·분류(`--ink-2`) · 진척(`--ink-3`) | `#1D6F55`·`#0F6E56`·`#1D9E75`·`#0C447C` | `--ink-2` · `--ink-3` | 10.11 / 6.26 · 10.78 / 7.14 | 같음 |
| 날값 1차 — 경고(상자·⚠️ 행·「오늘 마감」 `--warn`/`--warn-bg` · 경고 칩 `--paper`/`--warn` · 오류 문구 `--warn`/`--paper`) | `#A32D2D`/`#FFF3F3` · 어두움 `#f0b4b4`/`#3a2326`(인라인 상자는 어두움에서도 밝은 상자) | 경고 토큰 | 5.74 · 6.54 · 6.54 / 6.86 · 7.85 · 7.85 | 같음 |

대비 = 로컬 렌더(목록 RPC = 운영 anon 응답 캐시) 계산값 · 390/1280 × 밝음/어두움 · 앞 = 밝음 · 뒤 = 어두움 · 뒤 배경은 그 요소 위로 처음 만나는 불투명 배경.
