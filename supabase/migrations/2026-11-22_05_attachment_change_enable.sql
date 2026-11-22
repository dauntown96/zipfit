-- zipfit:function attachment_change_pending(text,timestamp with time zone) acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function attachment_change_candidates() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- zipfit:function get_reanalysis_queue() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 첨부 변경 갈래 켜기(2026-11-22 · 우편함 「코드 — 첨부 변경 갈래 켜기: get_reanalysis_queue() 둘째 갈래에 sha 거름 · attachment_change_enabled 참」 ·
--   전제 다운님 13:10 「두 스킬과 루틴 교체」 — analysis v11.9 · reverify v5.10 · 루틴 v2.24).
-- 바꾸는 것:
--   ① attachment_change_pending(공고, 기준 시각) — 「분석 뒤 첨부 변경」 판정 한 벌(이력 · 첫 채움 거름 · 「새 fileid · 내용 같음」 거름).
--   ② attachment_change_candidates() · get_reanalysis_queue() 둘째 갈래가 ①을 부른다 — 종전 두 벌 조건(「한쪽을 바꾸면 함께」 주석)을 한 벌로.
--      둘째 갈래 apply_end 뜻 · 첫 갈래 · 열 꼴 · 정렬은 그대로.
--   ③ analysis_dispatch_config.attachment_change_enabled = true — 🔴 가드: 켜기 직전 attachment_change_candidates() 가 1 이상이면 예외(적용 전체 롤백 ·
--      켜지 않음 · db-apply 이슈 — 요청서 「멈춤 · 켜자마자 후보가 1 이상이면 켜기 되돌림」).
-- 되돌리기: update public.analysis_dispatch_config set attachment_change_enabled = false where id = 1; ·
--   두 함수는 git show <앞 커밋>:supabase/rpc/… 사본으로 새 마이그레이션 · drop function public.attachment_change_pending(text, timestamp with time zone);
set local lock_timeout = '5s';
DO $$ begin
  if to_regclass('public.attachment_content_sha') is null then raise exception 'GUARD attachment_content_sha missing'; end if;
  if (select attachment_change_enabled from public.analysis_dispatch_config where id = 1) is not false then raise exception 'GUARD attachment_change_enabled 가 거짓이 아님'; end if;
end $$;

