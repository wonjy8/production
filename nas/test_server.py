import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4
from fastapi.testclient import TestClient


class StorageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        os.environ['DATA_DIR'] = cls.folder.name
        os.environ['NAS_API_TOKEN'] = 'test-' + 'x' * 40
        import sys
        sys.path.insert(0,str(Path(__file__).parent))
        spec = importlib.util.spec_from_file_location('nas_server', Path(__file__).with_name('server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        cls.module = module
        cls.client = TestClient(module.app)
        cls.auth = {'Authorization': 'Bearer ' + os.environ['NAS_API_TOKEN'],'X-Auth-Session':'test-session'}
        with module.database() as conn:
            conn.execute("INSERT INTO app_users VALUES('test-user','test@example.com','test-member','superadmin',1,'now')")
            import hashlib,time
            conn.execute('INSERT INTO local_sessions VALUES(?,?,?,?,?,2)',(hashlib.sha256(b'test-session').hexdigest(),'test-user',int(time.time()),int(time.time())+10000,int(time.time())))

    def test_end_to_end(self):
        client, auth = self.client, self.auth
        self.assertEqual(client.get('/api/data').status_code, 401)
        self.assertEqual(client.get('/api/health', headers=auth).status_code, 200)
        ident = str(uuid4())
        upload = client.put('/api/ref-files/' + ident, headers={**auth, 'Content-Type': 'video/mp4'}, content=b'0123456789')
        self.assertEqual(upload.status_code, 200)
        self.assertEqual(client.put('/api/ref-files/' + ident, headers=auth, content=b'other').status_code, 409)
        self.assertEqual(client.put('/api/ref-files/' + ident, headers={**auth, 'X-Import-Only': '1'}, content=b'0123456789').status_code, 200)
        ranged = client.get('/api/ref-files/' + ident, headers={**auth, 'Range': 'bytes=2-5'})
        self.assertEqual(ranged.status_code, 206)
        self.assertEqual(ranged.content, b'2345')
        ref = {'id': str(uuid4()), 'title': '레퍼런스', 'category': '촬영', 'tags': ['샷'], 'blocks': [{'id': 'b', 'kind': 'video', 'fileId': ident}, {'id': 't', 'kind': 'text', 'text': '메모'}]}
        self.assertEqual(client.put('/api/references/' + ref['id'], headers=auth, json=ref).status_code, 200)
        bad = {**ref, 'blocks': [{'id': 'bad', 'kind': 'image', 'fileId': str(uuid4())}]}
        self.assertEqual(client.put('/api/references/' + ref['id'], headers=auth, json=bad).status_code, 400)
        self.assertEqual(client.get('/api/references', headers=auth).json()[0]['blocks'], ref['blocks'])
        member = {'id': str(uuid4()), 'name': '사용자A', 'contact': 'private'}
        state = {'unknown': {'preserve': True}, 'productions': [{'id': 'g', 'name': '프로덕션', 'tasks': []}], 'members': [member], 'projects': [{'id': 'p', 'title': '촬영', 'productionId': 'g', 'modules': [{'id': 'm', 'type': 'text', 'note': '보존'}], 'tasks': [{'id': 't', 'title': '편집', 'done': False}], 'productionAssets': [{'id': ident, 'mime': 'video/mp4'}]}]}
        self.assertEqual(client.put('/api/data', headers=auth, json=state).status_code, 200)
        self.assertEqual(client.get('/api/data', headers=auth).json(), state)
        stale = client.get('/api/data', headers=auth).headers['etag']
        self.assertEqual(client.put('/api/data', headers={**auth, 'If-Match': '"stale"'}, json=state).status_code, 409)
        self.assertEqual(client.put('/api/data', headers={**auth, 'If-Match': stale}, json=state).status_code, 200)
        self.assertEqual(client.put('/api/data', headers={**auth, 'X-Import-Only': '1'}, json={**state, 'unknown': 2}).status_code, 409)
        place = {'id': str(uuid4()), 'name': '본당', 'address': '서울'}
        self.assertEqual(client.put('/api/database/locations/' + place['id'], headers=auth, json=place).status_code, 200)
        self.assertEqual(client.get('/api/database/locations?q=서울', headers=auth).json(), [place])
        self.assertEqual(client.get('/api/data', headers=auth).json()['locations'], [place])
        owned = {'id': str(uuid4()), 'name': 'FX3', 'category': '카메라 바디', 'ownership': 'personal', 'ownerId': member['id']}
        self.assertEqual(client.put('/api/database/equipment/' + owned['id'], headers=auth, json=owned).status_code, 200)
        self.assertEqual(client.put('/api/database/equipment/' + str(uuid4()), headers=auth, json={**owned, 'ownership': 'rental'}).status_code, 400)
        self.assertEqual(client.put('/api/database/locations/' + place['id'], headers=auth, json={**place, 'deleted': True}).status_code, 200)
        self.assertEqual(client.get('/api/database/locations', headers=auth).json(), [])
        with self.module.database() as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM modules').fetchone()[0], 1)
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM tasks').fetchone()[0], 1)
            self.assertEqual(conn.execute('SELECT deleted FROM locations').fetchone()[0], 1)
            self.assertEqual(conn.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_file_autosave_versions_and_access(self):
        client,auth=self.client,self.auth
        ident=str(uuid4());url='/api/ref-files/'+ident
        original=client.put(url,headers={**auth,'Content-Type':'text/plain'},content=b'original')
        self.assertEqual(original.status_code,200)
        version=client.get(url,headers=auth).headers['etag']
        self.assertEqual(version,'"'+original.json()['sha256']+'"')
        self.assertEqual(client.put(url,headers=auth,content=b'unconditional').status_code,409)
        self.assertEqual(client.put(url,headers={**auth,'If-Match':'"stale"'},content=b'stale').status_code,409)
        changed=client.put(url,headers={**auth,'If-Match':version,'Content-Type':'text/plain'},content=b'edited')
        self.assertEqual(changed.status_code,200)
        self.assertEqual(client.get(url,headers=auth).content,b'edited')
        self.assertEqual(client.put(url,headers={**auth,'If-Match':version},content=b'stale').status_code,409)
        version=client.get(url,headers=auth).headers['etag']
        reference={'id':str(uuid4()),'title':'private document','ownerUserId':'different-user','modules':[{'id':'module','kind':'file','files':[{'id':ident,'kind':'file'}]}],'blocks':[]}
        self.assertEqual(client.put('/api/references/'+reference['id'],headers=auth,json=reference).status_code,200)
        try:
            with self.module.database() as conn:conn.execute("UPDATE app_users SET role='operator' WHERE id='test-user'")
            self.assertEqual(client.put(url,headers={**auth,'If-Match':version},content=b'unauthorized').status_code,403)
            self.assertEqual(client.get(url,headers=auth).content,b'edited') # uploader can still read
            with self.module.database() as conn:conn.execute("UPDATE app_users SET role='viewer' WHERE id='test-user'")
            self.assertEqual(client.put(url,headers={**auth,'If-Match':version},content=b'viewer').status_code,403)
        finally:
            with self.module.database() as conn:conn.execute("UPDATE app_users SET role='superadmin' WHERE id='test-user'")


    def test_reference_trash_retention_restore_permissions_and_shared_files(self):
        from datetime import datetime, timezone, timedelta
        client,auth,module=self.client,self.auth,self.module
        sole,shared=str(uuid4()),str(uuid4())
        for ident in (sole,shared):
            self.assertEqual(client.put('/api/ref-files/'+ident,headers={**auth,'Content-Type':'text/plain'},content=b'trash test').status_code,200)
        records=[]
        for ident in (sole,shared):
            item={'id':str(uuid4()),'title':'trash retention','blocks':[{'id':'block','kind':'file','fileId':ident}],'deleted':False}
            self.assertEqual(client.put('/api/references/'+item['id'],headers=auth,json=item).status_code,200)
            self.assertEqual(client.delete('/api/references/'+item['id'],headers=auth).status_code,409)
            item['deleted']=True
            saved=client.put('/api/references/'+item['id'],headers=auth,json=item).json()
            self.assertIn('deletedAt',saved)
            records.append(saved)
        # A second active reference owns the same physical file.
        other={'id':str(uuid4()),'title':'shared active','blocks':[{'id':'block','kind':'file','fileId':shared}]}
        self.assertEqual(client.put('/api/references/'+other['id'],headers=auth,json=other).status_code,200)
        before=records[0]['deletedAt']
        renamed=client.put('/api/references/'+records[0]['id'],headers=auth,json={**records[0],'title':'renamed in trash'}).json()
        self.assertEqual(renamed['deletedAt'],before)
        restored=client.put('/api/references/'+records[0]['id'],headers=auth,json={**records[0],'deleted':False}).json()
        self.assertNotIn('deletedAt',restored)
        trashed=client.put('/api/references/'+records[0]['id'],headers=auth,json={**restored,'deleted':True}).json()
        with module.database() as conn:
            stamp=(datetime.now(timezone.utc)-timedelta(days=31)).isoformat()
            trashed['deletedAt']=stamp
            conn.execute('UPDATE reference_records SET payload=? WHERE id=?',(json.dumps(trashed),trashed['id']))
        module.purge_reference_trash()
        self.assertEqual(client.delete('/api/references/'+trashed['id'],headers=auth).status_code,404)
        self.assertFalse((module.DATA/'files'/sole).exists())
        try:
            with module.database() as conn:conn.execute("UPDATE app_users SET role='viewer' WHERE id='test-user'")
            self.assertEqual(client.delete('/api/references/'+records[1]['id'],headers=auth).status_code,403)
        finally:
            with module.database() as conn:conn.execute("UPDATE app_users SET role='superadmin' WHERE id='test-user'")
        self.assertEqual(client.delete('/api/references/'+records[1]['id'],headers=auth).status_code,200)
        self.assertTrue((module.DATA/'files'/shared).exists())
        self.assertEqual(client.get('/api/ref-files/'+shared,headers=auth).status_code,200)


if __name__ == '__main__':
    unittest.main()
