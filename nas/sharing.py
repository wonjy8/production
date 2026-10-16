"""Selected-scope, live public shares. Recheck publisher and recipient on every request."""
import copy,json,re,secrets,time,uuid
from datetime import datetime,timezone
from fastapi import HTTPException,Request
from fastapi.responses import JSONResponse,FileResponse
from access import actor_for,is_admin,scope,apply_tab_visibility,workspace_data,permitted,ref_visible,file_ids

TOKEN=re.compile(r'^[A-Za-z0-9_-]{43}$')
def not_found():raise HTTPException(404,'공유가 없거나 더 이상 열 수 없습니다.')
def owner_for(conn,actor,kind,ident):
    w=apply_tab_visibility(conn,scope(workspace_data(conn),actor),actor)
    if kind=='reference':
        row=conn.execute('SELECT payload FROM reference_records WHERE id=?',(ident,)).fetchone();owner=json.loads(row[0]) if row else None
        if not owner or not ref_visible(owner,w,actor):not_found()
    else:owner=next((p for p in w.get('productions' if kind=='production' else 'projects',[]) if p['id']==ident),None)
    if not owner or owner.get('deleted'):not_found()
    return owner,w

def readable_file(conn,actor,ident,w):
    if is_admin(actor):return True
    if ident in file_ids(w):return True
    if conn.execute('SELECT 1 FROM file_uploaders WHERE file_id=? AND user_id=?',(ident,actor['id'])).fetchone():return True
    for row in conn.execute('SELECT payload FROM reference_records'):
        r=json.loads(row[0])
        if not r.get('deleted') and ref_visible(r,w,actor) and ident in file_ids(r):return True
    return False

