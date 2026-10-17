// VET Work – offline cache. Netwerk eerst (altijd de nieuwste versie als er internet is), cache als terugval offline.
const V='vw-v8';
const FILES=['./','index.html','vet-sync.js','work-cloud.js','work-agenda.js','vet-update.js','vet-slot.js','pdf-lib.min.js','manifest.webmanifest','logo.png','logo-app.png','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r&&r.ok){const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp))}return r})
  .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(h=>h||caches.match('index.html'))))});
