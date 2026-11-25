# 2026-11-25 — 자동 — run 519 · 대상 1(GH_844 안양냉천 경기행복주택)

- 무엇을: 감지 루틴 run 519(발송 사유 returned · 몫 1건)가 GH(경기주택도시공사) 「안양냉천 경기행복주택 입주자 모집 공고」(GH_844 · 공고일 2026.11.25 · 접수 2026.12.07~12.09)를 처음 분석해 반영했다. 후속 처리 「운영 — 데이터 쓰기」 진행 요청 0장.
- 원문: GH 첨부 2개(공고문 hwp 1,154,048B · pdf 1,224,499B · 47쪽)를 fetch-attachment로 Drive `[임시] GH_844` 폴더(ensure_folder로 새로 만듦)에 올려 전문을 읽음. 정책 문장은 hwp → hwpx 셀 구조로 뜨고 PDF와 공백 무시 대조(표·세로 레이블 행은 hwp 출처 · 쪽 NULL).
- 반영(한 트랜잭션 · 생존 가드): announcement_policies 61(쉽게 쓴 말 요점 61/61 · plain-check v3 요점 · 같은 원문 요점 다시 쓰기 2) · announcement_schedule 8 · eligibility_criteria 3(대학생 · 청년 · 신혼부부·한부모가족 계층) · housing_units 4(39형 — 대학생 10 · 청년 소득無·소득有 묶음 38 · 신혼부부·한부모가족 20 = 금회공급 68) · announcement_extras 3(GH 공고 페이지 단지 이미지 — 조감도 · 위치도 · 세대평면도(39)) · 경로 0(인터넷·현장 접수 기간 같음) · 새 category 매핑 13(policy_category_classes 26행) · announcement_analysis 「완료」. 단지 잇기 complex_link_announcements → 새 단지 1 · 세대 4.
- 검사: 되돌리기 전용 시험에서 저장소 불변식 v3.34 전체 새 위반 0 · 트랜잭션 안 불변식(주소 NULL 0 · 모집 합 68 · 일정 부분 문자열 · unit_key · 공급대상 원문) 통과 · 전환 이율 원문 「연이율 7%」·「3.5%」와 4행 역산 일치.
- 분석률(supabase/metrics/analysis_rate.sql · 2026-11-25 10:56 UTC): 103/105.
- 우편함: 「자동 — run 519 · 2026-11-25 … · 대상 1」 회차 페이지.