def projection(conn,actor,policy,strict=False):
    owner,w=owner_for(conn,actor,policy['ownerKind'],policy['ownerId'])
    if actor['role']=='viewer' or policy['ownerKind']!='reference' and not permitted(conn,actor,owner['id'],'overview','edit'):raise HTTPException(403,'공유자의 권한이 변경되었습니다.')
    tabs=owner.get('tabs') if policy['ownerKind']=='reference' else owner.get('customTabs')
    if tabs is None:tabs=[{'id':owner['id']+'-main','name':'자료','modules':owner.get('modules') or owner.get('blocks',[])}]
    modules={(t['id'],m['id']):(t,m) for t in tabs for m in t.get('modules',[]) if m.get('id') and not m.get('deleted')}
    nodes=[];seen=set()
    def add(node,kind,title):
        if not isinstance(node,dict) or node.get('deleted'):return
        key=(kind,node.get('id',title))
        if key not in seen:nodes.append((node,kind,title));seen.add(key)
    def tab_view(tab):
        name='tab:'+tab['id']
        if policy['ownerKind']!='reference' and not permitted(conn,actor,owner['id'],name,'view'):not_found()
        for m in tab.get('modules',[]):add(m,'module',tab.get('name','자료'))
    def files(value):
        out={}
        def walk(v):
            if isinstance(v,list):
                for item in v:walk(item)
            elif isinstance(v,dict) and not v.get('deleted'):
                ident=v.get('fileId') or (v.get('id') if v.get('kind') in ('file','document','image','video','audio','pdf') and not v.get('files') else None)
                if ident:out[ident]=v
                for k,item in v.items():
                    if k not in ('source','sourceMetadata','originalSource','archives','completion'):walk(item)
        walk(value);return out
    available=files({k:v for k,v in owner.items() if k not in ('archives','completion')})
    for s in policy['selectors']:
        kind=s['kind'];ident=s['id']
        if strict:
            exists=(kind=='tab' and any(t['id']==ident for t in tabs) or kind=='module' and (s.get('tabId'),ident) in modules or kind=='file' and ident in available or kind in ('task','schedule') and any(r.get('id')==ident for r in owner.get('tasks' if kind=='task' else 'schedules',[])+([r for r in w.get('timetableSchedules',[]) if r.get('projectId')==owner['id'] or r.get('productionId')==owner['id'] and not r.get('projectId')] if kind=='schedule' else [])))
            if not exists:raise HTTPException(400,'선택한 공유 항목을 찾을 수 없습니다. 새로고침하세요.')
        if kind=='tab':
            tab=next((t for t in tabs if t['id']==ident),None)
            if tab:tab_view(tab)
        elif kind=='module':
            pair=modules.get((s.get('tabId'),ident))
            if pair:
                tab,m=pair
                if policy['ownerKind']!='reference' and not permitted(conn,actor,owner['id'],'tab:'+tab['id'],'view'):not_found()
                add(m,'module',tab.get('name','資料'))
        elif kind in ('schedule','task'):
            tab='schedule' if kind=='schedule' else 'tasks'
            if not permitted(conn,actor,owner['id'],tab,'view'):not_found()
            rows=owner.get('schedules' if kind=='schedule' else 'tasks',[])
            if kind=='schedule':rows=rows+[r for r in w.get('timetableSchedules',[]) if r.get('projectId')==owner['id'] or r.get('productionId')==owner['id'] and not r.get('projectId')]
            for row in rows:
                if row.get('id')==ident:add(row,kind,'일정' if kind=='schedule' else '할 일')
        elif kind=='file':
            if ident in available:add(available[ident],'file','자료')
    result=[];allowed={}
    def card(node,kind,title):
        # Whitelist public fields. Never serialize source links, permissions, member data or archives.
        value={k:node[k] for k in ('title','name','text','body','description','date','endDate','startTime','endTime','due','done','note') if k in node and isinstance(node[k],(str,bool,int,float))}
        value.update(kind=kind,section=title)
        if node.get('kind') in ('link','youtube','embed') and isinstance(node.get('url'),str) and re.match(r'^https?://',node['url']):value['url']=node['url']
        attachments=[]
        for ident,info in files(node).items():
            if not readable_file(conn,actor,ident,w):raise HTTPException(403,'공유 자료의 접근 권한이 변경되었습니다.')
            f=conn.execute('SELECT * FROM files WHERE id=?',(ident,)).fetchone()
            if not f:continue
            name=info.get('name') or info.get('originalName') or info.get('title') or '파일'
            catalog=conn.execute('SELECT payload FROM resource_records WHERE file_id=?',(ident,)).fetchone()
            if catalog:
                metadata=json.loads(catalog[0]);base=metadata.get('filename') or name;title=metadata.get('title') or name
                ext=re.search(r'(\.[A-Za-z0-9]{1,12})$',str(base));suffix=ext.group(1) if ext else ''
                name=title if not suffix or str(title).lower().endswith(suffix.lower()) else str(title)+suffix
            allowed[ident]={'name':str(name)[:250],'mime':f['mime']}
            attachments.append({'id':ident,'name':str(name)[:250],'mime':f['mime'],'size':f['size']})
        value['files']=attachments
        children=node.get('items') or node.get('rows') or []
        if node.get('kind')=='tasks':children=owner.get('tasks',[])
        elif node.get('kind') in ('schedule','schedule-list','timetable'):
            children=owner.get('schedules',[])+[r for r in w.get('timetableSchedules',[]) if r.get('moduleId')==node.get('id') and (r.get('projectId')==owner['id'] or r.get('productionId')==owner['id'] and not r.get('projectId'))]
        value['table']=[[str(cell) for cell in row if isinstance(cell,(str,int,float,bool))] for row in node.get('rows',[]) if isinstance(row,list)]
        if isinstance(node.get('headers'),list):value['headers']=[str(x) for x in node['headers'] if isinstance(x,(str,int,float,bool))]
        value['items']=[{k:item[k] for k in ('title','label','text','body','note','done','state','amount','type','due','date','endDate','startTime','endTime') if k in item and isinstance(item[k],(str,bool,int,float))} for item in children if isinstance(item,dict) and not item.get('deleted')]
        plan=node.get('planData') or {};fields=[f for f in plan.get('fields',[]) if f.get('type') in ('text','number','date','time','select','check')]
        value['records']=[{'title':str(e.get('title','')), 'values':[{ 'label':str(f.get('label','')), 'value':str(e.get('values',{}).get(f['id'],''))} for f in fields]} for e in plan.get('entries',[]) if not e.get('deleted')]
        return value
    for node,kind,title in nodes:
        if node.get('source') and not node.get('sourceCopy') or node.get('dataModuleId'):raise HTTPException(409,'연결 모듈은 독립 사본으로 바꾼 뒤 공유하세요.')
        result.append(card(node,kind,title))
    parent=next((p for p in w.get('productions',[]) if p['id']==owner.get('productionId')),None)
    return {'title':owner.get('name') or owner.get('title','공유 자료'),'completed':owner.get('status')=='완료' or bool(parent and parent.get('status')=='완료'),'items':result},allowed

