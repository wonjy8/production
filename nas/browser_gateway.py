"""Browser-only gateway. The service token never leaves the NAS process."""
import json
import re
from http.cookies import SimpleCookie
from urllib.parse import urlsplit

import httpx
from starlette.responses import JSONResponse, Response

COOKIE = '__Host-pn-pages'
PUBLIC = {'login', 'signup', 'logout', 'recovery-verify'}
AUTH = PUBLIC | {'me', 'member-status', 'users', 'invites', 'profile', 'password', 'account',
                 'tab-permissions', 'reset-tokens', 'mfa/enroll', 'mfa/verify'}
HEADERS = {'content-type', 'range', 'if-range', 'if-match', 'x-scope-owner', 'x-scope-tab'}


class BrowserGateway:
    def __init__(self, app, token, origins):
        self.app, self.token = app, token
        self.origins = set(filter(None, (v.strip() for v in origins.split(','))))
        for origin in self.origins:
            u = urlsplit(origin)
            if u.scheme != 'https' or not u.netloc or u.username or u.password or u.path or u.query or u.fragment:
                raise RuntimeError('PAGES_ORIGINS must contain exact HTTPS origins, without paths')

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope['path'].startswith('/browser/'):
            return await self.app(scope, receive, send)
        headers = dict(scope['headers'])
        origin = headers.get(b'origin', b'').decode()
        path = scope['path'][len('/browser'):]
        method = scope['method']
        async def cors_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = list(message['headers']) + [
                    (b'access-control-allow-origin', origin.encode()),
                    (b'access-control-allow-credentials', b'true'),
                    (b'access-control-expose-headers', b'ETag, X-Workspace-Revision, Content-Range, Content-Disposition, X-File-SHA256, X-Thumbnail'),
                    (b'vary', b'Origin'), (b'cache-control', b'no-store'),
                    (b'x-content-type-options', b'nosniff')]
            await send(message)
        async def reply(data, status=200):
            await JSONResponse(data, status)(scope, receive, cors_send)
        # All calls originate in the Pages service worker, including media requests.
        if not self.origins or origin not in self.origins:
            return await JSONResponse({'error': 'Origin not allowed'}, 403)(scope, receive, send)
        if method == 'OPTIONS':
            requested = {v.strip().lower() for v in headers.get(b'access-control-request-headers', b'').decode().split(',') if v.strip()}
            if not requested <= HEADERS or headers.get(b'access-control-request-method', b'').decode() not in {'GET', 'HEAD', 'POST', 'PUT', 'DELETE'}:
                return await reply({'error': 'Preflight not allowed'}, 403)
            return await Response(status_code=204, headers={
                'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE',
                'Access-Control-Allow-Headers': ', '.join(sorted(HEADERS)),
            })(scope, receive, cors_send)
        if not path.startswith('/api/'):
            return await reply({'error': 'Not found'}, 404)
        cookies = SimpleCookie()
        try:
            cookies.load(headers.get(b'cookie', b'').decode())
            session = cookies[COOKIE].value if COOKIE in cookies else ''
        except Exception:
            session = ''
        internal_headers = {'Authorization': 'Bearer ' + self.token, 'X-Auth-Session': session}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://nas.internal', headers=internal_headers) as client:
            if path == '/api/auth/connection' and method == 'GET':
                return await reply({'nasReachable': True, 'authenticationInstalled': True, 'features': {'archiveScopes': 1}})
            if path.startswith('/api/auth/'):
                part = path[len('/api/auth/'):]
                if part not in AUTH and not re.fullmatch(r'users/[a-f0-9-]{36}', part):
                    return await reply({'error': 'Not found'}, 404)
                if part not in PUBLIC and not session:
                    return await reply({'error': '로그인이 필요합니다'}, 401)
                body = bytearray()
                while True:
                    message = await receive()
                    if message['type'] == 'http.disconnect':
                        return
                    body.extend(message.get('body', b''))
                    if len(body) > 8192:
                        return await reply({'error': '입력값이 너무 큽니다'}, 413)
                    if not message.get('more_body'):
                        break
                try:
                    value = json.loads(body) if body else {}
                    if not isinstance(value, dict):
                        raise ValueError()
                except (ValueError, UnicodeError):
                    return await reply({'error': 'Invalid JSON'}, 400)
                if part in {'login', 'signup', 'recovery-verify', 'mfa/verify'}:
                    limited = await client.post('/api/auth/attempt', json={'kind': part, 'email': value.get('email', '')})
                    if not limited.is_success:
                        return await reply(limited.json(), limited.status_code)
                result = await client.request(method, path, content=bytes(body), headers={'Content-Type': 'application/json'})
                data = result.json()
                raw_session = data.pop('session', None) if isinstance(data, dict) else None
                metadata = data if isinstance(data, dict) else {}
                response = JSONResponse(data, result.status_code)
                clear = part == 'logout' or (part == 'recovery-verify' and result.is_success) or metadata.get('loggedOut')
                if raw_session or clear:
                    cookie = f'{COOKIE}={"" if clear else raw_session}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned'
                    if clear:
                        cookie += '; Max-Age=0'
                    elif part == 'login' and value.get('remember') is True and metadata.get('remembered') is True:
                        cookie += '; Max-Age=604800'
                    response.headers.append('Set-Cookie', cookie)
                return await response(scope, receive, cors_send)
            if not session:
                return await reply({'error': '로그인이 필요합니다'}, 401)
            me = await client.get('/api/auth/me')
            if not me.is_success:
                return await reply({'error': '로그인이 필요합니다'}, me.status_code)
            actor = me.json()
            if actor.get('mfaRequired'):
                return await reply({'error': '관리자 2단계 인증이 필요합니다'}, 403)
            if path in {'/api/storage', '/api/storage/check'} and method == 'GET':
                if actor.get('role') not in {'superadmin', 'admin'}:
                    return await reply({'error': '권한이 없습니다'}, 403)
                return await reply({'mode': 'nas', 'configured': True, 'ok': True})
            if path == '/api/youtube-meta' and method == 'GET':
                from urllib.parse import parse_qs
                ident = parse_qs(scope.get('query_string', b'').decode()).get('id', [''])[0]
                if not re.fullmatch(r'[\w-]{11}', ident, flags=re.ASCII):
                    return await reply({'error': 'Invalid video ID'}, 400)
                title = ''
                try:
                    async with httpx.AsyncClient(timeout=8, follow_redirects=False) as external:
                        result = await external.get('https://www.youtube.com/oembed', params={'format': 'json', 'url': 'https://www.youtube.com/watch?v=' + ident})
                        if result.is_success:
                            title = str(result.json().get('title', ''))[:500]
                except (httpx.HTTPError, ValueError):
                    pass
                return await reply({'id': ident, 'title': title, 'thumbnail': f'https://i.ytimg.com/vi/{ident}/hqdefault.jpg'})
            if not (path in {'/api/data', '/api/references'} or re.fullmatch(r'/api/(references|ref-files)/[a-f0-9-]{36}', path) or re.fullmatch(r'/api/database/[a-z-]+(?:/[a-f0-9-]{36})?', path)):
                return await reply({'error': 'Not found'}, 404)
        # Stream uploads/downloads without buffering files. Never trust browser X-Auth-*.
        forwarded = [(k, v) for k, v in scope['headers'] if k.decode().lower() in HEADERS]
        forwarded += [(b'authorization', ('Bearer ' + self.token).encode()), (b'x-auth-session', session.encode())]
        inner_scope = {**scope, 'path': path, 'raw_path': path.encode(), 'headers': forwarded}
        async def storage_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = list(message['headers'])
                if path == '/api/data':
                    etag = next((v for k, v in message['headers'] if k.lower() == b'etag'), None)
                    if etag:
                        message['headers'].append((b'x-workspace-revision', etag))
            await cors_send(message)
        await self.app(inner_scope, receive, storage_send)
