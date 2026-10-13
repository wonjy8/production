"""Local password/session authentication. Secrets never leave the NAS."""
import base64,hashlib,hmac,json,os,secrets,re,struct,threading,time,uuid
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError,InvalidHashError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException,Request
from starlette.concurrency import run_in_threadpool
from access import actor_for,deny
HASHER=PasswordHasher(time_cost=3,memory_cost=65536,parallelism=1)
LIMIT=threading.BoundedSemaphore(2)

def digest(s):return hashlib.sha256(str(s).encode()).hexdigest()
def password_valid(value):
    if not isinstance(value,str) or not 8<=len(value)<=128 or not any(c in '0123456789' for c in value) or not any(not c.isalnum() and not c.isspace() for c in value):raise HTTPException(400,'비밀번호는 8~128자이며 숫자와 특수문자를 각각 포함해야 합니다. 점(.)도 사용할 수 있습니다.')
def hash_password(value):
    password_valid(value)
    if not LIMIT.acquire(False):raise HTTPException(503,'잠시 후 다시 시도하세요')
    try:return HASHER.hash(value)
    finally:LIMIT.release()
def verify_password(encoded,value):
    if not LIMIT.acquire(False):raise HTTPException(503,'잠시 후 다시 시도하세요')
    try:
        try:return HASHER.verify(encoded,value)
        except (VerificationError,InvalidHashError):return False
    finally:LIMIT.release()
KEY_LOCK=threading.RLock()
def cipher_key():
    from pathlib import Path
    path=Path(os.environ.get('DATA_DIR','/data'))/'account.key'
    with KEY_LOCK:
        if not path.exists():
            fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            try:os.write(fd,secrets.token_bytes(32));os.fsync(fd)
            finally:os.close(fd)
        key=path.read_bytes()
    if len(key)!=32:raise RuntimeError('Account encryption key invalid')
    return key
def code_digest(code):return hmac.new(cipher_key(),str(code).encode(),hashlib.sha256).hexdigest()
def decrypt_seed(blob,token):
    if not blob:return None
    raw=base64.b64decode(blob);return AESGCM(cipher_key()).decrypt(raw[:12],raw[12:],b'mfa').decode()
def encrypt_seed(seed,token):
    iv=secrets.token_bytes(12);return base64.b64encode(iv+AESGCM(cipher_key()).encrypt(iv,seed.encode(),b'mfa')).decode()
def totp(seed,step=None):
    counter=int(time.time())//30 if step is None else step;secret=base64.b32decode(seed+'='*((8-len(seed)%8)%8));raw=hmac.new(secret,struct.pack('>Q',counter),hashlib.sha1).digest();offset=raw[-1]&15;value=(struct.unpack('>I',raw[offset:offset+4])[0]&0x7fffffff)%1000000;return str(value).zfill(6)
def verify_totp(seed,code,last):
    if not isinstance(code,str) or len(code)!=6 or not code.isdigit():return None
    stamp=int(time.time())//30
    for step in (stamp-1,stamp,stamp+1):
        if step>last and hmac.compare_digest(totp(seed,step),code):return step
    return None

def session_user(conn,request,token):
    value=request.headers.get('x-auth-session','');row=conn.execute('SELECT s.*,u.email,u.role,u.active,COALESCE(p.remembered,0) AS remembered FROM local_sessions s JOIN app_users u ON s.user_id=u.id LEFT JOIN local_session_preferences p ON p.token_hash=s.token_hash WHERE s.token_hash=?',(digest(value),)).fetchone()
    if not row or not row['active'] or row['expires_at']<int(time.time()) or (not row['remembered'] and row['last_seen']<int(time.time())-(1800 if row['role'] in ('superadmin','admin') else 86400)):raise HTTPException(401,'로그인이 필요합니다')
    actor=conn.execute('SELECT * FROM app_users WHERE id=?',(row['user_id'],)).fetchone();actor=dict(actor)
    conn.execute('UPDATE local_sessions SET last_seen=? WHERE token_hash=?',(int(time.time()),digest(value)))
    return actor,dict(row)

