-- 단지 좌표 전 단지 채움 cron 을 하루 내내로(2026-11-25 · 우편함 「코드·운영 — 스물일곱째」 1 · 스물여섯째 0장 4 의견 · claude.ai 검증 17:3x 「E0007 을 첫 주 지켜보는 조건으로 넓힘」).
--   '8,28,44 0-11 * * *'(KST 09~20시) → '8,28,44 * * * *'(하루 내내 · 시간당 3번 그대로). 한 런 20 · 순차 3초 · 메모리 문턱 · 출구 지역(EF)은 그대로 — 바뀌는 것은 시간 창뿐.
--   근거: juso 공개 밤 제약 없음(docs/data-sources.md 후보 9) · 알려진 제약은 몰아 부를 때 E0007 뿐이라 시간당 호출은 같다(하루 합만 늘어남).
--   지켜보기: health-ops ℹ️ juso_e0007_24h · 하루 1건이라도 나면 낮 창으로 되돌린다(아래 되돌리기 · docs/data-sources.md).
--   명령(command)은 그대로 — docs/cron-jobs.sql 블록 명령 md5 대조(health-ops cron_names)가 그대로 맞는다.
-- 되돌리기: select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-complex-geo-fill-complex'), schedule := '8,28,44 0-11 * * *');
DO $$ begin
  if not exists (select 1 from cron.job where jobname = 'zipfit-complex-geo-fill-complex' and schedule = '8,28,44 0-11 * * *' and active) then
    raise exception 'GUARD zipfit-complex-geo-fill-complex missing or schedule already changed';
  end if;
end $$;
select cron.alter_job((select jobid from cron.job where jobname = 'zipfit-complex-geo-fill-complex'), schedule := '8,28,44 * * * *');
