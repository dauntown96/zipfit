-- 그룹 키가 제목 머리 [조기접수마감] 을 걷는다 (2026-10-13 · 우편함 「코드 — 열린 카드 오표시·오답·놓침」 1 ⓑ).
--
-- 계기: 양산 삼성파크빌 자격완화 선착순 — 정정 전 `…20825`(「양산 삼성파크빌 자격완화 …」)와 정정 `…20898`(「[정정공고][조기접수마감]양산 …」)이
--   제목 키가 갈려 카드가 두 장이었고, 정정 전 카드는 「접수 중 · D-30」으로 남았다(LH 정정사유 「모집호수 소진으로 조기 접수마감합니다」).
--   [정정공고] 머리는 이미 걷고 있었다 — 같은 자리(머리 반복)에 [조기접수마감]·[조기 접수마감]·[조기마감] 꼴 하나를 더한다.
-- 영향(2026-10-13 실측 · 제목 있는 공고 전수): 키가 바뀌는 행 3(…20898 · 21399_1_경상남도_양산시 · …20613) · 그룹 975 → 973
--   (삼성파크빌 정정 전·후 한 그룹 · 이미 끝난 사송A-4BL …20613 이 정정 전 …20495 그룹으로). 다른 그룹 불변.
--   대표(winner)는 get_announcements_deduped 규칙 그대로 — 공고일이 늦은 정정 `…20898` 이 대표가 되고, 화면은 그 제목 머리·정정사유로 「조기 마감」을 단다.
-- 이 함수를 부르는 함수 7개(get_announcements_deduped · get_announcement_group_ids · get_announcement_blocks · get_announcement_price_summary ·
--   get_reanalysis_queue · analysis_dispatch_tick · refresh_announcement_post_links)는 정의를 바꾸지 않는다 — 키만 따라온다.
-- 🔴 화면 거울 index.html zfDedupKey 를 같은 PR 에서 같은 정규식으로 바꾼다(zfCheckDedupMirror 가 어긋나면 콘솔에 남긴다).
-- 되돌리기: 2026-10-13 앞 정의(git show <앞 커밋>:supabase/rpc/announcement_dedup_key.sql)로 create or replace.
-- zipfit:function announcement_dedup_key(text) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:anon select count(*) from get_announcements_deduped()
-- zipfit:anon select count(*) from get_announcement_group_ids('2015122300020825')

CREATE OR REPLACE FUNCTION public.announcement_dedup_key(p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(p_title, '^(\s*(\[정정공고\]|\[\s*조기\s*(접수)?\s*마감\s*\]|[\[(]\s*(재)?(수정|정정)[^\])]*[\])])\s*)+', ''),
          '[''‘’`"“”″]', '', 'g'
        ),
        '\s+', '', 'g'
      ),
      '\.{2,}', '.', 'g'
    )
$function$;
