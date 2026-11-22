# 2026-11-22 — 코드·운영 셋째 묶음: 7′ juso 좌표 전 단지 채움 + 출구 지역 한 줄

- 우편함 「코드·운영 — 셋째 묶음: 7′ juso 좌표 전 단지 채움(서울 저장 · 키워드 road_key · 단지 단위) + 출구 지역 한 줄」.
- EF `complex-geo-fill`: 좌표 단계 켬(`JUSO_COORD_ENABLED = true` — 서울 이전 뒤 · 행안부 답 2026-11-19) · 새 모드 `?mode=complex`(단지 단위 · 키워드 = 시도 + 시군구 + `road_key` 도로명·번호 · `logic.ts keywordOfComplex`) · `complex_dry`(쓰기 0) · 런 110초 상한 · `seoul-api` 응답 `region`이 서울이 아니면 런 멈춤 · 응답에 좌표 값 대신 `has_xy`.
- 마이그레이션 `2026-11-22_01_complex_geo_all_complexes.sql`: `complex_geo_complex_targets`(좌표 빈 juso 행 다시 채움 + complex_geo 없는 단지 · 메모리 가용 300MB 아래면 대상 0) · `complex_geo_complex_put`(도로명 키 = 단지 `road_key`일 때만 씀 · 다르면 사람 판정) · cron `zipfit-complex-geo-fill-complex` `8,28,44 0-11 * * *`(UTC · KST 09~20시 시간당 3번 · 런 ≤ 20단지).
- 착수 셈(10:1x KST): `complex_geo` 34(juso 21 — 좌표 0 · pending 13) · `complexes` 3,132 · 대상 단지 약 3,105(세대 주소 없는 단지 7 제외).
- 문서: `docs/data-sources.md` 「출구 지역」 EF ↔ DB 출구 다름 한 줄 · juso 줄 좌표 켬 · `docs/supabase-seoul-move.md` 7′ · `CLAUDE.md` juso 좌표 메모.
