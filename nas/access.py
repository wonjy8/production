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
            if not permitted(conn,actor,obj['id'],'overview','view'):obj['planning']={}
            if not permitted(conn,actor,obj['id'],'tasks','view'):obj['tasks']=[]
            if not permitted(conn,actor,obj['id'],'schedule','view'):
                obj['schedules']=[];obj['calendarPreferences']={};obj['scheduleTemplates']=[]
            if not permitted(conn,actor,obj['id'],'materials','view'):
                obj['modules']=[];obj['productionAssets']=[]
            if 'customTabs' in obj:obj['customTabs']=[t for t in obj['customTabs'] if permitted(conn,actor,obj['id'],'tab:'+t['id'],'view')]
            if 'groupTemplates' in obj:
                visible_owners={p['id'] for name in ('projects','productions') for p in data.get(name,[])}
                obj['groupTemplates']=[t for t in obj['groupTemplates'] if permitted(conn,actor,obj['id'],'overview','view') and (not t.get('sourceOwnerId') or t['sourceOwnerId'] in visible_owners and all(permitted(conn,actor,t['sourceOwnerId'],tab,'view') for tab in ['overview','tasks','schedule','materials']+['tab:'+tid for tid in t.get('sourceTabIds',[])]))]
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
                tab='tasks' if field=='tasks' else 'schedule' if field in ('schedules','calendarPreferences','scheduleTemplates') else 'people' if field in ('memberIds','teams','teamGroups','memberOrder') else 'materials' if field in ('modules','productionAssets') else 'overview'
                if field=='groupTemplates':
                    visible_ids={t['id'] for t in before.get('groupTemplates',[])}
                    hidden=[t for t in old[ident].get('groupTemplates',[]) if t['id'] not in visible_ids]
                    if {t['id'] for t in hidden}&{t['id'] for t in b or []}:deny()
                    validate_list_changes(conn,actor,ident,'overview',a or [],b or [])
                    visible_owner_ids={p['id'] for collection in ('productions','projects') for p in visible.get(collection,[])}
                    for template in b or []:
                        if template.get('sourceOwnerId') and template['sourceOwnerId'] not in visible_owner_ids:deny()
                    merged[field]=hidden+(b or []);continue
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
                if field=='planning' and not permitted(conn,actor,ident,'overview','edit'):
                    bound=before.get('eventScheduleId') or before.get('planningScheduleId')
                    source=next((s for s in obj.get('schedules',[]) if s.get('id')==bound),None)
                    previous_source=next((s for s in before.get('schedules',[]) if s.get('id')==bound),None)
                    dates={'startDate','endDate','location'}
                    clean=isinstance(b,dict) and {k:v for k,v in b.items() if k not in dates}=={k:v for k,v in (a or {}).items() if k not in dates}
                    matches=clean and source and source!=previous_source and b.get('startDate')==source.get('date') and b.get('endDate')==(source.get('endDate') or source.get('date')) and b.get('location','')==source.get('location','') and permitted(conn,actor,ident,'schedule','edit')
                    removed=clean and previous_source and not source and ('location' not in b or b.get('location','')==(a or {}).get('location','')) and not b.get('startDate') and not b.get('endDate') and permitted(conn,actor,ident,'schedule','delete')
                    if not clean or not bound or not (matches or removed):deny()
                    merged[field]={**old[ident].get('planning',{}),**b};continue
                if field in ('tabOrder','tabLabels','hiddenTabs'):tab='tabs'
                if isinstance(a,list) and isinstance(b,list) and field in ('tasks','schedules','modules','productionAssets','teams','teamGroups'):
                    validate_list_changes(conn,actor,ident,tab,a,b)
                elif not permitted(conn,actor,ident,tab,'edit'):
                    linked=[item for item in obj.get('schedules',[]) if (item.get('projectLinked') or item.get('eventGroupId')==ident) and item not in before.get('schedules',[])]
                    projected=field in ('due','description') and linked and any((item.get('endDate') if field=='due' else item.get('note',''))==b for item in linked) and permitted(conn,actor,ident,'schedule','edit')
                    if field in ('name','title') and before.get('groupType')=='event':
                        projected=any(item.get('id')==before.get('eventScheduleId') and item.get('eventGroupId')==ident and item.get('title')==b for item in linked) and permitted(conn,actor,ident,'schedule','edit')
                    if field=='due' and not b and before.get('groupType')=='event' and before.get('eventScheduleId') and any(s.get('id')==before['eventScheduleId'] and s.get('eventGroupId')==ident for s in before.get('schedules',[])) and not any(s.get('id')==before['eventScheduleId'] for s in obj.get('schedules',[])) and permitted(conn,actor,ident,'schedule','delete'):projected=True
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
    validate_event_changes(full,result)
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


