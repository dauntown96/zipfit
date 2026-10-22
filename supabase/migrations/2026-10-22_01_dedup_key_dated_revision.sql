-- 그룹 키가 제목 머리의 날짜 붙은 정정 괄호 「('26.10.21. 정정)」를 걷는다 (2026-10-22 · 우편함 「코드·운영 — A(G3): 제목 머리 「('YY.MM.DD. 정정)」 괄호가 중복 키에 남아 …」).
--
-- 계기: 창녕영산 1BL 행복주택 — LH …20937 「[정정공고]('26.10.21. 정정) 창녕영산 1BL …」 만 키가 「(26.10.21.정정)창녕영산1BL…」 로 남아
--   원(…20854)·첫 정정(…20904)·마이홈 셋과 갈렸다 → 카드 두 장 · 정정본 분석 대기열에 안 듦.
--   종전 머리 규칙 「[\[(]\s*(재)?(수정|정정)[^\])]*[\])]」 은 괄호 바로 안이 정정·수정일 때만 걷어, 날짜가 앞선 꼴이 빠졌다.
--   같은 자리(머리 반복)에 「괄호 · 따옴표? · (연.)월.일 · 정정·수정 · (공고)? · 괄호」 꼴 하나를 더한다. 회차를 가르는 「(26.10.07.공고)」 같은 괄호는 그대로다.
-- 영향(2026-10-22 실측 · 제목 있는 공고 3,388 전수): 키가 바뀌는 행 1(…20937) · 목록 카드 958 → 957(창녕영산 두 장 → 한 장 · 대표 …20937).
--   발송기 모의(오늘 = 2026-10-21 · 쓰기 0): 고치기 전 …20937 은 일반 후보(마감 ≥ 오늘+3 창 밖)·정정본 후보(같은 키에 완료 분석 없음) 둘 다 빠졌고,
--   고친 뒤 정정본 후보 「… #정정 2026-10-21 15:00」 로 잡힌다. 오늘(10-22)은 마감이 지나 실제 대기열에 들지 않는다.
-- 저장 칸 announcements.title_dedup_key(2026-10-17_07)는 함수가 바뀌어도 저절로 다시 계산되지 않는다 — SET EXPRESSION 으로 다시 채운다
--   (행 UPDATE 가 아니라 표 다시 쓰기라 updated_at·revised_at 트리거가 돌지 않는다).
-- 같은 게시물 링크 1행(…20937 ↔ 21440_1_경상남도_창녕군 · url_pan_id · Z2-link-v3 · 「panId=2015122300020937 · 공고일 2026-10-07」)은
--   두 키가 갈렸기 때문에만 생긴 것이다(refresh_announcement_post_links 는 키가 같으면 잇지 않는다) — 키가 같아지면 카드가 자기 자신을 가리키므로 지운다.
-- 🔴 화면 거울 index.html zfDedupKey 를 같은 PR 에서 같은 정규식으로 바꾼다(전수 3,388 + 시험 꼴 11 — DB 키 = 거울 키 · 어긋남 0).
-- 되돌리기: git show <이 PR 앞 커밋>:supabase/rpc/announcement_dedup_key.sql 로 create or replace → 같은 SET EXPRESSION → 위 링크 1행 다시 넣기.
-- zipfit:function announcement_dedup_key(text) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:anon select count(*) from get_announcements_deduped()
-- zipfit:anon select count(*) from get_announcement_group_ids('2015122300020937')

CREATE OR REPLACE FUNCTION public.announcement_dedup_key(p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(p_title, '^(\s*(\[정정공고\]|\[\s*조기\s*(접수)?\s*마감\s*\]|[\[(]\s*(재)?(수정|정정)[^\])]*[\])]|[\[(]\s*[''‘’`]?\s*(\d{2,4}\s*[-./]\s*)?\d{1,2}\s*[-./]\s*\d{1,2}\s*\.?\s*(재)?(수정|정정)\s*(공고)?\s*[\])])\s*)+', ''),
          '[''‘’`"“”″]', '', 'g'
        ),
        '\s+', '', 'g'
      ),
      '\.{2,}', '.', 'g'
    )
$function$;

-- 🔴 가드 — 키가 바뀌는 행은 옛 키가 머리 정정·수정 괄호로 시작하는 것뿐이어야 한다(아니면 적용 전체를 되돌린다).
do $$
begin
  if exists (select 1 from public.announcements
              where title_dedup_key is distinct from public.announcement_dedup_key(title)
                and title_dedup_key !~ '^[\[(][^\])]*(수정|정정)[^\])]*[\])]') then
    raise exception '정정 괄호 꼴 밖의 행이 키가 바뀐다 — 멈춤';
  end if;
end $$;

alter table public.announcements alter column title_dedup_key set expression as (public.announcement_dedup_key(title));

delete from public.announcement_post_links l
 using public.announcements lh, public.announcements m
 where lh.announcement_id = l.lh_announcement_id and m.announcement_id = l.linked_announcement_id
   and public.announcement_dedup_key(m.title) = public.announcement_dedup_key(lh.title);
