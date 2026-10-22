// ㉓ LH 목록에서 사라진 열린 카드(2026-10-22 · 우편함 「코드·운영 — A(G3 감시): LH 목록에서 사라진 열린 카드 ⚠️ …」).
//    계기: 김제하동 …20908 이 10-16 15:00 KST 뒤 LH 목록에서 사라졌는데 카드는 마감일(10-21)까지 「공고중」이었다.
//    collect-announcements 는 목록에 있는 행만 upsert 하고(매퍼가 last_seen_at 을 채운다) 상태는 markExpired()(마감일 지남)만 바꾼다 —
//    사라짐을 다루는 것은 SH(sh_close_missing)뿐이다. 그래서 「사라졌다」를 점검이 대신 본다.
//    기준 = 마지막 「성공한 LH 목록 수집」 회차(collection_run_log: lh_fetched > 0 ∧ errors 에 「LH 목록」 실패 줄 없음 — 한 카테고리라도 목록을
//    못 받은 회차는 그 카테고리 행이 안 보여도 사라진 것이 아니다). 열린 LH 행의 last_seen_at 이 그보다 1일 넘게 앞서면 센다.
//    열린 LH 행 = source LH ∧ 목록에서 숨기지 않음 ∧ 상태 공고중·접수중·정정공고중 ∧ apply_end ≥ 오늘(KST) ∧ 제목 조기 마감 아님.
//    🔴 마이홈 행은 넣지 않는다(열린 마이홈 행은 이미 1일 넘게 낡거나 빈 것이 많아 소음 — 요청서). 카드를 자동으로 닫지 않는다(사람이 공고 페이지로 정할 신호).
//    🔴 ⚠️ 경고만 · gate.mjs HARD 밖(안 멈춤) · SQL 이 실패하면 ❌가 아니라 ⚠️ 점검 불능(blind) — DB 재시작 순간의 연결 오류가 새 ❌를 만들지 않게.
//    목록 함수를 부르지 않는다 — announcements 열린 LH 행(수십) · collection_run_log 최근 7일(run_at 범위)만 읽는다.
//    롤백·과거 재현 시험이 이 SQL 을 그대로 가져다 쓴다(at = 기준 시각 식 · open = 상태 조건 식) — 바꾸면 시험도 다시 돈다.
export const lhGoneSql = ({ at = 'now()', open = `a.status in ('공고중', '접수중', '정정공고중')` } = {}) => `
with ok as (select max(r.run_at) t from public.collection_run_log r
             where r.run_at > ${at} - interval '7 days' and r.run_at <= ${at}
               and coalesce(r.lh_fetched, 0) > 0 and coalesce(r.errors::text, '') not like '%LH 목록%'),
o as (select a.announcement_id, a.last_seen_at from public.announcements a
       where a.source = 'LH' and a.hidden_from_listing is not true and ${open}
         and a.apply_end >= (${at} at time zone 'Asia/Seoul')::date and a.title not like '%조기%마감%'),
g as (select o.announcement_id, o.last_seen_at,
             floor(extract(epoch from (select t from ok) - o.last_seen_at) / 86400)::int days
        from o where o.last_seen_at is null or (select t from ok) - o.last_seen_at > interval '1 day'),
-- 🔵 2026-10-22 덧(우편함 「코드·운영 — A(G3 감시 덧) …」 3) — 경보 ID마다 공급기관 페이지 대조(source_page_checks · LH 는 source_key = 공고 ID)의
--    기준 시각까지 마지막 행 꼬리 — 「사라짐 + 페이지 접수마감」이면 바로 정정 대상으로 좁혀진다. 경보 행만 붙인다(평소 0행).
p as (select g.announcement_id, c.page_status, c.checked_at from g
        left join lateral (select x.page_status, x.checked_at from public.source_page_checks x
                            where x.source = 'LH' and x.source_key = g.announcement_id and x.checked_at <= ${at} and x.error is null
                            order by x.checked_at desc limit 1) c on true)
select json_build_object(
  'ok_at', (select t from ok),
  'open', (select count(*) from o),
  'n', (select count(*) from g),
  'ids', (select coalesce(json_agg(json_build_object('id', g.announcement_id, 'days', g.days, 'page', p.page_status,
            'page_at', to_char(p.checked_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')) order by g.last_seen_at nulls first), '[]'::json)
          from g join p using (announcement_id))) j`

// 판정 — ok_at 이 없으면(7일 안 성공한 LH 목록 수집 0) 잴 기준이 없다 → ⚠️(그 자체가 수집 문제다 · 수집 항목이 따로 ❌를 낸다).
export function judgeLhGone(j) {
  const rule = '0 — 열린 LH 행(공고중·접수중·정정공고중 ∧ 마감 ≥ 오늘 KST ∧ 조기 마감 아님) 중 last_seen_at 이 마지막 성공 LH 목록 수집보다 1일 넘게 앞선 것 · 넘으면 ⚠️ 경고만(카드를 닫지 않는다 — 공고 페이지 확인)'
  if (!j.ok_at) return { status: 'warn', value: `7일 안 성공한 LH 목록 수집 없음(열린 LH 행 ${j.open})`, rule }
  if (j.n === 0) return { status: 'pass', value: `0(열린 LH 행 ${j.open})`, rule }
  const page = x => x.page_at ? ` · 페이지: ${x.page || '상태 없음'} · ${x.page_at}` : ' · 페이지 대조 없음'
  const ids = j.ids.slice(0, 5).map(x => `${x.id}(${x.days == null ? '본 기록 없음' : `${x.days}일째 안 보임`}${page(x)})`)
  return { status: 'warn', value: `${j.n}: ${ids.join(', ')} — LH 목록에서 안 보임 · 공고 페이지 확인`, rule }
}
