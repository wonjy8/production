const COOKIE='__Host-pn-session';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function cookie(request){try{return decodeURIComponent((request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'')}catch{return ''}}
function setCookie(response,value,remember=false){response.headers.append('Set-Cookie',`${COOKIE}=${encodeURIComponent(value||'')}; Path=/; HttpOnly; Secure; SameSite=Strict${!value?'; Max-Age=0':remember?'; Max-Age=604800; Expires='+new Date(Date.now()+604800000).toUTCString():''}`);return response}
function connectionError(env,error){if(error?.name==='SyntaxError')return 'Invalid JSON response';return String(error?.message||'').replaceAll(env.NAS_API_TOKEN||'__no_token__','[redacted]').replaceAll(env.NAS_API_URL||'__no_url__','[endpoint]').replace(/https?:\/\/[^\s]+/g,'[endpoint]').slice(0,200)}
export async function nasAccount(env,path,{method='GET',body,session}={}){
 if(!env.NAS_API_URL||!env.NAS_API_TOKEN)throw Object.assign(Error('NAS configuration missing'),{code:'NAS_CONFIG'});
 let url;try{url=new URL(env.NAS_API_URL)}catch{throw Object.assign(Error('NAS endpoint invalid'),{code:'NAS_CONFIG'})}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Object.assign(Error('Invalid HTTPS endpoint'),{code:'NAS_CONFIG'});
 const response=await fetch(new URL(path,url.origin).href,{method,headers:{Authorization:'Bearer '+env.NAS_API_TOKEN,'Content-Type':'application/json',...(session?{'X-Auth-Session':session}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(response.status>=300&&response.status<400)throw Object.assign(Error('NAS redirect refused'),{code:'NAS_REDIRECT'});
 return response
}

const publicRoutes=new Set(['login','signup','recovery-verify','logout']);
export async function protect(request,env,next){const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/'))return next(request);if(request.method!=='GET'&&request.method!=='HEAD'&&request.headers.get('Origin')!==url.origin)return json({error:'Forbidden'},403);
try{const session=cookie(request),part=path.slice('/api/auth/'.length);
 if(path==='/api/auth/connection'&&request.method==='GET'){const health=await nasAccount(env,'/api/health');if(!health.ok)return json({error:health.status===401?'NAS API 토큰이 일치하지 않습니다':'NAS 서버 응답을 확인하세요',status:health.status},503);const capability=await health.json().catch(()=>({}));const check=await nasAccount(env,'/api/auth/me');return json({nasReachable:true,authenticationInstalled:check.status===401,features:capability.features||{}},check.status===401?200:503)}
 if(path.startsWith('/api/auth/')){
  if(!publicRoutes.has(part)&&!['me','member-status','users','invites','profile','password','account','tab-permissions','reset-tokens','mfa/enroll','mfa/verify'].includes(part)&&!/^users\/[a-f0-9-]{36}$/.test(part))return json({error:'Not found'},404);
  if(!publicRoutes.has(part)&&!session)return json({error:'로그인이 필요합니다'},401);
  let body;if(request.method!=='GET'){const raw=await request.text();if(raw.length>8192)return json({error:'입력값이 너무 큽니다'},413);body=JSON.parse(raw)}
  if(['login','signup','recovery-verify','mfa/verify'].includes(part)){const limit=await nasAccount(env,'/api/auth/attempt',{method:'POST',body:{kind:part,email:body?.email||''},session});if(!limit.ok)return json({error:limit.status===429?'잠시 후 다시 시도하세요':limit.status===401?'NAS API 토큰 또는 로그인 세션을 확인하세요':limit.status===404||limit.status===405?'NAS 인증 서버 업데이트가 필요합니다':'NAS 서버가 응답하지 않습니다. 컨테이너와 역방향 프록시를 확인하세요'},limit.status===429?429:503)}
  const r=await nasAccount(env,path,{method:request.method,session,body});const value=await r.json().catch(()=>({error:'NAS 인증 서버 업데이트가 필요합니다'}));const rawSession=value.session;delete value.session;if(part==='login'&&r.ok&&body?.remember===true)value.rememberSupported=value.rememberSupported===true&&value.remembered===true;
  const response=json(value,r.status);if(rawSession)setCookie(response,rawSession,part==='login'&&body?.remember===true&&value.remembered===true);if(part==='logout'||part==='recovery-verify'&&r.ok||value.loggedOut)setCookie(response,null);return response;
 }
 if(!session)return json({error:'로그인이 필요합니다'},401);
 const me=await nasAccount(env,'/api/auth/me',{session});if(!me.ok)return json({error:'로그인이 필요합니다'},me.status===401?401:503);const actor=await me.json();if(actor.mfaRequired)return json({error:'관리자 2단계 인증이 필요합니다'},403);
 if(path.startsWith('/api/storage')&&!['superadmin','admin'].includes(actor.role))return json({error:'권한이 없습니다'},403);
 if(env.NAS_STORAGE_MODE!=='nas')return json({error:'NAS 저장소 연결이 필요합니다'},503);
 const headers=new Headers(request.headers);for(const name of [...headers.keys()])if(name.startsWith('x-auth-'))headers.delete(name);headers.set('X-Auth-Session',session);return next(new Request(request,{headers}));
}catch(e){console.error('Account request failed',e.name,e.code||'',connectionError(env,e));return json({error:e.code==='NAS_CONFIG'?'앱의 NAS 연결 주소 설정을 확인하세요':e.code==='NAS_REDIRECT'?'NAS 주소가 다른 페이지로 이동합니다. 역방향 프록시를 확인하세요':'NAS 인증 서버 연결을 확인하세요'},503)} }
