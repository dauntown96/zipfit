-- 의견 창구 저장 자리 · 카드 반응 이벤트 · 의견 1년 삭제(2026-10-26 · 우편함 「표시층 — 의견 창구 · 이용 기록 구간값 셋 구현 준비」).
-- 🔴 처리방침 새 판(PR #682 고지 · 시행일 = 게시일 + 30일)이 말하는 항목만 둔다 —
--    1 「의견」: 의견 내용 · 보낸 화면 · 공고 식별자 · (선택) 답변받을 이메일 / 받은 날부터 1년 / 저장 전에 연락처 · 긴 숫자를 가림
--    1 「서비스 이용 기록」 카드 반응: 공고 식별자 · 👍/👎 · 틀렸다고 고른 칸 → usage_events 의 새 event 'card_reaction'(새 표 0)
--    7 파기 절차: 「1년이 지난 의견 삭제」 → 기존 정리 잡 zipfit-purge-usage-events 에 한 문장(잡을 새로 만들지 않는다)
-- 🔴 회원 식별자 · 세션 식별자 칸을 두지 않는다(고지 「의견」 항목 밖). 화면은 anon 키로 EF submit-feedback 을 부른다.
-- 🔴 개인정보 표 — 정책 0 · anon/authenticated 권한 0 · EF submit-feedback(service_role)만 넣는다(CLAUDE.md 원칙 15 · user_profiles 와 같은 꼴). 읽기는 service_role(운영자).
-- 🔴 백업 저장소 zipfit-backup scripts/data_excluded.py 에 user_feedback 을 같은 날 더한다 — 안 그러면 다음 덤프에 의견 데이터가 담긴다.
-- 되돌리기: 아래 잡 명령에서 user_feedback 줄을 뺀 옛 명령으로 cron.alter_job · drop table public.user_feedback ·
--           usage_events_event_check 를 card_reaction 없는 옛 목록으로(이 파일의 GUARD 가 확인한 그대로).

DO $$ begin
  if not exists (select 1 from pg_constraint where conname = 'usage_events_event_check'
                   and conrelid = 'public.usage_events'::regclass
                   and pg_get_constraintdef(oid) not like '%card_reaction%') then
    raise exception 'GUARD usage_events_event_check missing or already changed';
  end if;
  if not exists (select 1 from cron.job where jobname = 'zipfit-purge-usage-events'
                   and command like '%q_expired%' and command not like '%user_feedback%') then
    raise exception 'GUARD purge job missing or already changed';
  end if;
end $$;

-- ① 카드 반응 — usage_events event 목록에 하나 더(나머지 열 그대로).
alter table public.usage_events drop constraint usage_events_event_check;
alter table public.usage_events add constraint usage_events_event_check CHECK ((event = ANY (ARRAY['page_view'::text, 'notice_open'::text, 'notice_save'::text, 'notice_unsave'::text, 'search'::text, 'filter_apply'::text, 'diagnosis_start'::text, 'diagnosis_complete'::text, 'recommend_click'::text, 'attachment_open'::text, 'card_reaction'::text])));

-- ② 의견
create table public.user_feedback (
  id              bigint generated always as identity primary key,
  received_at     timestamptz not null default now(),
  body            text not null,
  screen          text,
  announcement_id text,
  reply_email     text,
  constraint user_feedback_body_len    check (char_length(btrim(body)) between 1 and 1000),
  -- 「저장 전에 가림」을 DB 가 지킨다 — 화면(zfFbMask)이 가린 글만 들어온다. 같은 세 꼴(이메일 · 하이픈 전화 · 6자리 이상 숫자).
  constraint user_feedback_body_masked check (body !~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+' and body !~ '[0-9]{2,4}-[0-9]{3,4}-[0-9]{4}' and body !~ '[0-9]{6,}'),
  constraint user_feedback_screen      check (screen is null or screen = any (array['추천','공고','인사이트','관리','설정'])),
  constraint user_feedback_ann_len     check (announcement_id is null or char_length(announcement_id) <= 64),
  constraint user_feedback_reply_email check (reply_email is null or (char_length(reply_email) <= 254 and reply_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);
comment on table public.user_feedback is '의견 보내기(처리방침 1 「의견」) — 받은 날부터 1년 뒤 zipfit-purge-usage-events 가 지운다 · 읽기는 service_role 만';
create index user_feedback_received_at_idx on public.user_feedback (received_at);

alter table public.user_feedback enable row level security;
revoke all on table public.user_feedback from public, anon, authenticated;
-- 🔵 2026-10-26(우편함 「코드·운영 — 런칭 날 병합 리허설 + 의견 표 남용 막기」 2) — 화면은 표에 직접 쓰지 않는다.
--    EF submit-feedback(service_role)만 넣고 센다(회수 제한 · 가림 한 번 더) · anon·authenticated 권한 0 · 정책 0.
grant select, insert, delete on table public.user_feedback to service_role;

-- ③ 1년 지난 의견 삭제 — 기존 정리 잡에 한 문장(매일 15:00 UTC = 00:00 KST · 처리방침 7 「매일 0시 무렵」).
select cron.alter_job(
  (select jobid from cron.job where jobname = 'zipfit-purge-usage-events'),
  command := $cmd$
  -- 처리방침 「서비스 이용 기록은 수집일로부터 1년간 보관한 뒤 파기합니다」를 지키는 장치.
  -- 🔴 삭제 기준에는 유예를 두지 않는다 — 유예를 두면 약속한 1년을 넘겨 보관하게 된다.
  --    유예는 감시(불변식 V8) 쪽에 둔다: 잡이 며칠 밀려도 경보가 깜빡이지 않게.
  -- occurred_at 인덱스가 있어 범위 삭제가 싸다. 시크릿이 필요 없는 순수 DELETE다.
  DELETE FROM public.usage_events WHERE occurred_at < now() - interval '1 year';
  -- 2026-10-09 — 검색어 원문(props.q)은 90일 뒤 걷는다. 행은 남긴다(검색 횟수는 1년).
  UPDATE public.usage_events
     SET props = (props - 'q') || '{"q_expired":true}'::jsonb
   WHERE event = 'search' AND props ? 'q' AND occurred_at < now() - interval '90 days';
  -- 2026-10-26 — 의견은 받은 날부터 1년(처리방침 1 · 7). 유예 없음(위와 같은 이유).
  DELETE FROM public.user_feedback WHERE received_at < now() - interval '1 year';
  $cmd$
);
