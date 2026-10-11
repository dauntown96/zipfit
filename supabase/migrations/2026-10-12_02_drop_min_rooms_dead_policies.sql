-- 최소 방 수 칸과 쓰이지 않는 정책 셋 걷기(2026-10-12 · 우편함 「코드 — 고지 회차 3」 5 · 0장 · 다운님 허용 문장 ③).
--   min_rooms — 「고지 회차 2」 5 다운님 결정 「받지 않기」 뒤 화면·EF 가 읽지도 쓰지도 않는다(save-user-profile 주석 30행).
--     의존 0(2026-10-12 실측 — 함수·뷰·pg_depend) · 값 있는 행 1(지운다 — 허용 문장 ③).
--   정책 「own profile insert」·「own profile update」·「own profile select」 — 표를 읽고 쓰는 길은 EF 둘(save-user-profile · delete-account)뿐이고
--     둘 다 service_role 로 접근한다(RLS 를 타지 않음 · 같은 날 코드 확인) · 화면은 표를 직접 읽지 않는다 · 이 표를 읽는 DB 함수 0.
--     → 원칙 15 「개인정보 표는 SELECT 정책도 만들지 않고 EF 경유로만」에 맞춰 걷고 authenticated SELECT 도 회수한다(RLS 는 켠 채).
--   되돌리기: alter table public.user_profiles add column min_rooms integer; grant select on public.user_profiles to authenticated;
--             정책 셋 재생성(정의는 zipfit-backup schema/ 의 직전 스키마 덤프).
DO $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'min_rooms') then
    raise exception 'GUARD min_rooms 없음';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_profiles'
        and policyname in ('own profile insert', 'own profile update', 'own profile select')) <> 3 then
    raise exception 'GUARD 정책 셋이 그대로가 아님';
  end if;
end $$;

drop policy "own profile insert" on public.user_profiles;
drop policy "own profile update" on public.user_profiles;
drop policy "own profile select" on public.user_profiles;
revoke select on table public.user_profiles from authenticated;
alter table public.user_profiles drop column min_rooms;
