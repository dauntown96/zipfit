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
$function$
