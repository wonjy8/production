/* API bridge keeps media, canvas and downloads same-origin on GitHub Pages.
 * Authentication is an HttpOnly, Secure, partitioned cookie at the NAS.
 * NAS responses are not cached. Local mode stores data in IndexedDB. */
importScripts('./pages-route.js','./pages-local.js');
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(!event.source?.url?.startsWith(self.registration.scope)||!event.ports[0])return;
 try{
  if(!['route:ready','connection:get'].includes(event.data?.type))throw Error('Unknown connection request');
  const value=self.productionConnectionFromURL(event.source.url,self.registration.scope);
  event.ports[0].postMessage({value});
 }catch(error){event.ports[0].postMessage({error:error.message})}
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const prefix = new URL('api/', self.registration.scope);
  if(url.origin!==prefix.origin)return;
  // Warm clients can navigate directly to a NAS path; GitHub Pages' 404.html covers first visits.
  if(event.request.mode==='navigate'&&url.pathname.startsWith(new URL(self.registration.scope).pathname)){
    try{self.productionConnectionFromURL(url.href,self.registration.scope)}catch{return}
    event.respondWith(fetch(new URL('index.html?route='+Date.now(),self.registration.scope),{cache:'no-store'}));return;
  }
  if(!url.pathname.startsWith(prefix.pathname))return;
  event.respondWith((async () => {
    const headers = new Headers();
    for (const name of ['Content-Type', 'Range', 'If-Range', 'If-Match', 'X-Scope-Owner', 'X-Scope-Tab']) {
      if (event.request.headers.has(name)) headers.set(name, event.request.headers.get(name));
    }
    try {
      const client=await self.clients.get(event.clientId);
      if(!client)throw Error('App client unavailable');
      const origin=self.productionConnectionFromURL(client.url,self.registration.scope);
      if (origin === 'local') return self.handleLocalRequest(event.request);
      if (!origin) return Response.json({error:'서버 연결 설정이 필요합니다.'}, {status:503});
      const target = origin + '/browser/api/' + url.pathname.slice(prefix.pathname.length) + url.search;
      const response = await fetch(target, {
        method:event.request.method, headers, credentials:'include', mode:'cors',
        redirect:'error', cache:'no-store',
        ...(!['GET','HEAD'].includes(event.request.method) ? {body:await event.request.blob()} : {})
      });
      return new Response(response.body, {status:response.status, statusText:response.statusText, headers:response.headers});
    } catch {
      return Response.json({error:'NAS에 연결할 수 없습니다. NAS 주소·HTTPS·Pages 허용 주소를 확인하세요.'}, {status:503});
    }
  })());
});
