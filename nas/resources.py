"""Independent resource catalog; legacy placements are registered without rewriting originals."""
import hashlib,json,re,uuid
from fastapi import Request,HTTPException
from access import actor_for,is_admin,scope,apply_tab_visibility,workspace_data,ref_visible,permitted,deny

def link_id(url): return str(uuid.UUID(hashlib.sha256(url.encode()).hexdigest()[:32]))
def catalog_entries(workspace, references):
    rows={}
    def walk(value,origin,tags=()):
        if isinstance(value,list):
            for node in value:walk(node,origin,tags)
        elif isinstance(value,dict) and not value.get('deleted') and not value.get('hidden'):
            tags=list(dict.fromkeys([*tags,*[t for t in (value.get('tags') or []) if isinstance(t,str)]]))
            ident=value.get('fileId') or (value.get('id') if value.get('kind') in ('image','video','audio','pdf','file','document') or value.get('mime') else None)
            url=value.get('url') if value.get('kind') in ('link','youtube','embed') else None
            text=value.get('text') if value.get('kind')=='text' and value.get('id') else None
            if not ident and isinstance(text,str):ident=link_id('text:'+str(origin['ownerId'])+':'+str(value['id']))
            text_only=isinstance(text,str)
            if ident or isinstance(url,str) and re.match(r'^https?://',url):
                key=ident or link_id(url)
                row=rows.setdefault(key,{'id':key,'fileId':None if text_only else ident,'url':url if not ident else '', 'title':value.get('name') or value.get('originalName') or value.get('title') or ('텍스트' if text_only else '링크' if url else '파일'),'filename':value.get('name') or value.get('originalName') or '', 'mime':value.get('mime',''),'size':value.get('size',0),'kind':value.get('kind','file'),'tags':[], 'properties':value.get('resourceProperties',{}),'propertyLabels':value.get('resourcePropertyLabels',{}),'origins':[]})
                if text_only:row['content']=text
                row['tags']=list(dict.fromkeys([*row['tags'],*tags]))[:30]
                if origin not in row['origins']:row['origins'].append(origin)
            for field,node in value.items():
                if field in ('source','photoEdit','archives','resourceProperties','resourcePropertyLabels'):continue
                if field in ('tabs','customTabs') and isinstance(node,list):
                    for tab in node:walk(tab,{**origin,'tabId':tab.get('id'),'tabName':tab.get('name')},tags)
                elif field in ('modules','blocks') and isinstance(node,list):
                    for module in node:walk(module,{**origin,'moduleId':module.get('id'),'moduleName':module.get('title')},tags)
                else:walk(node,origin,tags)
    for key,kind in [('projects','project'),('productions','production')]:
        for owner in workspace.get(key,[]):walk(owner,{'ownerKind':kind,'ownerId':owner['id'],'ownerName':owner.get('name') or owner.get('title','')})
    for owner in references:walk(owner,{'ownerKind':'reference','ownerId':owner['id'],'ownerName':owner.get('title','')})
    return rows

