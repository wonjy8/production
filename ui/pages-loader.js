const status = document.querySelector('#status');
const form = document.querySelector('#connection-form');
const input = form.elements.endpoint;

function workerMessage(type, value) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(Error('연결 설정을 읽지 못했습니다. 새로고침해 주세요.')); }, 10000);
    channel.port1.onmessage = ({data}) => {
      clearTimeout(timer); channel.port1.close();
      if (data.error) reject(Error(data.error)); else resolve(data.value);
    };
    navigator.serviceWorker.controller.postMessage({type, value}, [channel.port2]);
  });
}

try {
  if (!('serviceWorker' in navigator)) throw Error('서비스 워커를 지원하는 브라우저로 열어주세요.');
  await navigator.serviceWorker.register('./pages-sw.js', {scope:'./', updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
  // Wait for the runtime-configurable worker when upgrading an older deployment.
  const current = await workerMessage('connection:get');
  if (!current || new URL(location.href).searchParams.get('connection') === '1') {
    form.hidden = false; input.value = current || ''; status.textContent = '';
    form.onsubmit = async event => {
      event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
      try {
        const url = new URL(input.value.trim());
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('경로 없이 HTTPS 서버 주소만 입력하세요.');
        status.textContent = '서버 연결 확인 중…';
        const response = await fetch(url.origin+'/browser/api/auth/connection', {credentials:'omit', mode:'cors', redirect:'error', cache:'no-store', signal:AbortSignal.timeout(15000)});
        const data = await response.json();
        if (!response.ok || data.nasReachable !== true || data.authenticationInstalled !== true) throw Error('NAS 앱 업데이트와 허용 주소 설정을 확인하세요.');
        await workerMessage('connection:set', url.origin);
        const target = new URL(location.href); target.searchParams.delete('connection'); location.replace(target.href);
      } catch (error) {
        status.textContent = error instanceof TypeError ? '연결할 수 없습니다. 서버 주소·HTTPS·NAS의 Pages 허용 주소를 확인하세요.' : error.message;
        button.disabled = false;
      }
    };
  } else {
    const response = await fetch('./app.html', {cache:'no-store'});
    if (!response.ok) throw Error('앱을 불러오지 못했습니다. 새로고침해 주세요.');
    const html = await response.text(); document.open(); document.write(html); document.close();
  }
} catch (error) { status.textContent = error.message; }
