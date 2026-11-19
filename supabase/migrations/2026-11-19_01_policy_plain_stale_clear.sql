-- zipfit:function policy_plain_clear_on_raw_change() acl={postgres=X/postgres,service_role=X/postgres} secdef=false
-- 정책 행 원문이 바뀌면 낡은 「쉽게 쓴 말」 세 칸을 비운다(2026-11-19 · 우편함 「코드·운영 — 9장」 · analysis v11.7 · reverify v5.8 「content_raw 를 바꾸면 세 칸을 다시 쓰거나 셋 다 NULL」을 장치로).
-- 쓰기 꼴: 분석은 새 행 INSERT(트리거 밖) · 재확인·후속 처리는 content_raw 를 UPDATE 한다(docs/rollback/2026-11-09_reserve_counts_v21.sql · 2026-11-04_pohang_policy_prenewlywed4.sql) → 그 UPDATE 가 대상.
-- 발동(WHEN): content_raw 가 바뀜 ∧ 옛 content_plain 있음 ∧ 같은 UPDATE 가 content_plain · content_plain_at 둘 다 그대로 둠 → 세 칸 NULL(조용히 비움 · 화면은 원문만).
--   같은 UPDATE 가 content_plain 을 새로 쓰거나 content_plain_at 을 새로 찍으면(같은 글을 새 원문으로 다시 검사 통과) 그대로 둔다.
-- 되돌리기: drop trigger trg_policy_plain_stale_clear on public.announcement_policies; drop function public.policy_plain_clear_on_raw_change();
create function public.policy_plain_clear_on_raw_change()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  NEW.content_plain := NULL;
  NEW.content_plain_at := NULL;
  NEW.content_plain_check := NULL;
  RETURN NEW;
END;
$function$;
revoke execute on function public.policy_plain_clear_on_raw_change() from public, anon, authenticated;
grant execute on function public.policy_plain_clear_on_raw_change() to service_role;
comment on function public.policy_plain_clear_on_raw_change() is
  '정책 행 content_raw 가 바뀌었는데 같은 UPDATE 가 쉽게 쓴 말(content_plain·content_plain_at)을 새로 쓰지 않으면 세 칸을 NULL 로(2026-11-19 · 우편함 「코드·운영 — 9장」)';
create trigger trg_policy_plain_stale_clear
  before update on public.announcement_policies
  for each row
  when (old.content_raw is distinct from new.content_raw
        and old.content_plain is not null
        and new.content_plain is not distinct from old.content_plain
        and new.content_plain_at is not distinct from old.content_plain_at)
  execute function public.policy_plain_clear_on_raw_change();
