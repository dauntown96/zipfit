# 성능·전송량 기준선 — 2026-11 (배포본 1회)

우편함 「코드·운영 — 스물여섯째」 할 일 1. 이 문서는 12월 재편 전에 같은 방법으로 다시 재서 견주기 위한 **기준값**이다. 고친 것은 없다.

## 조건

- 대상: 배포본 `https://kkokzip.com/`(`sw.js` `CACHE_NAME = 'zipfit-v341'`)
- 잰 때: 2026-11-25 16:50~16:51 KST(07:50~07:51 UTC)
- 도구: `chrome-devtools-mcp@1.10.1`(Google) + `@modelcontextprotocol/sdk@1.20.2`(MCP 클라이언트). 둘 다 버전을 고정했고, 저장소 밖 임시 폴더에 깔았다.
  - 옵션: `--headless` · `--isolated`(빈 프로필 → 빈 캐시 첫 방문) · `--no-usage-statistics` · `--no-performance-crux`(주소를 CrUX에 보내지 않음) · `--viewport 390x844` · `--no-page-id-routing`
  - 브라우저: Playwright Chromium `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`(HeadlessChrome 158) · 컨테이너 프록시 경유
  - 🔴 `--slim`은 쓰지 않았다. 1.10.1의 slim은 `evaluate` · `navigate` · `screenshot` 세 도구만 있어서, 망 늦추기(`emulate`) · 신뢰 클릭(`click` — INP) · trace(LCP·CLS·바이트)를 쓸 수 없다.
  - 🔴 `--blockedUrlPattern`도 쓰지 않았다. 1.10.1에서는 망 늦추기와 함께 쓸 수 없다(「Network throttling is not supported when network blocking … is configured」).
- 망: 보통(늦추기 없음) · `Fast 3G`(도구 기본값). CPU 늦추기는 걸지 않았다.
- 차례: 망 조건마다 빈 세션 하나에서 한 번씩 잰다(화면당 1회 — 멈춤 조건 「화면당 3회 안」).
  1. 첫 화면: `about:blank` → trace 시작 → 배포본으로 이동 → 보통 8초 / 3G 30초 → trace 멈춤
  2. 공고 탭: 「공고」 탭을 도구 `click`으로 누른다.
  3. 상세: 검색 칸에 「충북혁신클러스터」를 넣고(trace 밖), 카드 「… 상세 보기」(…21132 · 정책 행 많은 공고)를 누른다. 펼친 상세 칸이 있는지 확인했다.
- 이용 기록 막기: 페이지 스크립트보다 먼저 도는 `initScript`가 `fetch`를 감싸, `/rest/v1/usage_events` 주소에만 바깥으로 안 나가는 201 빈 응답을 준다. trace에 그 요청 0을 확인했다(이용 기록 0행).
- 바이트: trace 원본의 `ResourceFinish.encodedDataLength`(헤더 포함 전송량)를 요청마다 더한다. 자원 타이밍(`transferSize`)은 쓰지 않았다 — Supabase·카카오 응답에 `Timing-Allow-Origin`이 없어 0으로 나온다.

## 다시 재는 법

```bash
D=$(mktemp -d) && (cd $D && npm init -y >/dev/null && npm i --no-audit --no-fund chrome-devtools-mcp@1.10.1 @modelcontextprotocol/sdk@1.20.2) && node scripts/perf-baseline.mjs --cdm $D --out $D/out
```

결과는 `<out>/result.json`(값 · 상위 10 요청)과 `<out>/<망>/{load,tab,detail}.trace.json.gz` · `summary-*.txt`(도구가 낸 trace 요약)에 남는다. 상세 공고를 바꾸려면 `--detail <id> --detail-word <제목 앞 낱말>`을 준다. 망 조건은 `--net 'none,Fast 3G'`로 고른다.

## 값

LCP·CLS·INP는 도구 trace 요약의 「Metrics (lab / observed)」 값이다. 요청 수·전송량은 trace 원본에서 셌다.

