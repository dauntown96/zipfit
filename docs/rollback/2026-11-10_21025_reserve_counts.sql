-- 되돌림 기록 — 2026-11-10 코드·운영 「11-09 정돈 셋 …」 ④ …21025(경주·영천 국민 동호지정) 세대 행 extracted_facts 「모집예비자수」
-- 🔴 실행하지 않은 기록이다. 되돌릴 때만 관리 API로 보낸다(데이터 쓰기 — 원칙 32 밖).
-- 13행 · 값 = extra_note 「모집호수 당첨자 N·예비당첨자 M」의 「예비당첨자 M」 조각 그대로(claude.ai 판정 2026-11-09 — 예비당첨자 = 이번에 뽑는 예비자).
-- 이 회차 전 이 행들에 그 키는 없었다(가드 확인) · 다른 키는 건드리지 않았다.
update housing_units set extracted_facts = extracted_facts - '모집예비자수'
where announcement_id = '2015122300021025' and id in (
  '21504af6-65cd-462c-8675-762951638d2b',
  '3a37a67c-3c67-43ad-988e-fc2895a52d70',
  '48bd8893-b422-4685-97de-fc97bd6b3a84',
  '4cb59c80-30c0-43b5-a323-8a03e1a0f79e',
  '55f57d53-73fb-4724-8ab0-600faebb1e29',
  '5d031673-704f-4b37-9fa4-fa0aae294a79',
  '6fd804cc-fac9-43ff-9d17-fb4c5a951d57',
  '7798c1ef-546c-40c9-af1f-818e808faffc',
  '8566dede-5640-4141-86ab-d65343dabc5b',
  '8f81476a-82ea-424d-8ecc-6384a791b9f7',
  '9e40c5db-b51c-4ac4-9c9e-da1124a09f6f',
  'a884c73e-0726-49d2-9bcd-d15171329f8a',
  'be5aeba9-2abb-4156-8c93-a7da332527e9'
);
