-- 정책 행 「꼭 볼 것 순위」 · 원문 쪽 번호 칸 + 오해 부르는 칸 설명(2026-11-10 · 우편함 「코드·운영 — 꼭 볼 것 key_rank 칸(정책 행) + 쪽 번호 칸 · 0장 …」 ·
--   다운님 승인 2026-11-10 — 새 칸 「꼭 볼 것 순위」 · 「누가」는 계산 · 설계 「📐 12월 재편」 8·9절).
-- ① key_rank    smallint — 그 공고에서 꼭 볼 것 1~3위(NULL = 순위 없음). 같은 공고(announcement_id) 안에서 같은 순위 두 행 금지(부분 유일 색인 + 불변식 V24).
-- ② source_page smallint — 그 행 원문이 시작하는 쪽(1부터 · source_file 의 쪽). 쪽이 고정되지 않는 원문(hwp·hwpx — 쪽은 그리는 쪽에서 정해진다) ·
--                           공고 페이지·후속 공지에서 온 행은 NULL. 새 공고부터 분석이 채운다(소급 0).
--    정수로 고른 까닭: 화면이 「p.21」로 그리기 쉽고 정렬·검사가 된다 — 「p.21」 꼴 글자는 꼴이 갈린다(p21 · 21쪽 · p.21~22).
-- ③ 설명만(이름·값 그대로): announcements.deposit_min · rent_min(목록 RPC 가 그대로 돌려줌 · 가격 정본 아님) · announcement_analysis.pending_fields(회차 메모).
-- 노출: 표 단위 SELECT 권한(anon·authenticated=r) + 정책 「public read announcement_policies」라 공개 REST 에 저절로 열린다 · 값은 지금 전부 NULL · 화면 변경 0.
-- 되돌리기: drop index public.announcement_policies_key_rank_uniq; alter table public.announcement_policies drop column source_page, drop column key_rank;
--          (설명은 앞 문구로 comment on 다시)
alter table public.announcement_policies
  add column key_rank smallint,
  add column source_page smallint,
  add constraint announcement_policies_key_rank_range check (key_rank is null or key_rank between 1 and 3),
  add constraint announcement_policies_source_page_range check (source_page is null or source_page between 1 and 2000);
create unique index announcement_policies_key_rank_uniq
  on public.announcement_policies (announcement_id, key_rank) where key_rank is not null;
comment on column public.announcement_policies.key_rank is
  '꼭 볼 것 순위 1~3(2026-11-10) — 그 공고에서 신청자가 꼭 볼 정책 행 · NULL = 순위 없음 · 같은 공고 같은 순위 금지(announcement_policies_key_rank_uniq · 불변식 V24) · 「누가」는 계산(칸 없음)';
comment on column public.announcement_policies.source_page is
  '원문 쪽 번호(2026-11-10) — 그 행 원문이 시작하는 source_file 의 쪽(1부터) · 쪽이 고정되지 않는 원문(hwp·hwpx)·공고 페이지·후속 공지 출처는 NULL · 새 공고부터(소급 0)';
comment on column public.announcements.deposit_min is
  '최소 임대보증금(원) — 마이홈포털 목록 API 값 그대로(0 은 null 로 접음) · 🔴 가격 정본 아님: 열린 공고 대부분 빈 칸(2026-11-10 열린 61 중 59) · 화면 가격은 get_announcement_price_summary(세대 행) · 목록 RPC get_announcements_deduped 가 그대로 돌려준다';
comment on column public.announcements.rent_min is
  '최소 월임대료(원) — 마이홈포털 목록 API 값 그대로(0 은 null 로 접음) · 🔴 가격 정본 아님: 열린 공고 대부분 빈 칸(2026-11-10 열린 61 중 59) · 화면 가격은 get_announcement_price_summary(세대 행) · 목록 RPC get_announcements_deduped 가 그대로 돌려준다';
comment on column public.announcement_analysis.pending_fields is
  '분석 회차가 남긴 메모 줄(「[범위밖보고] …」 · 「[판정완료] YYYY-MM-DD …」 · 판정 대기 필드 등) — 🔴 정정 전후 차이(diff) 목록이 아니다(2026-11-10) · 내부 기록 · anon 에 열지 않는다';
