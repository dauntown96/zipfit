# 시험 로그인 묶음 — 로그인 뒤 화면을 실사람 없이 한 바퀴

> 2026-10-28 신설 (우편함 「코드·운영 — 실사용 시험 로그인 묶음을 저장소로」 · 실사용 5·6회차 ⑦ 채택). 코드: [`scripts/test-login.mjs`](../scripts/test-login.mjs)(라이브러리) · [`scripts/login-walk.mjs`](../scripts/login-walk.mjs)(한 바퀴).

## 쓰는 법 — 세 줄

1. 배포본 한 바퀴: `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/login-walk.mjs --persona P2` — 로그인 → 설정 저장(페르소나 정본 `scripts/target-personas.json`) → 추천 탭 → 정리. 끝 JSON의 `ok`가 참이고 `clean`이 `{test_accounts: 0, link_rows: 0}`이면 통과다(아니면 종료 코드 1).
2. 고르는 칸: `--persona P1,P2,P4`(한 세션에서 차례로) · `--width 1280` · `--clock '2026-10-28 16:01'`(KST 시계 고정) · `--shot <세션 scratchpad 폴더>`(캡처 — 저장소 안에 두지 않는다) · `--base http://127.0.0.1:8201`(로컬 판 · 로그인까지만 — 아래 ⚠️).
3. 직접 짤 때: `withTestLogin(async link => { const { page } = await openLoggedIn(context, link); await applyPersona(page, persona) … })` — 링크 받기와 끝 정리·확인을 `withTestLogin`이 맡는다(오류가 나도 정리한다).

## 지키는 것 (⑦ 1-3 시험 계정 예외 · 다운님 승인 2026-10-13)

- 시험 사용자는 EF `test-login`의 상수 주소 하나다(실사람 아님 · `app_metadata.zf_test`). 스크립트는 주소·사용자 id를 받지도 찍지도 않는다.
- 1회용 링크는 프로세스 메모리에만 있다(`LinkSecret` — 출력·JSON·오류문에서 「[가림]」). 링크는 DB `net.http_post`로 받고(비밀값 = Vault `cron_secret_v2`), 응답 행은 읽는 같은 문장에서 지운다. 브라우저 주소 해시에 토큰이 남으면 멈춘다.
- 운영 표지: 배포본 `redirect_to`가 `?ops=1`이고, 모든 쪽에 `localStorage zf_ops=1`을 미리 심는다 → `usage_events.props.ops = 1`(집계에서 빠진다). 동의 꺼짐이라 계정도 붙지 않는다.
- 로컬 판은 목록 RPC를 `scripts/render-list-stub.mjs` 캐시로 돌린다(원칙 26). 배포본은 측정이라 대역을 쓰지 않는다(한 바퀴에 목록 RPC 1회).

⚠️ 로컬 판(`127.0.0.1`)은 프로필 EF(`save-user-profile`)의 CORS 허용 목록(배포 도메인 셋) 밖이라 **저장이 「조건을 불러오지 못해 저장할 수 없어요」로 끝난다**(2026-10-28 실측) — 저장 흐름은 배포본에서 본다.
