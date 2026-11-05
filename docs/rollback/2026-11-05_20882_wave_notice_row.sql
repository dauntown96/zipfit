-- 되돌림: …20882 「⚠️ 이번 차수 공급대상주택」 정책 행(2026-11-05 16:06 KST · 우편함 「코드·운영 — LH 첨부 경로(lhFile.do) 사용 중단 …」 3장 · 관리 API 데이터 쓰기).
-- 원문 = LH청약플러스 공지 상세(view.do · bbsSn=9102432471) 본문 「□ 대상주택 : 총 21호(춘천시 1호, 원주시 20호) - 첨부파일(공급주택목록) 참고」 — 첨부(붙임2 xlsx)는 robots 멈춤으로 받지 않음.
-- 기록이다(배포 경로 아님) — 되돌릴 때 관리 API 로 한 번 보낸다.
do $$ begin
  if (select count(*) from public.announcement_policies where id = '1ff691d3-eb93-47cb-a8b4-9cad7cd95c69' and category = '⚠️ 이번 차수 공급대상주택') <> 1 then raise exception 'GUARD 행 없음'; end if;
  delete from public.announcement_policies where id = '1ff691d3-eb93-47cb-a8b4-9cad7cd95c69';
end $$;
