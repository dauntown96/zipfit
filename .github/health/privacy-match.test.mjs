// privacy-match.mjs 시험(2026-11-22 · 넷째 묶음 C) — node .github/health/privacy-match.test.mjs
import { judgePrivacyMatch, v2StartOf, logEventsOf, hostsOf, MAP } from './privacy-match.mjs'
let ok = 0, bad = 0
const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name) } }
const phrases = [...Object.values(MAP.events), ...Object.values(MAP.props), ...Object.values(MAP.cols).flatMap(o => Object.values(o)), ...Object.values(MAP.hosts)]
const privacy = '<p>' + phrases.join('</p><p>') + '</p>'
const index = `const ZF_LOG_EVENTS = new Set(['page_view','notice_open','search','recommend_click','card_reaction']);
const ZF_PRIVACY_V2_START = '2026-11-29';
<script src="//dapi.kakao.com/v2/maps/sdk.js"></script> fetch('https://neuaeexdxfkkcvyzsicb.supabase.co/rest/v1/x')`
const cols = { user_profiles: ['id', 'user_id', 'email', 'marketing_alert', ...Object.keys(MAP.cols.user_profiles)], user_feedback: ['id', 'received_at', ...Object.keys(MAP.cols.user_feedback)], saved_announcements: ['id', 'user_id', 'announcement_id', 'created_at'] }
const db = { events: { page_view: 10, search: 2 }, events_pre: { page_view: 10, search: 2 }, props: { 'page_view.tab': 10, 'page_view.ops': 3, 'search.q': 2 }, props_pre: { 'page_view.tab': 10 }, cols, email_nn: 0, mkt_true: 0 }
const base = { privacyHtml: privacy, indexHtml: index, db, today: '2026-11-22' }
t('읽기 셋', v2StartOf(index) === '2026-11-29' && logEventsOf(index).length === 5 && hostsOf(index).length === 2)
t('깨끗한 꼴 0', judgePrivacyMatch(base).status === 'pass')
t('방침에서 빠진 문구', judgePrivacyMatch({ ...base, privacyHtml: privacy.replace('검색 —', '찾기 —') }).out.some(x => /search 문구/.test(x)))
t('DB 새 이벤트', judgePrivacyMatch({ ...base, db: { ...db, events: { ...db.events, notice_save: 1 } } }).out.some(x => /DB 이벤트 notice_save/.test(x)))
t('DB 새 키', judgePrivacyMatch({ ...base, db: { ...db, props: { ...db.props, 'search.ip': 1 } } }).out.some(x => /search\.ip/.test(x)))
t('ops 키는 셈 밖', !judgePrivacyMatch(base).out.some(x => /ops/.test(x)))
t('시행 전 v2 키', judgePrivacyMatch({ ...base, db: { ...db, props_pre: { 'page_view.width': 4 } } }).out.some(x => /시행 전 키 있음 — page_view\.width 4/.test(x)))
t('시행 전 카드 반응', judgePrivacyMatch({ ...base, db: { ...db, events_pre: { card_reaction: 1 } } }).out.some(x => /시행 전 키 있음 — 이벤트 card_reaction/.test(x)))
t('시행 뒤 v2 키는 정상', judgePrivacyMatch({ ...base, today: '2026-11-30', db: { ...db, props: { ...db.props, 'page_view.width': 4 } } }).status === 'pass')
t('옛 칸 값', judgePrivacyMatch({ ...base, db: { ...db, email_nn: 1 } }).out.some(x => /옛 칸 user_profiles\.email/.test(x)))
t('새 칸', judgePrivacyMatch({ ...base, db: { ...db, cols: { ...cols, user_profiles: [...cols.user_profiles, 'phone'] } } }).out.some(x => /user_profiles\.phone/.test(x)))
t('새 호스트', judgePrivacyMatch({ ...base, indexHtml: index + ` <img src="https://tracker.example.net/p.gif">` }).out.some(x => /tracker\.example\.net/.test(x)))
t('시행일 못 읽음', judgePrivacyMatch({ ...base, indexHtml: index.replace(/ZF_PRIVACY_V2_START/, 'X') }).out.some(x => /못 읽음/.test(x)))
console.log(`privacy-match 시험 ${ok}/${ok + bad}`)
process.exit(bad ? 1 : 0)
