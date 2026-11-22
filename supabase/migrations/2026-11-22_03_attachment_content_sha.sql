-- zipfit:function attachment_sha_put(bigint,text,bigint) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function attachment_change_candidates() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 첨부 (공고, fileid) 내용 sha 표 + 첨부 변경 후보에서 「새 fileid · 내용 같음」 빼기(2026-11-22 · 우편함 「코드·운영 — 넷째 묶음」 A ·
--   💡 「정정 첨부 sha가 원공고와 같으면 대조 건너뛰기」 승인 11-22 · 근거 물금2 …20420 · 첫 묶음 ⑦1 「fileid만 바뀜 · 내용 같음을 못 거름」).
-- 바꾸는 것:
--   ① 표 public.attachment_content_sha(announcement_id, file_id, sha256, bytes, first_seen, last_seen, source) — 한 행 = (공고, LH fileid) 하나.
--      public 에 둔 까닭: 이 표를 읽는 attachment_change_candidates() 가 public · SECURITY INVOKER 이고 service_role 도 부른다 —
--      zipfit_ops 에 두면 service_role 에 스키마 USAGE 가 없어 조용히 실패한다(셋째 묶음 #1201 사고 · 같은 축 기록 표 lh_file_fetch_log 도 public).
--      공개 읽기 0(RLS 켜고 정책 0 · anon·authenticated 권한 0) · 쓰기 service_role.
--   ② attachment_sha_put(log_id, sha, bytes) — EF fetch-attachment 가 문지기 허락 받기(lhFile.do)가 ok 로 끝난 뒤 부른다.
--      (공고, fileid)는 그 기록 행(lh_file_fetch_log · allowed ∧ outcome ok ∧ fileid 숫자 ∧ 공고 있음)에서 읽는다 · 있으면 last_seen 만(첫 sha 를 지킨다 —
--      같은 fileid 에 다른 sha 가 오면 sha_mismatch 로 돌려주고 덮지 않는다).
--   ③ attachment_change_candidates() — 「분석 뒤 첨부 변경」에서 **분석 때 목록에 없던 새 fileid 가 모두 sha 가 적혀 있고 각 sha 가 분석 때 목록의
--      어느 fileid sha 와 같으면**(내용 같음 · fileid 만 바뀜) 후보에서 뺀다. 분석 때 목록 = 분석 뒤 첫 이력 행의 files(트리거가 바뀌기 전 목록을 적는다).
--      새 fileid 의 sha 를 모르면 종전대로 후보다(받기 전에는 가릴 수 없다 — 받은 뒤 다음 셈부터 빠진다). 반환 꼴은 그대로(쓰는 곳 analysis_dispatch_tick · health-ops).
--   ④ 과거분: 새로 받지 않는다(LH 첨부 경로 robots Disallow — 문지기 받기만) · 이미 있는 기록에서만 — 갤러리 announcement_extras(source_url 의 fileid · content_sha256 ·
--      한 짝에 sha 가 둘이면 가장 먼저 만든 행) · source 'extras'. 공고문 첨부의 지난 받기 sha 는 남은 기록이 없다(net._http_response 는 6시간만 · 문지기 기록 표에 sha 칸 없음).
--   켜기 칸 analysis_dispatch_config.attachment_change_enabled 는 그대로(거짓).
-- 되돌리기: 사본 git show <앞 커밋>:supabase/rpc/attachment_change_candidates.sql 로 새 마이그레이션 · drop function public.attachment_sha_put(bigint,text,bigint);
--   drop table public.attachment_content_sha;
set local lock_timeout = '5s';
DO $$ begin
  if to_regclass('public.lh_file_fetch_log') is null or to_regclass('public.announcement_attachment_history') is null then raise exception 'GUARD tables missing'; end if;
  if to_regclass('public.attachment_content_sha') is not null then raise exception 'GUARD attachment_content_sha exists'; end if;
end $$;

create table public.attachment_content_sha (
  announcement_id text not null,
  file_id         text not null constraint attachment_content_sha_fid check (file_id ~ '^[0-9]+$'),
  sha256          text not null constraint attachment_content_sha_hex check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes           bigint,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  source          text not null constraint attachment_content_sha_source check (source in ('fetch', 'extras')),
  primary key (announcement_id, file_id)
);
create index attachment_content_sha_sha on public.attachment_content_sha (announcement_id, sha256);
comment on table public.attachment_content_sha is
  '첨부 (공고, LH fileid) 내용 sha256(2026-11-22) · source fetch = fetch-attachment 문지기 허락 받기(ok) · extras = 갤러리 announcement_extras 소급 · 첫 sha 를 지킨다 · attachment_change_candidates 가 「새 fileid · 내용 같음」을 뺀다 · 쓰기 service_role';
alter table public.attachment_content_sha enable row level security;
revoke all on table public.attachment_content_sha from public, anon, authenticated;
grant select, insert, update on table public.attachment_content_sha to service_role;

CREATE OR REPLACE FUNCTION public.attachment_sha_put(p_log_id bigint, p_sha256 text, p_bytes bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-22(우편함 「코드·운영 — 넷째 묶음」 A) — 문지기가 허락한 lhFile.do 받기가 ok 로 끝난 뒤 EF fetch-attachment 가 부른다.
--   (공고, fileid)는 그 기록 행에서 읽는다(allowed ∧ outcome 'ok' ∧ fileid 숫자 ∧ 공고 있음 — 아니면 skipped) · 있으면 last_seen 만 · 다른 sha 면 덮지 않고 sha_mismatch.
declare
  v_aid text; v_fid text; v_old text; v_sha text := lower(btrim(coalesce(p_sha256, '')));
begin
  if v_sha !~ '^[0-9a-f]{64}$' then return jsonb_build_object('result', 'bad_sha'); end if;
  select l.announcement_id, l.file_id into v_aid, v_fid from public.lh_file_fetch_log l
   where l.id = p_log_id and l.allowed and l.outcome = 'ok' and l.file_id ~ '^[0-9]+$' and l.announcement_id is not null;
  if v_aid is null then return jsonb_build_object('result', 'skipped'); end if;
  select s.sha256 into v_old from public.attachment_content_sha s where s.announcement_id = v_aid and s.file_id = v_fid;
  if v_old is null then
    insert into public.attachment_content_sha (announcement_id, file_id, sha256, bytes, source)
    values (v_aid, v_fid, v_sha, case when p_bytes > 0 then p_bytes end, 'fetch')
    on conflict (announcement_id, file_id) do update set last_seen = now();
    return jsonb_build_object('result', 'inserted');
  end if;
  update public.attachment_content_sha s set last_seen = now(), bytes = coalesce(s.bytes, case when p_bytes > 0 then p_bytes end)
   where s.announcement_id = v_aid and s.file_id = v_fid;
  return jsonb_build_object('result', case when v_old = v_sha then 'seen' else 'sha_mismatch' end);
end
$function$;
revoke execute on function public.attachment_sha_put(bigint,text,bigint) from public, anon, authenticated;
grant execute on function public.attachment_sha_put(bigint,text,bigint) to service_role;

CREATE OR REPLACE FUNCTION public.attachment_change_candidates()
 RETURNS TABLE(announcement_id text, group_key text, apply_end date, seen_at timestamp with time zone, analyzed_at timestamp with time zone, reviewed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-21(우편함 「코드·운영 — 첫 묶음」 A (가)(나)) — 분석 뒤 첨부 변경이 있는 열린 공고.
--   조건 = get_reanalysis_queue() 둘째 갈래 「분석 뒤 첨부 변경」과 같다(완료 계열 분석 ∧ 첨부 이력 seen_at > greatest(analyzed_at, attachment_reviewed_at)
--   ∧ 이력의 옛 목록이 빈 첫 채움이 아님) + apply_end ≥ 오늘(KST) — 한쪽을 바꾸면 함께 바꾼다.
--   group_key = 묶음 키(링크 표 ∪ 제목 키 — analysis_dispatch_tick 의 keyed 와 같은 규칙) || ' #첨부 ' || 마지막 변경 시각(KST 분) — 다시 바뀌면 새 몫.
--   쓰는 곳: analysis_dispatch_tick 다섯째 후보(acand · 켜기 칸 attachment_change_enabled) · health-ops attachment_review_gap(대기열에 없는 수).
-- 🔵 2026-11-22(우편함 「코드·운영 — 넷째 묶음」 A) — 「새 fileid · 내용 같음」을 뺀다: 분석 때 목록(분석 뒤 첫 이력 행의 files)에 없던 지금 목록의 fileid 가
--   모두 attachment_content_sha 에 sha 가 있고, 각 sha 가 분석 때 목록의 어느 fileid sha 와 같으면 후보 아님. 새 fileid 의 sha 를 모르면 종전대로 후보.
--   🔵 get_reanalysis_queue() 둘째 갈래는 이 거름을 아직 안 갖는다(켜기 칸 참 전 reverify 개정 때 함께 — 넷째 묶음 회신 ②).
WITH link_map AS (
  SELECT DISTINCT ON (l.linked_announcement_id)
    l.linked_announcement_id AS aid, announcement_dedup_key(lh.title) AS lh_key
  FROM public.announcement_post_links l
  JOIN public.announcements lh ON lh.announcement_id = l.lh_announcement_id
  WHERE lh.title IS NOT NULL AND lh.hidden_from_listing IS NOT TRUE
  ORDER BY l.linked_announcement_id, l.lh_announcement_id
),
x AS (
  SELECT a.announcement_id, a.apply_end, aa.analyzed_at, aa.attachment_reviewed_at, a.attachment_urls,
         COALESCE(lm.lh_key, announcement_dedup_key(a.title)) AS k,
         (SELECT max(h.seen_at) FROM public.announcement_attachment_history h
           WHERE h.announcement_id = aa.announcement_id
             AND h.seen_at > greatest(aa.analyzed_at, aa.attachment_reviewed_at)
             AND h.files IS NOT NULL
             AND jsonb_typeof(h.files) = 'array'
             AND jsonb_array_length(h.files) > 0) AS seen_at,
         (SELECT h1.files FROM public.announcement_attachment_history h1
           WHERE h1.announcement_id = aa.announcement_id
             AND h1.seen_at > greatest(aa.analyzed_at, aa.attachment_reviewed_at)
             AND h1.files IS NOT NULL AND jsonb_typeof(h1.files) = 'array' AND jsonb_array_length(h1.files) > 0
           ORDER BY h1.seen_at, h1.id LIMIT 1) AS base_files
  FROM public.announcement_analysis aa
  JOIN public.announcements a ON a.announcement_id = aa.announcement_id
  LEFT JOIN link_map lm ON lm.aid = a.announcement_id
  WHERE aa.status IN ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')
    AND a.title IS NOT NULL AND a.hidden_from_listing IS NOT TRUE
    AND a.apply_end >= (now() AT TIME ZONE 'Asia/Seoul')::date
),
y AS (
  SELECT x.*,
         ARRAY(SELECT DISTINCT substring(e->>'url' FROM 'fileid=([0-9]+)') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.base_files) = 'array' THEN x.base_files ELSE '[]'::jsonb END) e
                WHERE substring(e->>'url' FROM 'fileid=([0-9]+)') IS NOT NULL) AS old_fids,
         ARRAY(SELECT DISTINCT substring(e->>'url' FROM 'fileid=([0-9]+)') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.attachment_urls) = 'array' THEN x.attachment_urls ELSE '[]'::jsonb END) e
                WHERE substring(e->>'url' FROM 'fileid=([0-9]+)') IS NOT NULL) AS cur_fids
  FROM x
  WHERE x.seen_at IS NOT NULL
),
z AS (
  SELECT y.*,
         (SELECT array_agg(f) FROM unnest(y.cur_fids) f WHERE NOT (f = ANY (y.old_fids))) AS new_fids
  FROM y
)
SELECT z.announcement_id,
       z.k || ' #첨부 ' || to_char(z.seen_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
       z.apply_end, z.seen_at, z.analyzed_at, z.attachment_reviewed_at
FROM z
WHERE NOT (
  cardinality(z.new_fids) > 0
  AND NOT EXISTS (
    SELECT 1 FROM unnest(z.new_fids) nf
     WHERE NOT EXISTS (
       SELECT 1 FROM public.attachment_content_sha sn
         JOIN public.attachment_content_sha so ON so.announcement_id = sn.announcement_id AND so.sha256 = sn.sha256
        WHERE sn.announcement_id = z.announcement_id AND sn.file_id = nf AND so.file_id = ANY (z.old_fids)))
)
ORDER BY z.apply_end, z.announcement_id;
$function$;

-- ④ 과거분(갤러리 기록에서만 · 새로 받기 0)
insert into public.attachment_content_sha (announcement_id, file_id, sha256, bytes, first_seen, last_seen, source)
select distinct on (e.announcement_id, substring(e.source_url FROM 'fileid=([0-9]+)'))
       e.announcement_id, substring(e.source_url FROM 'fileid=([0-9]+)'), lower(e.content_sha256), null, e.created_at, e.created_at, 'extras'
  from public.announcement_extras e
 where e.content_sha256 ~* '^[0-9a-f]{64}$' and e.source_url ~ 'fileid=[0-9]+' and e.announcement_id is not null
 order by e.announcement_id, substring(e.source_url FROM 'fileid=([0-9]+)'), e.created_at, e.id;
