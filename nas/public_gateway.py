"""Same-origin public viewer and cookie login. Never exposes the NAS service token."""
import re,json
from pathlib import Path
from http.cookies import SimpleCookie
from urllib.parse import urlsplit
import httpx
from starlette.responses import Response,JSONResponse
COOKIE='__Host-pn-share'
class PublicGateway:
    def __init__(self,app,token):self.app,self.token=app,token
    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or not scope['path'].startswith('/public/'):return await self.app(scope,receive,send)
        path=scope['path'];method=scope['method'];headers=dict(scope['headers'])
        secure_headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; connect-src 'self'"}
        async def reply(data,status=200):return await JSONResponse(data,status,headers=secure_headers)(scope,receive,send)
        if re.fullmatch(r'/public/share/[A-Za-z0-9_-]{43}',path) and method=='GET':
            return await Response(Path(__file__).with_name('share-view.html').read_text(),media_type='text/html',headers=secure_headers)(scope,receive,send)
        try:
            cookies=SimpleCookie();cookies.load(headers.get(b'cookie',b'').decode());session=cookies[COOKIE].value if COOKIE in cookies else ''
        except Exception:session=''
        if path in ('/public/auth/login','/public/auth/logout') and method=='POST':
            origin=urlsplit(headers.get(b'origin',b'').decode())
            if origin.scheme!='https' or origin.netloc!=headers.get(b'host',b'').decode() or origin.path or origin.query or origin.fragment:return await reply({'error':'HTTPS 공유 페이지에서 요청하세요.'},403)
            raw=bytearray()
            while True:
                message=await receive()
                if message['type']=='http.disconnect':return
                raw.extend(message.get('body',b''))
                if len(raw)>8192:return await reply({'error':'입력값이 너무 큽니다.'},413)
                if not message.get('more_body'):break
            try:
                value=json.loads(raw)
                if not isinstance(value,dict):raise ValueError()
            except (ValueError,UnicodeError):return await reply({'error':'입력값을 확인하세요.'},400)
            part=path[len('/public/auth/'):]
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url='http://nas.internal',headers={'Authorization':'Bearer '+self.token,'X-Auth-Session':session}) as client:
                if part!='logout':
                    limited=await client.post('/api/auth/attempt',json={'kind':part,'email':value.get('email','')})
                    if not limited.is_success:return await reply({'error':'잠시 후 다시 시도하세요.'},limited.status_code)
                result=await client.post('/api/auth/'+part,json=value);data=result.json();new_session=data.pop('session',None) if isinstance(data,dict) else None
                if isinstance(data,dict):data.pop('recoveryCodes',None)
            response=JSONResponse(data,result.status_code,headers=secure_headers)
            if new_session or part=='logout':response.headers.append('Set-Cookie',f'{COOKIE}={new_session or ""}; Path=/; HttpOnly; Secure; SameSite=Lax'+('; Max-Age=0' if part=='logout' else ''))
            return await response(scope,receive,send)
        if method!='GET' or not re.fullmatch(r'/public/shares/[A-Za-z0-9_-]{43}(?:/files/[a-f0-9-]{36})?',path):return await reply({'error':'공유를 찾을 수 없습니다.'},404)
        internal=path.replace('/public/shares/','/api/public-shares/',1)
        # No user-controlled authentication headers are forwarded.
        forwarded=[(k,v) for k,v in scope['headers'] if k.lower() in (b'range',b'if-range')]+[(b'authorization',('Bearer '+self.token).encode()),(b'x-auth-session',session.encode())]
        inner={**scope,'path':internal,'raw_path':internal.encode(),'headers':forwarded}
        async def public_send(message):
            if message['type']=='http.response.start':message['headers']=list(message['headers'])+[(k.lower().encode(),v.encode()) for k,v in secure_headers.items() if k not in ('Content-Security-Policy','X-Frame-Options')]+[(b'x-frame-options',b'SAMEORIGIN')]
            await send(message)
        return await self.app(inner,receive,public_send)
