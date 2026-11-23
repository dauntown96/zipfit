-- zipfit:function zipfit_ops.irreplaceable_drop_record(jsonb) acl={postgres=X/postgres} secdef=false
-- 장부 없이 줄어든 재생산 불가 표 — 30분 알림(2026-11-23 · 우편함 「코드·운영 — 열다섯째 A장」 3 · 열셋째 회신 ⑦1).
--   ① zipfit_ops.irreplaceable_counts — health-ops 회차마다 한 행(재생산 불가 23표 count 스냅숏 · 표 이름 → 행 수 jsonb). 2일 넘은 행은 기록 함수가 지운다(약 96행).
--      공고·정책 행 수뿐 — 이용자 표 0. GRANT 0.
--   ② zipfit_ops.irreplaceable_drop_record(jsonb) — health-ops 가 부른다(lib.mjs callRecord 허용 목록). 직전 스냅숏과 견주어 줄어든 표 · 그 사이 장부 합 · 어긋난 표 수.
--   생존 신호(zipfit-backup)는 그대로 — 이 장치는 다음 날 아침 전에 같은 사실을 30분 안에 보이게 할 뿐이다.
-- 되돌리기: drop function zipfit_ops.irreplaceable_drop_record(jsonb); drop table zipfit_ops.irreplaceable_counts;
create table zipfit_ops.irreplaceable_counts (
  at timestamptz primary key default now(),
  counts jsonb not null
);
comment on table zipfit_ops.irreplaceable_counts is
  '재생산 불가 표 count 스냅숏(2026-11-23) — health-ops 회차마다 zipfit_ops.irreplaceable_drop_record 가 한 행 · 2일 보관 · GRANT 0.';
revoke all on table zipfit_ops.irreplaceable_counts from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION zipfit_ops.irreplaceable_drop_record(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-23(우편함 「코드·운영 — 열다섯째 A장」 3 · 열셋째 ⑦1) — 장부 없이 줄어든 재생산 불가 표를 30분 안에(health-ops 회차마다 한 번).
--   재생산 불가 표(zipfit-backup scripts/heartbeat_report.py IRREPLACEABLE 와 같은 23표 — 그쪽에 더하면 여기도 같은 날 한 줄)의 count(*)(reltuples 아님)를 세어
--   직전 스냅숏(zipfit_ops.irreplaceable_counts 마지막 행)과 견준다. 줄어든 표마다 그 사이(직전 스냅숏 뒤) 의도된 감소 장부(zipfit_ops.intended_drops) 합을 붙이고,
--   감소 ≠ 장부 합인 표 수를 unmatched 로 낸다(생존 신호와 같은 「정확히 같음」 규칙). 새 스냅숏을 남기고 2일 넘은 스냅숏은 지운다.
--   p 는 비워 둔다(향후 칸 · 지금은 읽지 않음). 결과: {prev_at, tables, drops: [{t, drop, ledger}], unmatched}.
declare
  v_tabs text[] := array['housing_units','announcements','announcement_extras','announcement_policies','eligibility_criteria','document_templates',
    'scoring_criteria','median_income_monthly','urban_worker_monthly_income','policy_classes','policy_category_classes','policy_row_classes',
    'housing_type_std','housing_type_map','announcement_apply_routes','supply_org_period_trust','announcement_attachment_history',
    'announcement_promo_files','announcement_analysis','announcement_complex_images','gh_complex_images','lh_cutoff_scores','complex_aliases'];
  v_t text; v_n bigint; v_cur jsonb := '{}'::jsonb; v_prev jsonb; v_prev_at timestamptz; v_drops jsonb := '[]'::jsonb; v_un int := 0; v_led bigint;
begin
  foreach v_t in array v_tabs loop
    execute format('select count(*) from public.%I', v_t) into v_n;
    v_cur := v_cur || jsonb_build_object(v_t, v_n);
  end loop;
  select c.counts, c.at into v_prev, v_prev_at from zipfit_ops.irreplaceable_counts c order by c.at desc limit 1;
  if v_prev is not null then
    foreach v_t in array v_tabs loop
      if v_prev ? v_t and (v_cur->>v_t)::bigint < (v_prev->>v_t)::bigint then
        select coalesce(sum(d.expected_drop), 0) into v_led from zipfit_ops.intended_drops d where d.table_name = v_t and d.at > v_prev_at;
        v_drops := v_drops || jsonb_build_object('t', v_t, 'drop', (v_prev->>v_t)::bigint - (v_cur->>v_t)::bigint, 'ledger', v_led);
        if v_led <> (v_prev->>v_t)::bigint - (v_cur->>v_t)::bigint then v_un := v_un + 1; end if;
      end if;
    end loop;
  end if;
  insert into zipfit_ops.irreplaceable_counts (counts) values (v_cur);
  delete from zipfit_ops.irreplaceable_counts where at < now() - interval '2 days';
  return jsonb_build_object('prev_at', v_prev_at, 'tables', array_length(v_tabs, 1), 'drops', v_drops, 'unmatched', v_un);
end
$function$;
revoke all on function zipfit_ops.irreplaceable_drop_record(jsonb) from public, anon, authenticated, service_role;