def install_local(app,database,lock,save_workspace,now,token):
    def audit(conn,uid,action):conn.execute('INSERT INTO access_audit(user_id,action,target,created_at) VALUES(?,?,?,?)',(uid,action,uid,now()))
    def create_session(conn,uid,remembered=False):
        raw=secrets.token_urlsafe(48);stamp=int(time.time());conn.execute('INSERT INTO local_sessions VALUES(?,?,?,?,?,1)',(digest(raw),uid,stamp,stamp+604800,stamp));conn.execute('DELETE FROM local_sessions WHERE expires_at<?',(stamp,));
        if remembered:conn.execute('INSERT INTO local_session_preferences(token_hash,remembered) VALUES(?,1)',(digest(raw),))
        return raw
    def pending_code(conn,email,code,purpose):
        row=conn.execute('SELECT * FROM local_pending WHERE email=? AND purpose=?',(email,purpose)).fetchone()
        if not row or row['expires_at']<int(time.time()) or row['attempts']>=5:raise HTTPException(400,'코드가 만료되었습니다')
        if not hmac.compare_digest(row['code_hash'],code_digest(code)):
            conn.execute('UPDATE local_pending SET attempts=attempts+1 WHERE email=? AND purpose=?',(email,purpose));return None
        return dict(row)
    def eligibility(conn,email,invite):
        if not conn.execute('SELECT 1 FROM app_bootstrap').fetchone():
            code=os.environ.get('ADMIN_SETUP_CODE','').strip().lower()
            if conn.execute('SELECT 1 FROM app_users').fetchone() or email!=bootstrap_identity()[0] or not re.fullmatch(r'[a-f0-9]{64}',code) or not hmac.compare_digest(code.encode(),invite.strip().lower().encode()):deny('NAS에 첫 관리자 설정 코드를 등록한 뒤 가입하세요')
            return {'bootstrap':True}
        accepted=conn.execute('SELECT * FROM app_invites WHERE token_hash=? AND email=? AND used_at IS NULL AND expires_at>?',(digest(invite),email,int(time.time()))).fetchone()
        if not accepted:deny('유효한 초대 코드가 필요합니다')
        return accepted
    @app.post('/api/auth/signup')
    async def signup(request:Request):
        from access import workspace_data
        b=await request.json();email=str(b.get('email','')).strip().lower();invite=str(b.get('invite',''));password_valid(b.get('password'))
        with database() as conn:eligibility(conn,email,invite)
        encoded=await run_in_threadpool(hash_password,b['password'])
        with lock,database() as conn:
            conn.execute('BEGIN IMMEDIATE');invitation=eligibility(conn,email,invite)
            if isinstance(invitation,dict) and invitation.get('bootstrap'):
                uid=create_founder(conn,save_workspace,now,encoded);session=create_session(conn,uid)
            else:
                if conn.execute('SELECT 1 FROM app_users WHERE email=? OR member_id=?',(email,invitation['member_id'])).fetchone():raise HTTPException(409,'이미 연결된 멤버입니다')
                data=workspace_data(conn);member=next((m for m in data.get('members',[]) if m['id']==invitation['member_id'] and not m.get('deleted') and m.get('kind')!='team'),None)
                if not member:deny('멤버 연결을 확인하세요')
                uid=str(uuid.uuid4());conn.execute('INSERT INTO app_users VALUES(?,?,?,?,1,?)',(uid,email,member['id'],'viewer',now()));conn.execute('INSERT INTO local_credentials VALUES(?,?,NULL,NULL,-1)',(uid,encoded));conn.execute('UPDATE app_invites SET used_at=? WHERE token_hash=?',(int(time.time()),digest(invite)));session=create_session(conn,uid);audit(conn,uid,'invite-signup')
        return {'ok':True,'session':session}
    @app.post('/api/auth/login')
    async def login(request:Request):
        b=await request.json();email=str(b.get('email','')).strip().lower();value=b.get('password','')
        if not isinstance(value,str) or len(value)>128:raise HTTPException(401,'이메일·비밀번호 확인')
        with database() as conn:row=conn.execute('SELECT u.*,c.password_hash FROM app_users u JOIN local_credentials c ON c.user_id=u.id WHERE email=? AND active=1',(email,)).fetchone()
        if not row:
            # Constant-cost verification prevents account-existence timing disclosure.
            await run_in_threadpool(hash_password,'DummyPassword123!');raise HTTPException(401,'이메일·비밀번호 확인')
        if not await run_in_threadpool(verify_password,row['password_hash'],value):raise HTTPException(401,'이메일·비밀번호 확인')
        remembered=b.get('remember') is True
        with lock,database() as conn:session=create_session(conn,row['id'],remembered);audit(conn,row['id'],'login')
        return {'ok':True,'session':session,'remembered':remembered,'rememberSupported':True}
    @app.post('/api/auth/logout')
    def logout(request:Request):
        with lock,database() as conn:conn.execute('DELETE FROM local_sessions WHERE token_hash=?',(digest(request.headers.get('x-auth-session','')),))
        return {'ok':True}
    @app.post('/api/auth/reset-tokens')
    async def reset_token(request:Request):
        b=await request.json();uid=str(b.get('userId',''))
        with lock,database() as conn:
            actor,_=session_user(conn,request,token)
            if actor['role']!='superadmin':deny('최고관리자만 재설정 코드를 발급할 수 있습니다')
            target=conn.execute('SELECT * FROM app_users WHERE id=? AND active=1',(uid,)).fetchone()
            if not target:raise HTTPException(404,'계정을 확인하세요')
            code=secrets.token_urlsafe(32);expires=int(time.time())+3600
            conn.execute('INSERT INTO local_pending VALUES(?,?,?,?,?,0) ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash,payload=excluded.payload,expires_at=excluded.expires_at,attempts=0',(target['email'],'recovery',code_digest(code),json.dumps({'uid':uid}),expires));audit(conn,actor['id'],'issue-reset-code')
        return {'ok':True,'resetCode':code,'email':target['email'],'expiresAt':expires}
    @app.post('/api/auth/recovery-verify')
    async def reset(request:Request):
        b=await request.json();email=str(b.get('email','')).lower();password_valid(b.get('password'));encoded=await run_in_threadpool(hash_password,b['password']);invalid=False
        with lock,database() as conn:
            pending=pending_code(conn,email,str(b.get('code','')),'recovery')
            if not pending:invalid=True
            else:
                uid=json.loads(pending['payload'])['uid'];conn.execute('UPDATE local_credentials SET password_hash=? WHERE user_id=?',(encoded,uid));conn.execute('DELETE FROM local_sessions WHERE user_id=?',(uid,));conn.execute('DELETE FROM local_pending WHERE email=? AND purpose=?',(email,'recovery'));audit(conn,uid,'password-reset')
        if invalid:raise HTTPException(400,'인증 코드 확인')
        return {'ok':True}
    @app.put('/api/auth/password')
    async def password(request:Request):
        b=await request.json();password_valid(b.get('password'))
        with database() as conn:
            actor,_=session_user(conn,request,token);old=conn.execute('SELECT password_hash FROM local_credentials WHERE user_id=?',(actor['id'],)).fetchone()
        if not await run_in_threadpool(verify_password,old[0],str(b.get('currentPassword',''))):deny('현재 비밀번호 확인')
        encoded=await run_in_threadpool(hash_password,b['password'])
        with lock,database() as conn:
            conn.execute('UPDATE local_credentials SET password_hash=? WHERE user_id=?',(encoded,actor['id']));conn.execute('DELETE FROM local_sessions WHERE user_id=?',(actor['id'],));audit(conn,actor['id'],'password-change')
        return {'ok':True,'loggedOut':True}
    @app.post('/api/auth/mfa/enroll')
    def enroll(request:Request):
        with lock,database() as conn:
            actor,_=session_user(conn,request,token);row=conn.execute('SELECT mfa_secret FROM local_credentials WHERE user_id=?',(actor['id'],)).fetchone()
            if row[0]:deny('이미 2단계 인증이 등록되었습니다')
            seed=base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=');conn.execute('UPDATE local_credentials SET pending_mfa=? WHERE user_id=?',(encrypt_seed(seed,token),actor['id']))
        import urllib.parse
        return {'secret':seed,'uri':'otpauth://totp/Production:'+urllib.parse.quote(actor['email'])+'?secret='+seed+'&issuer=Production&digits=6&period=30'}
    @app.post('/api/auth/mfa/verify')
    async def verify_mfa(request:Request):
        b=await request.json()
        with lock,database() as conn:
            actor,session=session_user(conn,request,token);row=conn.execute('SELECT * FROM local_credentials WHERE user_id=?',(actor['id'],)).fetchone();seed=decrypt_seed(row['mfa_secret'] or row['pending_mfa'],token)
            if not seed:raise HTTPException(400,'인증 앱을 등록하세요')
            step=verify_totp(seed,b.get('code'),row['last_totp']);backup=conn.execute('SELECT 1 FROM local_recovery_codes WHERE user_id=? AND code_hash=? AND used=0',(actor['id'],digest(str(b.get('code',''))))).fetchone()
            if step is None and not backup:raise HTTPException(400,'인증 코드를 확인하세요')
            if backup:conn.execute('UPDATE local_recovery_codes SET used=1 WHERE user_id=? AND code_hash=?',(actor['id'],digest(b['code'])))
            recovery=[]
            if not row['mfa_secret']:
                recovery=[secrets.token_urlsafe(16) for _ in range(10)]
                for code in recovery:conn.execute('INSERT INTO local_recovery_codes(user_id,code_hash) VALUES(?,?)',(actor['id'],digest(code)))
            conn.execute('UPDATE local_credentials SET mfa_secret=?,pending_mfa=NULL,last_totp=? WHERE user_id=?',(row['mfa_secret'] or row['pending_mfa'],step if step is not None else row['last_totp'],actor['id']));conn.execute('DELETE FROM local_sessions WHERE token_hash=?',(session['token_hash'],));raw=create_session(conn,actor['id'],bool(session.get('remembered')));conn.execute('UPDATE local_sessions SET aal=2 WHERE token_hash=?',(digest(raw),));audit(conn,actor['id'],'mfa')
        return {'ok':True,'session':raw,'recoveryCodes':recovery}


