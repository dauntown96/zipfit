-- Z-2 ① PR-B — 같은 게시물 링크 규칙 Z2-link-v3: 첨부 파일명 증거가 없어도 url panId + 같은 회차(공고일 · LH 정정이면 첫 공고일)면 잇는다
--   (2026-10-07 · 우편함 「코드 — Z-2 원문 ID 한 정의 · …」 8 · 다운님 승인 1).
--   1) announcement_post_links.evidence_kind 에 'url_pan_id' 를 허용한다(CHECK 넓힘).
--   2) refresh_announcement_post_links() 에 규칙 v3 INSERT 를 더한다(v2 는 그대로 · cron zipfit-refresh-post-links 10분마다).
--   3) 한 번 채운다 — 롤백 시험(2026-10-07): 새 링크 26행(대표 MYHOME 16 · 대표 아닌 10) · 목록 942 → 930.
--      목록에서 빠지는 MYHOME 카드 13(공주 3 · 광명 1 · 영암 2 · 부천 2 · 군산 2 · 제주 2 · 대구 1) · 숨은 LH …20198(당진·예산 3)은 숨김 그대로라 접히지 않는다.
--      ➕ 광명 원공고 LH …20143 이 대표로 선다(그 그룹의 대표였던 MYHOME 20574_1 이 정정 …20175 로 이어져 빠짐).
--      21197_* 은 …20344(앞 회차)에 이어지지 않는다.
--   되돌리기: delete from announcement_post_links where rule_version = 'Z2-link-v3' + 함수 이전 정의 새 마이그레이션.
-- zipfit:function refresh_announcement_post_links() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:anon select * from get_announcements_deduped()
-- zipfit:anon select * from get_announcements_deduped('경기도')
-- zipfit:anon select * from get_announcement_sites('2015122300020393')
alter table public.announcement_post_links drop constraint announcement_post_links_evidence_kind_check;
alter table public.announcement_post_links add constraint announcement_post_links_evidence_kind_check
  check (evidence_kind in ('attachment_filename', 'url_pan_id'));
CREATE OR REPLACE FUNCTION public.refresh_announcement_post_links()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- 같은 게시물 링크(announcement_post_links)를 채운다 — 2026-09-30 코드 회차 「같은 게시물 카드 분할」.
-- 규칙 B57-link-v2 = B57-link-v1(2026-09-28 한 번 적재한 INSERT … SELECT) ∧ MYHOME 행 url 의 panId = LH announcement_id.
--   v1 보다 좁기만 하다(조건을 더했을 뿐) — v1 이 낸 적 없는 링크는 나오지 않는다.
-- 🔴 카드를 합치지 않는다. MYHOME 카드(공고문 하나)를 같은 게시물의 LH 카드로 잇기만 한다 — 한 게시물에 공고문이 둘 이상이면
--    MYHOME 카드가 공고문마다 따로 서는 것이 맞다(대구연호 A-2BL·A-3BL · 아산 · 목포권 · 보성).
-- 있는 링크는 그대로 둔다(ON CONFLICT DO NOTHING) · 새로 넣은 행 수를 돌려준다. cron zipfit-refresh-post-links 가 10분마다 부른다.
-- 🔴 2026-10-07(Z-2 ① PR-B — 우편함 「코드 — Z-2 …」 8) 규칙 Z2-link-v3 을 더했다 — 첨부 파일명 증거가 없어도(LH 행의 attachment_urls 가
--   비었다 · 목록 LH 813행) MYHOME url 의 panId = LH announcement_id 와 **같은 회차**면 잇는다.
--   회차 = 공고일: MYHOME 공고일 = LH 공고일 ∨ (LH 가 정정 ∧ MYHOME 공고일 = LH 첫 공고일). 접수 마감일(apply_end)은 회차 키로 쓰지 않는다 —
--   한 게시물의 공고문마다 접수일이 다를 수 있다(영암용앙1 07-30 · 영암학산1 07-29 ↔ LH …20393 08-04).
--   🔴 회차 조건 없는 panId 는 앞 회차를 가리킬 수 있다 — MYHOME 21197_* url 은 앞 회차 …20344(공고일 07-08)를 가리킨다(21197 은 09-10) → 잇지 않는다.
--   evidence_kind 'url_pan_id' · evidence 「panId=… · 공고일 …」 · rule_version 'Z2-link-v3'(되돌리기는 이 값으로 골라 지운다).
declare
  n integer;
  k integer;
