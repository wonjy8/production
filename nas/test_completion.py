"""Authoritative lifecycle, independent bytes, read-only guards and rollback."""
import copy,json,unittest
from uuid import uuid4
import test_server

class CompletionTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):test_server.StorageTest.setUpClass.__func__(cls)
 @classmethod
 def tearDownClass(cls):cls.folder.cleanup()
 def state(self):return self.client.get('/api/data',headers=self.auth).json()
 def put(self,data):return self.client.put('/api/data',headers=self.auth,json=data)
 def fixture(self):
  ident=str(uuid4());a=str(uuid4());b=str(uuid4())
  for owner in [a,b]:
   w=self.state();w.setdefault('projects',[]);w.setdefault('members',[]);w.setdefault('productions',[]).append({'id':owner,'name':owner,'status':'진행 중','tasks':[],'customTabs':[]});self.assertEqual(self.put(w).status_code,200)
  response=self.client.put('/api/ref-files/'+ident+'?name=original.txt',headers={**self.auth,'Content-Type':'text/plain','X-Scope-Owner':a,'X-Scope-Tab':'materials'},content=b'original')
  self.assertEqual(response.status_code,200)
  w=self.state()
  for p in w['productions']:
   if p['id'] in [a,b]:p['customTabs']=[{'id':'t','name':'files','modules':[{'id':'file-module','kind':'file','files':[{'id':ident,'name':'original.txt','kind':'file','mime':'text/plain'}]},{'id':'external','kind':'link','url':'https://example.com','title':'website'}]}]
  self.assertEqual(self.put(w).status_code,200)
  return ident,a,b
 def test_complete_copy_lock_resume_and_original_independence(self):
  ident,a,b=self.fixture();w=self.state();next(p for p in w['productions'] if p['id']==a)['status']='완료'
  response=self.put(w);self.assertEqual(response.status_code,200,response.text);self.assertIn('workspace',response.json())
  w=self.state();owner=next(p for p in w['productions'] if p['id']==a);frozen=owner['customTabs'][0]['modules'][0]['files'][0]['id'];self.assertNotEqual(frozen,ident)
  self.assertEqual(next(p for p in w['productions'] if p['id']==b)['customTabs'][0]['modules'][0]['files'][0]['id'],ident)
  resources=self.client.get('/api/database/resources',headers=self.auth).json();row=next(r for r in resources if r['id']==frozen);self.assertEqual(row['completionOwner']['id'],a);self.assertFalse(row['canEdit'])
  old=self.client.get('/api/ref-files/'+ident,headers=self.auth)
  self.assertEqual(self.client.put('/api/ref-files/'+ident,headers={**self.auth,'If-Match':old.headers['etag']},content=b'changed').status_code,200)
  self.assertEqual(self.client.get('/api/ref-files/'+frozen,headers=self.auth).content,b'original')
  tag=self.client.get('/api/ref-files/'+frozen,headers=self.auth).headers['etag']
  self.assertEqual(self.client.put('/api/ref-files/'+frozen,headers={**self.auth,'If-Match':tag},content=b'bad').status_code,403)
  self.assertEqual(self.client.put('/api/database/resources/'+frozen,headers={**self.auth,'If-Match':'"'+str(row['version'])+'"'},json={**row,'title':'bad'}).status_code,403)
  bad=copy.deepcopy(w);next(p for p in bad['productions'] if p['id']==a)['tasks']=[{'id':'new','title':'blocked'}];self.assertEqual(self.put(bad).status_code,409)
  next(p for p in w['productions'] if p['id']==a)['status']='진행 중';self.assertEqual(self.put(w).status_code,200)
  reopened=next(p for p in self.state()['productions'] if p['id']==a);self.assertNotIn('completion',reopened);self.assertEqual(reopened['customTabs'][0]['modules'][0]['files'][0]['id'],frozen)
  self.assertEqual(self.client.put('/api/ref-files/'+frozen,headers={**self.auth,'If-Match':tag},content=b'reopened').status_code,200)
  self.assertEqual(self.client.get('/api/ref-files/'+ident,headers=self.auth).content,b'changed')
 def test_missing_file_rolls_back_status_and_every_copy(self):
  ident,a,b=self.fixture();w=self.state();owner=next(p for p in w['productions'] if p['id']==a);missing=str(uuid4());owner['customTabs'][0]['modules'][0]['files'].append({'id':missing,'kind':'file','name':'missing.txt','mime':'text/plain'});self.assertEqual(self.put(w).status_code,200)
  with self.module.database() as conn:before={r[0] for r in conn.execute('SELECT id FROM files')}
  owner['status']='완료';self.assertEqual(self.put(w).status_code,409)
  self.assertEqual(next(p for p in self.state()['productions'] if p['id']==a)['status'],'진행 중')
  with self.module.database() as conn:self.assertEqual(before,{r[0] for r in conn.execute('SELECT id FROM files')})
  self.assertEqual({p.name for p in (self.module.DATA/'files').iterdir()},before)
 def test_locked_child_and_invalid_workspace_rollback(self):
  ident,a,b=self.fixture();w=self.state();child={'id':str(uuid4()),'title':'child','productionId':a,'tasks':[]};w['projects'].append(child);self.assertEqual(self.put(w).status_code,200)
  next(p for p in w['productions'] if p['id']==a)['status']='완료';self.assertEqual(self.put(w).status_code,200)
  w=self.state();next(p for p in w['projects'] if p['id']==child['id'])['title']='bad';self.assertEqual(self.put(w).status_code,409)
  w=self.state();w['projects'].append({'id':str(uuid4()),'title':'new child','productionId':a});self.assertEqual(self.put(w).status_code,409)

 def test_child_completed_first_stays_frozen_after_parent_resume(self):
  ident,a,b=self.fixture();child_id=str(uuid4());w=self.state();w['projects'].append({'id':child_id,'title':'completed child','productionId':a,'status':'진행 중','tasks':[],'customTabs':[{'id':'child-tab','modules':[{'id':'child-files','kind':'file','files':[{'id':ident,'kind':'file','name':'original.txt','mime':'text/plain'}]}]}]});self.assertEqual(self.put(w).status_code,200)
  w=self.state();next(p for p in w['projects'] if p['id']==child_id)['status']='완료';self.assertEqual(self.put(w).status_code,200)
  w=self.state();child=next(p for p in w['projects'] if p['id']==child_id);child_copy=child['customTabs'][0]['modules'][0]['files'][0]['id'];next(p for p in w['productions'] if p['id']==a)['status']='완료';self.assertEqual(self.put(w).status_code,200)
  w=self.state();bad=copy.deepcopy(w);next(p for p in bad['projects'] if p['id']==child_id)['status']='진행 중';self.assertEqual(self.put(bad).status_code,409)
  next(p for p in w['productions'] if p['id']==a)['status']='진행 중';self.assertEqual(self.put(w).status_code,200)
  child=next(p for p in self.state()['projects'] if p['id']==child_id);self.assertEqual(child['status'],'완료');self.assertEqual(child['customTabs'][0]['modules'][0]['files'][0]['id'],child_copy)
  row=next(r for r in self.client.get('/api/database/resources',headers=self.auth).json() if r['id']==child_copy);self.assertFalse(row['canEdit']);self.assertEqual(row['completionOwner']['id'],child_id)
 def test_legacy_completion_prepare_and_metadata_preservation(self):
  ident,a,b=self.fixture()
  # Simulate a pre-upgrade completed project without pretending a snapshot already exists.
  with self.module.database() as conn:
   w=json.loads(conn.execute('SELECT payload FROM workspace').fetchone()[0]);p=next(p for p in w['productions'] if p['id']==a);p['status']='완료';self.module.save_workspace(conn,w)
  w=self.state();p=next(p for p in w['productions'] if p['id']==a);p['completionRequested']=True;response=self.put(w);self.assertEqual(response.status_code,200,response.text)
  w=self.state();p=next(p for p in w['productions'] if p['id']==a);self.assertIn('completion',p);self.assertNotIn('completionRequested',p)
  url_id=p['customTabs'][0]['modules'][1]['resourceId'];rows=self.client.get('/api/database/resources',headers=self.auth).json();url=next(r for r in rows if r['id']==url_id);self.assertEqual(url['url'],'https://example.com');self.assertFalse(url['canEdit'])
  bad=copy.deepcopy(w);next(p for p in bad['productions'] if p['id']==a)['completion']={};self.assertEqual(self.put(bad).status_code,409)