def install_resources(app,database,write_lock,now,json_body,can_edit_file):
    def sync_catalog(conn):
        full=workspace_data(conn);refs=[json.loads(r[0]) for r in conn.execute('SELECT payload FROM reference_records')]
        all_rows=catalog_entries(full,refs)
        for ident,item in all_rows.items():
            if item['fileId'] and not conn.execute('SELECT 1 FROM files WHERE id=?',(item['fileId'],)).fetchone():continue
            owner=conn.execute('SELECT user_id FROM file_uploaders WHERE file_id=?',(item['fileId'],)).fetchone() if item['fileId'] else None
            payload={k:v for k,v in item.items() if k!='origins'}
            existing=conn.execute('SELECT payload FROM resource_records WHERE id=?',(ident,)).fetchone()
            if existing and item.get('kind')=='text':
                previous=json.loads(existing[0])
                if previous.get('content')!=item.get('content'):
                    previous['content']=item.get('content');conn.execute('UPDATE resource_records SET payload=?,version=version+1,updated_at=? WHERE id=?',(json.dumps(previous,ensure_ascii=False),now(),ident))
            conn.execute('INSERT OR IGNORE INTO resource_records(id,file_id,owner_user_id,payload,version,updated_at) VALUES(?,?,?,?,1,?)',(ident,item['fileId'],owner[0] if owner else '',json.dumps(payload,ensure_ascii=False),now()))
    def discover(conn,actor):
        sync_catalog(conn)
        full=workspace_data(conn);refs=[json.loads(r[0]) for r in conn.execute('SELECT payload FROM reference_records')]
        visible=apply_tab_visibility(conn,scope(full,actor),actor)
        scoped=catalog_entries(visible,[r for r in refs if ref_visible(r,visible,actor)])
        result={}
        for record in conn.execute('SELECT * FROM resource_records'):
            ident=record['id']
            if not (is_admin(actor) or ident in scoped or record['owner_user_id']==actor['id']):continue
            if record['file_id'] and not conn.execute('SELECT 1 FROM files WHERE id=?',(record['file_id'],)).fetchone():continue
            item=json.loads(record['payload']);item.update(version=record['version'],updatedAt=record['updated_at'],origins=scoped.get(ident,{}).get('origins',[]))
            if record['file_id']:
                f=conn.execute('SELECT size,mime,sha256 FROM files WHERE id=?',(record['file_id'],)).fetchone();item.update(size=f['size'],mime=f['mime'],sha256=f['sha256'])
            item['canEdit']=actor['role']!='viewer' and (can_edit_file(conn,actor,record['file_id']) if record['file_id'] else is_admin(actor) or record['owner_user_id']==actor['id'] or any(o['ownerKind']=='reference' or permitted(conn,actor,o['ownerId'],'tab:'+o['tabId'] if o.get('tabId') else 'materials','edit') for o in item['origins']))
            result[ident]=item
        return result
    @app.get('/api/database/resources')
    def resources(request:Request):
        with write_lock,database() as conn:
            actor=actor_for(conn,request);items=discover(conn,actor)
            return list(items.values())
    @app.put('/api/database/resources/{ident}')
    async def put_resource(ident:str,request:Request):
        data=await json_body(request,100000)
        if not re.fullmatch(r'[a-f0-9-]{36}',ident) or not isinstance(data,dict):raise HTTPException(400,'Invalid resource')
        with write_lock,database() as conn:
            actor=actor_for(conn,request);items=discover(conn,actor);old=items.get(ident)
            exists=conn.execute('SELECT 1 FROM resource_records WHERE id=?',(ident,)).fetchone()
            if actor['role']=='viewer' or exists and not old or old and not old['canEdit']:deny()
            if not old:
                file_id=data.get('fileId');url=data.get('url','')
                if file_id:
                    if ident!=file_id or not conn.execute('SELECT 1 FROM files WHERE id=?',(file_id,)).fetchone() or not can_edit_file(conn,actor,file_id):deny()
                elif not isinstance(url,str) or not re.match(r'^https?://',url) or len(url)>4000:raise HTTPException(400,'Invalid resource URL')
                old={'id':ident,'fileId':file_id,'url':url,'kind':data.get('kind','file'),'mime':data.get('mime',''),'filename':str(data.get('filename',''))[:250],'version':0,'origins':[]}
            if request.headers.get('if-match')!='"'+str(old['version'])+'"':raise HTTPException(409,'자료가 다른 곳에서 변경되었습니다. 새로고침 후 다시 시도하세요.')
            title=data.get('title','');tags=data.get('tags',[]);props=data.get('properties',{})
            if not isinstance(title,str) or not title.strip() or len(title)>200 or not isinstance(tags,list) or len(tags)>30 or any(not isinstance(t,str) or len(t)>100 for t in tags) or not isinstance(props,dict) or len(props)>50 or any(not isinstance(k,str) or len(k)>80 or not isinstance(v,str) or len(v)>2000 for k,v in props.items()):raise HTTPException(400,'Invalid resource properties')
            item={k:v for k,v in old.items() if k not in ('version','updatedAt','origins','canEdit')};item.update(title=title.strip(),tags=tags,properties=props,deleted=bool(data.get('deleted',False)))
            labels=data.get('propertyLabels',old.get('propertyLabels',{}))
            if not isinstance(labels,dict) or len(labels)>50 or any(not isinstance(k,str) or len(k)>80 or not isinstance(v,str) or len(v)>80 for k,v in labels.items()):raise HTTPException(400,'Invalid resource property labels')
            item['propertyLabels']=labels
            version=old['version']+1;stamp=now()
            conn.execute('INSERT INTO resource_records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at',(ident,item.get('fileId'),actor['id'],json.dumps(item,ensure_ascii=False),version,stamp))
            return {**item,'version':version,'updatedAt':stamp,'origins':old['origins'],'canEdit':True}

    with write_lock,database() as conn:sync_catalog(conn)
    return sync_catalog
