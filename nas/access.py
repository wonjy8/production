"""Server-authoritative user membership, scoped workspace and object authorization."""
import copy, hashlib, json, secrets, time, uuid, os
from fastapi import HTTPException
ROLES=('superadmin','admin','operator','advanced','viewer')
PII={'email','contact','affiliations','affiliation','name','nameSuffix','kind','deleted','userId'}
def deny(message='권한이 없습니다'):
    raise HTTPException(403,message)
def is_admin(actor): return actor['role'] in ROLES[:2]
def identity(request):
    uid=request.headers.get('x-auth-user-id','')
    email=request.headers.get('x-auth-user-email','').lower()
    if not uid or not email or request.headers.get('x-auth-verified')!='1': raise HTTPException(401,'로그인이 필요합니다')
    return uid,email

def actor_for(conn,request):
    from local_auth import session_user
    return session_user(conn,request,os.environ['NAS_API_TOKEN'])[0]
def workspace_data(conn):
    row=conn.execute('SELECT payload FROM workspace WHERE id=1').fetchone()
    return json.loads(row[0]) if row else {'projects':[],'productions':[],'members':[]}
def scope(data,actor):
    if is_admin(actor): return copy.deepcopy(data)
    mid=actor['member_id'];out=copy.deepcopy(data)
    groups=[g for g in data.get('productions',[]) if not g.get('deleted') and (mid in g.get('memberIds',[]) or any(any(a.get('memberId')==mid for a in t.get('members',[])) for t in g.get('teams',[])))]
    gids={g['id'] for g in groups};projects=[p for p in data.get('projects',[]) if not p.get('deleted') and (p.get('productionId') in gids or mid in p.get('memberIds',[]))]
    mids={mid}
    for g in groups:
        mids.update(g.get('memberIds',[]))
        for t in g.get('teams',[]):mids.update(a.get('memberId') for a in t.get('members',[]))
    out['productions']=copy.deepcopy(groups);out['projects']=copy.deepcopy(projects)
    out['members']=[copy.deepcopy(m) if m['id']==mid else {k:v for k,v in m.items() if k in ('id','name','nameSuffix','kind','deleted')} for m in data.get('members',[]) if m['id'] in mids]
    out['equipment']=[e for e in data.get('equipment',[]) if e.get('ownerId') in mids]
    out['rentalShops']=[];out['locations']=[]
    out['timetableSchedules']=[s for s in data.get('timetableSchedules',[]) if s.get('productionId') in gids]
    return out

def permitted(conn,actor,owner_id,tab,action):
    if is_admin(actor):return True
    row=conn.execute('SELECT policy FROM tab_permissions WHERE owner_id=? AND tab_id=?',(owner_id,tab)).fetchone()
    if row:return bool(json.loads(row[0]).get(actor['role'],{}).get(action,False))
    if actor['role']=='viewer':return action=='view'
    if tab=='people':return actor['role']=='operator'
    if tab=='overview':return actor['role']=='operator' or action=='view'
    return True

def apply_tab_visibility(conn,data,actor):
    for key in ('productions','projects'):
        for obj in data.get(key,[]):
            if not permitted(conn,actor,obj['id'],'tasks','view'):obj['tasks']=[]
            if not permitted(conn,actor,obj['id'],'schedule','view'):obj['schedules']=[]
            if not permitted(conn,actor,obj['id'],'materials','view'):
                obj['modules']=[];obj['productionAssets']=[]
            if 'customTabs' in obj:obj['customTabs']=[t for t in obj['customTabs'] if permitted(conn,actor,obj['id'],'tab:'+t['id'],'view')]
            # Frozen records still contain tasks and files; hide an archive if any captured scope is unavailable.
            visible_ids={item['id'] for collection in ('productions','projects') for item in data.get(collection,[])}
            if 'archives' in obj:
                obj['archives']=[archive for archive in obj.get('archives',[]) if all(
                    row.get('owner',{}).get('id') in visible_ids and all(permitted(conn,actor,row['owner']['id'],tab,'view') for tab in ('overview','tasks','schedule','materials')) and all(permitted(conn,actor,row['owner']['id'],'tab:'+tab['id'],'view') for tab in row['owner'].get('customTabs',[]))
                    for row in archive.get('snapshot',[])) and all(permitted(conn,actor,obj['id'],tab,'view') for tab in ('overview','materials'))]

    return data

