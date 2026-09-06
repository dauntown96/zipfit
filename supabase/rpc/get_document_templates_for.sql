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
           row_number() OVER (PARTITION BY doc_category ORDER BY level_rank) AS rn
    FROM norm
  )
  SELECT doc_category, requirement_level, level_rank
  FROM ranked WHERE rn = 1
  ORDER BY level_rank, doc_category;
$function$
