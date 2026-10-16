CREATE OR REPLACE FUNCTION public.ops_listing_hide(p_announcement_id text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_release_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-16(우편함 「코드 — 관리자 페이지 (가) 첫 판 …」 4 · 다운님 승인 2026-10-16) — 목록 숨김 쓰기 한 곳(숨기기 · 풀기).
--   관리자(auth.uid() ∈ zipfit_ops.admins)가 아니면 예외(42501). 누가 = auth.uid()(인자로 받지 않는다).
--   숨기기: p_announcement_id 의 묶음 키(목록 RPC title_key — 같은 게시물 링크로 붙은 MYHOME 행이면 LH 행의 제목 키)를 사유와 함께 남긴다 · 사유 필수.
--   풀기: p_release_id 행의 released_at·released_by 를 채운다(행을 지우지 않는다 — 이력이 남는다).
--   announcements.hidden_from_listing(SH 수집 규칙 · 손 1)과는 따로다 — SH 수집 upsert 가 이 표를 덮어쓰지 못한다.
declare
  v_uid uuid := auth.uid();
  v_key text; v_id bigint;
begin
  if v_uid is null or not exists (select 1 from zipfit_ops.admins a where a.user_id = v_uid) then
    raise exception '관리자만 숨김을 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_release_id is not null then
    update zipfit_ops.listing_hides
       set released_at = now(), released_by = v_uid
     where id = p_release_id and released_at is null
    returning group_key into v_key;
    if v_key is null then
      raise exception '열린 숨김이 아닙니다: %', p_release_id using errcode = 'P0002';
    end if;
    return jsonb_build_object('released', v_key, 'id', p_release_id);
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception '숨기는 사유를 적어 주세요' using errcode = '22023';
  end if;
  select coalesce(
           (select public.announcement_dedup_key(lh.title)
              from public.announcement_post_links l
              join public.announcements lh on lh.announcement_id = l.lh_announcement_id
             where l.linked_announcement_id = a.announcement_id and lh.title is not null and lh.hidden_from_listing is not true
             order by l.lh_announcement_id limit 1),
           public.announcement_dedup_key(a.title))
    into v_key
    from public.announcements a
   where a.announcement_id = btrim(p_announcement_id) and a.title is not null;
  if v_key is null then
    raise exception '공고를 찾지 못했습니다: %', p_announcement_id using errcode = 'P0002';
  end if;
  insert into zipfit_ops.listing_hides (group_key, announcement_id, reason, hidden_by)
  values (v_key, btrim(p_announcement_id), btrim(p_reason), v_uid)
  on conflict (group_key) where released_at is null do nothing
  returning id into v_id;
  if v_id is null then
    raise exception '이미 숨긴 묶음입니다: %', v_key using errcode = '23505';
  end if;
  return jsonb_build_object('hidden', v_key, 'id', v_id);
end
$function$
