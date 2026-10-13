/* Detect deployed versions, but reload only when the user chooses Update. */
(()=>{
 const version=document.querySelector('meta[name="pn-build"]')?.content;if(!version)return;
 const base=new URL(document.baseURI),originalFetch=window.fetch.bind(window);let writes=0,checking=false,latest=version,reloading=false;
 window.fetch=async(input,options)=>{const method=String(options?.method||(input instanceof Request?input.method:'GET')).toUpperCase(),write=!['GET','HEAD','OPTIONS'].includes(method);if(write)writes++;try{return await originalFetch(input,options)}finally{if(write)writes--}};
 function announce(){window.dispatchEvent(new Event('app-update-ready'))}
 async function apply(){if(reloading||latest===version)return false;try{if(window.prepareAppUpdate&&await window.prepareAppUpdate()===false)throw Error('편집 내용을 저장한 뒤 업데이트를 다시 눌러주세요.');if(writes)throw Error('저장이 진행 중입니다. 잠시 후 다시 눌러주세요.');reloading=true;const target=new URL(location.href);target.searchParams.set('app-update',latest);location.replace(target.href);return true}catch(error){window.dispatchEvent(new CustomEvent('app-update-error',{detail:error.message}));return false}}
 async function check(){if(checking||document.hidden||reloading)return;checking=true;try{const url=new URL('version.json',base);url.searchParams.set('check',String(Date.now()));const response=await originalFetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok){const data=await response.json();if(/^[a-f0-9]{64}$/.test(data.version||'')){latest=data.version;announce()}}}catch{}finally{checking=false}}
 window.appUpdates={get available(){return latest!==version},apply,check};setInterval(check,30000);window.addEventListener('focus',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',check);check();
})();
