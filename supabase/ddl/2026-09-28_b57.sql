-- 2026-09-28 B57 기반 공사 — 실행한 DDL 기록(데이터 적재문은 뺐다).
-- 🔴 기록이지 배포 경로가 아니다(supabase/rpc/README.md 첫 절과 같은 원칙). 정본은 DB다.
-- 실행 경로: 관리 API 파일 실행, 항목마다 한 트랜잭션 · DO 가드. 적재 행 수·가드는 README 「스키마 변경 이력」 B57 절.

-- ① 정책 분류 ------------------------------------------------------------
create table public.policy_classes (
  axis        text     not null check (axis in ('standard','user')),
  name        text     not null,
  sort_order  smallint not null,
  description text,
  primary key (axis, name)
);
create table public.policy_category_classes (
  category   text        not null,
  axis       text        not null,
  class_name text        not null,
  mapped_by  text        not null,
  created_at timestamptz not null default now(),
  primary key (category, axis, class_name),
  foreign key (axis, class_name) references public.policy_classes (axis, name) on update cascade
);
create table public.policy_row_classes (
  policy_id  uuid        not null references public.announcement_policies (id) on delete cascade,
  axis       text        not null,
  class_name text        not null,
  reason     text        not null,
  created_at timestamptz not null default now(),
  primary key (policy_id, axis, class_name),
  foreign key (axis, class_name) references public.policy_classes (axis, name) on update cascade
);
create view public.policy_category_unmapped with (security_invoker = true) as
select p.category, count(*) as rows, count(distinct p.announcement_id) as announcements, min(p.created_at) as first_seen
from public.announcement_policies p
where not exists (select 1 from public.policy_category_classes m where m.category = p.category and m.axis = 'standard')
group by p.category;
alter table public.policy_classes          enable row level security;
alter table public.policy_category_classes enable row level security;
alter table public.policy_row_classes      enable row level security;
create policy "anon can read policy_classes"          on public.policy_classes          for select to anon, authenticated using (true);
create policy "anon can read policy_category_classes" on public.policy_category_classes for select to anon, authenticated using (true);
create policy "anon can read policy_row_classes"      on public.policy_row_classes      for select to anon, authenticated using (true);
revoke all on public.policy_category_unmapped from public, anon, authenticated;

-- ② housing_units 결정적 사실 칸 -------------------------------------------
alter table public.housing_units add column extracted_facts jsonb, add column extracted_by text;
alter table public.housing_units add constraint housing_units_extracted_pair check ((extracted_facts is null) = (extracted_by is null));
-- 값: supabase/extract/facts_v1.py (extracted_by = 'B57-facts-v1')

-- ③ housing_type 표준 ------------------------------------------------------
create table public.housing_type_std (
  name        text     primary key,
  sort_order  smallint not null,
  is_housing  boolean  not null,
  description text
);
create table public.housing_type_map (
  source_table text        not null check (source_table in ('announcements','eligibility_criteria','scoring_criteria')),
  source       text        not null default '',
  housing_type text        not null,
  std_type     text        not null references public.housing_type_std (name) on update cascade,
  mapped_by    text        not null,
  note         text,
  created_at   timestamptz not null default now(),
  primary key (source_table, source, housing_type)
);
alter table public.housing_type_std enable row level security;
alter table public.housing_type_map enable row level security;
create policy "anon can read housing_type_std" on public.housing_type_std for select to anon, authenticated using (true);
create policy "anon can read housing_type_map" on public.housing_type_map for select to anon, authenticated using (true);

-- ④ 게시물-공고 링크 --------------------------------------------------------
create table public.announcement_post_links (
  lh_announcement_id     text        not null,
  linked_announcement_id text        not null,
  linked_group_key       text        not null,
  evidence_kind          text        not null check (evidence_kind in ('attachment_filename')),
  evidence               text        not null,
  rule_version           text        not null,
  created_at             timestamptz not null default now(),
  primary key (lh_announcement_id, linked_announcement_id)
);
alter table public.announcement_post_links enable row level security;
create policy "anon can read announcement_post_links" on public.announcement_post_links for select to anon, authenticated using (true);
-- 규칙 B57-link-v1 — 이 INSERT … SELECT 가 곧 규칙이다(다시 돌리면 같은 6행이 나온다, 2026-09-28 기준)
insert into public.announcement_post_links (lh_announcement_id, linked_announcement_id, linked_group_key, evidence_kind, evidence, rule_version)
with lh as (
  select a.announcement_id, a.announcement_date, announcement_dedup_key(a.title) dk, f->>'filename' fn
  from public.announcements a,
       jsonb_array_elements(case when jsonb_typeof(a.attachment_urls)='array' then a.attachment_urls else '[]'::jsonb end) f
  where a.source='LH'),
my as (
  select announcement_id, announcement_date, announcement_dedup_key(title) dk, split_part(title,' ',1) tok
  from public.announcements
  where source='MYHOME' and length(split_part(title,' ',1))>=3
    and split_part(title,' ',1) ~ '[가-힣]' and split_part(title,' ',1) !~ '^[0-9]')
select lh.announcement_id, my.announcement_id, my.dk, 'attachment_filename',
       string_agg(distinct lh.fn, ' | ' order by lh.fn), 'B57-link-v1'
from lh join my on my.announcement_date = lh.announcement_date and my.dk <> lh.dk and position(my.tok in lh.fn) > 0
where not exists (select 1 from public.announcements z where z.source='MYHOME' and announcement_dedup_key(z.title)=lh.dk and position(my.tok in z.title)>0)
group by lh.announcement_id, my.announcement_id, my.dk;

-- ⑤ 경로별 접수 일정 --------------------------------------------------------
create table public.announcement_apply_routes (
  id              bigint generated always as identity primary key,
  announcement_id text        not null,
  policy_id       uuid        not null references public.announcement_policies (id) on delete cascade,
  route           text        not null check (route in ('인터넷·모바일','현장','전체')),
  site_text       text,
  period_text     text        not null,
  note_text       text,
  place_text      text,
  start_date      date,
  end_date        date,
  sort_order      smallint    not null,
  extracted_by    text        not null,
  created_at      timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date <= end_date)
);
alter table public.announcement_apply_routes enable row level security;
create policy "anon can read announcement_apply_routes" on public.announcement_apply_routes for select to anon, authenticated using (true);
