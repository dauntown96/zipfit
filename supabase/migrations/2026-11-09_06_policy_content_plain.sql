-- 정책 행 「쉽게 쓴 말」 저장 칸(2026-11-09 · 우편함 「코드·운영 — 쉽게 쓴 말 저장 칸」 1장 · 백로그 결정 2026-10-26 안 A · 말투 B 해요체 2026-10-27 ·
--   스킬 zipfit-notice-analysis references/interpretation.md 「표시 층 「쉽게 쓴 말」」 — 저장 칸 신설 전에는 쓰지 않는다).
-- ① content_plain        text        — content_raw 를 해요체로 옮긴 글(대상: announcement_policies 문단만 · ⚠️ 행·자격 요약 밖). 비면 화면은 원문만.
-- ② content_plain_at     timestamptz — 그 글을 쓴(검사를 통과한) 때.
-- ③ content_plain_check  text        — 통과한 기계 검사 판(예 'plain-check v1' · scripts/plain-check.mjs). 검사 ⑤(주어 없는 문장 그대로)는 claude.ai 몫.
-- 제약: ⚠️ 행(category 가 U+26A0 로 시작)은 content_plain 0 · 셋은 함께 비거나 함께 찬다. content_raw 는 이미 NOT NULL(「content_plain 있으면 content_raw 있음」은 표가 지킨다).
-- 노출: 표 단위 SELECT 권한(anon·authenticated=r) + 정책 「public read announcement_policies」라 공개 REST 에 저절로 열린다 · 값은 지금 전부 NULL.
-- 되돌리기: alter table public.announcement_policies drop column content_plain_check, drop column content_plain_at, drop column content_plain;
alter table public.announcement_policies
  add column content_plain text,
  add column content_plain_at timestamptz,
  add column content_plain_check text,
  add constraint announcement_policies_plain_not_warning
    check (content_plain is null or coalesce(left(category, 1), '') <> U&'\26A0'),
  add constraint announcement_policies_plain_together
    check ((content_plain is null) = (content_plain_at is null) and (content_plain is null) = (content_plain_check is null)),
  add constraint announcement_policies_plain_nonblank
    check (content_plain is null or btrim(content_plain) <> '');
comment on column public.announcement_policies.content_plain is
  '쉽게 쓴 말(해요체 · 2026-11-09) — content_raw 를 옮긴 글 · 원문 낱알 전부·원문 밖 낱알 0·부정/제한 갈래·때 낱말 그대로(scripts/plain-check.mjs) · ⚠️ 행은 비움 · 다 옮기지 못하면 쓰지 않는다';
comment on column public.announcement_policies.content_plain_at is '쉽게 쓴 말을 쓴 때(2026-11-09) — content_plain 과 함께 비거나 찬다';
comment on column public.announcement_policies.content_plain_check is '쉽게 쓴 말이 통과한 기계 검사 판(예 plain-check v1 · 2026-11-09) — content_plain 과 함께 비거나 찬다';
