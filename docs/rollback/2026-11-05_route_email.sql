-- 되돌림: 접수 경로 「이메일」 행 쓰기(2026-11-05 14:09 KST · 우편함 「코드·운영 — 대상주택 공지 감지 설계 · 접수 경로 이메일 …」 2장 · 관리 API 데이터 쓰기).
-- 쓴 것: 새 행 447(2015122300021004 · 이메일) · 448(20857_1_제주특별자치도_서귀포시 · 이메일) · 행 269(21442_1_제주특별자치도_서귀포시) 전체 → 이메일.
-- 이 파일은 기록이다(배포 경로 아님) — 되돌릴 때 관리 API 로 한 번 보낸다. CHECK 의 '이메일' 은 마이그레이션 2026-11-05_03 몫이라 여기서 걷지 않는다.
do $$ begin
  if (select count(*) from public.announcement_apply_routes where id in (447, 448, 269) and route = '이메일') <> 3 then raise exception 'GUARD 상태가 쓰기 직후와 다름'; end if;
  delete from public.announcement_apply_routes where id in (447, 448);
  update public.announcement_apply_routes
     set route = '전체',
         period_text = '11.3.(화) ~ 11.4.(수) - 시간: 9:00 ~ 17:00',
         note_text = '[E-mail 접수] - 기간: 11.3.(화) ~ 11.4.(수) ※ 11.5. 0시 이후 발송 시 접수 불가 - 주소: jpdc3590@jpdc.co.kr',
         place_text = null,
         extracted_by = '2026-10-22-자동run276'
   where id = 269;
end $$;
