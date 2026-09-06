CREATE OR REPLACE FUNCTION public.compute_announcement_flags()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- is_target: 신혼·신생아·청년 키워드
  NEW.is_target := (
    NEW.title ILIKE '%신혼%' OR
    NEW.title ILIKE '%신생아%' OR
    NEW.title ILIKE '%청년%' OR
    NEW.housing_type ILIKE '%신혼%'
  );

  -- is_metro: 수도권 (서울·경기·인천)
  NEW.is_metro := (
    NEW.region ILIKE '%서울%' OR
    NEW.region ILIKE '%경기%' OR
    NEW.region ILIKE '%인천%'
  );

  RETURN NEW;
END;
$function$
