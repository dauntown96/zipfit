-- zipfit:function zipfit_ops.irreplaceable_drop_record(jsonb) acl={postgres=X/postgres} secdef=false
-- 30분 감소 짝 판정식(2026-11-25 · 우편함 「코드·운영 — 스물두째」 2 · 백로그 4168aaa7e15581a689f9 ②) — 「감소 ≠ 장부」 → 「감소 > 장부」.
--   생존 신호(zipfit-backup #48 · 70bd4e2)와 같은 규칙. 시험 bash scripts/irreplaceable-drop-ledger.test.sh(되돌리기 전용 · 세 꼴).
--   바뀌는 것은 unmatched 셈 한 줄 + 머리 주석뿐 — 스냅숏·drops 칸·권한은 그대로.
-- 되돌리기: 옛 정의(git show 2c0b6bb:supabase/rpc/zipfit_ops/irreplaceable_drop_record.sql)로 새 마이그레이션.
CREATE OR REPLACE FUNCTION zipfit_ops.irreplaceable_drop_record(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 🔵 2026-11-23(우편함 「코드·운영 — 열다섯째 A장」 3 · 열셋째 ⑦1) — 장부 없이 줄어든 재생산 불가 표를 30분 안에(health-ops 회차마다 한 번).
--   재생산 불가 표(zipfit-backup scripts/heartbeat_report.py IRREPLACEABLE 와 같은 23표 — 그쪽에 더하면 여기도 같은 날 한 줄)의 count(*)(reltuples 아님)를 세어
--   직전 스냅숏(zipfit_ops.irreplaceable_counts 마지막 행)과 견준다. 줄어든 표마다 그 사이(직전 스냅숏 뒤) 의도된 감소 장부(zipfit_ops.intended_drops) 합을 붙이고,
--   감소 > 장부 합인 표 수를 unmatched 로 낸다(「장부보다 더 줄었나」 — 생존 신호와 같은 규칙 · 2026-11-25 우편함 「코드·운영 — 스물두째」 2 ·
--   zipfit-backup #48 과 짝 · 종전 「≠」는 같은 30분 창에 추가가 섞여 감소가 장부보다 작으면 손실 없이 ⚠️ 였다). 새 스냅숏을 남기고 2일 넘은 스냅숏은 지운다.
--   ⚠️ 「장부 이하」는 「장부대로 지워졌다」가 아니다 — 행 수로는 섞임과 덜 지움을 가르지 못한다(drops 의 drop · ledger 는 그대로 보인다).
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
        if (v_prev->>v_t)::bigint - (v_cur->>v_t)::bigint > v_led then v_un := v_un + 1; end if;
      end if;
    end loop;
  end if;
  insert into zipfit_ops.irreplaceable_counts (counts) values (v_cur);
  delete from zipfit_ops.irreplaceable_counts where at < now() - interval '2 days';
  return jsonb_build_object('prev_at', v_prev_at, 'tables', array_length(v_tabs, 1), 'drops', v_drops, 'unmatched', v_un);
end
$function$;
