-- 코드 — 분석률 셈 · 재분석 큐에 링크 표(2026-10-01 · 우편함 「코드 — 거짓 「다른 회차」 배너 · … · 블록 칩」 6)
--   get_reanalysis_queue 의 묶음 = 제목 키 ∪ 같은 게시물 링크 표(announcement_post_links). 링크 표에 있는 MYHOME 행은
--   LH 행의 제목 키를 쓴다 — get_announcements_deduped · get_announcement_group_ids 의 link_map 과 같은 규칙이다.
--   붙은 행은 같은 게시물(같은 날짜 ∧ panId)이라 마감일이 달라도 같은 회차로 센다.
--   반환형·권한·SECURITY 그대로(CREATE OR REPLACE). 분석률 측정 SQL 은 supabase/metrics/analysis_rate.sql(같은 규칙 · 읽기 전용).
-- zipfit:function get_reanalysis_queue() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
CREATE OR REPLACE FUNCTION public.get_reanalysis_queue()
 RETURNS TABLE(announcement_id text, source text, title text, announcement_date date, is_revised boolean, revision_note text, group_child_count bigint, donor_announcement_ids text[], queue_reason text)
 LANGUAGE sql
 STABLE
AS $function$
-- (e) 선별 재분석 큐 — 「winner 자식 0 + 그룹 자식 >0」인 대표행 목록.
-- 🔴 winner 산출을 재현하지 않는다. get_announcements_deduped()를 그대로 호출해 재사용한다.
-- 🔴 분류·우선순위 점수를 만들지 않는다(사유 텍스트는 원문 그대로 반환하고, 순서는 호출 측이 정한다).
-- 🔴 2026-10-01(코드 — 분석률 셈 · 재분석 큐에 링크 표) — 묶음 = 제목 키 ∪ 같은 게시물 링크 표. 링크 표에 있는 MYHOME 행은
--   LH 행의 제목 키를 쓴다(get_announcements_deduped · get_announcement_group_ids 의 link_map 과 같은 규칙 — 함께 바꾼다).
--   붙은 MYHOME 행은 같은 게시물(링크 규칙 v2 = 같은 날짜 ∧ panId)이라 **마감일이 달라도 같은 회차**로 센다
--   (아산 …0726 · 대구연호 …0855 — 공고문마다 접수일이 다르다). 그래서 붙은 공고문만 완료여도 그 게시물은 큐에 오르지 않는다.
WITH link_map AS (
  SELECT DISTINCT ON (l.linked_announcement_id)
    l.linked_announcement_id AS aid, announcement_dedup_key(lh.title) AS lh_key
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
         COALESCE(lm.lh_key, announcement_dedup_key(a.title)) AS dedup_key,
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
      AND COALESCE(ml.lh_key, announcement_dedup_key(m.title)) = w.dedup_key
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
  AND EXISTS (
    SELECT 1 FROM announcement_attachment_history h
    WHERE h.announcement_id = aa.announcement_id
      -- 🔵 2026-09-29 코드 회차 2 잔여 C-2 — 재확인이 첨부 변경을 보고 나면 attachment_reviewed_at 을 채운다.
      --   그 뒤에 생긴 이력만 센다(greatest 는 NULL 을 건너뛴다 — 칸이 비면 analyzed_at 만 본다).
      AND h.seen_at > greatest(aa.analyzed_at, aa.attachment_reviewed_at)
      -- 🔵 C-1 — 첫 채움(옛 목록이 NULL·빈 배열)은 내용이 바뀐 것이 아니라 거른다.
      AND h.files IS NOT NULL
      AND jsonb_typeof(h.files) = 'array'
      AND jsonb_array_length(h.files) > 0
  )
ORDER BY 7 DESC, 1;
$function$;
