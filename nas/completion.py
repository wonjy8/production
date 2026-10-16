"""Server-owned completion copies. No user-controlled flags can unlock a frozen file."""
import copy,hashlib,json,shutil,uuid,re
from pathlib import Path
from fastapi import HTTPException

KEYS=('productions','projects')
def owners(workspace):return [p for key in KEYS for p in workspace.get(key,[])]
def locked(workspace,owner):
    return owner.get('status')=='완료' or any(p.get('id')==owner.get('productionId') and p.get('status')=='완료' for p in workspace.get('productions',[]))
def frozen(conn,ident):
    row=conn.execute('SELECT payload FROM resource_records WHERE id=? OR file_id=?',(ident,ident)).fetchone()
    return bool(row and json.loads(row[0]).get('completionOwner'))
def assert_changes(before,after):
    new={p['id']:p for p in owners(after)}
    for old in owners(before):
        if not locked(before,old):continue
        item=new.get(old['id'])
        if item is None:raise HTTPException(409,'완료된 프로젝트는 읽기 전용입니다. 먼저 다시 진행으로 전환하세요.')
        parent_locked=any(p.get('id')==old.get('productionId') and p.get('status')=='완료' for p in before.get('productions',[]))
        allowed={'status','updatedAt','completionRequested'} if old.get('status')=='완료' and not parent_locked else set()
        if {k:v for k,v in old.items() if k not in allowed}!={k:v for k,v in item.items() if k not in allowed}:raise HTTPException(409,'완료된 프로젝트는 읽기 전용입니다. 먼저 다시 진행으로 전환하세요.')
    old_ids={p['id'] for p in owners(before)};locked_parents={p['id'] for p in before.get('productions',[]) if p.get('status')=='완료'}
    if any(p['id'] not in old_ids and p.get('productionId') in locked_parents for p in owners(after)):raise HTTPException(409,'완료 프로젝트에 업무 그룹을 추가할 수 없습니다.')
    for key in KEYS:
        old={p['id']:p for p in before.get(key,[])}
        for item in after.get(key,[]):
            if item.get('completion')!=old.get(item['id'],{}).get('completion'):raise HTTPException(409,'완료 보존 정보는 서버에서 관리합니다.')
    old={s['id']:s for s in before.get('timetableSchedules',[])};new={s['id']:s for s in after.get('timetableSchedules',[])}
    locked_ids={p['id'] for p in owners(before) if locked(before,p)}
    for ident in old.keys()|new.keys():
        if old.get(ident)!=new.get(ident) and any((s or {}).get(k) in locked_ids for s in [old.get(ident),new.get(ident)] for k in ('productionId','projectId')):raise HTTPException(409,'완료 프로젝트의 일정은 수정할 수 없습니다.')

def referenced_files(value,known):
    result=set()
    def walk(node):
        if isinstance(node,list):
            for child in node:walk(child)
        elif isinstance(node,dict):
            ident=node.get('fileId')
            if ident:result.add(ident)
            ident=node.get('id')
            if ident in known or ident and not any(k in node for k in ('files','groups','modules','blocks')) and (node.get('kind') in ('file','document','image','video','audio','pdf') or node.get('mime')) and (node.get('name') or node.get('originalName') or node.get('mime')):result.add(ident)
            for k,child in node.items():
                if k!='source':walk(child)
        elif isinstance(node,str):
            result.update(re.findall(r'/api/ref-files/([a-f0-9-]{36})',node))
    walk(value);return result

