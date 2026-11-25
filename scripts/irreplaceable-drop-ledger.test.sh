#!/usr/bin/env bash
# 30분 감소 짝(zipfit_ops.irreplaceable_drop_record) 판정 시험 — 되돌리기 전용(2026-11-25 · 우편함 「코드·운영 — 스물두째」 2).
#   zipfit-backup #48 시험과 같은 세 꼴: (가) 장부 2 · 감소 1(같은 창 추가 섞임) → 경보 0 (나) 장부 1 · 감소 1 → 0 (다) 장부 1 · 감소 2 → 1
#   요청 하나 = 트랜잭션 하나: 가짜 직전 스냅숏(그 표만 실제 + 감소 · 나머지 표 0 = 줄지 않음) · 가짜 장부 줄을 넣고 함수를 부른 뒤
#   raise exception 'RESULT …' 로 결과를 내보내며 전부 되돌린다(쓰기 0 남음). 관리 API(프록시 주입) · bash scripts/irreplaceable-drop-ledger.test.sh
set -uo pipefail
T=announcement_apply_routes
bad=0
for c in "가 2 1 0" "나 1 1 0" "다 1 2 1"; do
  set -- $c; name=$1; led=$2; drop=$3; want=$4
  sql="set statement_timeout = '60s';
do \$\$ declare n bigint; r jsonb; begin
  select count(*) into n from public.$T;
  insert into zipfit_ops.irreplaceable_counts(at, counts) values (now() - interval '1 minute', jsonb_build_object('$T', n + $drop));
  insert into zipfit_ops.intended_drops(table_name, expected_drop, round) values ('$T', $led, '시험 — 되돌림');
  r := zipfit_ops.irreplaceable_drop_record('{}'::jsonb);
  raise exception 'RESULT %', r->>'unmatched';
end \$\$;"
  out=$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$sql" | curl -sS -X POST "https://api.supabase.com/v1/projects/$(grep -oP '^project_id = "\K[^"]+' supabase/config.toml)/database/query" -H 'Content-Type: application/json' --data-binary @-)
  got=$(printf '%s' "$out" | grep -oP 'RESULT \K[0-9]+' | head -1)
  if [ "$got" = "$want" ]; then echo "✓ ($name) 장부 $led · 감소 $drop → 경보 $got"; else echo "✗ ($name) 장부 $led · 감소 $drop → 경보 ${got:-?} (기대 $want) ${out:0:200}"; bad=$((bad+1)); fi
done
echo "감소 짝 시험 $((3-bad))/3"
exit $bad