CREATE OR REPLACE FUNCTION public.attachment_change_pending(p_announcement_id text, p_since timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-22(우편함 「코드 — 첨부 변경 갈래 켜기」 1) — 「분석 뒤 첨부 변경」 판정 한 벌. get_reanalysis_queue() 둘째 갈래 · attachment_change_candidates() 가 함께 부른다
--   (종전 두 함수가 같은 조건을 두 벌로 가졌다 — 「한쪽을 바꾸면 함께」 주석으로만 묶였다).
--   참 = p_since(= greatest(analyzed_at, attachment_reviewed_at)) 뒤 첨부 이력 행이 있고(옛 목록이 빈 첫 채움은 거름)
--        ∧ 「새 fileid · 내용 같음」이 아님. 내용 같음 = 분석 때 목록(p_since 뒤 첫 이력 행의 files — 트리거가 바뀌기 전 목록을 적는다)에 없던
--        지금 목록(announcements.attachment_urls)의 fileid 가 하나 이상이고, 그 모두가 attachment_content_sha 에 sha 가 있고 각 sha 가
--        분석 때 목록의 어느 fileid sha 와 같음(2026-11-22 넷째 묶음 A). 새 fileid 의 sha 를 모르면 참(받기 전에는 가릴 수 없다).
--   p_since 가 NULL 이면(분석·검토 시각 둘 다 없음) 거짓 — 종전 greatest(NULL, NULL) 비교와 같다.
  WITH h AS (
    SELECT h.id, h.seen_at, h.files FROM public.announcement_attachment_history h
     WHERE h.announcement_id = p_announcement_id AND h.seen_at > p_since
       AND h.files IS NOT NULL AND jsonb_typeof(h.files) = 'array' AND jsonb_array_length(h.files) > 0
  ),
  base AS (SELECT h.files FROM h ORDER BY h.seen_at, h.id LIMIT 1),
  old AS (SELECT DISTINCT substring(e->>'url' FROM 'fileid=([0-9]+)') AS f FROM base, jsonb_array_elements(base.files) e),
  cur AS (SELECT DISTINCT substring(e->>'url' FROM 'fileid=([0-9]+)') AS f
            FROM public.announcements a,
                 jsonb_array_elements(CASE WHEN jsonb_typeof(a.attachment_urls) = 'array' THEN a.attachment_urls ELSE '[]'::jsonb END) e
           WHERE a.announcement_id = p_announcement_id),
  nf AS (SELECT cur.f FROM cur WHERE cur.f IS NOT NULL AND NOT EXISTS (SELECT 1 FROM old WHERE old.f = cur.f))
  SELECT EXISTS (SELECT 1 FROM h)
     AND NOT (
       EXISTS (SELECT 1 FROM nf)
       AND NOT EXISTS (
         SELECT 1 FROM nf
          WHERE NOT EXISTS (
            SELECT 1 FROM public.attachment_content_sha sn
              JOIN public.attachment_content_sha so ON so.announcement_id = sn.announcement_id AND so.sha256 = sn.sha256
             WHERE sn.announcement_id = p_announcement_id AND sn.file_id = nf.f
               AND EXISTS (SELECT 1 FROM old WHERE old.f = so.file_id))))
$function$;
revoke execute on function public.attachment_change_pending(text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.attachment_change_pending(text, timestamp with time zone) to service_role;

CREATE OR REPLACE FUNCTION public.attachment_change_candidates()
 RETURNS TABLE(announcement_id text, group_key text, apply_end date, seen_at timestamp with time zone, analyzed_at timestamp with time zone, reviewed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-21(우편함 「코드·운영 — 첫 묶음」 A (가)(나)) — 분석 뒤 첨부 변경이 있는 열린 공고.
--   조건 = 완료 계열 분석 ∧ attachment_change_pending(공고, greatest(analyzed_at, attachment_reviewed_at)) + apply_end ≥ 오늘(KST).
--   🔵 2026-11-22(우편함 「코드 — 첨부 변경 갈래 켜기」 1) — 판정은 attachment_change_pending() 한 벌(get_reanalysis_queue() 둘째 갈래와 같은 함수를 부른다 ·
--      「새 fileid · 내용 같음」 거름도 그 안 — 넷째 묶음 A). 이 함수가 더하는 것은 apply_end ≥ 오늘(KST)과 group_key 뿐이다.
--   group_key = 묶음 키(링크 표 ∪ 제목 키 — analysis_dispatch_tick 의 keyed 와 같은 규칙) || ' #첨부 ' || 마지막 변경 시각(KST 분) — 다시 바뀌면 새 몫.
--   쓰는 곳: analysis_dispatch_tick 다섯째 후보(acand · 켜기 칸 attachment_change_enabled) · health-ops attachment_review_gap(대기열에 없는 수).
WITH link_map AS (
  SELECT DISTINCT ON (l.linked_announcement_id)
    l.linked_announcement_id AS aid, announcement_dedup_key(lh.title) AS lh_key
  FROM public.announcement_post_links l
  JOIN public.announcements lh ON lh.announcement_id = l.lh_announcement_id
  WHERE lh.title IS NOT NULL AND lh.hidden_from_listing IS NOT TRUE
  ORDER BY l.linked_announcement_id, l.lh_announcement_id
),
x AS (
  SELECT a.announcement_id, a.apply_end, aa.analyzed_at, aa.attachment_reviewed_at,
         COALESCE(lm.lh_key, announcement_dedup_key(a.title)) AS k,
         (SELECT max(h.seen_at) FROM public.announcement_attachment_history h
           WHERE h.announcement_id = aa.announcement_id
             AND h.seen_at > greatest(aa.analyzed_at, aa.attachment_reviewed_at)
             AND h.files IS NOT NULL
             AND jsonb_typeof(h.files) = 'array'
             AND jsonb_array_length(h.files) > 0) AS seen_at
  FROM public.announcement_analysis aa
  JOIN public.announcements a ON a.announcement_id = aa.announcement_id
  LEFT JOIN link_map lm ON lm.aid = a.announcement_id
  WHERE aa.status IN ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')
    AND a.title IS NOT NULL AND a.hidden_from_listing IS NOT TRUE
    AND a.apply_end >= (now() AT TIME ZONE 'Asia/Seoul')::date
    AND public.attachment_change_pending(aa.announcement_id, greatest(aa.analyzed_at, aa.attachment_reviewed_at))
)
SELECT x.announcement_id,
       x.k || ' #첨부 ' || to_char(x.seen_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
       x.apply_end, x.seen_at, x.analyzed_at, x.attachment_reviewed_at
FROM x
WHERE x.seen_at IS NOT NULL
ORDER BY x.apply_end, x.announcement_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_reanalysis_queue()
 RETURNS TABLE(announcement_id text, source text, title text, announcement_date date, is_revised boolean, revision_note text, group_child_count bigint, donor_announcement_ids text[], queue_reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-10-17(우편함 「코드·운영 — 목록 RPC 가볍게 …」 1) — announcements 행의 묶음 키는 title_dedup_key(저장 생성 칸 = announcement_dedup_key(title))를 읽는다(행마다 함수 호출 없음 · 결과 같음).
-- (e) 선별 재분석 큐 — 「winner 자식 0 + 그룹 자식 >0」인 대표행 목록.
-- 🔴 winner 산출을 재현하지 않는다. get_announcements_deduped()를 그대로 호출해 재사용한다.
-- 🔴 분류·우선순위 점수를 만들지 않는다(사유 텍스트는 원문 그대로 반환하고, 순서는 호출 측이 정한다).
-- 🔴 2026-10-01(코드 — 분석률 셈 · 재분석 큐에 링크 표) — 묶음 = 제목 키 ∪ 같은 게시물 링크 표. 링크 표에 있는 MYHOME 행은
--   LH 행의 제목 키를 쓴다(get_announcements_deduped · get_announcement_group_ids 의 link_map 과 같은 규칙 — 함께 바꾼다).
--   붙은 MYHOME 행은 같은 게시물(링크 규칙 v2 = 같은 날짜 ∧ panId)이라 **마감일이 달라도 같은 회차**로 센다
--   (아산 …0726 · 대구연호 …0855 — 공고문마다 접수일이 다르다). 그래서 붙은 공고문만 완료여도 그 게시물은 큐에 오르지 않는다.
WITH link_map AS (
  SELECT DISTINCT ON (l.linked_announcement_id)
    l.linked_announcement_id AS aid, lh.title_dedup_key AS lh_key
  FROM public.announcement_post_links l
  JOIN public.announcements lh ON lh.announcement_id = l.lh_announcement_id
  WHERE lh.title IS NOT NULL AND lh.hidden_from_listing IS NOT TRUE
  ORDER BY l.linked_announcement_id, l.lh_announcement_id
),
winner AS (
  SELECT d.announcement_id, d.source, d.title, d.announcement_date,
         d.is_revised, d.revision_note, d.apply_end,
         COALESCE(lm.lh_key, announcement_dedup_key(d.title)) AS dedup_key
  FROM get_announcements_deduped(NULL, NULL, NULL) d
  LEFT JOIN link_map lm ON lm.aid = d.announcement_id
),
child_counts AS (
  SELECT c.announcement_id, sum(c.n)::bigint AS n
  FROM (
    SELECT announcement_id, count(*) AS n FROM eligibility_criteria   GROUP BY announcement_id
    UNION ALL
    SELECT announcement_id, count(*) AS n FROM announcement_policies  GROUP BY announcement_id
    UNION ALL
    SELECT announcement_id, count(*) AS n FROM housing_units          GROUP BY announcement_id
  ) c
  GROUP BY c.announcement_id
),
group_rows AS (
  SELECT a.announcement_id,
         COALESCE(lm.lh_key, a.title_dedup_key) AS dedup_key,
         COALESCE(cc.n, 0) AS child_count
  FROM announcements a
  LEFT JOIN link_map lm ON lm.aid = a.announcement_id
  LEFT JOIN child_counts cc ON cc.announcement_id = a.announcement_id
  WHERE a.title IS NOT NULL
    AND a.hidden_from_listing IS NOT TRUE
),
grp AS (
  SELECT dedup_key,
         sum(child_count)::bigint AS group_child_count,
         array_agg(announcement_id ORDER BY child_count DESC, announcement_id)
           FILTER (WHERE child_count > 0) AS donors
  FROM group_rows
  GROUP BY dedup_key
)
SELECT w.announcement_id, w.source, w.title, w.announcement_date,
       w.is_revised, w.revision_note,
       g.group_child_count, g.donors,
       '대표 산물 없음'::text AS queue_reason
FROM winner w
JOIN grp g ON g.dedup_key = w.dedup_key
LEFT JOIN child_counts cw ON cw.announcement_id = w.announcement_id
WHERE COALESCE(cw.n, 0) = 0
  AND g.group_child_count > 0
  -- 🔴 2026-09-23(B24) — 같은 회차 완료분 제외. 대표와 같은 apply_end 의 구성원이 완료 계열
  --   분석을 가졌으면 그 회차는 이미 분석된 것이라 큐에 올리지 않는다(⑨ 5장 분석률 산식과 같은 축).
  --   대표 apply_end 가 NULL 이면 = 가 성립하지 않아 종전대로 큐에 남는다.
  AND NOT EXISTS (
    SELECT 1
    FROM announcements m
    JOIN announcement_analysis aa ON aa.announcement_id = m.announcement_id
    LEFT JOIN link_map ml ON ml.aid = m.announcement_id
    WHERE m.title IS NOT NULL
      AND m.hidden_from_listing IS NOT TRUE
      AND COALESCE(ml.lh_key, m.title_dedup_key) = w.dedup_key
      AND (m.apply_end = w.apply_end OR ml.aid IS NOT NULL)
      AND aa.status IN ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')
  )
-- 🔵 2026-09-29 코드 회차 2 — 둘째 갈래 「분석 뒤 첨부 변경」: 완료 계열로 닫힌 공고인데 analyzed_at 뒤에
--   첨부 목록이 바뀐 것(announcement_attachment_history 에 그 뒤 행이 있다). 대표 여부와 무관하게 분석된 그 ID 를 올린다.
--   🔴 analyzed_at 은 처음 분석한 묶음 시각이다(재확인이 덮지 않는다 — 스킬 v9.3). 그래서 재확인 뒤에도 이 줄은 남는다 —
--   재확인이 끝난 공고를 걷는 축은 아직 없다(pending_fields 의 날짜 줄로 사람이 가린다).
--   group_child_count·donor_announcement_ids 는 이 갈래에서 NULL 이다(정렬에서 첫 갈래보다 앞에 온다 — DESC 는 NULL 먼저).
UNION ALL
SELECT a.announcement_id, a.source, a.title, a.announcement_date,
       a.is_revised, a.revision_note,
       NULL::bigint, NULL::text[],
       '분석 뒤 첨부 변경'::text
FROM announcement_analysis aa
JOIN announcements a ON a.announcement_id = aa.announcement_id
WHERE aa.status IN ('완료', '완료(보조 누락)', '완료(판정 대기)', '완료(소급)')
  -- 🔵 2026-11-22(우편함 「코드 — 첨부 변경 갈래 켜기」 1) — 판정은 attachment_change_pending() 한 벌(attachment_change_candidates() 와 같은 함수):
  --   analyzed_at·attachment_reviewed_at 뒤 이력(첫 채움 거름 — C-1 · 재확인 뒤 이력만 — C-2) ∧ 「새 fileid · 내용 같음」 아님(넷째 묶음 A sha 표).
  --   이 갈래는 apply_end 를 보지 않는다(닫힌 공고도 올린다 — 종전 그대로).
  AND public.attachment_change_pending(aa.announcement_id, greatest(aa.analyzed_at, aa.attachment_reviewed_at))
ORDER BY 7 DESC, 1;
$function$;

-- ③ 켜기(가드 — 후보 0 일 때만)
DO $$ declare n int; begin
  select count(*) into n from public.attachment_change_candidates();
  if n > 0 then raise exception 'GUARD 켜기 직전 첨부 변경 후보 % — 켜지 않는다(요청서 멈춤 · 그 공고 표로 회신)', n; end if;
end $$;
update public.analysis_dispatch_config set attachment_change_enabled = true where id = 1;