def validate_list_changes(conn,actor,owner,tab,old,new):
    if old==new:return
    om={str(v.get('id',i)):v for i,v in enumerate(old)};nm={str(v.get('id',i)):v for i,v in enumerate(new)}
    for key in om.keys()|nm.keys():
        action='add' if key not in om else 'delete' if key not in nm else 'edit'
        if om.get(key)!=nm.get(key) and not permitted(conn,actor,owner,tab,action):deny()
    if om==nm and old!=new and not permitted(conn,actor,owner,tab,'edit'):deny()

def merge_workspace(conn,full,incoming,actor):
    visible=apply_tab_visibility(conn,scope(full,actor),actor)
    result=copy.deepcopy(full)
    catalogs={'equipmentCatalog','cameraCatalog','projectCatalog','affiliationCatalog','equipmentBrands'}
    for key in set(incoming)|set(visible):
        if key in ('productions','projects','members','equipment','timetableSchedules'):continue
        if incoming.get(key)!=visible.get(key):
            if not is_admin(actor):deny('전체 설정은 관리자만 수정할 수 있습니다')
            if key in incoming:result[key]=incoming[key]
    for key in ('productions','projects'):
        old={p['id']:p for p in full.get(key,[])};shown={p['id']:p for p in visible.get(key,[])};sent={p['id']:p for p in incoming.get(key,[])}
        if set(sent)-set(shown) and not is_admin(actor):
            groups={g['id'] for g in visible.get('productions',[])}
            if key!='projects' or actor['role']!='operator' or any(sent[i].get('productionId') not in groups or not permitted(conn,actor,sent[i].get('productionId'),'overview','add') for i in set(sent)-set(shown)):deny('생성 권한이 없습니다')
        for ident,obj in sent.items():
            if ident not in old:
                result.setdefault(key,[]).append(obj);continue
            if ident not in shown:deny()
            before=shown[ident];merged=copy.deepcopy(old[ident])
            for field in set(before)|set(obj):
                if before.get(field)==obj.get(field):continue
                a,b=before.get(field),obj.get(field)
                tab='tasks' if field=='tasks' else 'schedule' if field=='schedules' else 'people' if field in ('memberIds','teams','teamGroups','memberOrder') else 'materials' if field in ('modules','productionAssets') else 'overview'
                if field=='archives':
                    visible_archive_ids={a['id'] for a in before.get('archives',[])}
                    hidden_archives=[a for a in old[ident].get('archives',[]) if a['id'] not in visible_archive_ids]
                    if not permitted(conn,actor,ident,'overview','edit') or not permitted(conn,actor,ident,'materials','view'):deny()
                    merged[field]=hidden_archives+(b or []);continue
                if field=='customTabs':
                    if actor['role']=='viewer':
                        # A viewer may edit an existing tab's contents only if an administrator explicitly permits it.
                        if {t['id'] for t in a or []}!={t['id'] for t in b or []}:deny()
                    aa={t['id']:t for t in a or []};bb={t['id']:t for t in b or []}
                    for tid in aa.keys()|bb.keys():
                        if aa.get(tid)!=bb.get(tid) and not permitted(conn,actor,ident,'tab:'+tid,'add' if tid not in aa else 'delete' if tid not in bb else 'edit'):deny()
                    hidden=[t for t in old[ident].get(field,[]) if t['id'] not in aa];merged[field]=hidden+(b or []);continue
                if field in ('tabOrder','tabLabels','hiddenTabs'):tab='tabs'
                if isinstance(a,list) and isinstance(b,list) and field in ('tasks','schedules','modules','productionAssets','teams','teamGroups'):
                    validate_list_changes(conn,actor,ident,tab,a,b)
                elif not permitted(conn,actor,ident,tab,'edit'):
                    linked=[item for item in obj.get('schedules',[]) if item.get('projectLinked') and item not in before.get('schedules',[])]
                    projected=field in ('due','description') and linked and any((item.get('endDate') if field=='due' else item.get('note',''))==b for item in linked) and permitted(conn,actor,ident,'schedule','edit')
                    if not projected:deny()
                merged[field]=b
            result[key]=[merged if p['id']==ident else p for p in result.get(key,[])]
        for ident in shown.keys()-sent.keys():
            if not is_admin(actor):deny()
            result[key]=[p for p in result.get(key,[]) if p['id']!=ident]
    mids={m['id']:m for m in full.get('members',[])};shown={m['id']:m for m in visible.get('members',[])}
    for m in incoming.get('members',[]):
        if m['id'] not in shown:
            if not is_admin(actor):deny()
            result.setdefault('members',[]).append(m);continue
        if m==shown[m['id']]:continue
        suffix_changed=m.get('nameSuffix')!=shown[m['id']].get('nameSuffix')
        if suffix_changed and not is_admin(actor):deny('호칭은 관리자만 수정할 수 있습니다')
        other_changes={k:v for k,v in m.items() if k!='nameSuffix'}!={k:v for k,v in shown[m['id']].items() if k!='nameSuffix'}
        if other_changes and actor['role']!='superadmin' and actor['member_id']!=m['id']:deny('본인 개인정보만 수정할 수 있습니다')
        # Account identity is not a profile property and cannot be reassigned through a workspace save.
        if m.get('userId')!=shown[m['id']].get('userId'):deny()
        if m.get('kind', 'personal')!=mids[m['id']].get('kind','personal') and conn.execute('SELECT 1 FROM app_users WHERE member_id=?',(m['id'],)).fetchone():deny('가입한 개인 계정은 팀으로 바꿀 수 없습니다')
        updated={**mids[m['id']],**m};result['members']=[updated if v['id']==m['id'] else v for v in result.get('members',[])]
    if set(shown)-{m['id'] for m in incoming.get('members',[])}:deny('멤버 삭제는 계정 관리에서 처리하세요')
    for key in ('equipment','timetableSchedules'):
        if incoming.get(key,[])==visible.get(key,[]):continue
        if key=='equipment' and not is_admin(actor):deny('장비 수정은 관리자만 가능합니다')
        if key=='timetableSchedules':
            old={v['id']:v for v in visible.get(key,[])};new={v['id']:v for v in incoming.get(key,[])}
            for ident in old.keys()|new.keys():
                if old.get(ident)==new.get(ident):continue
                obj=new.get(ident) or old[ident];gid=obj.get('productionId');action='add' if ident not in old else 'delete' if ident not in new else 'edit'
                if not gid or gid not in {g['id'] for g in visible.get('productions',[])} or not permitted(conn,actor,gid,'schedule',action):deny()
        shown_ids={v['id'] for v in visible.get(key,[])};incoming_ids={v['id'] for v in incoming.get(key,[])}
        hidden=[v for v in full.get(key,[]) if v['id'] not in shown_ids]
        if any(v['id'] in {x['id'] for x in hidden} for v in incoming.get(key,[])):deny()
        result[key]=hidden+incoming.get(key,[])
    return result

def ref_visible(item,data,actor):
    return is_admin(actor) or item.get('ownerUserId')==actor['id'] or item.get('productionId') in {g['id'] for g in data.get('productions',[])} or item.get('projectId') in {p['id'] for p in data.get('projects',[])}
def file_ids(value):
    ids=set()
    if isinstance(value,dict):
        if value.get('fileId'):ids.add(value['fileId'])
        if value.get('kind') in ('image','video','audio','pdf','file','document') and value.get('id'):ids.add(value['id'])
        ids.update(i for v in value.values() for i in file_ids(v))
    elif isinstance(value,str) and value.startswith('/api/ref-files/'):
        ids.add(value.split('/api/ref-files/')[-1].split('?')[0])
    elif isinstance(value,list):ids.update(i for v in value for i in file_ids(v))
    return ids
