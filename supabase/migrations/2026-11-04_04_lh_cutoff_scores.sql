-- LH 건설임대 당첨 합격점수(커트라인) 표 · 수집 런 기록 · 주 1회 cron(2026-11-04 · 우편함 「코드·운영 — LH 건설임대 당첨 합격점수 수집 장치」).
-- 원천: data.go.kr 15160376(B552555/lhCsrLsPwiPneScrInfo) — Edge Function collect-lh-cutoff 가 시도 16 × 1년 창으로 받는다(같은 PR).
-- 🔴 개인정보 — 받는 자리 거름: 커트라인 글자(PWI_PNE_SCR_CTS)에는 마지막 당첨자의 동점 처리 값(전입일자 · 세대구성원수 · 신청자연령 · 자녀 여부 …)이
--    섞여 온다. EF 가 화이트리스트 꼴(순위 · 점수 · 소득N%이하 · 타지역 · 당첨/경쟁/미달)만 남기고, 신청자 5명 이하면 비운다 — 원문 글자는 저장하지 않는다.
--    아래 CHECK 셋(꼴 · 금지 낱말 · 5명)이 같은 규칙을 DB 에서 한 번 더 막는다. EF 의 cutoff-filter.ts 와 같은 정규식 — 하나만 고치지 않는다.
-- 경쟁률: 원천 CM_RT 는 94.7%가 「0」이라 받지 않는다 · competition_ratio = 신청자수 ÷ 공급호수(공급 0 이면 NULL · 생성 칸).
-- 잇기: pan_id = announcements.announcement_id(LH · 2026-04 이후 98% 일치 — 조사 회차) · 지난 회차는 get_announcement_round_chain_ids 로(단지명 맞춤 쓰지 않음).
-- 권한: 두 표 모두 RLS 켜고 정책 0 · anon·authenticated 권한 0(원칙 15 — 화면이 아직 읽지 않는다 · 화면 회차가 읽기 정책을 같은 PR 에서 연다) ·
--   쓰기는 service_role(EF). 보안 권고 허용목록 두 줄(같은 PR).
-- 보관: 지우지 않는다 — 원천이 지난 5년만 주므로 그보다 오래된 행은 다시 받을 수 없다(백업 IRREPLACEABLE · zipfit-backup 같은 날 PR).
-- 되돌리기: select cron.unschedule('zipfit-collect-lh-cutoff'); drop table public.lh_cutoff_run_log; drop table public.lh_cutoff_scores;
DO $$ begin
  if to_regclass('public.lh_cutoff_scores') is not null then raise exception 'GUARD lh_cutoff_scores exists'; end if;
  if to_regclass('public.lh_cutoff_run_log') is not null then raise exception 'GUARD lh_cutoff_run_log exists'; end if;
  if exists (select 1 from cron.job where jobname = 'zipfit-collect-lh-cutoff') then raise exception 'GUARD job exists'; end if;
end $$;

create table public.lh_cutoff_scores (
  pan_id            text        not null,
  sbd_lgo_no        text        not null,
  ltst_nm           text        not null default '',
  rqs_tp_nm         text        not null default '',
  sbd_lgo_nm        text,
  pan_nm            text,
  spl_tp_nm         text,
  cnp_nm            text,
  sgg_nm            text,
  spl_rmno          integer,
  rqpr_cnt          integer,
  competition_ratio numeric(10,2) generated always as (case when spl_rmno > 0 and rqpr_cnt is not null then round(rqpr_cnt::numeric / spl_rmno, 2) end) stored,
  cutoff_text       text,
  cutoff_state      text        not null,
  gmy_stnd_desc     text,
  rfe_stnd_desc     text,
  rcr_pan_dt        date        not null,
  fetched_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  primary key (pan_id, sbd_lgo_no, ltst_nm, rqs_tp_nm),
  constraint lh_cutoff_scores_state check (cutoff_state in ('ok', 'empty', 'not_whitelisted', 'small_applicants')),
  constraint lh_cutoff_scores_state_text check ((cutoff_state = 'ok') = (cutoff_text is not null)),
  constraint lh_cutoff_scores_cutoff_small check (cutoff_text is null or rqpr_cnt > 5),
  constraint lh_cutoff_scores_cutoff_forbidden check (cutoff_text is null or cutoff_text !~ '(전입|연령|나이|세대구성원|자녀|여부|당해지역|당해단지|거주기간|생년|출생|장애|추천순번)'),
  constraint lh_cutoff_scores_cutoff_whitelist check (cutoff_text is null or cutoff_text ~ '(^(?:소득\d{1,3}%이하,\s*)?(?:(?:(?:(?:신혼)?\d{1,2}순위|무순위),\s*)?\d{1,3}점|(?:(?:신혼)?\d{1,2}순위|무순위))\s*,?\s*(?:타지역\s*)?(?:당첨(?:\s*\((?:소득\d{1,3}%이하,\s*)?(?:(?:(?:신혼)?\d{1,2}순위|무순위)(?:,\s*\d{1,3}점)?|\d{1,3}점)\s*경쟁\))?|\(미달\))$)|(^\(미달\)$)|(^\((?:소득\d{1,3}%이하,\s*)?(?:(?:(?:신혼)?\d{1,2}순위|무순위)(?:,\s*\d{1,3}점)?|\d{1,3}점)\s*경쟁\)$)')
);
create index lh_cutoff_scores_rcr_pan_dt on public.lh_cutoff_scores (rcr_pan_dt);
comment on table public.lh_cutoff_scores is
  'LH 건설임대 당첨 합격점수(커트라인) — data.go.kr 15160376 · collect-lh-cutoff(주 1회 · 시도 16 × 1년 창) · 2026-11-04. 🔴 커트라인 글자는 받는 자리에서 거른 값(원문 아님 — 동점 처리 개인 값 제거 · 신청 5명 이하 비움)';
