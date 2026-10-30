CREATE OR REPLACE FUNCTION public.refresh_announcement_post_links()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
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
-- 🔵 2026-10-28(우편함 「코드·운영 — 런칭 뒤 첫 주 DB 쪽 묶음」 1 · 백로그 「회차 거르기 규칙을 한 벌로」 판정 꼴 A) 규칙 link-v4 —
--   panId = LH announcement_id ∧ **접수 시작·마감이 둘 다 같다**(NULL 없음)면 공고일이 달라도 잇는다(v3 이 못 잇는 짝만).
--   계기: 태백철암1 MYHOME 21199_1_…(공고일 09-14) ↔ LH …20735(09-11 · 접수 09-28~10-28 같음) — 대표가 MYHOME 이 되어 화면이 LH 산물을 「다른 회차」로 갈랐다.
--   🔴 v3 과 달리 제목 키가 같아도 잇는다 — 같은 키의 짝은 이미 한 묶음이고, 링크는 MYHOME 행을 대표 후보 맨 뒤로 보내(get_announcements_deduped linked_in)
--   LH 행이 대표가 되게 한다(태백 짝은 키가 같다 — 키 조건을 두면 잡히지 않는다 · 2026-10-28 실측).
--   접수 창을 회차 키로 쓰는 것은 「panId 가 이미 같은 게시물을 가리킬 때」뿐이다 — panId 없이 접수 창만으로는 잇지 않는다(상시모집은 해마다 같은 창일 수 있다).
--   evidence 「panId=… · 접수 …~…」 · rule_version 'link-v4'(되돌리기는 이 값으로 골라 지운다).
declare
  n integer;
  k integer;
  v integer;
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
  insert into public.announcement_post_links (lh_announcement_id, linked_announcement_id, linked_group_key, evidence_kind, evidence, rule_version)
  select lh.announcement_id, m.announcement_id, announcement_dedup_key(m.title), 'url_pan_id',
         'panId=' || lh.announcement_id || ' · 접수 ' || m.apply_start::text || '~' || m.apply_end::text, 'link-v4'
  from public.announcements m
  join public.announcements lh ON lh.announcement_id = substring(m.url from 'panId=([0-9]+)') and lh.source = 'LH' and lh.title is not null
  where m.source = 'MYHOME' and m.title is not null and m.url ~ 'panId='
    and m.apply_start is not null and m.apply_end is not null
    and m.apply_start = lh.apply_start and m.apply_end = lh.apply_end
    -- 🔴 공고일이 같은(v3 회차 조건에 드는) 짝은 v4 가 잇지 않는다 — 같은 날 · 같은 키 짝은 LH 자기 공고문이 MYHOME 에도 올라온 것이라
    --    링크하면 화면이 그 카드를 「같은 게시물 공고문 묶음」으로 그린다(zfPostNotices · ownRow). v4 는 v3 이 공고일로 떨어뜨린 짝만 메운다.
    and not (m.announcement_date = lh.announcement_date
             or (lh.is_revised and m.announcement_date = lh.first_announcement_date))
  on conflict (lh_announcement_id, linked_announcement_id) do nothing;
  get diagnostics v = row_count;
  return n + k + v;
end
$function$
