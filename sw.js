const V='expenses-shell-v15';
const FILES=['./','index.html','style.css','app.js','manifest.webmanifest','icon-192.png','icon-512.png','rubik-regular.woff','rubik-medium.woff','rubik-bold.woff'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(V).then(k=>k.put(e.request,c))}return r}).catch(()=>caches.match(e.request)))});
