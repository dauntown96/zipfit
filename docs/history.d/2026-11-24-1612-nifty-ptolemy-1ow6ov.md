# 2026-11-24 — 코드·운영 열다섯째 B장 2: 갤러리 source_url 소급 210행

- 우편함: 「코드·운영 — 열다섯째 B장(원문 재료) …」 2 · 판정 2(같은 공고 안 크기 한 후보 · 표본 5 sha256 같음 뒤에만 나머지 · 이름만·후보 둘 이상은 빈칸).
- 목록 다시 받기(배포 0 · 공고 하나씩 5초 간격): `collect-lh-promo ?mode=collect&id=` 매입 27공고 → `announcement_promo_files` 654 → 1,052행(9 → 27공고) · `collect-lh-images` 같은 꼴 79공고 → `announcement_complex_images` 237 → 842행(28 → 78공고) · 실패 1(…20850 EF TypeError).
- Drive 크기: `file_hash`(= Drive 크기) 349 + 파일별 메타(읽기만) 365 · `file_hash` ≠ Drive 크기 0.
- 맞춤(LH 819행): 한 후보 212 · 후보 0 498 · 후보 둘 이상 88 · 목록 없음 21 — 한 후보는 모두 홍보물(이미지 탭 0). …20750 평면도 두 행(서로 다른 Drive 파일 · 같은 크기)이 한 홍보물에 맞아 둘 다 빈칸으로 둠 → 210행 · 17공고.
- 표본 5(5공고): 문지기 `fetch-attachment mode=fetch&meta=1`(받은 바이트 sha256만) = Drive 파일 sha256 — 5/5 같음(바이트 수도 같음).
- 쓰기: 공고마다 한 트랜잭션 · 빈칸 행만 · 행 수 가드 · 되돌리기 전용 시험 먼저 → 17/17 · 210행 일치 · 빈칸 836 → 626(110 → 106공고). 되돌리기 `docs/rollback/2026-11-24_gallery_source_url_{forward,backward}.sql`(BEFORE 모두 NULL).
- `index.html`·`sw.js` 0 · 코드 0 · DDL 0.
