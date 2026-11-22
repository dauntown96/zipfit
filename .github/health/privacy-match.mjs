// ㊶ 처리방침 ↔ 실물 대조(2026-11-22 · 우편함 「코드·운영 — 넷째 묶음」 C · docs/ops-check-backlog.md 17위 · 근거 사건 10-18 고지 넷 어긋남).
//    대조표(아래 MAP) = 실물 이름 → 처리방침(privacy.html) 안의 문구. 세 축을 본다:
//      ⓐ 이벤트 키 — index.html ZF_LOG_EVENTS · DB usage_events 최근 30일의 event · props 키(이름·개수만 — 값은 읽지 않는다)
//      ⓑ 칸 — user_profiles · user_feedback · saved_announcements 의 칸 이름(information_schema) · 옛 칸(email · marketing_alert)은 값이 든 행 수만
//      ⓒ 호스트 — index.html 안의 바깥 호스트(//host · https://host) → 수탁자·이동 문구
//    걸리는 꼴: 실물에 있는데 대조표에 없음(새 키·칸·호스트) · 대조표 문구가 privacy.html 에 없음(방침에서 빠짐) · 옛 칸에 값 있음 ·
//    🔵 「시행 전 키 있음」 — 처리방침 v2 시행일(index.html ZF_PRIVACY_V2_START — 2026-11-29) 전 날짜(KST)에 v2 키(카드 반응 · 처음 열기 구간 셋)가 DB 에 있음.
//       시행일 전에는 v2 키가 실물에 **없는 것**이 정상이라 「방침에 있는데 실물에 없음」은 세지 않는다(방침 본문에 v2 항목이 이미 있다).
//    ⚠️ 경고만(안 멈춤 · gate.mjs HARD 밖) · SQL 실패는 ⚠️ 점검 불능.
//    🔴 개인정보 표를 읽지만 값은 꺼내지 않는다 — event·키 이름별 개수 · 칸 이름 · 옛 칸 값 든 행 수만(CLAUDE.md 원칙 36).

export const MAP = {
  events: {
    // 방침 「서비스 이용 기록」 항목 머리(「… —」) — 낱말만 걸면 다른 문장에 묻혀 빠짐을 못 잡는다
    page_view: '화면 보기 —', notice_open: '공고 열기 —', search: '검색 —', recommend_click: '「원문 보기」 누름', card_reaction: '카드 반응 —',
  },
  v2Events: ['card_reaction'],
  props: {
    'page_view.tab': '연 화면(탭)의 이름', 'page_view.nav': '연 방법',
    'page_view.revisit': '지난 방문이 며칠 전인지', 'page_view.width': '화면 폭', 'page_view.via': '들어온 길',
    'notice_open.from': '연 자리',
    'search.q': '입력한 검색어', 'search.len': '글자 수', 'search.q_omitted': '글자 수',
    'recommend_click.rank': '추천 목록에서의 순서',
    'card_reaction.v': '도움이 됐는지', 'card_reaction.wrong': '틀렸다고 고른 칸',
  },
  v2Props: ['page_view.revisit', 'page_view.width', 'page_view.via'],
  // ops = 운영 기기 표지(?ops=1 기기 · 자동 브라우저 'auto') — 이용자 정보가 아니라 집계 제외 표지라 방침 문구를 걸지 않는다(index.html zfLog 주석)
  techProps: ['ops'],
  cols: {
    user_profiles: {
      regions: '희망 지역', types: '주택 유형', max_deposit: '최대 보증금', marital: '혼인 상태', children: '자녀 수', members: '가구원 수',
      income: '소득', assets: '자산', birth_year: '출생연도', alert_on: '알림 수신 여부', new_notice_alert: '새 공고 알림',
      alert_email: '알림용 이메일', theme: '테마', font_size: '글꼴 크기', usage_log_consent: '회원 식별자가 함께 저장',
    },
    user_feedback: { body: '의견 내용', screen: '보낸 화면', announcement_id: '공고 식별자', reply_email: '답변받을 이메일' },
    saved_announcements: { announcement_id: '공고 식별자' },
  },
  techCols: ['id', 'user_id', 'created_at', 'updated_at', 'received_at'],
  // 옛 칸 — 방침에 없다(카카오에서 이메일을 받지 않음 · 마케팅 알림 없음). 칸은 남아 있어도 값이 든 행이 0 이어야 한다.
  legacyCols: { 'user_profiles.email': 'email_nn', 'user_profiles.marketing_alert': 'mkt_true' },
  hosts: {
    'neuaeexdxfkkcvyzsicb.supabase.co': 'Supabase', 'dapi.kakao.com': '카카오', 'cdn.jsdelivr.net': 'jsDelivr',
    'drive.google.com': 'Google', 'api.github.com': 'GitHub', 'apply.lh.or.kr': '한국토지주택공사(LH)',
  },
}

