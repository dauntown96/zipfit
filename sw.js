const CACHE_NAME = 'zipfit-v139';
// 코딩원칙 17번 ③: 외부 CDN 스크립트는 PRECACHE에 포함(오프라인/캐시 일관성)
const PRECACHE = ['/zipfit/', '/zipfit/index.html', '/zipfit/privacy.html'];
// 외부 CDN은 별도로 캐싱한다. addAll에 함께 넣으면 CDN 일시 장애 시
// install 전체가 거부되어 오프라인 캐시가 통째로 사라진다.
const PRECACHE_EXTERNAL = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      c.addAll(PRECACHE).then(() =>
        Promise.all(PRECACHE_EXTERNAL.map(u => c.add(u).catch(() => null)))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  // Supabase API는 캐시 우회
  if(e.request.url.includes('supabase.co')) return;
  // 🔴 이동 요청(HTML)만 HTTP 캐시를 재검증한다(2026-09-23 B19). GitHub Pages 가 index.html 을
  //    Cache-Control: max-age=600 으로 주므로, 그대로 두면 배포 직전 10분 안에 왔던 사람이 옛 HTML 을 받을 수 있다.
  //    no-cache 는 캐시를 건너뛰는 것이 아니라 ETag 로 되묻는 것이라(304) 비용이 작다. 오프라인 폴백은 그대로다.
  const req = e.request.mode === 'navigate' ? fetch(e.request, { cache: 'no-cache' }) : fetch(e.request);
  e.respondWith(
    req.catch(() => caches.match(e.request).then(r => r || caches.match('/zipfit/')))
  );
});
