/* 꼭집 디자인 실험실 — 시안 공통 도우미(빌드 때 각 index.html 안으로 들어간다).
   값은 전부 #zf-data(배포본 공개 REST 2026-10-08 KST 응답)에서만 읽는다. */
const ZF = JSON.parse(document.getElementById('zf-data').textContent);
const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const d8 = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const dayDiff = (a, b) => Math.round((d8(b) - d8(a)) / 864e5);
// 2,886만원 · 3,270만 8,000원 · 1억 7,480만원 · 14만 6,700원 — 반올림 없이 그대로 쓴다
function won(w) {
  if (w == null) return '—';
  const eok = Math.floor(w / 1e8), man = Math.floor((w % 1e8) / 1e4), rest = w % 1e4;
  const p = [];
  if (eok) p.push(eok + '억');
  if (man) p.push(man.toLocaleString('ko-KR') + '만');
  if (rest) p.push(rest.toLocaleString('ko-KR'));
  return p.join(' ') + '원';
}
const md = s => { if (!s) return '—'; const d = d8(s); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`; };
const mdw = s => { if (!s) return '—'; const d = d8(s); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const ymd = s => s ? s.replace(/-/g, '.') : '—';
const area = n => (Math.round(n * 100) / 100).toString();
// 오늘(ZF.asOf) 기준 접수 상태 — 시작 전 / 접수 중 / 끝
function phase(c) {
  const t = ZF.asOf;
  if (t < c.applyStart) return { key: 'soon', label: '접수 예정', short: '예정', d: dayDiff(t, c.applyStart), dLabel: '접수까지' };
  if (t <= c.applyEnd) return { key: 'open', label: '접수중', short: '접수중', d: dayDiff(t, c.applyEnd), dLabel: '마감까지' };
  return { key: 'closed', label: '접수 마감', short: '마감', d: 0, dLabel: '' };
}
const dd = n => n === 0 ? 'D-DAY' : `D-${n}`;
const TABS = [['추천', 'rec'], ['공고', 'list'], ['인사이트', 'ins'], ['관리', 'mng'], ['설정', 'set']];
// 화면 전환 — View Transitions가 있으면 쓰고, 없거나 동작 줄이기면 바로 바꾼다
function swap(fn) {
  if (!RM && document.startViewTransition) document.startViewTransition(fn); else fn();
}
function route(name, opts = {}) {
  const run = () => {
    $$('.screen').forEach(s => s.classList.toggle('on', s.dataset.screen === name));
    document.documentElement.dataset.route = name;
    const sc = $(`.screen[data-screen="${name}"]`); if (sc) sc.scrollTop = 0;
    if (typeof onRoute === 'function') onRoute(name);
  };
  if (opts.instant) run(); else (typeof customSwap === 'function' ? customSwap(run, name) : swap(run));
  if (!opts.noHash) history.replaceState(null, '', name === 'detail' ? '#detail' : '#home');
}
function boot() {
  if (typeof render === 'function') render();
  $$('[data-open]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('[data-fav]')) return; route('detail'); }));
  $$('[data-back]').forEach(el => el.addEventListener('click', () => route('home')));
  $$('[data-fav]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); el.classList.toggle('is-on'); el.setAttribute('aria-pressed', el.classList.contains('is-on')); }));
  $$('[data-toggle]').forEach(el => el.addEventListener('click', () => { const g = el.closest('[data-group]'); g.classList.toggle('is-open'); el.setAttribute('aria-expanded', g.classList.contains('is-open')); }));
  route(location.hash === '#detail' ? 'detail' : 'home', { instant: true, noHash: true });
  requestAnimationFrame(() => document.documentElement.classList.add('ready'));
}
// 숫자 올라가기(동작 줄이기면 바로 끝값)
function countUp(el, to, ms = 900) {
  if (RM) { el.textContent = to.toLocaleString('ko-KR'); return; }
  const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / ms); const e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString('ko-KR'); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