export const PRIVACY_MATCH_SQL = (v2Start) => `
with ue as (select u.event, u.props, (u.occurred_at at time zone 'Asia/Seoul')::date >= '${v2Start}'::date as v2
              from public.usage_events u where u.occurred_at > now() - interval '30 days')
select json_build_object(
  'events', (select coalesce(json_object_agg(e, n), '{}'::json) from (select ue.event e, count(*) n from ue group by 1) x),
  'events_pre', (select coalesce(json_object_agg(e, n), '{}'::json) from (select ue.event e, count(*) n from ue where not ue.v2 group by 1) x),
  'props', (select coalesce(json_object_agg(k, n), '{}'::json) from (select ue.event || '.' || k k, count(*) n from ue,
             jsonb_object_keys(case when jsonb_typeof(ue.props) = 'object' then ue.props else '{}'::jsonb end) k group by 1) y),
  'props_pre', (select coalesce(json_object_agg(k, n), '{}'::json) from (select ue.event || '.' || k k, count(*) n from ue,
             jsonb_object_keys(case when jsonb_typeof(ue.props) = 'object' then ue.props else '{}'::jsonb end) k where not ue.v2 group by 1) y),
  'cols', (select coalesce(json_object_agg(t, c), '{}'::json) from (select table_name t, json_agg(column_name order by ordinal_position) c
             from information_schema.columns where table_schema = 'public' and table_name in ('user_profiles', 'user_feedback', 'saved_announcements') group by 1) z),
  'email_nn', (select count(*) from public.user_profiles where email is not null),
  'mkt_true', (select count(*) from public.user_profiles where marketing_alert is true)) j`

