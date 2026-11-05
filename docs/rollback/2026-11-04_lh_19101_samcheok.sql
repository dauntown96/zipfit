-- 되돌림 — 2026-11-04 16:44 KST 관리 API 데이터 쓰기(우편함 「옛 주소 걷기·화면 빈칸 점검」 6)
-- 삼척도계/정선신동 LH 행(panId 2015122300019101 · 접수마감) 한 행을 지운다.
-- 행 값 = LH 목록 API(lhLeaseNoticeInfo1 · 게시 2025-11-20~30 창) + 상세 API(getLeaseNoticeDtlInfo1 · 세대 2 · 일정 2 · 첨부 4)를
--          collect-announcements 의 mapLHRow 그대로 거친 것(코드 사본을 로컬 Deno로 돌림 · 손으로 고친 칸 0).
-- 🔴 이 행에 분석 산물(정책·세대·일정·경로·자격·이미지)이 붙은 뒤에는 그것부터 본다 — 아래는 산물 0일 때만 지운다.
do $$ declare n int; begin
  if exists (select 1 from public.announcement_policies where announcement_id = '2015122300019101')
     or exists (select 1 from public.housing_units where announcement_id = '2015122300019101')
     or exists (select 1 from public.announcement_schedule where announcement_id = '2015122300019101') then
    raise exception 'GUARD 분석 산물이 붙어 있다 — 먼저 본다';
  end if;
  delete from public.announcements where announcement_id = '2015122300019101' and source = 'LH' and created_at >= '2026-11-04 07:44:00+00';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'GUARD 행 수 %', n; end if;
end $$;
