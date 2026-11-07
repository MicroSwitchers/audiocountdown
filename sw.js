/* Versioned, offline-first app shell. Updates are applied only when requested. */
const VERSION='v6.0';
const PREFIX='talking-visual-countdown-';
const CACHE=PREFIX+VERSION;
const CORE=['./','./index.html','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
  /* Do not skipWaiting automatically: an active timer should not be reloaded or replaced. */
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  const scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  if(request.mode==='navigate'){
    // Prefer the latest HTML, but never fail to display an already cached timer offline.
    event.respondWith((async()=>{
      const abort=new AbortController();
      const timeout=setTimeout(()=>abort.abort(),3500);
      try{
        const response=await fetch(request,{cache:'no-store',signal:abort.signal});
        if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./index.html',copy)));}
        return response;
      }catch(_){return (await caches.match('./index.html'))||(await caches.match('./'))||Response.error();}
      finally{clearTimeout(timeout);}
    })());
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(request);
    if(hit)return hit;
    try{const response=await fetch(request);if(response.ok)event.waitUntil(cache.put(request,response.clone()));return response;}
    catch(_){return Response.error();}
  })());
});