export const v2StartOf = (indexHtml) => {
  const m = /const\s+ZF_PRIVACY_V2_START\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(indexHtml || '')
  return m ? m[1] : null
}
export const logEventsOf = (indexHtml) => {
  const m = /const\s+ZF_LOG_EVENTS\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(indexHtml || '')
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]) : null
}
export const hostsOf = (indexHtml) => {
  const out = new Set()
  for (const m of String(indexHtml || '').matchAll(/(?:https?:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?=[/'"`?:)\s])/gi)) out.add(m[1].toLowerCase())
  return [...out]
}

// 주석·문서 안 주소(예 「drive.google.com/file/d/…」 설명)도 세므로, 대조표 밖 호스트는 「실물에 쓰이는 곳」인지 사람이 본다(⚠️ 값에 이름을 싣는다).
const IGNORE_HOSTS = /(^|\.)(w3\.org|example\.com|kkokzip\.com|github\.io)$/

export function judgePrivacyMatch({ privacyHtml, indexHtml, db, today, privacyFiles }) {
  const text = String(privacyHtml || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const has = (p) => text.includes(p)
  const v2Start = v2StartOf(indexHtml)
  const pre = !v2Start || (today || '') < v2Start
  const out = []
  // ⓐ 이벤트
  const logEv = logEventsOf(indexHtml) || []
  for (const e of logEv) if (!MAP.events[e]) out.push(`화면 이벤트 ${e} — 대조표 없음`)
  for (const e of Object.keys(db.events || {})) if (!MAP.events[e]) out.push(`DB 이벤트 ${e} — 대조표 없음`)
  for (const [e, p] of Object.entries(MAP.events)) if (!has(p)) out.push(`이벤트 ${e} 문구 「${p}」 방침에 없음`)
  for (const k of Object.keys(db.props || {})) {
    const key = k.split('.').pop()
    if (MAP.techProps.includes(key)) continue
    if (!MAP.props[k]) out.push(`DB 키 ${k} — 대조표 없음`)
  }
  for (const [k, p] of Object.entries(MAP.props)) if (!has(p)) out.push(`키 ${k} 문구 「${p}」 방침에 없음`)
  // 시행 전 키
  if (v2Start) {
    for (const e of MAP.v2Events) if ((db.events_pre || {})[e]) out.push(`시행 전 키 있음 — 이벤트 ${e} ${db.events_pre[e]}건(시행 ${v2Start} 전)`)
    for (const k of MAP.v2Props) if ((db.props_pre || {})[k]) out.push(`시행 전 키 있음 — ${k} ${db.props_pre[k]}건(시행 ${v2Start} 전)`)
  } else out.push('ZF_PRIVACY_V2_START 를 index.html 에서 못 읽음')
  // ⓑ 칸
  for (const [t, cols] of Object.entries(db.cols || {})) {
    for (const c of cols) {
      if (MAP.techCols.includes(c)) continue
      const lg = MAP.legacyCols[`${t}.${c}`]
      if (lg) { if (Number(db[lg]) > 0) out.push(`옛 칸 ${t}.${c} 에 값 든 행 ${db[lg]}`); continue }
      const p = (MAP.cols[t] || {})[c]
      if (!p) out.push(`칸 ${t}.${c} — 대조표 없음`)
    }
  }
  for (const [t, m] of Object.entries(MAP.cols)) for (const [c, p] of Object.entries(m)) if (!has(p)) out.push(`칸 ${t}.${c} 문구 「${p}」 방침에 없음`)
  // ⓒ 호스트
  const hosts = hostsOf(indexHtml).filter(h => !IGNORE_HOSTS.test(h))
  for (const h of hosts) if (!MAP.hosts[h]) out.push(`호스트 ${h} — 대조표 없음`)
  for (const [h, p] of Object.entries(MAP.hosts)) if (!has(p)) out.push(`호스트 ${h} 문구 「${p}」 방침에 없음`)
  // 이전 판 사슬(privacyFiles = { 'YYYY-MM-DD.html': 글 } — 넘겨 받았을 때만)
  let chain = null
  if (privacyFiles) { chain = judgePrivacyChain({ privacyHtml, files: privacyFiles }); for (const o of chain.out) out.push(`사슬 — ${o}`) }
  const seen = `이벤트 ${logEv.length} · DB 이벤트 ${Object.keys(db.events || {}).length} · 키 ${Object.keys(db.props || {}).length} · 칸 ${Object.values(db.cols || {}).flat().length} · 호스트 ${hosts.length} · 시행일 ${v2Start ?? '?'}(${pre ? '전' : '뒤'})${chain ? ` · 이전 판 사슬 ${chain.n}판 · 링크 ${chain.links} · ${chain.first} ~ 현행 ${chain.current}` : ''}`
  const rule = '0 — 대조표(privacy-match.mjs MAP: 이벤트 · props 키 · 프로필·의견·찜 칸 · index.html 바깥 호스트 → 처리방침 문구) 밖의 실물 · 방침에서 빠진 문구 · 옛 칸(email · marketing_alert) 값 · 시행일(ZF_PRIVACY_V2_START) 전 v2 키 · 이전 판 사슬(docs/privacy 파일 = 링크 · 적용기간 빈틈·겹침 0 · 링크 글자 = 판 머리) — 넘으면 ⚠️(안 멈춤 · 값은 이름·개수만)'
  return { status: out.length ? 'warn' : 'pass', value: out.length ? `${out.length}: ${out.slice(0, 6).join(' / ')} · ${seen}` : `0(${seen})`, rule, out }
}

// ── 처리방침 이전 판 사슬(2026-11-22 · 우편함 「코드·운영 — 다섯째 묶음」 2 · 💡 「처리방침 이전 판 사슬 검사」 승인 · #1197 손 고침 계기) ──
//    ① docs/privacy/*.html 파일 목록 = privacy.html 「이전 판(적용기간)」 링크 목록(끊긴 링크 · 링크 없는 판)
//    ② 판마다 머리 「적용기간 A ~ B」(B 가 「… 전날까지」면 열린 끝) — 시작 순으로 다음 시작 = 앞 끝 + 1일(빈틈·겹침 없음).
//       같은 날 고친 판(앞 판 기간 글에 「같은 날」)은 다음 시작 = 앞 끝(하루 겹침) 허용.
//    ③ 열린 끝은 마지막 판 하나만 · ④ 링크 글자 기간 = 그 파일 머리 기간. ⚠️만.
const D = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./
const toDay = (m) => m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null
const addDay = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const plain = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
export const periodOf = (text) => {
  const m = /적용기간\s*(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.)\s*(?:~\s*(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.)|부터)?([^현새]{0,40})/.exec(plain(text))
  if (!m) return null
  return { start: toDay(D.exec(m[1])), end: m[2] ? toDay(D.exec(m[2])) : null, note: (m[3] || '').trim() }
}
export function judgePrivacyChain({ privacyHtml, files }) {
  const out = []
  const line = (/이전 판\(적용기간\):([\s\S]*?)<\/p>/.exec(privacyHtml || '') || [])[1] || ''
  const links = [...line.matchAll(/<a href="\.\/docs\/privacy\/([^"]+)">([^<]*)<\/a>/g)].map(m => ({ name: m[1], text: m[2] }))
  if (!links.length) out.push('privacy.html 「이전 판(적용기간)」 링크를 못 읽음')
  const names = Object.keys(files || {})
  for (const l of links) if (!names.includes(l.name)) out.push(`끊긴 링크 ${l.name}`)
  for (const n of names) if (!links.some(l => l.name === n)) out.push(`링크 없는 판 ${n}`)
  const cur = toDay(D.exec((/시행일\s*(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.)/.exec(plain(privacyHtml)) || [])[1] || ''))
  const ps = []
  for (const n of names) {
    const p = periodOf(files[n])
    if (!p || !p.start) { out.push(`${n} 머리 적용기간 못 읽음`); continue }
    ps.push({ name: n, ...p })
    const l = links.find(x => x.name === n)
    if (l) {
      const ls = toDay(D.exec(l.text)), le = toDay(D.exec(l.text.replace(D, '')))
      if (ls !== p.start || (p.end && le !== p.end)) out.push(`${n} 링크 글자 기간(${ls} ~ ${le ?? '열림'}) ≠ 머리(${p.start} ~ ${p.end ?? '열림'})`)
    }
  }
  ps.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : (a.name < b.name ? -1 : 1))
  ps.forEach((p, i) => {
    if (!p.end && i !== ps.length - 1) out.push(`${p.name} 열린 끝인데 마지막 판이 아님`)
    if (i === 0) return
    const a = ps[i - 1]
    if (!a.end) return
    const want = addDay(a.end, 1)
    if (p.start === want) return
    if (p.start === a.end && /같은 날/.test(a.note)) return
    out.push(p.start > want ? `빈틈 ${a.name}(~${a.end}) → ${p.name}(${p.start}~)` : `겹침 ${a.name}(~${a.end}) → ${p.name}(${p.start}~)`)
  })
  const last = ps[ps.length - 1]
  if (last && last.end && cur && addDay(last.end, 1) !== cur) out.push(`마지막 판 ${last.name}(~${last.end}) → 현행 시행일 ${cur} 이 이어지지 않음`)
  return { out, n: ps.length, links: links.length, current: cur, first: ps[0]?.start ?? null }
}
