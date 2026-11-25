// 묶음 안 분석 빠진 열린 구성원(2026-11-25 · 우편함 「코드·운영 — 스물일곱째」 2 · health-ops ⚠️ 안 멈춤 · HARD 밖).
//   계기: …21044(영암·해남 국민임대) 묶음에 붙은 MYHOME 「영암용앙1 국민임대주택 …」(21561_3 · 접수 11-30)의 단지가 분석에서 빠져,
//     화면 날짜가 섞였다(표시층 판 K 덧 1 · 분석 D1 덧 2).
//   꼴: 열린 대표(get_announcements_deduped · apply_end ≥ 오늘 KST)의 묶음 구성원 중 셋을 모두 만족하는 것을 센다.
//     묶음 = 제목 키 ∪ 같은 게시물 링크(발송기·dispatch_orphan 과 같은 kd).
//     ① 접수가 안 끝났다(apply_end ≥ 오늘).
//     ② 제목이 대표와 다르다.
//     ③ 제목 머리의 단지 이름이 묶음 어느 세대 행(building_name · unit_group · address · 단지 display_name)에도 없다.
//       단지 이름 = 「<이름> 국민임대·행복주택·영구임대·공공임대·통합공공·장기전세」 꼴의 <이름> · 「…지역·시·군·구·도」로 끝나면 셈 밖 · 끝 「단지」는 뗀다.
//   🔴 단지 이름을 제목 머리에서만 읽으니 넓게 잡지 않는다. 거짓 걸림보다 놓침 쪽이다(2026-11-25 제목 다른 열린 구성원 124 중 이름 읽힘 4).
//   기준선 2026-11-25: 0. 되돌리기 전용 재현(…21044 영암용앙1 세대 행 6 지움)에서는 …21044 ← 21561_3 「영암용앙1」 1을 잡았다.
//   멈춤 조건(요청서): 걸린 카드가 10장을 넘으면 ⚠️ 대신 ℹ️(judge 의 cap).
export const GROUP_MEMBER_GAP_SQL = `
with lm as (select distinct on (l.linked_announcement_id) l.linked_announcement_id aid, lh.title_dedup_key lh_key
              from public.announcement_post_links l join public.announcements lh on lh.announcement_id = l.lh_announcement_id
             where lh.title is not null and lh.hidden_from_listing is not true order by l.linked_announcement_id, l.lh_announcement_id),
kd as materialized (select a.announcement_id, a.title, a.apply_end, coalesce(lm.lh_key, a.title_dedup_key) k
              from public.announcements a left join lm on lm.aid = a.announcement_id where a.title is not null and a.hidden_from_listing is not true),
rp as materialized (select d.announcement_id rid, d.title rtitle, kd.k from public.get_announcements_deduped() d join kd using (announcement_id)
              where d.apply_end >= (now() at time zone 'Asia/Seoul')::date),
mem0 as (select rp.rid, rp.rtitle, m.announcement_id mid, m.title mtitle,
              substring(btrim(m.title) from '^([가-힣]{2,}[0-9A-Za-z-]*)\\s*(국민임대|행복주택|영구임대|공공임대|통합공공|장기전세)') nm0
         from rp join kd m on m.k = rp.k and m.announcement_id <> rp.rid
        where m.apply_end >= (now() at time zone 'Asia/Seoul')::date and m.title <> rp.rtitle),
mem as (select mem0.*, case when nm0 ~ '(지역|시|군|구|도)$' then null else regexp_replace(nm0, '단지$', '') end nm from mem0),
u as (select rp.rid, string_agg(concat_ws(' ', h.building_name, h.unit_group, h.address, c.display_name), ' ') txt
        from rp join kd g on g.k = rp.k join public.housing_units h on h.announcement_id = g.announcement_id
        left join public.complexes c on c.id = h.complex_id group by rp.rid)
select json_build_object('members_diff_title', count(*), 'named', count(*) filter (where nm is not null),
  'hit', coalesce(json_agg(json_build_array(mem.rid, mem.mid, mem.nm, left(mem.mtitle, 50))) filter (where nm is not null and position(nm in coalesce(u.txt, '')) = 0), '[]'),
  'ok', count(*) filter (where nm is not null and position(nm in coalesce(u.txt, '')) > 0)) j
from mem left join u on u.rid = mem.rid`

export function judgeGroupMemberGap(j, cap = 10) {
  const hit = j.hit || []
  const cards = new Set(hit.map(h => h[0]))
  const short = id => (/^\d{16}$/.test(id) ? '…' + id.slice(-5) : id)
  const value = `빠짐 ${hit.length}${hit.length ? ': ' + hit.slice(0, 4).map(([r, m, nm]) => `${short(r)} ← ${short(m)} 「${nm}」`).join(' / ') : ''} · 걸린 열린 카드 ${cards.size} · 제목 다른 열린 구성원 ${j.members_diff_title} 중 이름 읽힘 ${j.named} · 세대 행에 있음 ${j.ok}`
  return {
    status: !hit.length ? 'pass' : (cards.size > cap ? 'info' : 'warn'), value, hit,
    rule: '0 — 열린 대표 묶음 구성원 중 접수 안 끝남 ∧ 제목이 대표와 다름 ∧ 제목 머리 단지 이름(「<이름> 국민임대·행복주택…」 · 지역·시·군·구·도 끝은 셈 밖)이 묶음 세대 행 어디에도 없음 → ⚠️(안 멈춤 · 그 단지 분석을 더하는 것은 분석 묶음 몫) · 걸린 카드가 10장 넘으면 ℹ️(꼴 정의 거짓 걸림 의심)',
  }
}
