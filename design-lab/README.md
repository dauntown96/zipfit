# design-lab — 디자인 샘플 독립안(시안 전용)

> 🔴 **배포되지 않는다.** 세션 브랜치 `claude/optimistic-noether-ls9tza`에만 있고 PR을 열지 않는다(우편함 「조사·의견 — 디자인 샘플 독립안」 2026-10-08).
> `index.html`·`sw.js`와 무관하다. 고른 방향을 실제로 반영할 때는 원칙 1·9·17을 그때 다시 적용한다.

## 여는 법

각 폴더의 `index.html`을 브라우저로 바로 연다(한 파일 · 자기완결 · 데이터 내장). 390px 폭 기준이다.
`#detail`을 붙이면 공고 상세 첫 화면으로 바로 열린다. 첫 카드를 누르면 상세로, 뒤로 단추로 홈으로 간다.

| 폴더 | 방향 | 갈래 |
|---|---|---|
| `01-soft-bento/` | 소프트 벤토 — 따뜻한 파스텔 타일 · 큰 숫자 · 스프링 | 흐름(트렌드) |
| `02-kinetic-editorial/` | 키네틱 에디토리얼 — 신문 1면 · 큰 명조 · 흐르는 마감 띠 | 흐름(트렌드) |
| `03-night-glass/` | 나이트 글래스 — 어두운 지도 · 유리 시트 · 빛 | 흐름(트렌드) |
| `04-gazette-form/` | 공고문 서식 — 괘선 표 · 직인(상태) · 문서번호 | 흔한 목록 밖 |
| `05-blueprint/` | 도면 — 치수선 · 표제란 · 평형 겹쳐 보기 | 흔한 목록 밖 |
| `06-transit-line/` | 노선도 — 유형 = 노선 색 · 일정 = 역 · 안내 전광판 | 흔한 목록 밖 |

## 데이터 — 지어낸 숫자 0

`_data.json` 한 묶음을 여섯 시안이 같이 쓴다. 값은 2026-10-08 KST 배포본 공개 REST(anon 키) 응답에서만 뽑았다.

| 화면 값 | 출처(REST) | 행 |
|---|---|---|
| 열린 공고 74 · 접수중 3 | `rpc/get_announcements_deduped(null,null,null)` 931행의 `status` 집계(공고중 70 · 접수중 3 · 정정공고중 1) | — |
| 카드 1 인천석남 어울림센터 | 같은 RPC · `rpc/get_announcement_price_summary` | `announcement_id` `2015122300020858` (RPC 행 id 4876988) |
| 카드 2 아산지역 국민임대 | 같은 RPC · 가격 요약 · `housing_units`(단지 4곳 = `building_name` 고유값) | `2015122300020726` (RPC 행 id 3868139) |
| 카드 3 대전천동3 5블록 | 같은 RPC · 가격 요약 · `housing_units`(모집 210 = 39A 80 + 51A 50 + 59D 80) | `0000061176` (RPC 행 id 4798679) |
| 상세 — 제목·상태·주소·일정·난방·입주·총 110세대 | 같은 RPC | `2015122300020858` |
| 상세 — 보증금·월 임대료 범위·면적 범위 | `rpc/get_announcement_price_summary` | `2015122300020858` |
| 상세 — 21A 묶음(62세대 = 계층 공동 56 + 주거급여 6) | `housing_units` | `f87e9872…` · `03b6e7e2…` · `d09bc4c1…` |
| 상세 — 평형 겹쳐 보기(05) | `housing_units` `area_sqm` | 위 셋 + `e0ca84e0…` · `91666bd4…` · `f8d627d6…` · `dc964608…` |

- D-day·요일·「접수까지 N일」은 `asOf`(2026-10-08)와 공고 날짜에서 계산한 값이다.
- 금액은 반올림하지 않는다(28,860,000 → 2,886만원 · 146,700 → 14만 6,700원).
- 03의 밤 지도 점 위치, 05의 평면 모양(정사각형), 지도 자리 그림은 **장식**이다 — 공고 데이터가 아니며 화면에 「지도 자리」·「평면 모양은 원문 참조」로 밝혔다.

## 다시 만드는 법

```sh
# 1) 공개 REST 응답 세 개를 스크래치에 받는다(ann.json · price.json · units.json)
python3 design-lab/_tools/build_data.py <스크래치> design-lab/_data.json
# 2) src/*.html + core.js + 데이터를 한 파일로 묶는다
python3 design-lab/_tools/build_pages.py
# 3) 390px 스크린샷(홈 · 상세 · 상세 전체)과 모션 녹화(webm)
node design-lab/_tools/capture.mjs design-lab <출력 경로>
```

## 모션 — 공통 원칙

- `transform`·`opacity` 위주(벤토 스프링 · 줄 가림막 · 시트 · 직인 · 선 그리기 · 열차 이동).
- `prefers-reduced-motion: reduce`면 모든 애니메이션·전환을 끄고 끝 상태로 보인다.
- 화면 이동은 View Transitions API를 쓰고, 없는 브라우저는 바로 바꾼다.
