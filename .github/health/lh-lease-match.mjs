// ㉛ 기본 임대조건 ↔ LH 합격점수 API 대조(2026-11-05 · 우편함 「코드·운영 — 합격점수 문서 칸·② 표 둘 · 기본 임대조건 대조 ℹ️ …」 1장 ·
//    백로그 「분석한 기본 임대조건이 LH 합격점수 API 값과 같은지 자동 대조가 없다」 · #887 회신 ⑦ 담양삼만 …20054 8/8 일치).
//    우리가 공고문에서 읽어 넣은 세대 행 임대조건(housing_units)이 LH 가 따로 내는 값(lh_cutoff_scores.gmy_stnd_desc · rfe_stnd_desc)과 같은지 본다.
//    🔴 ℹ️ 정보만 — 판정하지 않는다(처음은 알림 · 맞춤 꼴이 안정되면 ⚠️로 올릴지 회신에서 정한다) · gate.mjs HARD 밖.
//    🔴 합격점수 표 행 값은 출력하지 않는다(개수 · 공고 ID 만 — 동점 처리 값 선례). 보증금·월세 숫자도 값에 싣지 않는다.
//
//    카드     = get_announcements_deduped() 대표 ∧ apply_end ≥ 오늘(KST) ∧ 제목에 「조기…마감」 없음(G2 식 — target_hanbumo_age 와 같다) ∧ housing_type 에 국민·영구·통합공공
//    같은 카드 = 제목 키(announcement_dedup_key)가 같은 공고 전부 — 합격점수 pan_id · 세대 행 announcement_id 를 그 묶음에서 찾는다
//    벌      = 합격점수 행 (보증금, 월임대료) 서로 다른 짝 · spl_tp_nm 국민임대·영구임대·통합공공임대 ∧ 두 칸 다 숫자만(행복 계층별 「대학생 계층 : …」·「고령자 : …」 글자 제외)
//    일치     = 같은 묶음 세대 행 어느 하나가 (deposit, monthly_rent) 또는 (deposit_priority1, rent_priority1) 로 그 짝과 같음
//    공고 불일치 = 벌 하나라도 일치 없음 · 세대 행이 0 인 묶음은 「세대 행 없음」으로 따로 센다(분석 전 — 대조 불가)
//    참고(all) = 열린 카드 밖까지 — 합격점수 국민·영구·통합공공 숫자 벌 ∧ 같은 pan_id 세대 행이 있는 공고 전체(안정성 판단 재료)
export const LH_LEASE_MATCH_SQL = `
with oc as materialized (select d.announcement_id cid, public.announcement_dedup_key(d.title) k from public.get_announcements_deduped() d
        where d.apply_end >= (now() at time zone 'Asia/Seoul')::date and d.title not like '%조기%마감%'
          and d.housing_type ~ '(국민|영구|통합공공)'),
ids as materialized (select distinct oc.cid, a.announcement_id aid from oc join public.announcements a on public.announcement_dedup_key(a.title) = oc.k),
pr as (select distinct ids.cid, s.gmy_stnd_desc::bigint g, s.rfe_stnd_desc::bigint r
         from ids join public.lh_cutoff_scores s on s.pan_id = ids.aid
        where s.spl_tp_nm in ('국민임대', '영구임대', '통합공공임대') and s.gmy_stnd_desc ~ '^[0-9]{1,12}$' and s.rfe_stnd_desc ~ '^[0-9]{1,12}$'),
hu as materialized (select distinct ids.cid, h.deposit, h.monthly_rent, h.deposit_priority1, h.rent_priority1
         from ids join public.housing_units h on h.announcement_id = ids.aid where ids.cid in (select cid from pr)),
m as (select pr.cid, exists (select 1 from hu where hu.cid = pr.cid
          and ((hu.deposit = pr.g and hu.monthly_rent = pr.r) or (hu.deposit_priority1 = pr.g and hu.rent_priority1 = pr.r))) ok from pr),
z as (select cid, count(*) n, count(*) filter (where ok) ok, exists (select 1 from hu where hu.cid = m.cid) has_hu from m group by cid),
apr as (select distinct s.pan_id cid, s.gmy_stnd_desc::bigint g, s.rfe_stnd_desc::bigint r from public.lh_cutoff_scores s
         where s.spl_tp_nm in ('국민임대', '영구임대', '통합공공임대') and s.gmy_stnd_desc ~ '^[0-9]{1,12}$' and s.rfe_stnd_desc ~ '^[0-9]{1,12}$'
           and exists (select 1 from public.housing_units h where h.announcement_id = s.pan_id)),
az as (select apr.cid, bool_and(exists (select 1 from public.housing_units h where h.announcement_id = apr.cid
          and ((h.deposit = apr.g and h.monthly_rent = apr.r) or (h.deposit_priority1 = apr.g and h.rent_priority1 = apr.r)))) all_ok,
          count(*) n from apr group by apr.cid)
select json_build_object(
  'cards', (select count(*) from oc),
  'with_cut', (select count(*) from z),
  'no_hu', (select count(*) from z where not has_hu),
  'pairs', (select coalesce(sum(n), 0) from z where has_hu),
  'pairs_ok', (select coalesce(sum(ok), 0) from z where has_hu),
  'n', (select count(*) from z where has_hu and ok < n),
  'ids', (select coalesce(json_agg(json_build_object('id', cid, 'n', n, 'ok', ok) order by cid), '[]'::json) from z where has_hu and ok < n),
  'all_ann', (select count(*) from az),
  'all_bad', (select count(*) from az where not all_ok),
  'all_pairs', (select coalesce(sum(n), 0) from az)) j`

// 판정 — 언제나 ℹ️(값만). 불일치 공고는 ID · 벌 일치 수만.
export function judgeLhLeaseMatch(j) {
  const rule = '정보 — 판정하지 않는다 · 열린 국민·영구·통합공공 카드(G2 식) 묶음의 합격점수 숫자 벌(보증금·월임대료 짝) 중 세대 행 (deposit, monthly_rent) · (deposit_priority1, rent_priority1) 어느 것과도 안 맞는 벌이 있는 공고 수 · 행복 계층별 글자 제외 · 참고 = 열린 카드 밖 전체'
  const head = `${j.n}${j.n ? ': ' + j.ids.slice(0, 5).map(x => `${x.id}(벌 ${x.ok}/${x.n} 일치)`).join(', ') : ''}`
  const v = `${head} · 열린 카드 ${j.cards} 중 합격점수 있음 ${j.with_cut}(세대 행 없음 ${j.no_hu}) · 벌 ${j.pairs_ok}/${j.pairs} 일치 · 참고 전체 공고 ${j.all_ann} 중 불일치 ${j.all_bad}(벌 ${j.all_pairs})`
  return { status: 'info', value: v, rule }
}