def bootstrap_identity():
    email=os.environ.get('ADMIN_EMAIL','').strip().lower()
    name=os.environ.get('ADMIN_NAME','').strip()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254 or not name or len(name)>100:
        raise HTTPException(503,'NAS에 ADMIN_EMAIL과 ADMIN_NAME을 설정하세요')
    return email,name


def create_founder(conn,save_workspace,now,encoded):
    from access import workspace_data
    if conn.execute('SELECT 1 FROM app_bootstrap').fetchone() or conn.execute('SELECT 1 FROM app_users').fetchone():raise HTTPException(409,'이미 초기 계정이 생성되어 있습니다')
    email,name=bootstrap_identity()
    data=workspace_data(conn);members=data.setdefault('members',[])
    # Match a stable, explicitly configured ID or exact email, never a person's name.
    member_id=os.environ.get('ADMIN_MEMBER_ID','').strip()
    active=[m for m in members if not m.get('deleted') and m.get('kind')!='team']
    matches=[m for m in active if m.get('id')==member_id] if member_id else [m for m in active if str(m.get('email','')).strip().lower()==email]
    if len(matches)>1 or (member_id and not matches):raise HTTPException(409,'초기 관리자 멤버 연결을 확인하세요')
    member=matches[0] if matches else {'id':str(uuid.uuid4()),'name':name,'kind':'personal','deleted':False,'email':email}
    if not matches:members.append(member)
    # Preserve the existing member profile, including their name and contact details.
    uid=str(uuid.uuid4());conn.execute('INSERT INTO app_users VALUES(?,?,?,?,1,?)',(uid,email,member['id'],'superadmin',now()));conn.execute('INSERT INTO local_credentials VALUES(?,?,NULL,NULL,-1)',(uid,encoded));conn.execute('INSERT INTO app_bootstrap VALUES(1,?)',(uid,));save_workspace(conn,data);conn.execute('INSERT INTO access_audit(user_id,action,target,created_at) VALUES(?,?,?,?)',(uid,'bootstrap',member['id'],now()))
    return uid


def bootstrap_admin(database,lock,save_workspace,now,password):
    encoded=hash_password(password)
    with lock,database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        return create_founder(conn,save_workspace,now,encoded)
