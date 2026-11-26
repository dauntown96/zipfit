# 2026-11-26 — 자동 run 526 — 전남광주통합특별시 고령자 매입임대주택 예비입주자 모집 분석(완료)

- 루틴 지시 v2.25 · 스킬 analysis v11.10 · reverify v5.11 · record v2.11 · 발송기 호출 「run 526 · 이번 몫 1건 · 남은 대기 0건 · 사유 next」 · 후속 처리 0(우편함 「운영 — 데이터 쓰기」 진행 요청 0).
- 대상: 2015122300021127 「[광주전남지역본부] 고령자 매입임대주택 예비입주자 모집」(공고 2026-11-26 · 접수 2026-12-07~12-11 · 원문 ID = 자신 · MYHOME 블록 5 — 산물 0).
- 원문: LH 첨부 7(공고문 PDF 23쪽 · hwpx · 보유주택목록 xlsx 5 — 동구·서구·남구·북구·광산구) — fetch-attachment ensure_folder(Drive [임시] 2015122300021127 새로 만듦) · upload 7(모두 uploaded · 받은 sha = 응답 sha). LH 공고 페이지 공급정보 표 비어 있음 · 홍보물·단지 이미지 0.
- DB 데이터 쓰기 1회(관리 API 한 트랜잭션 · 생존 가드 · 11:42 KST) — 앞서 되돌리기 전용 시험 1회(11:41 · 불변식 v3.34 전체 위반 0): announcement_policies 30(key_rank 1 공급개요 · 2 모집일정 · source_page 5행) · eligibility_criteria 4(1순위 수급자 등 · 1순위 70% 장애인 · 2순위 50% · 2순위 100% 장애인 — 공급대상 키 고령자 나이_최소 65) · announcement_schedule 1(접수) · announcement_apply_routes 1(현장) · announcement_analysis 1(완료) · housing_units 0(공급 주택 미특정 예비입주자 — 선례 …21126 · …21105) · announcement_extras 0.
- 쉽게 쓴 말(요점) 30/30(걸림 0 · 같은 원문 요점 다시 씀 22 · 새로 씀 8 — 첫 판 2 걸림을 고쳐 다시 돌림).
- 커밋 뒤 불변식 0 · 블록·그룹 md5 착수와 같음 · 분석률 100/100(02:42 UTC · supabase/metrics/analysis_rate.sql).
- DDL 0 · 함수 0 · EF 0 · index.html 0.
- 우편함: 「자동 — run 526 · 2026-11-26 · 대상 1」.
