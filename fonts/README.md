# fonts — 꼭집 화면 글꼴(자체 호스팅 · 부분 글꼴)

`index.html`의 `?ui=d3` 화면이 쓴다(디자인 상시 판 2026-10-12 결정 — 외부 요청 0 유지).
글꼴을 쓰는 요소가 그려질 때만 브라우저가 내려받는다 — 종전 화면은 받지 않는다.

| 파일 | 글꼴 이름(CSS) | 원본 | 라이선스 |
|---|---|---|---|
| `kkokzip-sans-400.woff2` | Kkokzip Sans 400 | IBM Plex Sans KR Regular | SIL OFL 1.1 — `OFL-IBMPlexSansKR.txt` |
| `kkokzip-sans-700.woff2` | Kkokzip Sans 700 | IBM Plex Sans KR Bold | 같음 |
| `kkokzip-led-700.woff2` | Kkokzip LED 700 | Nanum Gothic Coding Bold | SIL OFL 1.1 — `OFL-NanumGothicCoding.txt` |

- 원본: `github.com/google/fonts` `ofl/ibmplexsanskr` · `ofl/nanumgothiccoding`(2026-10-12 내려받음).
- 🔴 **수정본이다** — 글자를 줄였다(fontTools `subset` · 힌팅 제거 · woff2). OFL의 예약 글꼴 이름(「Plex」 · 「Nanum」)은 수정본에 쓸 수 없어
  글꼴 안 이름(name 표 1·2·3·4·6·16·17)을 `Kkokzip Sans` · `Kkokzip LED`로 바꿨다. 저작권·라이선스 줄(name 0·7~14)은 그대로 둔다.
- 남긴 글자: KS X 1001 한글 2,350자 + 기본 라틴(U+0020–007E · 00A0–00FF) · 구두점(2010–2027 · 2030–203A) · 화살표(2190–2199) ·
  동그라미 숫자(2460–24FF) · 도형(25A0–26FF) · CJK 기호(3000–303F) · 한글 자모(3131–318E) · 괄호 문자(3200–32FF) · 단위(3380–33FF, ㎡) · 전각(FF01–FF5E).
  그 밖의 글자(드문 한글 음절 · 한자 · 이모지)는 기기 글꼴로 그려진다.
- 다시 만들 때: 원본 ttf → `python3 -m fontTools.subset <ttf> --unicodes-file=<위 범위> --flavor=woff2 --layout-features='*' --no-hinting --desubroutinize` → name 표 바꾸기.
