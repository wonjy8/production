import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from browser_gateway import BrowserGateway
from local_auth import bootstrap_admin


class BrowserTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'ADMIN_EMAIL': 'admin@example.com', 'ADMIN_NAME': 'Example Administrator', 'DATA_DIR': self.folder.name, 'NAS_API_TOKEN': 'test-' + 'x'*40, 'PAGES_ORIGINS': 'https://example.github.io'})
        self.env.start()
        spec = importlib.util.spec_from_file_location('browser_test_server', Path(__file__).with_name('server.py'))
        self.server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.server)
        self.client = TestClient(self.server.app, base_url='https://nas.example.com', headers={'Origin': 'https://example.github.io'})
        bootstrap_admin(self.server.database, self.server.write_lock, self.server.save_workspace, self.server.now, 'StrongPassword2026!')

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.folder.cleanup()

    def login(self, remember=False):
        return self.client.post('/browser/api/auth/login', json={'email':'admin@example.com', 'password':'StrongPassword2026!', 'remember':remember})

    def test_login_storage_files_and_logout(self):
        response = self.login(True)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('session', response.json())
        cookie = response.headers['set-cookie']
        for flag in ['HttpOnly', 'Secure', 'SameSite=None', 'Partitioned', 'Max-Age=604800']:
            self.assertIn(flag, cookie)
        self.assertEqual(response.headers['access-control-allow-origin'], 'https://example.github.io')
        self.assertEqual(self.client.get('/browser/api/auth/me').status_code, 200)
        users = self.client.get('/browser/api/auth/users')
        self.assertEqual(users.status_code, 200)
        self.assertIsInstance(users.json(), list)
        r = self.client.get('/browser/api/data')
        self.assertEqual(r.status_code, 200)
        # Existing NAS optimistic concurrency semantics survive the bridge.
        self.assertEqual(r.headers['x-workspace-revision'], r.headers['etag'])
        saved = self.client.put('/browser/api/data', json=r.json(), headers={'If-Match':r.headers['etag']})
        self.assertEqual(saved.status_code, 200)
        ident = str(uuid4())
        self.assertEqual(self.client.put('/browser/api/ref-files/'+ident, content=b'0123456789', headers={'Content-Type':'video/mp4'}).status_code, 200)
        r = self.client.get('/browser/api/ref-files/'+ident, headers={'Range':'bytes=2-5'})
        self.assertEqual(r.status_code, 206)
        self.assertEqual(r.content, b'2345')
        self.assertEqual(self.client.post('/browser/api/auth/logout', json={}).status_code, 200)
        self.assertEqual(self.client.get('/browser/api/data').status_code, 401)
        self.assertEqual(self.client.get('/api/data').status_code, 401)

    def test_origins_preflight_and_spoofing(self):
        self.assertEqual(self.client.get('/browser/api/data', headers={'X-Auth-Session':'forged', 'Authorization':'Bearer '+os.environ['NAS_API_TOKEN']}).status_code, 401)
        for origin in ['https://evil.example', 'null', '']:
            self.assertEqual(self.client.post('/browser/api/auth/login', json={}, headers={'Origin':origin}).status_code, 403)
        response = self.client.options('/browser/api/data', headers={'Access-Control-Request-Method':'PUT', 'Access-Control-Request-Headers':'content-type,if-match'})
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.options('/browser/api/data', headers={'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'x-auth-session'}).status_code, 403)
        self.login()
        self.assertEqual(self.client.post('/browser/api/storage/copy', json={}).status_code, 404)
        self.assertEqual(self.client.post('/browser/api/auth/attempt', json={}).status_code, 404)
        self.assertEqual(self.client.post('/browser/api/auth/login', content='x'*8193).status_code, 413)
        self.assertEqual(self.client.post('/browser/api/auth/login', content='[]').status_code, 400)

    def test_login_rate_limit(self):
        # Seed the existing NAS limiter, then verify the public gateway cannot skip it.
        email = 'admin@example.com'
        key = hashlib.sha256(('login:'+email).encode()).hexdigest()
        with self.server.database() as conn:
            conn.execute('INSERT INTO auth_attempts VALUES(?,?,?)', (key, int(time.time()), 15))
        self.assertEqual(self.login().status_code, 429)

    def test_disabled_by_default(self):
        app = BrowserGateway(self.server.app.app, os.environ['NAS_API_TOKEN'], '')
        with TestClient(app) as client:
            self.assertEqual(client.get('/browser/api/auth/connection', headers={'Origin':'https://example.github.io'}).status_code, 403)
        with self.assertRaises(RuntimeError):
            BrowserGateway(app, 'test', 'https://example.github.io/production/')

    def test_viewer_and_expired_session(self):
        self.login()
        with self.server.database() as conn:
            conn.execute("UPDATE app_users SET role='viewer'")
        self.assertEqual(self.client.get('/browser/api/storage').status_code, 403)
        self.assertEqual(self.client.get('/browser/api/auth/users').status_code, 403)
        with self.server.database() as conn:
            conn.execute('UPDATE local_sessions SET expires_at=0')
        self.assertEqual(self.client.get('/browser/api/data').status_code, 401)

    def test_existing_login_without_bootstrap_settings(self):
        with patch.dict(os.environ, {'ADMIN_EMAIL':'', 'ADMIN_NAME':'', 'ADMIN_MEMBER_ID':''}):
            self.assertEqual(self.login().status_code, 200)
            self.assertEqual(self.client.get('/browser/api/auth/me').status_code, 200)

    def test_offline_reset_uses_database_identity(self):
        import importlib.util
        import sys
        from local_auth import verify_password
        spec = importlib.util.spec_from_file_location('bootstrap_reset_test', Path(__file__).with_name('setup_admin.py'))
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'server': self.server}):
            spec.loader.exec_module(module)
        with patch.dict(os.environ, {'ADMIN_EMAIL':'', 'ADMIN_NAME':''}), patch.object(sys, 'argv', ['setup_admin.py','--reset-password']), patch.object(module.getpass, 'getpass', return_value='ChangedPassword2026!'):
            module.main()
        with self.server.database() as conn:
            row=conn.execute('SELECT c.password_hash FROM local_credentials c JOIN app_bootstrap b ON b.user_id=c.user_id').fetchone()
        self.assertTrue(verify_password(row[0], 'ChangedPassword2026!'))