begin
  insert into public.announcement_post_links (lh_announcement_id, linked_announcement_id, linked_group_key, evidence_kind, evidence, rule_version)
  with my as (
    select m.announcement_id, m.announcement_date, announcement_dedup_key(m.title) as dk,
           split_part(m.title, ' ', 1) as tok, substring(m.url from 'panId=([0-9]+)') as pan
    from public.announcements m
    where m.source = 'MYHOME' and m.url ~ 'panId='
      and length(split_part(m.title, ' ', 1)) >= 3
      and split_part(m.title, ' ', 1) ~ '[가-힣]' and split_part(m.title, ' ', 1) !~ '^[0-9]'
  ),
  lh as (
    select a.announcement_id, a.announcement_date, announcement_dedup_key(a.title) as dk, f->>'filename' as fn
    from public.announcements a
    join (select distinct pan from my) p on p.pan = a.announcement_id,
         jsonb_array_elements(case when jsonb_typeof(a.attachment_urls) = 'array' then a.attachment_urls else '[]'::jsonb end) f
    where a.source = 'LH'
  ),
  my_keys as (
    select announcement_dedup_key(z.title) as dk, z.title
    from public.announcements z
    where z.source = 'MYHOME'
  )
  select lh.announcement_id, my.announcement_id, my.dk, 'attachment_filename',
         string_agg(distinct lh.fn, ' | ' order by lh.fn), 'B57-link-v2'
  from lh
  join my on my.pan = lh.announcement_id and my.announcement_date = lh.announcement_date
         and my.dk <> lh.dk and position(my.tok in lh.fn) > 0
  where not exists (select 1 from my_keys z where z.dk = lh.dk and position(my.tok in z.title) > 0)
  group by lh.announcement_id, my.announcement_id, my.dk
  on conflict (lh_announcement_id, linked_announcement_id) do nothing;
  get diagnostics n = row_count;
  insert into public.announcement_post_links (lh_announcement_id, linked_announcement_id, linked_group_key, evidence_kind, evidence, rule_version)
  select lh.announcement_id, m.announcement_id, announcement_dedup_key(m.title), 'url_pan_id',
         'panId=' || lh.announcement_id || ' · 공고일 ' || m.announcement_date::text, 'Z2-link-v3'
  from public.announcements m
  join public.announcements lh ON lh.announcement_id = substring(m.url from 'panId=([0-9]+)') and lh.source = 'LH' and lh.title is not null
  where m.source = 'MYHOME' and m.title is not null and m.url ~ 'panId='
    and announcement_dedup_key(m.title) <> announcement_dedup_key(lh.title)
    and (m.announcement_date = lh.announcement_date
         or (lh.is_revised and m.announcement_date = lh.first_announcement_date))
  on conflict (lh_announcement_id, linked_announcement_id) do nothing;
  get diagnostics k = row_count;
  return n + k;
end
$function$;
comment on function public.refresh_announcement_post_links() is
  '같은 게시물 링크(announcement_post_links) 자동 채움 — 규칙 B57-link-v2(첨부 파일명 ∧ panId ∧ 같은 공고일) + Z2-link-v3(panId ∧ 같은 회차 · 2026-10-07). cron zipfit-refresh-post-links 10분마다. 정의 사본: supabase/rpc/refresh_announcement_post_links.sql';
-- 첫 채움(2026-10-07 롤백 시험 기대: 새 26행 · 기존 8행 그대로)
select public.refresh_announcement_post_links();
