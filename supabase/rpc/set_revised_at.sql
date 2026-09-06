CREATE OR REPLACE FUNCTION public.set_revised_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_revised THEN
      NEW.revised_at := now();
      NEW.revised_at_source := 'auto';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_revised AND NOT OLD.is_revised THEN
      -- false→true 전이: 지금 막 정정 감지됨(진짜 새로운 정정 이벤트) — 이전에 user_verified였어도
      -- 이건 완전히 새로운 정정 사이클이므로 auto로 갱신
      NEW.revised_at := now();
      NEW.revised_at_source := 'auto';
    ELSIF NOT NEW.is_revised AND OLD.is_revised THEN
      -- true→false 전이: 더 이상 정정상태 아님
      NEW.revised_at := NULL;
      NEW.revised_at_source := 'auto';
    ELSIF NEW.revised_at_source = 'user_verified' THEN
      -- 다운님이 명시적으로 실제 게시일을 확인해서 넣는 UPDATE는 상태 전이 여부와 무관하게 그대로 반영
      NULL;
    ELSE
      -- 상태 유지(계속 true 또는 계속 false)이고 user_verified 명시 설정도 아닌 일반 자동 재수집:
      -- 기존 값을 그대로 유지(수집 스크립트가 이 필드를 건드리지 않아도 안전하게 보존)
      NEW.revised_at := OLD.revised_at;
      NEW.revised_at_source := OLD.revised_at_source;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
