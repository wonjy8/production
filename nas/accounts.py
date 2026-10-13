import hashlib,json,secrets,time,uuid
from fastapi import HTTPException,Request
from access import actor_for,identity,is_admin,deny,ROLES,workspace_data

def install(app,database,lock,save_workspace,now):
    def record(conn,actor,action,target):conn.execute('INSERT INTO access_audit(user_id,action,target,created_at) VALUES(?,?,?,?)',(actor['id'],action,target,now()))
    @app.post('/api/auth/attempt')
    async def attempt(request:Request):
        body=await request.json();kind=body.get('kind');email=str(body.get('email','')).lower()[:254]
        if kind not in ('login','signup','signup-verify','recover','recovery-verify','mfa/verify'):raise HTTPException(400,'Invalid attempt')
        interval,limit=(900,15) if kind=='login' else (3600,5)
        if kind=='mfa/verify':
            raw=request.headers.get('x-auth-session','')
            with database() as c:
                session=c.execute('SELECT user_id FROM local_sessions WHERE token_hash=?',(hashlib.sha256(raw.encode()).hexdigest(),)).fetchone()
                if not session:raise HTTPException(401,'로그인이 필요합니다')
                email='user:'+session[0]
        key=hashlib.sha256((kind+':'+email).encode()).hexdigest();stamp=int(time.time())
        with lock,database() as conn:
            row=conn.execute('SELECT * FROM auth_attempts WHERE key=?',(key,)).fetchone()
            if row and stamp-row['window_start']<interval:
                if row['count']>=limit:raise HTTPException(429,'잠시 후 다시 시도하세요')
                conn.execute('UPDATE auth_attempts SET count=count+1 WHERE key=?',(key,))
            else:conn.execute('INSERT INTO auth_attempts VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=1',(key,stamp))
            conn.execute('DELETE FROM auth_attempts WHERE window_start<?',(stamp-86400,))
        return {'ok':True}
    @app.get('/api/auth/me')
    def me(request:Request):
        with database() as conn:
            actor=actor_for(conn,request);data=workspace_data(conn)
            profile=next((m for m in data.get('members',[]) if m['id']==actor['member_id']),{})
            from local_auth import session_user
            _,session=session_user(conn,request,__import__('os').environ['NAS_API_TOKEN'])
            mfa=conn.execute('SELECT mfa_secret FROM local_credentials WHERE user_id=?',(actor['id'],)).fetchone()
            return {'id':actor['id'],'email':actor['email'],'role':actor['role'],'memberId':actor['member_id'],'profile':{k:v for k,v in profile.items() if k!='nameSuffix'},'mfaRequired':False,'mfaEnrolled':bool(mfa and mfa[0]),'permissions':[dict(r) for r in conn.execute('SELECT owner_id,tab_id,policy FROM tab_permissions')]}
    @app.get('/api/auth/member-status')
    def member_status(request:Request):
        from access import scope
        with database() as conn:
            actor=actor_for(conn,request);visible=scope(workspace_data(conn),actor)
            registered={r['member_id'] for r in conn.execute('SELECT member_id FROM app_users')}
            return [{'memberId':m['id'],'registered':m['id'] in registered} for m in visible.get('members',[]) if not m.get('deleted') and m.get('kind')!='team']
    @app.get('/api/auth/users')
    def users(request:Request):
        with database() as conn:
            actor=actor_for(conn,request)
            if not is_admin(actor):deny()
            return [dict(r) for r in conn.execute('SELECT id,email,member_id,role,active FROM app_users ORDER BY created_at')]
    @app.post('/api/auth/invites')
    async def invites(request:Request):
        body=await request.json();email=str(body.get('email','')).strip().lower();mid=str(body.get('memberId',''))
        if '@' not in email or len(email)>254:raise HTTPException(400,'이메일을 확인하세요')
        with lock,database() as conn:
            actor=actor_for(conn,request)
            if not is_admin(actor):deny()
            data=workspace_data(conn)
            if not any(m['id']==mid and not m.get('deleted') and m.get('kind')!='team' for m in data.get('members',[])):deny('개인 멤버를 선택하세요')
            if conn.execute('SELECT 1 FROM app_users WHERE member_id=? OR email=?',(mid,email)).fetchone():raise HTTPException(409,'이미 가입한 멤버입니다')
            token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest();expires=int(time.time())+86400*3
            conn.execute('INSERT INTO app_invites VALUES(?,?,?,?,NULL,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,member_id=excluded.member_id,expires_at=excluded.expires_at,used_at=NULL,created_by=excluded.created_by',(digest,email,mid,expires,actor['id']))
            record(conn,actor,'invite',mid)
            return {'invite':token,'expiresAt':expires,'email':email}
    @app.put('/api/auth/users/{uid}')
    async def change_user(uid:str,request:Request):
        body=await request.json()
        with lock,database() as conn:
            conn.execute('BEGIN IMMEDIATE');actor=actor_for(conn,request)
            target=conn.execute('SELECT * FROM app_users WHERE id=?',(uid,)).fetchone()
            if not target:raise HTTPException(404,'계정 없음')
            if actor['role']!='superadmin':deny('최고관리자만 변경할 수 있습니다')
            role=body.get('role',target['role']);active=1 if body.get('active',target['active']) else 0
            if role not in ROLES:raise HTTPException(400,'잘못된 등급')
            if target['role']=='superadmin' and (role!='superadmin' or not active) and conn.execute("SELECT COUNT(*) FROM app_users WHERE role='superadmin' AND active=1").fetchone()[0]<=1:deny('마지막 최고관리자는 해제할 수 없습니다')
            email=str(body.get('email',target['email'])).strip().lower()
            if '@' not in email or len(email)>254:raise HTTPException(400,'이메일을 확인하세요')
            if conn.execute('SELECT 1 FROM app_users WHERE email=? AND id!=?',(email,uid)).fetchone():raise HTTPException(409,'이미 사용하는 이메일입니다')
            conn.execute('UPDATE app_users SET role=?,active=?,email=? WHERE id=?',(role,active,email,uid))
            if email!=target['email']:conn.execute('DELETE FROM local_sessions WHERE user_id=?',(uid,))
            record(conn,actor,'user-level',uid)
        return {'ok':True}
    @app.put('/api/auth/profile')
    async def profile(request:Request):
        body=await request.json()
        with lock,database() as conn:
            actor=actor_for(conn,request);data=workspace_data(conn)
            member=next((m for m in data.get('members',[]) if m['id']==actor['member_id']),None)
            if not member:raise HTTPException(409,'멤버 연결 오류')
            if 'nameSuffix' in body:deny('호칭은 데이터베이스에서 관리자만 변경할 수 있습니다')
            for key in ('name','contact','email'):
                if key in body:
                    value=str(body[key]).strip()
                    if len(value)>254 or key=='name' and not value:raise HTTPException(400,'입력값 확인')
                    member[key]=value
            save_workspace(conn,data);record(conn,actor,'profile',member['id'])
        return {'ok':True}
    @app.get('/api/auth/tab-permissions')
    def permissions(request:Request):
        with database() as conn:
            actor=actor_for(conn,request)
            if not is_admin(actor):deny()
            return [dict(r) for r in conn.execute('SELECT owner_id,tab_id,policy FROM tab_permissions')]
    @app.put('/api/auth/tab-permissions')
    async def set_permissions(request:Request):
        body=await request.json();owner=str(body.get('ownerId',''));tab=str(body.get('tabId',''));policy=body.get('policy',{})
        if not isinstance(policy,dict) or len(tab)>150:raise HTTPException(400,'잘못된 권한')
        normalized={role:{action:bool(policy.get(role,{}).get(action,False)) for action in ('view','add','edit','delete')} for role in ROLES[2:]}
        with lock,database() as conn:
            actor=actor_for(conn,request)
            if not is_admin(actor):deny()
            data=workspace_data(conn)
            obj=next((v for k in ('productions','projects') for v in data.get(k,[]) if v['id']==owner and not v.get('deleted')),None)
            if not obj:deny('항목 없음')
            if tab not in ('overview','tasks','schedule','people','materials','tabs','references') and tab not in {'tab:'+t['id'] for t in obj.get('customTabs',[])}:deny('탭 없음')
            conn.execute('INSERT INTO tab_permissions VALUES(?,?,?,?) ON CONFLICT(owner_id,tab_id) DO UPDATE SET policy=excluded.policy,updated_by=excluded.updated_by',(owner,tab,json.dumps(normalized),actor['id']));record(conn,actor,'tab-permissions',owner+':'+tab)
        return {'ok':True}
