-- 되돌림 — 2026-11-04 분석 묶음 「신혼 갈래 「예비신혼부부」 7행」 · 실행 안 함(되돌릴 때만 · 관리 API 데이터 쓰기)
-- eligibility_criteria.verification_requirements → 공급대상 → 갈래[idx] → 확인필요 를 쓰기 전 값으로.

update public.eligibility_criteria set verification_requirements = jsonb_set(verification_requirements, array['공급대상','갈래','0','확인필요'], to_jsonb('혼인기간 7년 이내 또는 6세 이하 자녀'::text)) where id = '3b47b426-f300-434a-b79a-55e6b6d48565';  -- …20919
update public.eligibility_criteria set verification_requirements = jsonb_set(verification_requirements, array['공급대상','갈래','0','확인필요'], to_jsonb('혼인기간 10년 이내 또는 6세 이하·9세 이하 자녀'::text)) where id = '4e17fbd7-dc79-4a30-ad00-a982b0ea4bf1';  -- …20888
update public.eligibility_criteria set verification_requirements = jsonb_set(verification_requirements, array['공급대상','갈래','0','확인필요'], to_jsonb('혼인기간 10년 이내 또는 6세 이하·9세 이하 자녀'::text)) where id = '77de56e9-f6b8-4c93-ad79-ca80b2055692';  -- …20888
update public.eligibility_criteria set verification_requirements = jsonb_set(verification_requirements, array['공급대상','갈래','0','확인필요'], to_jsonb('혼인기간 7년(자격완화 10년) 이내 또는 6세(자격완화 9세) 이하 자녀'::text)) where id = '8927aca3-7140-415e-ac99-f1fa2686b6a1';  -- …20887
update public.eligibility_criteria set verification_requirements = jsonb_set(verification_requirements, array['공급대상','갈래','0','확인필요'], to_jsonb('혼인기간 10년 이내 또는 9세 이하 자녀(태아 포함)'::text)) where id = 'a4dcb886-dd19-48ef-9f53-e5d042e0e8cf';  -- …20909
update public.eligibility_criteria set verification_requirements = jsonb_set(verification_requirements, array['공급대상','갈래','0','확인필요'], to_jsonb('혼인기간 7년 이내 또는 6세 이하 자녀'::text)) where id = 'd5db292b-0ecf-4657-ab6b-77691bf9ca9e';  -- …20911
update public.eligibility_criteria set verification_requirements = jsonb_set(verification_requirements, array['공급대상','갈래','0','확인필요'], to_jsonb('혼인기간 10년 이내 또는 6세 이하·9세 이하 자녀'::text)) where id = 'fc3f5ba5-daa3-4eac-b9ff-50b022f9618a';  -- …20888
