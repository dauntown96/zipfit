# 2026-11-21 — 코드·운영 서울 이전 뒷정리 ② 일회용 워크플로 걷기 · 문서 끝 상태

- `.github/workflows/seoul-move.yml` 걷음(이전용 일회용 · 부르는 곳 0). `scripts/seoul-move-*.sql` 넷은 기록으로 남김. 비교 SQL ③④는 `zipfit-backup` 복원 리허설(`scripts/drill_origin.py` · zipfit-backup PR #44)로 옮김.
- `docs/data-sources.md` 「출구 지역」: 서울 DB `net.http_get` robots 재측정(11-21 20:25 KST) — `www.bmc.busan.kr` 403 · `business.juso.go.kr` 200 · `data.myhome.go.kr` 시간 초과 20초 → 서울 실행 길은 남긴다. 후보 9 「해외 서버」 칸: DB 서울 · 좌표 단계는 아직 꺼짐.
- `docs/supabase-seoul-move.md` 7장 「끝 상태」 새로(전환 · Vault 설명칸 7 복원 · 토큰 줄 · 고정본 #1187 · 걷은 것 · 남은 것).
- `docs/network-allowlist.md` Postgres 줄의 `seoul-move.yml` 언급을 고침.
- DB 데이터 쓰기(관리 API): `vault.secrets` 설명칸 7(옛 DB 글자 그대로 · 비밀 본문 md5 전후 같음 가드) · `zipfit_ops.secret_expiry_external` Supabase 토큰 줄 `basis` 1.
- 우편함 「코드·운영 — 서울 이전 뒷정리 회차」 범위 1·2·4·6.
