-- B61 0-5 — announcement_apply_routes 에 차수 칸(phase_text)을 더한다.
-- 순위·차수 이름(원문 부분 문자열). route 는 접수 「경로」(인터넷·모바일/현장/전체) 뜻을 그대로 둔다.
-- 되돌리기: delete from public.announcement_apply_routes where extracted_by='B61-phase-v1';
--          alter table public.announcement_apply_routes drop column phase_text;
begin;
DO $$ begin
  if (select count(*) from public.announcement_apply_routes) <> 21 then raise exception 'GUARD rows'; end if;
  if (select md5(string_agg(row_to_json(r)::text, E'\n' order by r.id)) from public.announcement_apply_routes r) <> 'fe891bdd66402d38242cbe5ee40210e2' then raise exception 'GUARD md5'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='announcement_apply_routes' and column_name='phase_text') then raise exception 'GUARD col'; end if;
end $$;
alter table public.announcement_apply_routes add column phase_text text null;
comment on column public.announcement_apply_routes.phase_text is '순위·차수 이름(원문 부분 문자열) — 경로(route)와 다른 축. 차수로 날짜가 갈릴 때만 채운다(B61)';
insert into public.announcement_apply_routes(announcement_id,policy_id,route,phase_text,period_text,note_text,start_date,end_date,sort_order,extracted_by) values
('2015122300020713','14424e72-f357-440d-a9ca-530c780738d8'::uuid,'현장','1순위 (우선)','‘26.9.29(화) ~ 10.1(목)','(10:00~15:00)','2026-09-29'::date,'2026-10-01'::date,1,'B61-phase-v1'),
('2015122300020713','14424e72-f357-440d-a9ca-530c780738d8'::uuid,'현장','1순위 (일반) ⋅ 2순위','‘26.10.20(화) ~ 10.22(목)','(10:00~15:00)','2026-10-20'::date,'2026-10-22'::date,2,'B61-phase-v1'),
('2015122300020706','1de9761e-7c76-4ad6-b5a9-f8166ade1e6e'::uuid,'현장','1순위 (우선)','‘26.9.29(화) ~ 10.1(목)','(10:00~16:00)','2026-09-29'::date,'2026-10-01'::date,1,'B61-phase-v1'),
('2015122300020706','1de9761e-7c76-4ad6-b5a9-f8166ade1e6e'::uuid,'현장','1순위 (일반) ⋅ 2순위','‘26.10.20(화) ~ 10.22(목)','(10:00~16:00)','2026-10-20'::date,'2026-10-22'::date,2,'B61-phase-v1');
DO $$ begin
  if (select count(*) from public.announcement_apply_routes) <> 25 then raise exception 'POST rows'; end if;
  if (select md5(string_agg(json_build_object('id',r.id,'announcement_id',r.announcement_id,'policy_id',r.policy_id,'route',r.route,'site_text',r.site_text,'period_text',r.period_text,'note_text',r.note_text,'place_text',r.place_text,'start_date',r.start_date,'end_date',r.end_date,'sort_order',r.sort_order,'extracted_by',r.extracted_by,'created_at',r.created_at)::text, E'\n' order by r.id)) from public.announcement_apply_routes r where r.id<=21) is null then raise exception 'POST old'; end if;
  if exists (select 1 from public.announcement_apply_routes r where r.id<=21 and r.phase_text is not null) then raise exception 'POST old phase'; end if;
  if exists (select 1 from public.announcement_apply_routes r join public.announcement_policies p on p.id=r.policy_id
             where r.extracted_by='B61-phase-v1' and (position(r.phase_text in p.content_raw)=0 or position(r.period_text in p.content_raw)=0 or position(r.note_text in p.content_raw)=0 or p.announcement_id<>r.announcement_id)) then raise exception 'POST substring'; end if;
  if (select relacl::text from pg_class where oid='public.announcement_apply_routes'::regclass) <> '{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}' then raise exception 'POST acl'; end if;
end $$;
commit;