def apply_completion(conn,before,after,actor,stamp,catalog_entries,resource_origins,created):
    assert_changes(before,after)
    previous={p['id']:p for p in owners(before)}
    root=Path(conn.execute('PRAGMA database_list').fetchone()[2]).parent
    # Reopening converts those same copies to working originals, never back to another project's source.
    for owner in owners(after):
        old=previous.get(owner['id'],{})
        if old.get('completion') and old.get('status')=='완료' and owner.get('status')!='완료':
            for record in conn.execute('SELECT id,payload FROM resource_records').fetchall():
                item=json.loads(record['payload'])
                if item.get('completionOwner',{}).get('id')==owner['id']:
                    item.pop('completionOwner',None);item.pop('completedAt',None)
                    conn.execute('UPDATE resource_records SET payload=?,version=version+1,updated_at=? WHERE id=?',(json.dumps(item,ensure_ascii=False),stamp,record['id']))
            archive_ids=set(old['completion'].get('archiveIds',[]))
            owner['archives']=[a for a in owner.get('archives',[]) if a['id'] not in archive_ids]
            owner.pop('completion',None)
    for key in KEYS:
        for owner in after.get(key,[]):
            old=previous.get(owner['id'],{})
            requested=owner.pop('completionRequested',False)
            if owner.get('status')!='완료' or old.get('status')=='완료' and not (requested and not old.get('completion')):continue
            if key=='projects' and any(p.get('id')==owner.get('productionId') and p.get('status')=='완료' for p in after.get('productions',[])):continue
            scoped=[owner]+([p for p in after.get('projects',[]) if p.get('productionId')==owner['id'] and not p.get('deleted') and p.get('status')!='완료'] if key=='productions' else [])
            if any((m.get('source') and not m.get('sourceCopy')) or m.get('dataModuleId') for p in scoped for t in p.get('customTabs',[]) for m in t.get('modules',[])):raise HTTPException(409,'연결된 모듈의 사본 준비가 필요합니다. 앱의 완료 점검을 통해 다시 완료하세요.')
            catalog=catalog_entries({'productions':scoped if key=='productions' else [],'projects':scoped[1:] if key=='productions' else scoped},[],include_hidden=True)
            ids=referenced_files(scoped,{r[0] for r in conn.execute('SELECT id FROM files')})
            catalog={ident:entry for ident,entry in catalog.items() if not entry.get('fileId') or entry['fileId'] in ids}
            for ident in ids:
                catalog.setdefault(ident,{'id':ident,'fileId':ident,'origins':[]})
            required=sum(r[0] for ident in ids for r in conn.execute('SELECT size FROM files WHERE id=?',(ident,)))
            if shutil.disk_usage(root).free<required+1024*1024:raise HTTPException(507,'완료 보존본을 만들 저장 공간이 부족합니다.')
            mapping={};urls={};texts={};folder={'id':owner['id'],'kind':'production' if key=='productions' else 'project','name':owner.get('name') or owner.get('title','프로젝트')}
            for ident,entry in catalog.items():
                record=conn.execute('SELECT * FROM resource_records WHERE id=?',(ident,)).fetchone()
                meta=json.loads(record['payload']) if record else {k:v for k,v in entry.items() if k!='origins'}
                new_id=str(uuid.uuid4());mapping[ident]=new_id
                file_id=meta.get('fileId') or entry.get('fileId')
                if file_id:
                    file=conn.execute('SELECT * FROM files WHERE id=?',(file_id,)).fetchone();source=root/'files'/file_id
                    if not file or not source.is_file():raise HTTPException(409,'보존할 원본 파일을 찾을 수 없습니다.')
                    target=root/'files'/new_id;created.append(target);shutil.copyfile(source,target)
                    with target.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
                    if digest!=file['sha256'] or target.stat().st_size!=file['size']:raise HTTPException(409,'원본 파일 검증에 실패했습니다.')
                    conn.execute('INSERT INTO files VALUES(?,?,?,?,?)',(new_id,file['mime'],file['size'],digest,stamp))
                    uploader=conn.execute('SELECT user_id FROM file_uploaders WHERE file_id=?',(file_id,)).fetchone()
                    if uploader:conn.execute('INSERT INTO file_uploaders VALUES(?,?)',(new_id,uploader[0]))
                    meta['fileId']=new_id;mapping[file_id]=new_id
                elif meta.get('url'):urls[meta['url']]=new_id
                if entry.get('sourceTextKey'):texts[entry['sourceTextKey']]=new_id
                meta.update(id=new_id,completionOwner=folder,completedAt=stamp,completionOf=ident,libraryPinned=False)
                for field in ('deleted','deletedAt','purged','catalogSeed'):meta.pop(field,None)
                conn.execute('INSERT INTO resource_records VALUES(?,?,?,?,1,?)',(new_id,meta.get('fileId'),record['owner_user_id'] if record else '',json.dumps(meta,ensure_ascii=False),stamp))
            def rewrite(value,owner_id):
                if isinstance(value,list):return [rewrite(v,owner_id) for v in value]
                if isinstance(value,dict):
                    result={k:rewrite(v,owner_id) for k,v in value.items()}
                    if value.get('kind') in ('link','youtube','embed') and value.get('url') in urls:result['resourceId']=urls[value['url']]
                    if value.get('kind')=='text' and owner_id+':'+str(value.get('id')) in texts:result['resourceId']=texts[owner_id+':'+str(value.get('id'))]
                    return result
                if isinstance(value,str):
                    if value in mapping:return mapping[value]
                    for ident,new_id in mapping.items():
                        if '/ref-files/'+ident in value:value=value.replace('/ref-files/'+ident,'/ref-files/'+new_id)
                    return value
                return value
            for item in scoped:
                updated=rewrite(item,item['id']);item.clear();item.update(updated)
            old_archive_ids={a['id'] for a in old.get('archives',[])}
            owner['completion']={'completedAt':stamp,'resourceIds':list(mapping.values()),'archiveIds':[a['id'] for a in owner.get('archives',[]) if a['id'] not in old_archive_ids]}
            # Unique project uploads are retired to recoverable trash, never physically deleted here.
            references=[json.loads(r[0]) for r in conn.execute('SELECT payload FROM reference_records')]
            usage=resource_origins(after,references)
            for ident in mapping:
                record=conn.execute('SELECT payload FROM resource_records WHERE id=?',(ident,)).fetchone()
                if not record:continue
                meta=json.loads(record[0])
                if not usage.get(ident,{}).get('origins') and not meta.get('libraryPinned',True) and not meta.get('properties',{}).get('category'):
                    meta.update(deleted=True,deletedAt=stamp)
                    conn.execute('UPDATE resource_records SET payload=?,version=version+1,updated_at=? WHERE id=?',(json.dumps(meta,ensure_ascii=False),stamp,ident))
    return after
