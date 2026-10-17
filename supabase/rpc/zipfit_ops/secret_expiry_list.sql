CREATE OR REPLACE FUNCTION zipfit_ops.secret_expiry_list()
 RETURNS TABLE(source text, name text, state text, expires date, days_left integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 인스턴스 지표 정기 기록 · Vault 밖 만료 표 · 비밀값 30일 전 ⚠️ …」 2·3) — 비밀값 만료 한 정의.
--   ops_status_board().secrets 와 health-ops secret_expiry(30일 안 ⚠️ · 지나면 ❌)가 이 함수 하나를 읽는다.
--   vault 줄 = vault.secrets 의 이름·설명칸 머리 「expires=YYYY-MM-DD|none|unknown」만(🔴 secret 칸·decrypted_secrets 는 읽지 않는다 · 꼴이 없으면 missing)
--   · fixed 줄 = Vault 밖 만료 표 zipfit_ops.secret_expiry_external(토큰을 갈면 그 표 한 줄을 고친다).
--   days_left = KST 오늘부터 · 날짜 있는 것부터 남은 날 오름차순.
select s.source, s.name, s.state, s.expires, s.expires - (now() at time zone 'Asia/Seoul')::date
  from (select 'vault' as source, v.name,
               case when m.tok ~ '^\d{4}-\d{2}-\d{2}$' then 'date' when m.tok in ('none', 'unknown') then m.tok else 'missing' end as state,
               case when m.tok ~ '^\d{4}-\d{2}-\d{2}$' then m.tok::date end as expires
          from vault.secrets v
          cross join lateral (select lower(trim(substring(coalesce(v.description, '') from '^\s*expires=([^;]*)'))) as tok) m
        union all
        select 'fixed', e.name, 'date', e.expires
          from zipfit_ops.secret_expiry_external e) s
 order by s.expires nulls last, s.source desc, s.name;
$function$
