CREATE OR REPLACE FUNCTION public.get_document_templates_for(p_housing_type text DEFAULT NULL::text, p_recruitment_mode text DEFAULT NULL::text)
 RETURNS TABLE(doc_category text, requirement_level text, level_rank integer)
 LANGUAGE sql
 STABLE
AS $function$
  WITH norm AS (
    SELECT
      t.doc_category,
      t.requirement_level,
      CASE t.requirement_level
        WHEN '필수' THEN 1
        WHEN '조건부' THEN 2
        WHEN '해당자만' THEN 3
        WHEN '현장방문신청자만' THEN 4
        ELSE 5
      END AS level_rank
    FROM document_templates t
    WHERE (p_housing_type IS NULL
           OR t.housing_type IS NULL
           OR p_housing_type LIKE '%' || t.housing_type || '%')
      AND (p_recruitment_mode IS NULL
           OR t.recruitment_mode IS NULL
           OR t.recruitment_mode = p_recruitment_mode)
  ), ranked AS (
    SELECT doc_category, requirement_level, level_rank,
           -- 🔴 2026-09-21 — 결정적 꼬리키. level_rank 는 requirement_level 의 CASE 값이고
           --   ELSE 5 에 여러 표기가 떨어져 같은 doc_category 안에서 동률이 날 수 있다
           --   (현재 표기 6종 중 3종이 ELSE 5). 동률이면 어느 requirement_level 이 나올지
           --   물리적 행 순서로 갈린다 — 지금은 그런 조합이 0건이지만 꼬리키로 닫는다.
           row_number() OVER (PARTITION BY doc_category ORDER BY level_rank, requirement_level) AS rn
    FROM norm
  )
  SELECT doc_category, requirement_level, level_rank
  FROM ranked WHERE rn = 1
  ORDER BY level_rank, doc_category;
$function$
