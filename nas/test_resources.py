"""Catalog migration, independent file retention, authorization and revision checks."""
import hashlib,json,time,unittest
from uuid import uuid4
import test_server
class ResourceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):test_server.StorageTest.setUpClass.__func__(cls)
    @classmethod
    def tearDownClass(cls):cls.folder.cleanup()
    def upload(self):
        ident=str(uuid4());r=self.client.put('/api/ref-files/'+ident,headers={**self.auth,'Content-Type':'text/plain'},content=b'original bytes');self.assertEqual(r.status_code,200);return ident
    def rows(self,auth=None):
        r=self.client.get('/api/database/resources',headers=auth or self.auth);self.assertEqual(r.status_code,200);return r.json()
    def account(self,role):
        ident=str(uuid4());token=str(uuid4());stamp=int(time.time())
        with self.module.database() as conn:
            conn.execute('INSERT INTO app_users VALUES(?,?,?,?,1,?)',(ident,ident+'@example.com',ident,role,'now'))
            conn.execute('INSERT INTO local_sessions VALUES(?,?,?,?,?,2)',(hashlib.sha256(token.encode()).hexdigest(),ident,stamp,stamp+10000,stamp))
        return ident,{**self.auth,'X-Auth-Session':token}
    def test_legacy_migration_and_independent_metadata(self):
        ident=self.upload();ref={'id':str(uuid4()),'title':'기존 자료','tags':['말씀'],'blocks':[{'id':'f','kind':'file','fileId':ident,'originalName':'기존 노트.txt','mime':'text/plain'}]}
        self.assertEqual(self.client.put('/api/references/'+ref['id'],headers=self.auth,json=ref).status_code,200)
        with self.module.database() as conn:self.assertTrue(conn.execute('SELECT 1 FROM resource_records WHERE id=?',(ident,)).fetchone())
        rows=self.rows();row=next(r for r in rows if r['id']==ident)
        self.assertEqual(row['title'],'기존 노트.txt');self.assertEqual(len(row['origins']),1)
        self.assertEqual(len([r for r in self.rows() if r['id']==ident]),1)
        update={**row,'title':'주일 말씀','properties':{'category':'예배','date':'2026-10-15','speaker':'설교자'},'tags':['말씀']}
        result=self.client.put('/api/database/resources/'+ident,headers={**self.auth,'If-Match':'"'+str(row['version'])+'"'},json=update)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(self.client.put('/api/database/resources/'+ident,headers={**self.auth,'If-Match':'"'+str(row['version'])+'"'},json=update).status_code,409)
        self.assertEqual(self.client.get('/api/ref-files/'+ident,headers=self.auth).content,b'original bytes')
        self.assertEqual(self.client.get('/api/references',headers=self.auth).json()[0]['blocks'],ref['blocks'])
        self.client.put('/api/references/'+ref['id'],headers=self.auth,json={**ref,'deleted':True})
        self.assertEqual(self.client.delete('/api/references/'+ref['id'],headers=self.auth).status_code,200)
        self.assertEqual(self.client.get('/api/ref-files/'+ident,headers=self.auth).status_code,200)
        self.assertTrue(any(r['id']==ident and r['title']=='주일 말씀' for r in self.rows()))
    def test_private_permissions_and_standalone_file_registration(self):
        ident=self.upload();row={'id':ident,'fileId':ident,'title':'비공개 노트','properties':{'category':'QT'},'tags':[]}
        self.assertEqual(self.client.put('/api/database/resources/'+ident,headers={**self.auth,'If-Match':'"0"'},json=row).status_code,200)
        uid,operator=self.account('operator');viewer_id,viewer=self.account('viewer')
        self.assertFalse(any(r['id']==ident for r in self.rows(operator)))
        self.assertEqual(self.client.put('/api/database/resources/'+ident,headers={**operator,'If-Match':'"1"'},json=row).status_code,403)
        self.assertEqual(self.client.put('/api/database/resources/'+str(uuid4()),headers={**viewer,'If-Match':'"0"'},json={'title':'링크','url':'https://example.com','tags':[],'properties':{}}).status_code,403)
        group={'id':'resources-group','name':'공유','memberIds':[uid,viewer_id],'customTabs':[{'id':'notes','name':'말씀','modules':[{'id':'db','kind':'database','files':[{'id':ident,'name':'말씀.txt','kind':'file','mime':'text/plain'}]}]}]}
        workspace={'projects':[],'productions':[group],'members':[]}
        self.assertEqual(self.client.put('/api/data',headers=self.auth,json=workspace).status_code,200)
        self.assertTrue(next(r for r in self.rows(operator) if r['id']==ident)['canEdit'])
        self.assertFalse(next(r for r in self.rows(viewer) if r['id']==ident)['canEdit'])
        with self.module.database() as conn:conn.execute('INSERT INTO tab_permissions VALUES(?,?,?,?)',('resources-group','tab:notes',json.dumps({'operator':{'view':False}}),'test-user'))
        self.assertFalse(any(r['id']==ident for r in self.rows(operator)))
        self.assertEqual(self.client.get('/api/ref-files/'+ident,headers=operator).status_code,403)
    def test_link_dedup_and_input_validation(self):
        workspace={'projects':[],'productions':[{'id':'links','name':'링크','customTabs':[{'id':'t','modules':[{'id':'a','kind':'link','title':'링크 A','url':'https://example.com/말씀'},{'id':'b','kind':'embed','url':'https://example.com/말씀'}]}]}]}
        self.assertEqual(self.client.put('/api/data',headers=self.auth,json=workspace).status_code,200)
        found=[r for r in self.rows() if r.get('url')=='https://example.com/말씀'];self.assertEqual(len(found),1);self.assertEqual(len(found[0]['origins']),2)
        row=found[0];bad={**row,'properties':{'x':['invalid']}}
        self.assertEqual(self.client.put('/api/database/resources/'+row['id'],headers={**self.auth,'If-Match':'"1"'},json=bad).status_code,400)

    def test_legacy_text_snapshot_and_docx_safe_metadata(self):
        ref={'id':str(uuid4()),'title':'옛 노트','blocks':[{'id':'legacy-text','kind':'text','text':'말씀 내용'}]}
        self.assertEqual(self.client.put('/api/references/'+ref['id'],headers=self.auth,json=ref).status_code,200)
        row=next(r for r in self.rows() if r.get('content')=='말씀 내용');ident=row['id']
        ref['blocks'][0]['text']='수정된 말씀';self.client.put('/api/references/'+ref['id'],headers=self.auth,json=ref)
        updated=next(r for r in self.rows() if r['id']==ident);self.assertEqual(updated['content'],'수정된 말씀');self.assertGreater(updated['version'],row['version'])
        self.client.put('/api/references/'+ref['id'],headers=self.auth,json={**ref,'deleted':True})
        self.client.delete('/api/references/'+ref['id'],headers=self.auth)
        self.assertEqual(next(r for r in self.rows() if r['id']==ident)['content'],'수정된 말씀')
