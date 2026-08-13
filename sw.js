const CACHE_NAME = 'zipfit-v64';
// 코딩원칙 17번 ③: 외부 CDN 스크립트는 PRECACHE에 포함(오프라인/캐시 일관성)
const PRECACHE = ['/zipfit/', '/zipfit/index.html'];
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
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/zipfit/')))
  );
});
