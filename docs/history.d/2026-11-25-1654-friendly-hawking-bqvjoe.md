# 2026-11-25 — 코드·운영 스물여섯째 · 성능·전송량 기준선 1회 · AgentShield 읽기 전용 스캔 1회 · 0장 재셈 셋

우편함 「코드·운영 — 스물여섯째」. 화면 0 · DB 쓰기 0 · 고침 0. 기록 회차다(결과는 문서와 스크립트).

- 할 일 1: `docs/perf-baseline-2026-11.md` · `scripts/perf-baseline.mjs`(chrome-devtools-mcp 1.10.1을 MCP 클라이언트로 부른다 · 빈 캐시 · 390px · 망 둘 · 화면당 1회 · 이용 기록 쓰기 막음 · 바이트는 trace 원본에서). 배포본 v341, 16:50 KST.
  - 첫 화면 LCP: 보통 3,921 ms · Fast 3G 9,335 ms. CLS 0.76 / 0.74.
  - INP: 공고 탭 12 ms · 상세 열기 47 / 54 ms.
  - 첫 방문: 60 요청 · 2,005,947 B. 그중 `index.html`을 두 번 받는다(456 KB × 2).
  - 상세 열기: 56 요청 · 402,297 B.
  - `--slim`은 망 늦추기·클릭·trace 도구가 없어 쓰지 않았다. `--blockedUrlPattern`도 망 늦추기와 함께 못 써서 `initScript`로 바꿨다.
- 할 일 2: AgentShield(`ecc-agentshield@1.6.0`) `scan -p zipfit -f json` 1회(고침·LLM·sandbox 끔). 등급 C(64) · 60건(critical 9 · high 13 · medium 30 · low 8). 결과 요약은 회신에만 적었다. `.mcp.json`은 만들지 않았다(스크립트가 MCP를 직접 부름).
- 할 일 3: 0장 3 결과 오경보가 없어 고칠 것이 없었다. `income_table_rows` 최근 3일 기록은 1건(관리 API 502 점검 불능)이고, SH_313610은 11-22 표 머리 끊기 뒤로 나오지 않는다.
