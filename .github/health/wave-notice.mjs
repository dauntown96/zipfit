// ㉘ 매입 순위별 후속 공지 미반영(2026-11-02 · 우편함 「코드·운영 — 런칭 뒤 첫 주 묶음 …」 A-1 · 백로그 「LH 후순위 공지를 카드가 모른다」 남은 ③).
//    LH 매입임대는 1순위(우선) 창 뒤 1순위(일반)·2순위 창을 따로 열고, 그 창의 대상 주택을 공지사항 목록으로 다시 낸다(공고문 전체 목록과 다름).
//    화면은 그 차수의 ⚠️ 정책 행(분류에 「차수」 ∧ 「대상」 — run 346 꼴 「⚠️ 이번 차수 공급대상주택」)이 있을 때만 카드에 한 줄을 띄운다(zfLoadWaveNotes).
//    행이 없으면 화면은 아무것도 쓰지 않는다 → 사용자는 공고문 전체 목록을 보고 신청한다. 그래서 「행이 아직 없다」를 점검이 본다.
//
//    🔴 정의는 DB 함수 public.wave_notice_targets(p_now) 한 곳이다(2026-11-05 · 우편함 「코드·운영 — 대상주택 공지 감지 구현 …」 1장 —
//       종전에는 이 파일에 SQL 사본이 있었다 · EF collect-lh-notices · 발송기 #차수 갈래가 같은 함수를 부른다). 함수 머리 주석이 정의의 정본이다
//       (화면 zfRouteWinsAll · zfRouteDefaultWin · zfWaveIdsOf · zfLoadWaveNotes · zfRouteSchedOf 와 한 줄씩 대응 · 게시 시각 = 시작일 + period_text HH:MM).
//    이 점검의 ⚠️ = 함수 행 중 due ∧ not has_warn 이 있는 카드(창마다) — 공지가 이미 나왔어야 하는데 ⚠️ 차수 행이 없다.
//    값 덧(2026-11-05): 그 카드·창에 lh_notice_matches 로 맞은 공지 수 · 대기열(analysis_dispatch_queue · 키 「… #차수 scope」) 상태 —
//       켜기 칸(analysis_dispatch_config.wave_notice_enabled)이 거짓이면 「맞음 n · 대기(꺼짐)」.
//    🔴 ⚠️ 경고만 · gate.mjs HARD 밖(안 멈춤 — 고치는 길은 공지를 읽고 정책 행을 쓰는 데이터 쓰기 · 켜진 뒤에는 루틴 #차수 몫) · SQL 이 실패하면 ⚠️ 점검 불능.
//    now = 지금 식(KST timestamp · 시험은 과거·미래 시각 리터럴).
export const waveNoticeSql = ({ now = `(now() at time zone 'Asia/Seoul')` } = {}) => `
with t as materialized (select * from public.wave_notice_targets(${now})),
hit as (select t.announcement_id, t.win, t.win_from, t.win_to, t.phases, min(t.post_on) post,
               array_agg(distinct t.scope_text) filter (where t.due) scopes
          from t where t.due and not t.has_warn group by 1, 2, 3, 4, 5),
mx as (select h.announcement_id, count(m.*) matched,
              exists (select 1 from public.analysis_dispatch_queue q
                       where q.announcement_id = h.announcement_id and q.group_key like '% #차수 %' and q.state in ('waiting', 'sent', 'claimed')) queued
         from hit h left join public.lh_notice_matches m on m.announcement_id = h.announcement_id and m.scope_text = any(h.scopes)
        group by h.announcement_id)
select json_build_object(
  'wave', (select count(distinct announcement_id) from t),
  'n', (select count(*) from hit),
  'enabled', coalesce((select wave_notice_enabled from public.analysis_dispatch_config where id = 1), false),
  'ids', (select coalesce(json_agg(json_build_object('id', hit.announcement_id, 'win', hit.win, 'from', hit.win_from, 'to', hit.win_to, 'post', hit.post,
            'phase', hit.phases, 'matched', mx.matched, 'queued', mx.queued) order by hit.win_from, hit.announcement_id), '[]'::json)
            from hit join mx using (announcement_id))) j`

// 판정 — 0 이면 통과 · 넘으면 ⚠️(공고 ID · 몇째 창 · 게시일 · 창 · 공지 맞음 · 대기열 — 사람이 읽고 공지를 찾아 정책 행을 쓰게 · 켜진 뒤에는 루틴 몫인지 보이게).
export function judgeWaveNotice(j) {
  const rule = '0 — wave_notice_targets() 중 due(순위별 · 둘째 이후 창 · 대상주택 게시 시각 ≤ 지금 KST · 오늘 ≤ 창 끝) ∧ not has_warn(「⚠️ … 차수 … 대상」 정책 행 없음) · 넘으면 ⚠️ 경고만 · 값에 LH 공지 맞음 수(lh_notice_matches)와 대기열(#차수 · 켜기 칸 wave_notice_enabled) 상태'
  if (j.n === 0) return { status: 'pass', value: `0(둘째 이후 창 ${j.wave})`, rule }
  const q = x => x.matched > 0 ? `공지 맞음 ${x.matched} · ${x.queued ? '대기열 들어감' : j.enabled ? '대기열 아직' : '대기(꺼짐)'}` : '공지 아직 못 찾음'
  const v = j.ids.slice(0, 5).map(x => `${x.id}(${x.win}째 창 ${x.from}~${x.to} · 대상주택 게시 ${x.post} · ⚠️ 차수 행 없음 · ${q(x)})`).join(', ')
  return { status: 'warn', value: `${j.n}: ${v}`, rule }
}
