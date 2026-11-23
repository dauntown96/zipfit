-- zipfit:function zipfit_ops.secret_expiry_list() acl={postgres=X/postgres} secdef=false
-- 비밀값 만료 표가 「만료 없음」을 받게(2026-11-23 · 우편함 「코드·운영 — 서울 이전 마무리: 백업 덤프에서 juso 좌표 빼기 · 처리방침 옛 서버 삭제 날짜 · 비밀값 만료 표」 3).
--   ① zipfit_ops.secret_expiry_external.expires NOT NULL 걷음 — 비면 「만료 없음」.
--   ② zipfit_ops.secret_expiry_list() — fixed 줄 만료일이 비면 state = none(Vault 「expires=none」과 같은 뜻 · health-ops secret_expiry 는 none 을 「만료 없음」으로 세기만 · 상태판 secrets 그대로).
--   ③ 새 줄 NOTION_TOKEN(Notion 내부 통합 · Claude Code 환경 변수 · 만료 없음). 폐기된 옛 토큰(옛 관리 토큰 zipfit-claude-code · 7일 토큰)은 표에 줄이 없다(2026-11-23 실측 — 지울 것 0).
--   값은 두지 않는다 — 이름·만료일·근거만.
-- 되돌리기: delete from zipfit_ops.secret_expiry_external where expires is null; alter table … alter column expires set not null;
--   git show <이 PR 앞 커밋>:supabase/rpc/zipfit_ops/secret_expiry_list.sql 로 create or replace.
alter table zipfit_ops.secret_expiry_external alter column expires drop not null;

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
--   🔵 2026-11-23(우편함 「코드·운영 — 서울 이전 마무리」 3) — fixed 줄 만료일이 비면(만료 없는 토큰) state = none(Vault 「expires=none」과 같은 뜻).
select s.source, s.name, s.state, s.expires, s.expires - (now() at time zone 'Asia/Seoul')::date
  from (select 'vault' as source, v.name,
               case when m.tok ~ '^\d{4}-\d{2}-\d{2}$' then 'date' when m.tok in ('none', 'unknown') then m.tok else 'missing' end as state,
               case when m.tok ~ '^\d{4}-\d{2}-\d{2}$' then m.tok::date end as expires
          from vault.secrets v
          cross join lateral (select lower(trim(substring(coalesce(v.description, '') from '^\s*expires=([^;]*)'))) as tok) m
        union all
        select 'fixed', e.name, case when e.expires is null then 'none' else 'date' end, e.expires
          from zipfit_ops.secret_expiry_external e) s
 order by s.expires nulls last, s.source desc, s.name;
$function$;

insert into zipfit_ops.secret_expiry_external (name, expires, basis) values
  ('NOTION_TOKEN(Notion 내부 통합 · Claude Code 환경 변수)', null, '만료 없음(Notion 내부 통합 토큰) · 다운님 2026-11-23 요청서 「서울 이전 마무리」 3');
