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
declare
  n integer;
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
  return n;
end
$function$
