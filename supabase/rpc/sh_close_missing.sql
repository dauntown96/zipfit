CREATE OR REPLACE FUNCTION public.sh_close_missing(p_threshold integer DEFAULT 8, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(announcement_id text, prev_status text, misses bigint, last_seen_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  with ok_runs as (
    select started_at
    from public.sh_collection_run_log
    where pages_failed = 0
      and errors = '[]'::jsonb
      and coalesce(upserted, 0) > 0
      and started_at is not null
  ),
  cand as (
    select a.announcement_id as aid,
           a.status          as prev,
           a.updated_at      as seen,
           (select count(*) from ok_runs r where r.started_at > a.updated_at) as n
    from public.announcements a
    where a.source = 'SH'
      and a.status <> '접수마감'          -- 🔴 이중 마감 방지 가드
  ),
  hit as (
    select * from cand where n >= p_threshold
  ),
  logged as (
    insert into public.sh_auto_close_log
      (announcement_id, prev_status, misses, last_seen_at, threshold)
    select h.aid, h.prev, h.n, h.seen, p_threshold
    from hit h
    where not p_dry_run
    returning 1
  ),
  closed as (
    update public.announcements a
       set status = '접수마감'
      from hit h
     where a.source = 'SH'
       and a.announcement_id = h.aid
       and a.status <> '접수마감'
       and not p_dry_run
    returning a.announcement_id
  )
  select h.aid, h.prev, h.n, h.seen from hit h order by h.n desc, h.aid;
$function$
