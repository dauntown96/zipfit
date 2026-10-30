CREATE OR REPLACE FUNCTION zipfit_ops.round_link_add(p_a text, p_b text, p_evidence text, p_added_by text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 회차 링크 한 줄 넣기(2026-10-29 · 우편함 「코드·운영 — 회차 링크 표 B′」 덧 1) — 분석·국면 C 회차가 원문으로 같은 단지를 확인한 뒤 부른다.
--   방향은 스스로 정한다: 공고일(announcements.announcement_date 최솟값)이 이른 쪽 = earlier · 같거나 모르면 announcement_id 순.
--   거절(예외): 두 id 가 같음 · 공고 행 없음 · 근거·넣은 회차 빔 · 같은 묶음(get_announcement_group_ids — 이미 한 카드라 링크가 필요 없다).
--   이미 있으면(방향 무관) 그대로 두고 「이미 있음」 · 넣으면 「넣음」.
declare
  da date; db date; e text; l text;
begin
  if p_a is null or p_b is null or p_a = p_b then raise exception 'round_link_add: 두 id 가 같거나 비었다 (%, %)', p_a, p_b; end if;
  if coalesce(trim(p_evidence), '') = '' or coalesce(trim(p_added_by), '') = '' then raise exception 'round_link_add: 근거·넣은 회차가 비었다'; end if;
  if not exists (select 1 from announcements where announcement_id = p_a) then raise exception 'round_link_add: 공고 행 없음 %', p_a; end if;
  if not exists (select 1 from announcements where announcement_id = p_b) then raise exception 'round_link_add: 공고 행 없음 %', p_b; end if;
  if exists (select 1 from get_announcement_group_ids(p_a) g where g.announcement_id = p_b) then
    raise exception 'round_link_add: 같은 묶음 (%, %) — 이미 한 카드다', p_a, p_b;
  end if;
  select min(announcement_date) into da from announcements where announcement_id = p_a;
  select min(announcement_date) into db from announcements where announcement_id = p_b;
  if (coalesce(da, date '9999-12-31'), p_a) <= (coalesce(db, date '9999-12-31'), p_b) then e := p_a; l := p_b; else e := p_b; l := p_a; end if;
  if exists (select 1 from announcement_round_links r
              where least(r.earlier_announcement_id, r.later_announcement_id) = least(e, l)
                and greatest(r.earlier_announcement_id, r.later_announcement_id) = greatest(e, l)) then
    return '이미 있음';
  end if;
  insert into announcement_round_links (earlier_announcement_id, later_announcement_id, added_by, evidence) values (e, l, p_added_by, p_evidence);
  return '넣음';
end;
$function$
