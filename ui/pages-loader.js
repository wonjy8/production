import './pages-route.js';
const status=document.querySelector('#status');
const base=new URL(document.querySelector('meta[name="pn-base"]').content,location.origin);
function workerMessage(type){
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel();
  const timer=setTimeout(()=>{channel.port1.close();reject(Error('앱 연결을 준비하지 못했습니다. 다시 시도해 주세요.'))},10000);
  channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();if(data.error)reject(Error(data.error));else resolve(data.value)};
  navigator.serviceWorker.controller.postMessage({type},[channel.port2]);
 });
}
let phase='앱 준비',nasOrigin='';
try{
 globalThis.productionConnectionFromURL(location.href,base.href);
 if(!('serviceWorker' in navigator))throw Error('서비스 워커를 지원하는 브라우저로 열어주세요.');
 const registration=await navigator.serviceWorker.register(new URL('pages-sw.js',base),{scope:base.pathname,updateViaCache:'none'});
 const installing=registration.installing||registration.waiting;
 if(installing&&installing.state!=='activated')await new Promise((resolve,reject)=>{const changed=()=>{if(installing.state==='activated')resolve();else if(installing.state==='redundant')reject(Error('앱 업데이트를 준비하지 못했습니다.'))};installing.addEventListener('statechange',changed);changed()});
 await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
 // Confirm that the controller understands URL-selected, per-tab routing.
 const mode=await workerMessage('route:ready');
 if(mode!=='local'){
  phase='NAS 연결';nasOrigin=mode;status.textContent='NAS에 자동 연결하는 중…';
  const response=await fetch(mode+'/browser/api/auth/connection',{credentials:'omit',mode:'cors',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(response.status===401||response.status===403){phase='로그인 연결';throw Error('NAS 접근이 거부되었습니다. 앱 허용 주소와 로그인 서비스 설정을 확인하세요.')}if(data.authenticationInstalled!==true){phase='로그인 준비';throw Error('NAS 로그인 서비스를 확인하지 못했습니다. 서버 업데이트와 인증 설정을 확인하세요.')}if(!response.ok||data.nasReachable!==true)throw Error('NAS 실행 상태와 HTTPS·앱 허용 주소 설정을 확인하세요.');
 }
 phase='앱 화면';
 const response=await fetch(new URL('app.html?build='+Date.now(),base),{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('앱을 불러오지 못했습니다. 다시 시도해 주세요.');
 const html=await response.text();document.open();document.write(html);document.close();
 }catch(error){status.textContent=phase+'에 실패했습니다.';document.querySelector('#boot-reason').textContent=!navigator.onLine?'인터넷 연결을 확인하세요.':error instanceof TypeError?(phase==='NAS 연결'?'NAS가 실행 중인지, HTTPS 인증서와 앱 허용 주소가 올바른지 확인하세요.':'앱 배포와 인터넷 연결을 확인하세요.'):error.message;document.querySelector('#boot-help').hidden=false}
document.querySelector('#retry')?.addEventListener('click',()=>location.reload());
document.querySelector('#connection-check')?.addEventListener('click',async()=>{const reason=document.querySelector('#boot-reason');if(!nasOrigin){reason.textContent=navigator.onLine?'인터넷에 연결되어 있습니다. 다시 시도하거나 웹에서 열기를 선택하세요.':'인터넷 연결을 확인하세요.';return}reason.textContent='NAS 연결 확인 중…';try{const r=await fetch(nasOrigin+'/browser/api/auth/connection',{credentials:'omit',mode:'cors',cache:'no-store',signal:AbortSignal.timeout(10000)}),data=await r.json();reason.textContent=r.ok&&data.nasReachable&&data.authenticationInstalled?'NAS에 연결되었습니다. 다시 시도하여 로그인 화면을 여세요.':'NAS의 로그인 서비스와 앱 허용 주소 설정을 확인하세요.'}catch{reason.textContent='NAS에 연결할 수 없습니다. 서버 실행 상태와 HTTPS 설정을 확인하세요.'}});