comment on column public.lh_cutoff_scores.pan_id is 'PAN_ID = announcements.announcement_id(LH)';
comment on column public.lh_cutoff_scores.sbd_lgo_no is 'SBD_LGO_NO 단지 번호(「C01542」 꼴)';
comment on column public.lh_cutoff_scores.ltst_nm is 'LTST_NM — 명세는 「추첨형명」이나 실물은 주택형(46 · 26A · 29(주거약자용) …)';
comment on column public.lh_cutoff_scores.rqs_tp_nm is 'RQS_TP_NM 신청유형(예비자 · 일반공급 · 신혼부부·한부모 · 청년 …)';
comment on column public.lh_cutoff_scores.spl_rmno is 'SPL_RMNO 공급호수';
comment on column public.lh_cutoff_scores.rqpr_cnt is 'RQPR_CNT 신청자수';
comment on column public.lh_cutoff_scores.competition_ratio is '신청자수 ÷ 공급호수(소수 둘째 자리 · 공급 0 이면 NULL) — 원천 CM_RT 는 94.7% 「0」이라 쓰지 않는다';
comment on column public.lh_cutoff_scores.cutoff_text is '거른 커트라인 글자(화이트리스트 꼴만 · 신청 5명 초과만) — 원문 아님';
comment on column public.lh_cutoff_scores.cutoff_state is 'ok = 남김 · empty = 원천이 비움(행복주택 · 공급 5호 미만 등) · not_whitelisted = 꼴 밖이라 버림(동점 처리 값 등) · small_applicants = 신청 5명 이하라 비움';
comment on column public.lh_cutoff_scores.gmy_stnd_desc is 'GMY_STND_DESC 임대보증금 기준(명세 integer — 실물은 글자도 옴 · 행복 계층별 「대학생 계층 : …」)';
comment on column public.lh_cutoff_scores.rfe_stnd_desc is 'RFE_STND_DESC 월임대료 기준(위와 같은 꼴)';
comment on column public.lh_cutoff_scores.rcr_pan_dt is 'RCR_PAN_DT 모집공고일';
comment on column public.lh_cutoff_scores.fetched_at is '처음 받은 시각';
comment on column public.lh_cutoff_scores.last_seen_at is '마지막으로 원천에서 다시 받은 시각';
alter table public.lh_cutoff_scores enable row level security;
revoke all on table public.lh_cutoff_scores from public, anon, authenticated;
grant select, insert, update on table public.lh_cutoff_scores to service_role;

create table public.lh_cutoff_run_log (
  id             bigint generated always as identity primary key,
  run_at         timestamptz not null default now(),
  mode           text        not null,
  years_ago      integer     not null,
  window_from    date,
  window_to      date,
  calls          integer,
  ok_calls       integer,
  rows_in        integer,
  upserted       integer,
  kept           integer,
  dropped_empty  integer,
  dropped_filter integer,
  dropped_small  integer,
  dup_dropped    integer,
  total_after    integer,
  duration_ms    integer,
  errors         jsonb       not null default '[]'::jsonb
);
comment on table public.lh_cutoff_run_log is
  'collect-lh-cutoff 런 기록(2026-11-04) — 한 호출 = 한 행 · 셈만(원문 글자 0) · errors 는 시도별 호출 실패(키·URL 가림)';
alter table public.lh_cutoff_run_log enable row level security;
revoke all on table public.lh_cutoff_run_log from public, anon, authenticated;
grant select, insert on table public.lh_cutoff_run_log to service_role;

-- 주 1회 — 월요일 05:13 KST(일요일 20:13 UTC) · 백업(18:00 UTC)·생존 신호(18:40 UTC)·수집 주간 창 밖 · 최근 1년 창 16호출.
-- 결과는 모집공고일 뒤 2~3개월에 들어오므로(조사 회차 추정) 주 1회로 충분하다. 시크릿은 Vault 에서 실행 시점에 읽는다.
select cron.schedule('zipfit-collect-lh-cutoff', '13 20 * * 0', $cmd$
  SELECT net.http_post(
    url := 'https://khdpjjyspmlqtzperoqg.supabase.co/functions/v1/collect-lh-cutoff?mode=collect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret_v2')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$);
