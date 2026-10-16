"""Public sharing: selection, identities, live content, completion, revocation and transport."""
import copy,json,time,hashlib,unittest
from uuid import uuid4
import test_server
from local_auth import hash_password
class SharingTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):test_server.StorageTest.setUpClass.__func__(cls)
 @classmethod
 def tearDownClass(cls):cls.folder.cleanup()
 def state(self):return self.client.get('/api/data',headers=self.auth).json()
 def put(self,w):
  r=self.client.put('/api/data',headers=self.auth,json=w);self.assertEqual(r.status_code,200,r.text);return r
 def fixture(self):
  a,b,f,g=[str(uuid4()) for _ in range(4)]
  for ident,body in [(f,b'public original'),(g,b'secret original')]:self.assertEqual(self.client.put('/api/ref-files/'+ident+'?name=note.txt',headers={**self.auth,'Content-Type':'text/plain'},content=body).status_code,200)
  w=self.state();w.setdefault('productions',[]).extend([{'id':a,'name':'shared project','status':'진행 중','tasks':[],'customTabs':[{'id':'visible','name':'selected','modules':[{'id':'text','kind':'text','text':'public text','sourceMetadata':{'secret':'never leak'}},{'id':'files','kind':'file','files':[{'id':f,'kind':'file','name':'note.txt','mime':'text/plain'}]}]},{'id':'private','name':'private','modules':[{'id':'private-file','kind':'file','files':[{'id':g,'kind':'file','name':'secret.txt','mime':'text/plain'}]}]}]},{'id':b,'name':'other project','status':'진행 중','customTabs':[{'id':'other','modules':[{'id':'other-files','kind':'file','files':[{'id':f,'kind':'file','name':'note.txt','mime':'text/plain'}]}]}]}]);self.put(w)
  return a,b,f,g
 def create(self,a,selectors=None,**options):
  data={'ownerKind':'production','ownerId':a,'selectors':selectors or [{'kind':'tab','id':'visible'}],'audience':'anyone','allowDownload':True,**options}
  r=self.client.post('/api/shares',headers=self.auth,json=data);self.assertEqual(r.status_code,200,r.text);return r.json()
 def read(self,s,**kwargs):return self.client.get('/public/shares/'+s['token'],**kwargs)
 def test_column_shells_do_not_become_empty_shared_cards(self):
  a,b,f,g=self.fixture();w=self.state();tab=next(p for p in w['productions'] if p['id']==a)['customTabs'][0]
  tab['modules'].insert(0,{'id':'columns','kind':'columns','title':'2단 열','columnSlots':['left','right']})
  tab['modules'][1]['parentSlot']='left';tab['modules'][2]['parentSlot']='right';self.put(w)
  share=self.create(a);r=self.read(share);self.assertEqual(r.status_code,200,r.text)
  self.assertEqual(len(r.json()['items']),2);self.assertNotIn('2단 열',r.text);self.assertIn('public text',r.text)
 def test_selected_tab_live_content_and_download_revocation(self):
  a,b,f,g=self.fixture();share=self.create(a);r=self.read(share);self.assertEqual(r.status_code,200,r.text);self.assertNotIn('secret',r.text);self.assertNotIn('sourceMetadata',r.text);self.assertEqual(len(r.json()['items']),2)
  self.assertEqual(self.client.get('/public/shares/'+share['token']+'/files/'+g).status_code,404)
  self.assertEqual(self.client.get('/public/shares/'+share['token']+'/files/'+f+'?download=1').content,b'public original')
  w=self.state();next(p for p in w['productions'] if p['id']==a)['customTabs'][0]['modules'].append({'id':'new','kind':'text','text':'added later'});self.put(w);self.assertIn('added later',self.read(share).text)
  raw=self.client.get('/api/ref-files/'+f,headers=self.auth);self.assertEqual(self.client.put('/api/ref-files/'+f,headers={**self.auth,'If-Match':raw.headers['etag'],'Content-Type':'text/plain'},content=b'new version').status_code,200)
  self.assertEqual(self.client.get('/public/shares/'+share['token']+'/files/'+f+'?download=1').content,b'new version')
  changed=self.client.put('/api/shares/'+share['id'],headers={**self.auth,'If-Match':'"1"'},json={**share,'allowDownload':False});self.assertEqual(changed.status_code,200,changed.text)
  self.assertEqual(self.client.get('/public/shares/'+share['token']+'/files/'+f+'?download=1').status_code,403)
  preview=self.client.get('/public/shares/'+share['token']+'/files/'+f+'?preview=1');self.assertEqual(preview.status_code,200,preview.text);self.assertEqual(preview.json()['text'],'new version')
  stale=self.client.put('/api/shares/'+share['id'],headers={**self.auth,'If-Match':'"1"'},json={'revoked':True});self.assertEqual(stale.status_code,409)
  self.assertEqual(self.client.put('/api/shares/'+share['id'],headers={**self.auth,'If-Match':'"2"'},json={'revoked':True}).status_code,200);self.assertEqual(self.read(share).status_code,404)
 def test_completion_remaps_only_owner_links_and_resume_same_url(self):
  a,b,f,g=self.fixture();share=self.create(a,[{'kind':'file','id':f}]);other=self.create(b,[{'kind':'file','id':f}]);w=self.state();next(p for p in w['productions'] if p['id']==a)['status']='완료';self.put(w)
  rows=self.client.get('/api/shares',headers=self.auth).json();updated=next(r for r in rows if r['id']==share['id']);self.assertNotEqual(updated['selectors'][0]['id'],f);self.assertEqual(next(r for r in rows if r['id']==other['id'])['selectors'][0]['id'],f)
  raw=self.client.get('/api/ref-files/'+f,headers=self.auth);self.client.put('/api/ref-files/'+f,headers={**self.auth,'If-Match':raw.headers['etag']},content=b'ongoing edit')
  r=self.read(share);self.assertTrue(r.json()['completed']);copy_id=r.json()['items'][0]['files'][0]['id'];self.assertNotEqual(copy_id,f);self.assertEqual(self.client.get('/public/shares/'+share['token']+'/files/'+copy_id+'?download=1').content,b'public original')
  w=self.state();next(p for p in w['productions'] if p['id']==a)['status']='진행 중';self.put(w);self.assertFalse(self.read(share).json()['completed']);self.assertEqual(self.read(share).json()['items'][0]['files'][0]['id'],copy_id)
 def test_named_user_login_session_spoof_and_expiration(self):
  a,b,f,g=self.fixture();uid=str(uuid4());email=uid+'@example.com';session='session-'+uid
  with self.module.database() as conn:
   conn.execute('INSERT INTO app_users VALUES(?,?,?,?,1,?)',(uid,email,'member-'+uid,'viewer','now'));conn.execute('INSERT INTO local_credentials VALUES(?,?,NULL,NULL,-1)',(uid,hash_password('StrongPassword2026!')));conn.execute('INSERT INTO local_sessions VALUES(?,?,?,?,?,1)',(hashlib.sha256(session.encode()).hexdigest(),uid,int(time.time()),int(time.time())+10000,int(time.time())))
  share=self.create(a,audience='users',emails=[email]);self.assertEqual(self.read(share).status_code,401)
  self.assertEqual(self.read(share,headers={'X-Auth-Session':session,'Authorization':self.auth['Authorization']}).status_code,401)
  self.assertEqual(self.read(share,headers={'Cookie':'__Host-pn-share=test-session'}).status_code,403)
  self.assertEqual(self.read(share,headers={'Cookie':'__Host-pn-share='+session}).status_code,200)
  bad=self.client.post('/public/auth/login',headers={'Origin':'https://attacker.example'},json={'email':email,'password':'StrongPassword2026!'});self.assertEqual(bad.status_code,403)
  login=self.client.post('/public/auth/login',headers={'Origin':'https://testserver'},json={'email':email,'password':'StrongPassword2026!'});self.assertEqual(login.status_code,200,login.text);self.assertNotIn('session',login.json());self.assertIn('HttpOnly',login.headers['set-cookie']);self.assertIn('Secure',login.headers['set-cookie'])
  with self.module.database() as conn:
   row=conn.execute('SELECT payload FROM public_shares WHERE id=?',(share['id'],)).fetchone();data=json.loads(row[0]);data['expiresAt']='2000-01-01T00:00:00+00:00';conn.execute('UPDATE public_shares SET payload=? WHERE id=?',(json.dumps(data),share['id']))
  self.assertEqual(self.read(share,headers={'Cookie':'__Host-pn-share='+session}).status_code,404)
 def test_individual_selection_not_widened_and_invalid_selection_rejected(self):
  a,b,f,g=self.fixture();share=self.create(a,[{'kind':'module','tabId':'visible','id':'text'}]);w=self.state();next(p for p in w['productions'] if p['id']==a)['customTabs'][0]['modules'].append({'id':'new','kind':'text','text':'excluded'});self.put(w);r=self.read(share);self.assertNotIn('excluded',r.text);self.assertNotIn('note.txt',r.text)
  invalid=self.client.post('/api/shares',headers=self.auth,json={**share,'selectors':[{'kind':'file','id':g+'bad'}]});self.assertEqual(invalid.status_code,400)
  w=self.state();next(p for p in w['productions'] if p['id']==a)['deleted']=True;self.put(w);self.assertEqual(self.read(share).status_code,404)
  self.assertEqual(self.client.put('/api/shares/'+share['id'],headers={**self.auth,'If-Match':'"1"'},json={'revoked':True}).status_code,200)
 def test_page_and_public_transport_do_not_open_workspace_routes(self):
  a,b,f,g=self.fixture();share=self.create(a)
  page=self.client.get('/public/share/'+share['token']);self.assertEqual(page.status_code,200);self.assertIn('공유 자료',page.text);self.assertIn('no-referrer',page.headers['referrer-policy']);self.assertNotIn(self.module.TOKEN,page.text)
  for path in ['/public/api/data','/public/auth/me','/public/shares/'+share['token']+'/files/../../api/data']:
   self.assertNotEqual(self.client.get(path).status_code,200)
  self.assertEqual(self.client.put('/public/shares/'+share['token'],json={}).status_code,404)
 def test_publisher_membership_and_viewer_creation_are_enforced(self):
  a,b,f,g=self.fixture();uid=str(uuid4());session='publisher-'+uid;member='member-'+uid
  with self.module.database() as conn:
   conn.execute('INSERT INTO app_users VALUES(?,?,?,?,1,?)',(uid,uid+'@example.com',member,'operator','now'));conn.execute('INSERT INTO local_sessions VALUES(?,?,?,?,?,1)',(hashlib.sha256(session.encode()).hexdigest(),uid,int(time.time()),int(time.time())+10000,int(time.time())))
  w=self.state();next(p for p in w['productions'] if p['id']==a)['memberIds']=[member];self.put(w)
  auth={**self.auth,'X-Auth-Session':session};policy={'ownerKind':'production','ownerId':a,'selectors':[{'kind':'module','tabId':'visible','id':'text'}],'audience':'anyone'}
  created=self.client.post('/api/shares',headers=auth,json=policy);self.assertEqual(created.status_code,200,created.text);share=created.json();self.assertEqual(self.read(share).status_code,200)
  self.assertEqual(self.client.post('/api/shares',headers=auth,json={**policy,'ownerId':b}).status_code,404)
  w=self.state();next(p for p in w['productions'] if p['id']==a)['memberIds']=[];self.put(w);self.assertEqual(self.read(share).status_code,404)
  with self.module.database() as conn:conn.execute("UPDATE app_users SET role='viewer' WHERE id=?",(uid,))
  self.assertEqual(self.client.post('/api/shares',headers=auth,json=policy).status_code,403)
 def test_document_preview_pdf_inline_and_input_validation(self):
  import io,zipfile
  a,b,f,g=self.fixture();doc,pdf=str(uuid4()),str(uuid4());buffer=io.BytesIO()
  with zipfile.ZipFile(buffer,'w') as archive:archive.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>문서 &lt;script&gt;본문&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>')
  self.client.put('/api/ref-files/'+doc+'?name=view.docx',headers={**self.auth,'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},content=buffer.getvalue())
  self.client.put('/api/ref-files/'+pdf+'?name=view.pdf',headers={**self.auth,'Content-Type':'application/pdf'},content=b'%PDF-1.7\nexample')
  w=self.state();next(p for p in w['productions'] if p['id']==a)['customTabs'][0]['modules'][1]['files']+=[{'id':doc,'kind':'file','name':'view.docx'},{'id':pdf,'kind':'pdf','name':'view.pdf'}];self.put(w);share=self.create(a,allowDownload=False)
  address='/public/shares/'+share['token']+'/files/'
  preview=self.client.get(address+doc+'?preview=1');self.assertEqual(preview.status_code,200,preview.text);self.assertEqual(preview.json()['text'],'문서 <script>본문</script>')
  self.assertEqual(self.client.get(address+doc+'?download=1').status_code,403);self.assertEqual(self.client.get(address+doc+'?download=1&preview=1').status_code,403)
  inline=self.client.get(address+pdf);self.assertEqual(inline.status_code,200);self.assertEqual(inline.headers['content-type'],'application/pdf');self.assertIn('inline',inline.headers['content-disposition']);self.assertEqual(inline.headers['x-frame-options'],'SAMEORIGIN')
  self.assertEqual(self.client.post('/api/shares',headers=self.auth,json={**share,'expiresAt':12345}).status_code,400)
  self.assertEqual(self.client.put('/api/shares/'+share['id'],headers=self.auth,json=[]).status_code,400)