| 화면 | 망 | LCP | CLS | INP | 요청 | 전송량 |
| --- | --- | --- | --- | --- | --- | --- |
| 첫 화면(빈 캐시 첫 방문) | 보통 | 3,921 ms(TTFB 618 · 렌더 지연 3,304) | 0.76 | — | 60 | 2,005,947 B |
| 첫 화면(빈 캐시 첫 방문) | Fast 3G | 9,335 ms(TTFB 974 · 렌더 지연 8,361) | 0.74 | — | 60 | 2,006,190 B |
| 공고 탭 누름 | 보통 | — | 0.00 | 12 ms | 0 | 0 B |
| 공고 탭 누름 | Fast 3G | — | 0.00 | 12 ms | 0 | 0 B |
| 상세 열기(…21132) | 보통 | 46 ms(누른 뒤) | 0.00 | 47 ms | 56 | 402,297 B |
| 상세 열기(…21132) | Fast 3G | 54 ms(누른 뒤) | 0.00 | 54 ms | 57 | 408,110 B |

- 첫 화면 trace의 도구 insight는 RenderBlocking(예상 절감 FCP·LCP 910 ms) · Cache(LCP 400 ms) · LCPBreakdown · CLSCulprits · NetworkDependencyTree · DOMSize · ThirdParties · ForcedReflow다(보통 망 기준).
- 공고 탭 누름은 네트워크 0이다 — 목록은 첫 화면에서 이미 받았다.
- 첫 화면 CLS 0.74~0.76은 Core Web Vitals 「나쁨」 문턱(0.25)을 넘는다. 원인 분석(`performance_analyze_insight` CLSCulprits)은 이 회차에서 하지 않았다.

## 첫 방문 상위 10 요청(보통 망 · 전송 바이트)

Fast 3G도 같은 차례이고, 값 차이는 1% 안이다.

| # | 바이트 | 요청 |
| --- | --- | --- |
| 1 | 456,404 | `https://kkokzip.com/`(문서) |
| 2 | 456,300 | `https://kkokzip.com/index.html` — 🔵 같은 파일을 한 번 더 받는다(서비스 워커 사전 캐시로 보임 · 첫 방문 전송량의 23%) |
| 3 | 328,845 | `rpc/get_announcements_deduped`(목록 RPC) |
| 4 | 223,755 | `fonts/kkokzip-led-700.woff2` |
| 5 | 138,996 | `fonts/kkokzip-sans-400.woff2` |
| 6 | 127,486 | `fonts/kkokzip-sans-700.woff2` |
| 7 | 81,754 | `announcement_policies?select=id,announcement_id,category,seq,…` |
| 8 | 46,745 | `cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js` |
| 9 | 23,551 | `announcement_apply_routes?select=…` |
| 10 | 15,372 | `announcement_schedule?select=…` |

## 상세 열기 상위 10 요청(보통 망)

| # | 바이트 | 요청 |
| --- | --- | --- |
| 1 | 52,950 | `announcement_policies?announcement_id=in.(…)`(상세 정책 행) |
| 2 | 43,623 | `complex_geo?select=matched_from,complex_id,lat,lng&lat=not.is…`(쪽 1) |
| 3 | 41,463 | `complex_geo?…`(쪽 2) |
| 4 | 34,897 | `t1.kakaocdn.net/mapjsapi/js/main/4.5.31/kakao.js` |
| 5 | 26,017 | `mts.kakaocdn.net/api/v1/tile/…` 지도 타일 |
| 6 | 25,015 | 지도 타일 |
| 7 | 22,890 | 지도 타일 |
| 8 | 21,244 | 지도 타일 |
| 9 | 16,605 | `complex_geo?…`(쪽 3) |
| 10 | 15,663 | 지도 타일 |

## 이 값을 읽을 때

- 실험실 값 1회다. 한 화면을 한 번만 쟀으니 흔들림 폭을 모른다. 다음에 견줄 때는 같은 명령으로 재고, 차이가 크면(예: LCP ±20%) 한 번 더 잰다.
- 컨테이너는 해외 출구 + 프록시 경유라, 보통 망 TTFB(618 ms)에 한국 사용자보다 긴 왕복이 들어 있다. 사람 기기 값(필드)은 CrUX에 「데이터 없음」이었다.
- 바이트는 압축된 전송량이다(헤더 포함). 원본 크기는 `decodedBodyLength`로 trace에 함께 남는다.
