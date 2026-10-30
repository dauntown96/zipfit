-- 회차 링크 표 B′ + 읽기 RPC(2026-10-29 · 우편함 「코드·운영(브랜치만 · 병합 0) — 회차 링크 표 B′」 1·2 · 조사 「다른 키 회차 잇기」 B′ 채택 · 백로그 「같은 단지 다른 회차 잇기 — 회차 링크 표 B′」).
--
-- ① announcement_round_links — 같은 단지 다른 회차 쌍(제목 끝 공고일만 다른 LH 재공고 등 묶음 키가 다른 회차). 원문으로 확인한 쌍만 넣는다(분석·국면 C 회차).
--    방향: earlier = 앞 회차(공고일 이른 쪽) · later = 뒤 회차 · 같은 쌍은 방향을 바꿔도 한 줄(least/greatest 유일 색인) · 자기 자신 금지.
--    🔴 get_announcement_group_ids · 목록 RPC link_map · refresh_announcement_post_links 에 넣지 않는다 — 넣으면 카드가 합쳐진다(조사 ③).
--    권한: 이웃 표 announcement_post_links 꼴 — RLS 켬 · anon·authenticated SELECT 정책 · 쓰기는 service_role(관리 API 데이터 쓰기).
-- ② get_announcement_round_chain_ids(카드 id) → (announcement_id, hop) — 묶음 ∪ 회차 링크로 이어진 회차들의 묶음(사슬 6단계 · 순환은 hop 최솟값으로 접힘).
--    표가 비면 get_announcement_group_ids 와 같은 결과(hop 0).
-- 되돌리기 전용 시험(2026-10-29 14:14 KST · 관리 API · 쓰기 0):
--   표 빔 — 열린 카드 68 · 사슬 = 그룹 68/68(ID 330) · hop > 0 0 · anon 카드마다 평균 13.4ms · 최대 13.8ms
--   정답 14쌍 + 고리 1 을 넣은 시험 — 14/14 이어짐 · 셋 고리 멈춤(hop 1·2·3) · 역방향 같은 쌍은 유일 색인이 막음 · 바뀐 카드 13 · anon 평균 33.7ms · 최대 197.8ms
-- 불변식: 표 쓰기 권한(V1) · RLS(V5) · 정책(V6)은 기존 줄이 본다 · 함수는 v3.17 allow_exec_funcs. 표 데이터 줄(양끝 공고 있음)은 표가 생긴 뒤 별도 PR(v3.10 선례 — 적용 전 기준값이 새 표를 못 읽는다).
-- 되돌리기: drop function public.get_announcement_round_chain_ids(text); drop table public.announcement_round_links;
-- zipfit:function get_announcement_round_chain_ids(text) acl={postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres} secdef=false
-- zipfit:anon select count(*) from get_announcement_round_chain_ids('2015122300020958')

create table public.announcement_round_links (
  earlier_announcement_id text        not null,
  later_announcement_id   text        not null,
  added_by                text        not null,
  evidence                text        not null,
  created_at              timestamptz not null default now(),
  primary key (earlier_announcement_id, later_announcement_id),
  check (earlier_announcement_id <> later_announcement_id)
);
create unique index announcement_round_links_pair on public.announcement_round_links
  (least(earlier_announcement_id, later_announcement_id), greatest(earlier_announcement_id, later_announcement_id));
create index announcement_round_links_later on public.announcement_round_links (later_announcement_id);
comment on table public.announcement_round_links is
  '같은 단지 다른 회차 링크(B′ · 2026-10-29) — 제목 끝 공고일만 다른 재공고 등 묶음 키가 다른 같은 단지 회차 쌍. 원문으로 확인한 쌍만 넣는다(분석·국면 C 회차). 🔴 get_announcement_group_ids·목록 RPC link_map 에 넣지 않는다(카드가 합쳐진다) — 읽기는 get_announcement_round_chain_ids 만';
comment on column public.announcement_round_links.earlier_announcement_id is '앞 회차(공고일이 이른 쪽) announcement_id — 카드 대표 id 든 묶음 안 어느 id 든 된다(읽기 RPC 가 양끝의 묶음을 편다)';
comment on column public.announcement_round_links.later_announcement_id is '뒤 회차(공고일이 늦은 쪽) announcement_id';
comment on column public.announcement_round_links.added_by is '넣은 회차 — 우편함 페이지 이름 · run 번호';
comment on column public.announcement_round_links.evidence is '원문 확인 근거(짧은 글 — 두 회차 공고문·공고 페이지의 같은 단지 근거 · 우리 판단 문장 아님)';
alter table public.announcement_round_links enable row level security;
create policy "anon can read announcement_round_links" on public.announcement_round_links for select to anon, authenticated using (true);
revoke all on table public.announcement_round_links from public, anon, authenticated;
grant select on table public.announcement_round_links to anon, authenticated;
grant select, insert, update, delete on table public.announcement_round_links to service_role;

create function public.get_announcement_round_chain_ids(p_announcement_id text)
 returns table(announcement_id text, hop integer)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
-- 회차 사슬 ID(2026-10-29 · 우편함 「코드·운영 — 회차 링크 표 B′」 2) — 카드 id 의 묶음(get_announcement_group_ids) ∪ 회차 링크(announcement_round_links)로
-- 이어진 회차들의 묶음. hop = 처음 닿은 단계(0 = 카드 자신의 묶음 · 1 = 링크 한 번 · …).
--   링크는 방향 없이 따른다(앞↔뒤) · 양끝 id 는 그 id 의 묶음으로 편다 · 사슬은 6단계까지(LH 재공고 연 2~3회 · 2~3년 치) ·
--   순환은 hop 최솟값으로 접힌다(같은 id 가 다시 나와도 결과는 한 줄 — 재귀는 6단계 상한으로 멈춘다).
--   표가 비면 결과 = get_announcement_group_ids(hop 0) 그대로.
with recursive walk(aid, hop) as (
  select g.announcement_id, 0 from public.get_announcement_group_ids(p_announcement_id) g
  union
  select n.announcement_id, w.hop + 1
  from walk w
  join public.announcement_round_links l on w.aid in (l.earlier_announcement_id, l.later_announcement_id)
  cross join lateral public.get_announcement_group_ids(
    case when l.earlier_announcement_id = w.aid then l.later_announcement_id else l.earlier_announcement_id end) n
  where w.hop < 6
)
select aid, min(hop)::integer from walk group by aid;
$function$;
revoke all on function public.get_announcement_round_chain_ids(text) from public, anon, authenticated;
grant execute on function public.get_announcement_round_chain_ids(text) to anon, authenticated, service_role;
comment on function public.get_announcement_round_chain_ids(text) is
  '회차 사슬 ID(2026-10-29) — 묶음 ID ∪ 회차 링크로 이어진 회차 묶음 ID · hop 0 = 카드 자신의 묶음 · 화면 「🕘 다른 회차」·「지난 회차 대비」의 재료(표시층 다음 회차)';
