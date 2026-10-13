/* Check deployed code without touching API responses or browser workspace data. */
(()=>{
 const version=document.querySelector('meta[name="pn-build"]')?.content;
 if(!version)return;
 const base=new URL(document.baseURI);
 const originalFetch=window.fetch.bind(window);
 let writes=0,checking=false,latest=version,reloading=false;
 window.fetch=async(input,options)=>{
  const method=String(options?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const write=!['GET','HEAD','OPTIONS'].includes(method);
  if(write)writes++;
  try{return await originalFetch(input,options)}finally{if(write)writes--}
 };
 function editing(){
  const focused=[];let node=document.activeElement;
  while(node){if(node.shadowRoot?.querySelector('dialog[open]'))return true;focused.push(node);node=node.shadowRoot?.activeElement}
  return focused.some(el=>el.isContentEditable||el.matches?.('input,textarea,select,[contenteditable="true"],dialog[open]'))||document.querySelector('dialog[open]');
 }
 async function apply(){
  if(reloading||latest===version||document.hidden||writes||window.wordcraftOpenCount||editing())return;
  try{
   if(window.prepareAppUpdate){if(await window.prepareAppUpdate()===false)return}
   if(writes||editing())return;
   reloading=true;
   const target=new URL(location.href);target.searchParams.set('app-update',latest);
   location.replace(target.href);
  }catch{/* Retry after pending data has been saved successfully. */}
 }
 async function check(){
  if(checking||document.hidden||reloading)return;
  checking=true;
  try{
   const url=new URL('version.json',base);url.searchParams.set('check',String(Date.now()));
   const response=await originalFetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(response.ok){const data=await response.json();if(/^[a-f0-9]{64}$/.test(data.version||''))latest=data.version}
   await apply();
  }catch{/* Connectivity problems must not interrupt the current app. */}
  finally{checking=false}
 }
 setInterval(check,30000);
 window.addEventListener('focus',check);
 window.addEventListener('online',check);
 document.addEventListener('visibilitychange',check);
 document.addEventListener('focusout',()=>setTimeout(apply,0));
 check();
})();
