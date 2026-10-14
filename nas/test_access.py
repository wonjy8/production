import os,sys,json,tempfile,importlib.util,hashlib,time,unittest,copy
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
sys.path.insert(0,str(Path(__file__).parent))
from fastapi.testclient import TestClient
import local_auth
class AccessTest(unittest.TestCase):
 def setUp(self):
  self.folder=tempfile.TemporaryDirectory();os.environ['DATA_DIR']=self.folder.name;os.environ['NAS_API_TOKEN']='t'*64;os.environ['ADMIN_EMAIL']='admin@example.com';os.environ['ADMIN_NAME']='예시 관리자'
  spec=importlib.util.spec_from_file_location('access_server',Path(__file__).with_name('server.py'));self.s=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.s);self.c=TestClient(self.s.app);self.service={'Authorization':'Bearer '+'t'*64};self.mid=str(uuid4());self.other=str(uuid4());self.gid='group-a';self.hidden='group-b'
  self.data={'projects':[{'id':'project-a','title':'A','productionId':self.gid,'tasks':[{'id':'task','title':'원본'}]},{'id':'project-b','title':'B','productionId':self.hidden,'tasks':[]}],'productions':[{'id':self.gid,'name':'A','memberIds':[self.mid,self.other],'teams':[]},{'id':self.hidden,'name':'B','memberIds':[],'teams':[]}],'members':[{'id':self.mid,'name':'예시 관리자','email':'admin@example.com','contact':'old'},{'id':self.other,'name':'멤버','contact':'private','email':'private@example.com'}],'equipment':[]}
  with self.s.database() as db:self.s.save_workspace(db,self.data)
 def test_archive_visibility_preserves_hidden_records(self):
  from access import scope,apply_tab_visibility,merge_workspace
  full=copy.deepcopy(self.data)
  full['productions'][0]['archives']=[{'id':'visible-archive','snapshot':[{'owner':{'id':'project-a','customTabs':[]}}],'retrospective':'visible'}, {'id':'hidden-archive','snapshot':[{'owner':{'id':'project-b','customTabs':[]}}],'retrospective':'hidden'}]
  actor={'role':'operator','member_id':self.mid}
  with self.s.database() as db:
   visible=apply_tab_visibility(db,scope(full,actor),actor)
   self.assertEqual([a['id'] for a in visible['productions'][0]['archives']],['visible-archive'])
   self.assertEqual(len(full['productions'][0]['archives']),2)
   visible['productions'][0]['description']='edited'
   merged=merge_workspace(db,full,visible,actor)
   self.assertEqual(len(merged['productions'][0]['archives']),2)
   db.execute('INSERT INTO tab_permissions VALUES(?,?,?,?)',(self.gid,'materials',json.dumps({'operator':{'view':False,'edit':False}}),'admin'))
   restricted=apply_tab_visibility(db,scope(full,actor),actor)
   self.assertEqual(restricted['productions'][0]['archives'],[])
 def tearDown(self):self.folder.cleanup()
 def session(self,uid,role,mid,email='person@example.com',aal=2):
  raw=str(uuid4())
  with self.s.database() as db:
   db.execute('INSERT INTO app_users VALUES(?,?,?,?,1,?)',(uid,email,mid,role,'now'));db.execute('INSERT INTO local_sessions VALUES(?,?,?,?,?,?)',(local_auth.digest(raw),uid,int(time.time()),int(time.time())+1000,int(time.time()),aal))
  return {**self.service,'X-Auth-Session':raw}
 def test_signup_mfa_invite(self):
  password='LongPassword2026!'
  self.assertEqual(self.c.post('/api/auth/signup',headers=self.service,json={'email':'admin@example.com','password':password}).status_code,403)
  uid=local_auth.bootstrap_admin(self.s.database,self.s.write_lock,self.s.save_workspace,self.s.now,password)
  with self.assertRaises(Exception):local_auth.bootstrap_admin(self.s.database,self.s.write_lock,self.s.save_workspace,self.s.now,password)
  logged=self.c.post('/api/auth/login',headers=self.service,json={'email':'admin@example.com','password':password});self.assertEqual(logged.status_code,200)
  auth={**self.service,'X-Auth-Session':logged.json()['session']};me=self.c.get('/api/auth/me',headers=auth).json();self.assertEqual(me['memberId'],self.mid);self.assertFalse(me['mfaRequired']);self.assertEqual(me['profile']['contact'],'old');self.assertEqual(self.c.get('/api/data',headers=auth).status_code,200)
  seed=self.c.post('/api/auth/mfa/enroll',headers=auth).json()['secret'];self.assertEqual(self.c.post('/api/auth/mfa/verify',headers=auth,json={'code':'wrong'}).status_code,400)
  elevated=self.c.post('/api/auth/mfa/verify',headers=auth,json={'code':local_auth.totp(seed)});self.assertEqual(elevated.status_code,200);codes=elevated.json()['recoveryCodes'];self.assertEqual(len(codes),10);auth['X-Auth-Session']=elevated.json()['session'];self.assertEqual(self.c.get('/api/data',headers=auth).status_code,200)
  with self.s.database() as db:
   self.assertEqual(db.execute('SELECT COUNT(*) FROM members WHERE id=?',(self.mid,)).fetchone()[0],1);row=db.execute('SELECT * FROM local_credentials').fetchone();self.assertTrue(row['password_hash'].startswith('$argon2id$'));self.assertNotIn(seed,row['mfa_secret']);self.assertNotIn(codes[0],db.execute('SELECT code_hash FROM local_recovery_codes').fetchone()[0])
  invite=self.c.post('/api/auth/invites',headers=auth,json={'email':'member@example.com','memberId':self.other});self.assertEqual(invite.status_code,200)
  self.assertEqual(self.c.post('/api/auth/signup',headers=self.service,json={'email':'wrong@example.com','password':password,'invite':invite.json()['invite']}).status_code,403)
  joined=self.c.post('/api/auth/signup',headers=self.service,json={'email':'member@example.com','password':password,'invite':invite.json()['invite']});self.assertEqual(joined.status_code,200)
  member={**self.service,'X-Auth-Session':joined.json()['session']};self.assertEqual(self.c.get('/api/auth/me',headers=member).json()['role'],'viewer')
  self.assertEqual(self.c.post('/api/auth/signup',headers=self.service,json={'email':'member@example.com','password':password,'invite':invite.json()['invite']}).status_code,403)
  self.assertEqual(self.c.put('/api/auth/users/'+me['id'],headers=member,json={'role':'superadmin'}).status_code,403)
  self.assertEqual(self.c.put('/api/auth/users/'+me['id'],headers=auth,json={'role':'viewer'}).status_code,403)
  target=self.c.get('/api/auth/me',headers=member).json()['id']
  self.assertEqual(self.c.post('/api/auth/reset-tokens',headers=member,json={'userId':target}).status_code,403)
  code=self.c.post('/api/auth/reset-tokens',headers=auth,json={'userId':target});self.assertEqual(code.status_code,200)
  reset=self.c.post('/api/auth/recovery-verify',headers=self.service,json={'email':'member@example.com','code':code.json()['resetCode'],'password':'Reset12.'});self.assertEqual(reset.status_code,200)
  self.assertEqual(self.c.get('/api/auth/me',headers=member).status_code,401)
  self.assertEqual(self.c.post('/api/auth/recovery-verify',headers=self.service,json={'email':'member@example.com','code':code.json()['resetCode'],'password':'Reset12.'}).status_code,400)
  self.assertEqual(self.c.post('/api/auth/login',headers=self.service,json={'email':'member@example.com','password':'Reset12.'}).status_code,200)
  self.assertEqual(self.c.post('/api/auth/signup-verify',headers=self.service,json={}).status_code,404)
  self.assertEqual(self.c.post('/api/auth/recover',headers=self.service,json={}).status_code,404)
 def test_first_web_account_is_superadmin(self):
  import secrets
  code=secrets.token_hex(32);password='First123.'
  def signup(email,invite):return self.c.post('/api/auth/signup',headers=self.service,json={'email':email,'password':password,'invite':invite})
  with patch.dict(os.environ,{'ADMIN_SETUP_CODE':'short'}):self.assertEqual(signup('admin@example.com','short').status_code,403)
  with patch.dict(os.environ,{'ADMIN_SETUP_CODE':code}):
   self.assertEqual(signup('other@example.com',code).status_code,403)
   self.assertEqual(signup('admin@example.com','wrong').status_code,403)
   joined=signup('admin@example.com',code);self.assertEqual(joined.status_code,200)
   auth={**self.service,'X-Auth-Session':joined.json()['session']}
   me=self.c.get('/api/auth/me',headers=auth).json();self.assertEqual(me['role'],'superadmin');self.assertEqual(me['memberId'],self.mid);self.assertFalse(me['mfaRequired'])
   self.assertEqual(self.c.get('/api/data',headers=auth).status_code,200)
   self.assertEqual(signup('admin@example.com',code).status_code,403)
   self.assertEqual(signup('other@example.com',code).status_code,403)
  logged=self.c.post('/api/auth/login',headers=self.service,json={'email':'admin@example.com','password':password});self.assertEqual(logged.status_code,200)
  auth={**self.service,'X-Auth-Session':logged.json()['session']};self.assertEqual(self.c.get('/api/auth/me',headers=auth).json()['role'],'superadmin')
  with self.s.database() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM app_users').fetchone()[0],1)
 def test_scope_and_permissions(self):
  advanced=self.session('adv','advanced',self.other);admin=self.session('admin','admin',self.mid,email='admin@example.com');top=self.session('top','superadmin','top-member',email='top@example.com')
  r=self.c.get('/api/data',headers=advanced);self.assertEqual(r.status_code,200);visible=r.json();self.assertEqual([p['id'] for p in visible['projects']],['project-a']);self.assertNotIn('contact',next(m for m in visible['members'] if m['id']==self.mid))
  changed=copy.deepcopy(visible);changed['projects'][0]['tasks'][0]['title']='수정';self.assertEqual(self.c.put('/api/data',headers={**advanced,'If-Match':r.headers['etag']},json=changed).status_code,200)
  full=self.c.get('/api/data',headers=top).json();self.assertEqual(len(full['projects']),2);self.assertEqual(full['projects'][1]['title'],'B')
  full['members'][1]['contact']='hack';self.assertEqual(self.c.put('/api/data',headers=admin,json=full).status_code,403)
  viewer=self.session('viewer','viewer',self.other,email='viewer@example.com') if False else None
  self.assertEqual(self.c.put('/api/auth/users/adv',headers=admin,json={'role':'superadmin'}).status_code,403)
  policy={role:{a:a=='view' for a in ('view','add','edit','delete')} for role in ('operator','advanced','viewer')}
  self.assertEqual(self.c.put('/api/auth/tab-permissions',headers=admin,json={'ownerId':'project-a','tabId':'tasks','policy':policy}).status_code,200)
  visible=self.c.get('/api/data',headers=advanced).json();visible['projects'][0]['tasks'][0]['title']='막힘';self.assertEqual(self.c.put('/api/data',headers=advanced,json=visible).status_code,403)
  self.assertEqual(self.c.put('/api/auth/users/adv',headers=top,json={'active':False}).status_code,200);self.assertEqual(self.c.get('/api/data',headers=advanced).status_code,403 if False else 401)
 def test_member_suffix_and_account_separation(self):
  admin=self.session('admin','admin',self.mid,email='admin@example.com');top=self.session('top','superadmin','top-member',email='top@example.com');person=self.session('person','viewer',self.other,email='person@example.com')
  self.assertEqual(self.c.put('/api/auth/profile',headers=person,json={'nameSuffix':'자칭'}).status_code,403)
  self.assertEqual(self.c.put('/api/auth/profile',headers=admin,json={'nameSuffix':'별명'}).status_code,403)
  data=self.c.get('/api/data',headers=admin).json();data['members'][1]['nameSuffix']='감독'
  self.assertEqual(self.c.put('/api/data',headers=admin,json=data).status_code,200)
  self.assertNotIn('nameSuffix',self.c.get('/api/auth/me',headers=person).json()['profile'])
  visible=self.c.get('/api/data',headers=person).json();visible['members'][1]['nameSuffix']='변경'
  self.assertEqual(self.c.put('/api/data',headers=person,json=visible).status_code,403)
  member=self.c.get('/api/data',headers=admin).json()['members'][1];member['nameSuffix']='PD'
  self.assertEqual(self.c.put('/api/database/members/'+self.other,headers=admin,json=member).status_code,200)
  member['nameSuffix']='직접 변경'
  self.assertEqual(self.c.put('/api/database/members/'+self.other,headers=person,json=member).status_code,403)
  member['nameSuffix']='PD';member['contact']='수정'
  self.assertEqual(self.c.put('/api/database/members/'+self.other,headers=admin,json=member).status_code,403)
  self.assertEqual(self.c.put('/api/auth/users/person',headers=admin,json={'role':'admin'}).status_code,403)
  self.assertEqual(self.c.put('/api/auth/users/person',headers=top,json={'role':'advanced','email':'changed@example.com'}).status_code,200)
  self.assertEqual(self.c.get('/api/auth/me',headers=person).status_code,401)
  self.assertEqual(self.c.get('/api/data',headers=top).json()['members'][1]['email'],'private@example.com')
 def test_member_registration_status_is_scoped(self):
  person=self.session('person','viewer',self.other,email='person@example.com');top=self.session('top','superadmin',self.mid,email='top@example.com')
  data=self.c.get('/api/data',headers=top).json();data['members'].append({'id':'unregistered','name':'미등록'});data['members'].append({'id':'team','name':'팀','kind':'team'})
  self.assertEqual(self.c.put('/api/data',headers=top,json=data).status_code,200)
  status=self.c.get('/api/auth/member-status',headers=top);self.assertEqual(status.status_code,200);rows={m['memberId']:m['registered'] for m in status.json()};self.assertTrue(rows[self.mid]);self.assertTrue(rows[self.other]);self.assertFalse(rows['unregistered']);self.assertNotIn('team',rows)
  visible=self.c.get('/api/auth/member-status',headers=person).json();self.assertNotIn('unregistered',[m['memberId'] for m in visible]);self.assertTrue(all(set(m)=={'memberId','registered'} for m in visible))
  self.assertEqual(self.c.get('/api/auth/users',headers=person).status_code,403)
 def test_remembered_login_survives_idle_but_not_expiry_or_logout(self):
  password='Remember123.';local_auth.bootstrap_admin(self.s.database,self.s.write_lock,self.s.save_workspace,self.s.now,password)
  def login(remember):
   result=self.c.post('/api/auth/login',headers=self.service,json={'email':'admin@example.com','password':password,'remember':remember});self.assertEqual(result.status_code,200);return result.json(),{**self.service,'X-Auth-Session':result.json()['session']}
  regular,regular_auth=login(False);remembered,remember_auth=login(True);string,string_auth=login('true')
  self.assertFalse(regular['remembered']);self.assertTrue(remembered['remembered']);self.assertTrue(remembered['rememberSupported']);self.assertFalse(string['remembered'])
  with self.s.database() as db:
   db.execute('UPDATE local_sessions SET last_seen=?',(int(time.time())-3*86400,))
  self.assertEqual(self.c.get('/api/auth/me',headers=regular_auth).status_code,401);self.assertEqual(self.c.get('/api/auth/me',headers=string_auth).status_code,401);self.assertEqual(self.c.get('/api/auth/me',headers=remember_auth).status_code,200)
  self.assertEqual(self.c.post('/api/auth/logout',headers=remember_auth,json={}).status_code,200);self.assertEqual(self.c.get('/api/auth/me',headers=remember_auth).status_code,401)
  with self.s.database() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM local_session_preferences WHERE token_hash=?',(local_auth.digest(remembered['session']),)).fetchone()[0],0)
  expired,expired_auth=login(True)
  with self.s.database() as db:db.execute('UPDATE local_sessions SET expires_at=? WHERE token_hash=?',(int(time.time())-1,local_auth.digest(expired['session'])))
  self.assertEqual(self.c.get('/api/auth/me',headers=expired_auth).status_code,401)
  disabled,disabled_auth=login(True)
  with self.s.database() as db:db.execute('UPDATE app_users SET active=0')
  self.assertEqual(self.c.get('/api/auth/me',headers=disabled_auth).status_code,401)
 def test_password_policy(self):
  from fastapi import HTTPException
  for value in ['abcdef1.','1234567.','가나다라마1.2','Password2026!']:
   local_auth.password_valid(value)
  for value in ['abcde1.','abcdefgh','abcdefg1','abcdefg.','abcdef1 ','x'*129+'1.']:
   with self.assertRaises(HTTPException):local_auth.password_valid(value)
 def test_self_withdrawal_revokes_sessions_and_protects_superadmin(self):
  top=self.session('top-withdraw','superadmin',self.mid,email='top@example.com')
  self.assertEqual(self.c.request('DELETE','/api/auth/account',headers=top,json={'currentPassword':'Password2026!'}).status_code,403)
  person=self.session('withdraw-user','viewer',self.other,email='withdraw@example.com')
  with self.s.database() as db:
   db.execute('INSERT INTO local_credentials VALUES(?,?,NULL,NULL,-1)',('withdraw-user',local_auth.hash_password('Password2026!')))
   db.execute('INSERT INTO local_recovery_codes VALUES(?,?,0)',('withdraw-user','code'))
   token=local_auth.digest(person['X-Auth-Session']);db.execute('INSERT INTO local_session_preferences VALUES(?,1)',(token,))
  self.assertEqual(self.c.request('DELETE','/api/auth/account',headers=person,json={'currentPassword':'wrong'}).status_code,403)
  self.assertEqual(self.c.get('/api/auth/me',headers=person).status_code,200)
  self.assertEqual(self.c.request('DELETE','/api/auth/account',headers=person,json={'currentPassword':'Password2026!'}).status_code,200)
  self.assertEqual(self.c.get('/api/auth/me',headers=person).status_code,401)
  with self.s.database() as db:
   for table in ('app_users','local_sessions','local_credentials','local_recovery_codes'):
    key='id' if table=='app_users' else 'user_id'
    self.assertEqual(db.execute('SELECT COUNT(*) FROM '+table+' WHERE '+key+'=?',('withdraw-user',)).fetchone()[0],0)
   self.assertEqual(db.execute('SELECT COUNT(*) FROM local_session_preferences WHERE token_hash=?',(token,)).fetchone()[0],0)
   self.assertTrue(any(m['id']==self.other for m in __import__('access').workspace_data(db)['members']))
 def test_anonymous_and_rate_limits(self):
  self.assertEqual(self.c.get('/api/data',headers=self.service).status_code,401)
  self.assertEqual(self.c.get('/api/data',headers={**self.service,'X-Auth-User-Id':'top','X-Auth-Verified':'1','X-Auth-User-Email':'admin@example.com'}).status_code,401)
  for i in range(15):self.assertEqual(self.c.post('/api/auth/attempt',headers=self.service,json={'kind':'login','email':'rate@example.com'}).status_code,200)
  self.assertEqual(self.c.post('/api/auth/attempt',headers=self.service,json={'kind':'login','email':'rate@example.com'}).status_code,429)
if __name__=='__main__':unittest.main()
