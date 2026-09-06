CREATE OR REPLACE FUNCTION public.get_rental_stats_summary()
 RETURNS TABLE("임대종류" text, "총세대수" bigint, "평균보증금" numeric, "평균월임대료" numeric)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    "임대종류"::text,
    SUM("세대수")::bigint AS 총세대수,
    ROUND(AVG(CASE WHEN "임대보증금" > 0 THEN "임대보증금" END), 0) AS 평균보증금,
    ROUND(AVG(CASE WHEN "월임대료" > 0 THEN "월임대료" END), 0) AS 평균월임대료
  FROM rental_housing_stats
  GROUP BY "임대종류"
  ORDER BY 총세대수 DESC NULLS LAST;
$function$
