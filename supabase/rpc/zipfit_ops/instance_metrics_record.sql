CREATE OR REPLACE FUNCTION zipfit_ops.instance_metrics_record(p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 인스턴스 지표 정기 기록 …」 1) — health-ops(30분)가 관리 API 지표 끝점(베타 · Prometheus 본문)에서 고른 숫자만 넘긴다.
--   p = {scraped_at, mem_total, mem_available, swap_total, swap_free, committed_as, commit_limit, pswpin, pswpout,
--        cpu_user_s, cpu_system_s, cpu_iowait_s, cpu_idle_s, disk_root_read_b, disk_root_written_b, disk_data_read_b, disk_data_written_b}
--   (바이트 · 쪽 · 초 — 누적값은 원값 그대로 · 율은 zipfit_ops.instance_metrics_rates 가 이웃 행 차이로). 없는 키는 NULL.
--   🔴 숫자 칸만 — 본문·계열 원문·Auth 경로별 집계는 받지도 남기지도 않는다. 90일 지난 행은 여기서 지운다. 넣은 행 id 를 돌려준다.
declare v_id bigint;
begin
  insert into zipfit_ops.instance_metrics_log (scraped_at, mem_total, mem_available, swap_total, swap_free, committed_as, commit_limit,
         pswpin, pswpout, cpu_user_s, cpu_system_s, cpu_iowait_s, cpu_idle_s,
         disk_root_read_b, disk_root_written_b, disk_data_read_b, disk_data_written_b)
  values (coalesce((p->>'scraped_at')::timestamptz, now()),
          (p->>'mem_total')::bigint, (p->>'mem_available')::bigint, (p->>'swap_total')::bigint, (p->>'swap_free')::bigint,
          (p->>'committed_as')::bigint, (p->>'commit_limit')::bigint, (p->>'pswpin')::bigint, (p->>'pswpout')::bigint,
          (p->>'cpu_user_s')::double precision, (p->>'cpu_system_s')::double precision,
          (p->>'cpu_iowait_s')::double precision, (p->>'cpu_idle_s')::double precision,
          (p->>'disk_root_read_b')::bigint, (p->>'disk_root_written_b')::bigint,
          (p->>'disk_data_read_b')::bigint, (p->>'disk_data_written_b')::bigint)
  returning id into v_id;
  delete from zipfit_ops.instance_metrics_log where scraped_at < now() - interval '90 days';
  return v_id;
end
$function$
