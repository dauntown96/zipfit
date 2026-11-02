// ㉘ 매입 순위별 후속 공지 미반영(2026-11-02 · 우편함 「코드·운영 — 런칭 뒤 첫 주 묶음 …」 A-1 · 백로그 「LH 후순위 공지를 카드가 모른다」 남은 ③).
//    LH 매입임대는 1순위(우선) 창 뒤 1순위(일반)·2순위 창을 따로 열고, 그 창의 대상 주택을 공지사항 목록으로 다시 낸다(공고문 전체 목록과 다름).
//    화면은 그 차수의 ⚠️ 정책 행(분류에 「차수」 ∧ 「대상」 — run 346 꼴 「⚠️ 이번 차수 공급대상주택」)이 있을 때만 카드에 한 줄을 띄운다(zfLoadWaveNotes).
//    행이 없으면 화면은 아무것도 쓰지 않는다 → 사용자는 공고문 전체 목록을 보고 신청한다. 그래서 「행이 아직 없다」를 점검이 본다.
//
//    🔴 정의는 화면 그대로다(새 정의를 만들지 않는다 — index.html 의 같은 이름 함수와 한 줄씩 대응):
//      카드      = get_announcements_deduped() 대표 ∧ apply_end ≥ 오늘(KST) ∧ apply_period_check 아님 ∧ 조기 마감 아님(zfEarlyClosed — 제목 머리 [조기마감] · revision_note)
//      창        = 같은 제목 키(announcement_dedup_key)의 경로 행(announcement_apply_routes) 중 카드 기간과 겹치는 것 · 겹치거나 하루 차로 붙은 행은 한 창 ·
//                  날짜 빈 경로 행이 하나라도 있으면 그 카드는 보지 않는다 · 창 둘 이상만(zfRouteWinsAll)
//      기본 창 i = 오늘이 든 창 · 없으면 다음 창 · 다 끝났으면 마지막 창(zfRouteDefaultWin) · i ≥ 1(둘째 이후 창)만(zfWaveIdsOf)
//      ⚠️ 행    = 창들의 경로 행 공고 id ∪ 카드 id 의 정책 행 중 분류가 「⚠️」로 시작 ∧ 「차수」 ∧ 「대상」(zfLoadWaveNotes)
//    요청서가 더한 조건(#711 회신 ⑦) — 화면 정의를 바꾸지 않고 「공지가 이미 나왔어야 하는 때」로 좁히기만 한다:
//      매입     = 대표 housing_type 에 「매입」
//      순위별   = 그 id 들의 일정 표(announcement_schedule) 대상주택게시 행의 scope_text 가 둘 이상
//      게시 지남 = 창 i 의 대상주택게시 행(scope_text ∈ 창 i 의 phase_text — zfRouteSchedOf 와 같은 짝짓기) 중 하나라도 시작일 ≤ 오늘
//      창 끝 전  = 오늘 ≤ 창 i 끝(오늘이 그 창 안 ∨ 그 창 시작 전)
//    🔴 ⚠️ 경고만 · gate.mjs HARD 밖(안 멈춤 — 고치는 길이 공지를 읽고 정책 행을 쓰는 운영 데이터 쓰기 몫) · SQL 이 실패하면 ⚠️ 점검 불능.
//    대역 시험이 이 SQL 을 그대로 쓴다 — today = 오늘 식(날짜 리터럴로 바꿔 과거·미래 재현) · dropWarn = ⚠️ 행을 없는 셈 칠 공고 id 배열(가지 대역).
export const waveNoticeSql = ({ today = `(now() at time zone 'Asia/Seoul')::date`, dropWarn = [] } = {}) => {
  const drop = dropWarn.length ? `and p.announcement_id not in (${dropWarn.map(s => `'${String(s).replace(/'/g, "''")}'`).join(', ')})` : ''
  return `
with c as materialized (select d.announcement_id, d.title, d.apply_start s0, d.apply_end e0, public.announcement_dedup_key(d.title) k
        from public.get_announcements_deduped() d
       where d.apply_end >= ${today} and d.apply_start is not null and d.housing_type like '%매입%'
         and d.apply_period_check is not true
         and d.title !~ '^\\s*(\\[[^\\]]*\\]\\s*)*\\[\\s*조기\\s*(접수)?\\s*마감\\s*\\]' and coalesce(d.revision_note, '') !~ '조기\\s*(접수\\s*)?마감'),
r as materialized (select c.announcement_id cid, x.announcement_id rid, x.start_date x0, x.end_date y0, x.phase_text ph
        from c join public.announcements a on public.announcement_dedup_key(a.title) = c.k
        join public.announcement_apply_routes x on x.announcement_id = a.announcement_id
       where a.title is not null),
bad as (select distinct cid from r where x0 is null or y0 is null),
w as (select r.*, case when x0 <= max(y0) over (partition by cid order by x0, y0 rows between unbounded preceding and 1 preceding) + 1 then 0 else 1 end brk
        from r join c on c.announcement_id = r.cid
       where r.cid not in (select cid from bad) and not (r.y0 < c.s0 or r.x0 > c.e0)),
g as (select w.*, sum(brk) over (partition by cid order by x0, y0 rows unbounded preceding) gi from w),
m as (select cid, gi, min(x0) x, max(y0) y, array_agg(distinct ph) filter (where ph is not null) phs, array_agg(distinct rid) ids
        from g group by cid, gi),
mc as (select m.*, count(*) over (partition by cid) n, row_number() over (partition by cid order by x) - 1 i from m),
di as (select cid, coalesce(min(i) filter (where x <= ${today} and ${today} <= y), min(i) filter (where x > ${today}), max(i)) i
         from mc where n >= 2 group by cid),
cw as (select mc.cid, mc.i, mc.x, mc.y, mc.phs,
              (select array_agg(distinct v) from mc z, unnest(z.ids || mc.cid) v where z.cid = mc.cid) allids
         from mc join di using (cid, i) where di.i >= 1),
hit as (select cw.*,
          (select min(s.start_date) from public.announcement_schedule s
            where s.announcement_id = any(cw.allids) and s.stage = '대상주택게시' and s.scope_text = any(cw.phs)) post
         from cw
        where ${today} <= cw.y
          and (select count(distinct s.scope_text) from public.announcement_schedule s
                where s.announcement_id = any(cw.allids) and s.stage = '대상주택게시') >= 2
          and exists (select 1 from public.announcement_schedule s
                       where s.announcement_id = any(cw.allids) and s.stage = '대상주택게시' and s.scope_text = any(cw.phs) and s.start_date <= ${today})
          and not exists (select 1 from public.announcement_policies p
                           where p.announcement_id = any(cw.allids) and p.category like '⚠️%' and p.category like '%차수%' and p.category like '%대상%' ${drop}))
select json_build_object(
  'cards', (select count(*) from c),
  'wave', (select count(*) from cw),
  'n', (select count(*) from hit),
  'ids', (select coalesce(json_agg(json_build_object('id', hit.cid, 'win', hit.i + 1, 'from', hit.x, 'to', hit.y, 'post', hit.post,
            'phase', array_to_string(hit.phs, ' / ')) order by hit.x, hit.cid), '[]'::json) from hit)) j`
}

// 판정 — 0 이면 통과 · 넘으면 ⚠️(공고 ID · 몇째 창 · 게시일 · 창 — 사람이 읽고 공지를 찾아 정책 행을 쓰게).
export function judgeWaveNotice(j) {
  const rule = '0 — 열린 매입 대표 ∧ 경로 창 둘 이상 ∧ 기본 창이 둘째 이후(화면 zfRouteDefaultWin) ∧ 대상주택게시 scope 둘 이상 ∧ 그 창 게시일 ≤ 오늘 ∧ 오늘 ≤ 그 창 끝 ∧ 「⚠️ … 차수 … 대상」 정책 행 없음 · 넘으면 ⚠️ 경고만(공지 목록을 읽고 정책 행을 쓰는 것은 운영 데이터 쓰기 몫)'
  if (j.n === 0) return { status: 'pass', value: `0(열린 매입 카드 ${j.cards} · 둘째 이후 창 ${j.wave})`, rule }
  const v = j.ids.slice(0, 5).map(x => `${x.id}(${x.win}째 창 ${x.from}~${x.to} · 대상주택 게시 ${x.post} · ⚠️ 차수 행 없음)`).join(', ')
  return { status: 'warn', value: `${j.n}: ${v}`, rule }
}
