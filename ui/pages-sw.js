/* API bridge keeps media, canvas and downloads same-origin on GitHub Pages.
 * Authentication is an HttpOnly, Secure, partitioned cookie at the NAS.
 * No API responses or private files are cached by this worker. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Only the connection origin is persisted, never API data, sessions or files.
function connection(value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('production-connection:'+self.registration.scope, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('settings');
    open.onerror = () => reject(Error('브라우저 연결 설정 저장소를 열 수 없습니다.'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('settings', value === undefined ? 'readonly' : 'readwrite');
      const request = value === undefined ? tx.objectStore('settings').get('origin') : tx.objectStore('settings').put(value, 'origin');
      let result;
      request.onsuccess = () => { result = value === undefined ? request.result : value; };
      tx.oncomplete = () => { db.close(); resolve(result || ''); };
      tx.onerror = tx.onabort = () => { db.close(); reject(Error('브라우저 연결 설정을 저장하지 못했습니다.')); };
    };
  });
}
self.addEventListener('message', event => {
  if (!event.source?.url?.startsWith(self.registration.scope) || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      let value;
      if (event.data?.type === 'connection:get') value = await connection();
      else if (event.data?.type === 'connection:set') {
        const url = new URL(event.data.value);
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('올바른 HTTPS 서버 주소가 필요합니다.');
        value = await connection(url.origin);
      } else throw Error('Unknown connection request');
      event.ports[0].postMessage({value});
    } catch(error) { event.ports[0].postMessage({error:error.message}); }
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const prefix = new URL('api/', self.registration.scope);
  if (url.origin !== prefix.origin || !url.pathname.startsWith(prefix.pathname)) return;
  event.respondWith((async () => {
    const headers = new Headers();
    for (const name of ['Content-Type', 'Range', 'If-Range', 'If-Match', 'X-Scope-Owner', 'X-Scope-Tab']) {
      if (event.request.headers.has(name)) headers.set(name, event.request.headers.get(name));
    }
    try {
      const origin = await connection();
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
