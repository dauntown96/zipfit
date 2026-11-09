-- 되돌림 기록 — 2026-11-09 코드·운영(데이터 쓰기) 「세대 행 extracted_facts 「모집예비자수」 채우기 · 출산 가산 근거 V21 · …20728 옛 ⚠️ 문장」
-- 🔴 실행하지 않은 기록이다. 되돌릴 때만 관리 API로 보낸다(데이터 쓰기 — 원칙 32 밖).
-- 1) 모집예비자수 — 54행(열린 카드 그룹). 이 회차 전 이 키를 가진 행은 0이었다 · extracted_by 는 모두 이미 있던 값이라 그대로 둔다.
update housing_units set extracted_facts = extracted_facts - '모집예비자수'
where id in (
  '05abd81e-a506-4e97-afdb-3d2dc8a5f92e',
  '09efecfe-21ca-486b-a8a4-b7d01f33d83e',
  '10e320d8-f6e9-42c3-8e15-cd922d1fe108',
  '1440bd7b-1f8c-453f-a2d3-2584c2db3b04',
  '1677db31-a03d-4e87-8731-cbf9331b6180',
  '1d49d67a-6339-4efe-b9dc-baab58c080de',
  '1faf833b-b737-4246-b46f-42640db4b1cf',
  '21111951-fde7-4b64-94de-bbac5b252d62',
  '22f8b764-fced-4aec-a06b-5254afc21054',
  '25ec308e-251a-417b-a5c6-26b101913b02',
  '27e9e234-298b-466e-be75-eb4e45d3d75a',
  '2f8ad4b1-d159-4998-9273-d7ff8bb49a14',
  '37ad003c-1447-47dd-928e-ead940e24709',
  '3abc3e2d-0389-4b20-8c17-bdd972f26190',
  '3c391fd9-d783-4d33-9978-fa83d51223d3',
  '4395d970-70a1-473a-9657-b586bfffa710',
  '43f4bc87-f4c5-45cb-8596-283972856e80',
  '45f8bbe4-2e0b-4006-afb4-bd4c46f32ede',
  '4712fd3d-6e04-420d-b3aa-c81790cf2812',
  '4a22628e-bb64-4dc1-bd20-7db80475112e',
  '4a78dae2-f8b2-4d29-b72d-ebf2fa5b7146',
  '4c979140-0b57-4bed-90eb-bae652b8a212',
  '5843e009-c3f0-4377-b0f5-fa625ad4f414',
  '5974930f-5754-442d-8e5c-992d568ce9de',
  '5ca232cf-71ed-4de4-8083-992132dfa028',
  '61153811-efd8-4cf9-b337-69b926f5a53e',
  '629eac2b-fa17-40a2-a1f3-e20d5730f2f0',
  '69fb3953-f3c2-44aa-bff6-cf17c3e20e41',
  '6db7d6d6-69bb-4628-b4b1-3d576e8ec12c',
  '755404ac-4e6c-4f08-b055-ce3d35fc3bb6',
  '7c04ce4a-71a8-4cf3-bf11-5ca3640e12c8',
  '892d35cd-5f6c-4054-83cc-031bbe7d07e9',
  '89ad5c12-47b2-4526-9b7e-315250ae3193',
  '9615d1f5-bd45-4e1a-aff4-08b6dc5e3bc1',
  '968ac9a8-ef53-4a3f-9a67-ceb0c95fca15',
  '96a06cb5-35ab-43e2-8ea5-fef570a373b0',
  '9b771096-5eb5-43af-9494-94fc7511ed50',
  'a2deb7db-8bd7-4890-b6c0-1566a9bcb5ed',
  'a889cf3d-9081-4d26-a825-43ec3500f706',
  'b8f9dc20-262a-4135-934d-d311d6f66ae8',
  'c71f4876-4a63-4137-abca-3143a2744a20',
  'cbf30f6f-0b21-4ca3-b55f-feb4c74a1ab6',
  'd0947990-b346-46d5-9224-f4765f0c5e3c',
  'd27065b9-7620-44a1-9887-b11eff0cfa16',
  'd709aebd-20e4-447f-99f8-10070831205e',
  'dc8971db-c92a-4a05-8286-b57dbe339058',
  'ddb620c5-5fad-493d-bb90-f85162f1b337',
  'e2211fe3-a8f5-4970-9fc3-28e25f4f11f7',
  'e5e67c05-c36a-49d6-ae81-17c66c80dc1e',
  'ed35dea6-a8a6-4ec9-9f70-61fa790dc8bd',
  'eef37119-4dc3-4835-a552-b4ce7df43d0c',
  'f0777d2e-d8a5-43ab-8872-60b9f9b2c8f3',
  'f6f194fa-5c90-449a-8a09-6d8d68112e3d',
  'fbeff70b-a6dc-44a0-b76f-9d46566002f4'
);
-- 2) 대기예비자수 — …19312 24형 · 39형 2행(이 회차 전 키 없음).
update housing_units set extracted_facts = extracted_facts - '대기예비자수'
where id in ('10e320d8-f6e9-42c3-8e15-cd922d1fe108', 'dc8971db-c92a-4a05-8286-b57dbe339058');
-- 3) V21 근거 — vr 키 3(원문 p4 표 문장).
update eligibility_criteria set verification_requirements = verification_requirements - '출산자녀수에 따른 자산기준 금액'
where id in ('89f6d525-c058-4d1e-95af-d97a96f95679', 'dd8d153a-6511-4f0f-933b-7803fcb7b97b');
update eligibility_criteria set verification_requirements = verification_requirements - '자산기준 가산(출산자녀)'
where id = '25446921-0564-400b-ab0d-f4285762a423';
-- 4) …20728 ⚠️ 행 921441f7 — 옛 문장으로.
update announcement_policies set content_raw = '원문 「2. 모집대상 주택」 표(공고문 1면)의 두 표기가 서로 맞지 않습니다. 양쪽을 그대로 옮깁니다.
① 표 머리 : 「모집할 예비자수 (40)」
② 표 행 값 : 경산백천1 37형 30 / 경산백천1 49형 30 (합 60)
꼭집은 주택형별 행 값(37형 30호·49형 30호)을 그대로 저장했습니다. 같은 공고의 마이홈 공개자료도 모집호수를 60호로 싣고 있어 행 값 쪽을 지지합니다. 머리의 「(40)」이 무엇을 가리키는지는 공고문 어디에도 다시 나오지 않습니다.
건설호수(37형 119호·49형 120호, 합 239호 = 단지 개요의 2개동 239호), 세대당 계약면적, 임대조건(계약금 20%·증액 전환이율 6%)은 모두 검산을 통과했습니다. 신청 전 LH에 확인하시기 바랍니다.'
where id::text like '921441f7%' and announcement_id = '2015122300020728';
-- 5) announcement_analysis.pending_fields — 이 회차가 끝에 더한 줄(「2026-11-09 코드·운영 모집예비자수」·「V21 근거」·「…20728 ⚠️ 현행 꼴」)을 지운다(손으로 · 다른 줄은 두다).