def validate_policy(data):
    if not isinstance(data,dict) or data.get('ownerKind') not in ('production','project','reference') or not isinstance(data.get('ownerId'),str):raise HTTPException(400,'공유할 프로젝트·자료를 선택하세요.')
    selectors=data.get('selectors')
    if not isinstance(selectors,list) or not 1<=len(selectors)<=100:raise HTTPException(400,'공유할 항목을 1~100개 선택하세요.')
    clean=[]
    for s in selectors:
        if not isinstance(s,dict) or s.get('kind') not in ('tab','module','schedule','task','file') or not isinstance(s.get('id'),str) or not 1<=len(s['id'])<=200 or s.get('kind')=='module' and not isinstance(s.get('tabId'),str):raise HTTPException(400,'잘못된 공유 항목입니다.')
        clean.append({k:s[k] for k in ('kind','id','tabId') if k in s})
    audience=data.get('audience','anyone');emails=data.get('emails',[])
    if audience not in ('anyone','users') or not isinstance(emails,list) or len(emails)>100 or any(not isinstance(e,str) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',e) or len(e)>254 for e in emails):raise HTTPException(400,'접근 방식과 이메일을 확인하세요.')
    emails=sorted(set(e.lower().strip() for e in emails)) if audience=='users' else []
    if audience=='users' and not emails:raise HTTPException(400,'허용할 NAS 계정 이메일을 입력하세요.')
    expires=data.get('expiresAt')
    if expires:
        try:
            if not isinstance(expires,str):raise ValueError()
            expiry=datetime.fromisoformat(expires.replace('Z','+00:00'))
            if not expiry.tzinfo or expiry.timestamp()<=time.time():raise ValueError()
            expires=expiry.astimezone(timezone.utc).isoformat()
        except (TypeError,ValueError):raise HTTPException(400,'미래 만료 시각을 입력하세요.')
    return {'ownerKind':data['ownerKind'],'ownerId':data['ownerId'],'selectors':clean,'audience':audience,'emails':emails,'allowDownload':data.get('allowDownload') is True,'expiresAt':expires or None,'revoked':data.get('revoked') is True}

def remap_shares(conn,mapping,owner_ids):
    for row in conn.execute('SELECT id,payload FROM public_shares').fetchall():
        data=json.loads(row['payload']);changed=False
        if data['ownerId'] not in owner_ids or data['ownerKind']=='reference':continue
        for s in data['selectors']:
            if s['kind']=='file' and s['id'] in mapping:s['id']=mapping[s['id']];changed=True
        if changed:conn.execute('UPDATE public_shares SET payload=?,version=version+1 WHERE id=?',(json.dumps(data,ensure_ascii=False),row['id']))

def install_sharing(app,database,lock,now,json_body,data_root):
    def require_publisher(conn,request):
        actor=actor_for(conn,request)
        if actor['role']=='viewer':raise HTTPException(403,'공유 생성 권한이 없습니다.')
        return actor
    def record(row):return {'id':row['id'],'token':row['token'],**json.loads(row['payload']),'version':row['version']}
    @app.get('/api/shares')
    def list_shares(request:Request):
        with database() as conn:
            actor=require_publisher(conn,request)
            return [record(r) for r in conn.execute('SELECT * FROM public_shares WHERE created_by=? ORDER BY updated_at DESC',(actor['id'],))]
    @app.post('/api/shares')
    async def create(request:Request):
        data=validate_policy(await json_body(request,100000))
        with lock,database() as conn:
            actor=require_publisher(conn,request);projection(conn,actor,data,strict=True)
            if data['audience']=='users' and any(not conn.execute('SELECT 1 FROM app_users WHERE email=? AND active=1',(email,)).fetchone() for email in data['emails']):raise HTTPException(400,'지정 사용자는 먼저 NAS 계정에 등록되어 있어야 합니다.')
            ident=str(uuid.uuid4());token=secrets.token_urlsafe(32)
            conn.execute('INSERT INTO public_shares VALUES(?,?,?,?,1,?)',(ident,token,actor['id'],json.dumps(data,ensure_ascii=False),now()))
            return record(conn.execute('SELECT * FROM public_shares WHERE id=?',(ident,)).fetchone())
    @app.put('/api/shares/{ident}')
    async def update(ident:str,request:Request):
        incoming=await json_body(request,100000)
        if not isinstance(incoming,dict):raise HTTPException(400,'공유 설정을 확인하세요.')
        with lock,database() as conn:
            actor=require_publisher(conn,request);row=conn.execute('SELECT * FROM public_shares WHERE id=? AND created_by=?',(ident,actor['id'])).fetchone()
            if not row:not_found()
            if request.headers.get('if-match')!='"'+str(row['version'])+'"':raise HTTPException(409,'공유 설정이 변경되었습니다. 새로고침하세요.')
            old=json.loads(row['payload'])
            # Revoking must always work, including deleted/unavailable sources.
            data={**old,'revoked':True} if incoming.get('revoked') is True else validate_policy(incoming)
            if not data['revoked']:
                projection(conn,actor,data,strict=True)
                if data['audience']=='users' and any(not conn.execute('SELECT 1 FROM app_users WHERE email=? AND active=1',(email,)).fetchone() for email in data['emails']):raise HTTPException(400,'등록된 NAS 계정 이메일을 입력하세요.')
            conn.execute('UPDATE public_shares SET payload=?,version=version+1,updated_at=? WHERE id=?',(json.dumps(data,ensure_ascii=False),now(),ident))
            return record(conn.execute('SELECT * FROM public_shares WHERE id=?',(ident,)).fetchone())
    def resolve(conn,token,request):
        if not TOKEN.fullmatch(token):not_found()
        row=conn.execute('SELECT * FROM public_shares WHERE token=?',(token,)).fetchone()
        if not row:not_found()
        data=json.loads(row['payload'])
        if data['revoked'] or data.get('expiresAt') and datetime.fromisoformat(data['expiresAt']).timestamp()<=time.time():not_found()
        if data['audience']=='users':
            viewer=actor_for(conn,request)
            if viewer['email'].lower() not in data['emails']:raise HTTPException(403,'이 링크에 지정된 계정으로 로그인하세요.')
        actor=conn.execute('SELECT * FROM app_users WHERE id=? AND active=1',(row['created_by'],)).fetchone()
        if not actor:not_found()
        result,files=projection(conn,dict(actor),data)
        return data,result,files
    @app.get('/api/public-shares/{token}')
    def view(token:str,request:Request):
        with database() as conn:
            data,result,_=resolve(conn,token,request)
            return JSONResponse({**result,'allowDownload':data['allowDownload'],'expiresAt':data['expiresAt']},headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'})
    @app.get('/api/public-shares/{token}/files/{ident}')
    def file(token:str,ident:str,request:Request):
        with database() as conn:
            policy,_,files=resolve(conn,token,request)
            if ident not in files:not_found()
            info=files[ident];download='download' in request.query_params
            safe=info['mime'] in ('image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/webm','application/pdf')
            if download and not policy['allowDownload']:raise HTTPException(403,'이 공유는 파일 다운로드를 허용하지 않습니다.')
            preview=request.query_params.get('preview')=='1'
            path=data_root/'files'/ident
            if preview and (info['mime'].startswith('text/') or info['name'].lower().endswith('.docx')):
                if not path.is_file():not_found()
                if info['name'].lower().endswith('.docx'):
                    import zipfile,xml.etree.ElementTree as ET
                    try:
                        with zipfile.ZipFile(path) as archive:
                            entry=archive.getinfo('word/document.xml')
                            if entry.file_size>8*1024*1024:raise ValueError()
                            root=ET.fromstring(archive.read(entry));text='\n'.join(''.join(p.itertext()) for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'))
                    except (zipfile.BadZipFile,KeyError,ValueError,ET.ParseError):raise HTTPException(422,'문서 미리보기를 만들 수 없습니다.')
                else:
                    with path.open('rb') as stream:text=stream.read(2*1024*1024).decode('utf-8',errors='replace')
                return JSONResponse({'text':text,'truncated':info['mime'].startswith('text/') and path.stat().st_size>2*1024*1024},headers={'Cache-Control':'no-store'})
            if not policy['allowDownload'] and (download or not safe):raise HTTPException(403,'이 공유는 파일 다운로드를 허용하지 않습니다.')
            path=data_root/'files'/ident
            if not path.is_file():not_found()
        return FileResponse(path,media_type=info['mime'] if safe else 'application/octet-stream',filename=info['name'],content_disposition_type='attachment' if download or not safe else 'inline',headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'" if safe else "default-src 'none'; sandbox"})