def validate_event_changes(before, after):
    """Validate edited fields only; preserve untouched legacy records."""
    import math
    from datetime import date
    def invalid(message):raise HTTPException(422,message)
    def amount(value, optional=False):
        if value is None and optional:return
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0 or value*100>9007199254740991 or abs(value*100-round(value*100))>0.0001:invalid('금액은 0 이상의 숫자, 소수점 두 자리까지 입력하세요.')
    def planning(p):
        if not isinstance(p,dict):invalid('행사 정보를 확인하세요.')
        for k in ('startDate','endDate'):
            if p.get(k):
                try:date.fromisoformat(p[k])
                except (ValueError,TypeError):invalid('행사 날짜를 확인하세요.')
        if p.get('startDate') and p.get('endDate') and p['endDate']<p['startDate']:invalid('행사 종료일을 확인하세요.')
        for k in ('budgetMin','budgetMax'):amount(p.get(k),True)
        if p.get('budgetMin') is not None and p.get('budgetMax') is not None and p['budgetMax']<p['budgetMin']:invalid('예산 범위를 확인하세요.')
        for k in ('location','goal','stakeholders','risk'):
            if len(str(p.get(k,'')))>(160 if k=='location' else 2000):invalid('행사 정보 길이를 확인하세요.')
    def modules(new,old):
        if isinstance(new,list):
            previous={n.get('id'):n for n in old or [] if isinstance(n,dict)} if isinstance(old,list) else {}
            for node in new:
                if isinstance(node,dict):modules(node,previous.get(node.get('id'),{}))
        elif isinstance(new,dict):
            old=old if isinstance(old,dict) else {}
            if new==old:return
            if new.get('kind')=='accounting':
                if 'budget' in new:amount(new['budget'])
                for row in new.get('rows',[]):
                    for key in ('amount','actual','planned','estimate','contract'):
                        if key in row:amount(row[key],key not in ('amount','actual'))
                    if row.get('vatMode','included') not in ('included','exclusive','exempt'):invalid('VAT 처리를 확인하세요.')
                    rate=row.get('vatRate',10)
                    if isinstance(rate,bool) or not isinstance(rate,(int,float)) or not math.isfinite(rate) or not 0<=rate<=100:invalid('VAT 세율을 확인하세요.')
                    for payment in row.get('payments',[]):
                        amount(payment.get('amount'))
                        if payment.get('status','planned') not in ('planned','requested','paid'):invalid('지급 상태를 확인하세요.')
            for key in ('customTabs','modules'):modules(new.get(key,[]),old.get(key,[]))
    for key in ('projects','productions'):
        old={p['id']:p for p in before.get(key,[])}
        for p in after.get(key,[]):
            previous=old.get(p['id'],{})
            for field in ('name','title','description'):
                if field not in p or p[field]==previous.get(field):continue
                value=p[field]
                if not isinstance(value,str) or len(value)>(2000 if field=='description' else 160) or field!='description' and not value.strip():invalid('이름은 1~160자, 메모는 2000자까지 입력하세요.')
            if p.get('planning')!=previous.get('planning'):planning(p.get('planning') or {})
            modules(p,previous)
