-- 첫 적용 시험(2026-09-30 · 우편함 「운영 — DB 함수·스키마 변경도 PR 병합 = 적용」) — 정의·권한은 그대로 두고 설명만 단다.
-- zipfit:function get_announcement_blocks(text) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:anon select * from get_announcement_blocks('2015122300020838')
comment on function public.get_announcement_blocks(text) is
  '공고 하나가 속한 그룹의 블록(단지 주소) 목록. 산물을 어느 ID에 둘지 가르는 기준(규약 29 — 블록 2 이상이면 블록별). 정의 사본: supabase/rpc/get_announcement_blocks.sql';
