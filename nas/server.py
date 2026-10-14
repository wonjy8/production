"""Scoped storage API behind authenticated Worker gateway."""
from access import actor_for,is_admin,scope,apply_tab_visibility,merge_workspace,workspace_data,ref_visible,file_ids,deny,permitted
from accounts import install
import hashlib
import hmac
import json
import os
import re
import sqlite3
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

DATA = Path(os.environ.get('DATA_DIR', '/data'))
DATA.mkdir(parents=True, exist_ok=True)
(DATA / 'files').mkdir(exist_ok=True)
TOKEN = os.environ.get('NAS_API_TOKEN', '')
if len(TOKEN) < 32 or TOKEN.startswith('replace-'):
    raise RuntimeError('Set a random NAS_API_TOKEN of at least 32 characters')
ID = re.compile(r'^[a-f0-9-]{36}$')
CATEGORIES = ['카메라 바디', '렌즈', '메모리', '배터리', '충전기', '기타 장비']
COLLECTIONS = {'members': 'members', 'equipment': 'equipment', 'rental-shops': 'rental_shops', 'locations': 'locations'}
ROOT_KEYS = {'members': 'members', 'equipment': 'equipment', 'rental-shops': 'rentalShops', 'locations': 'locations'}
write_lock = threading.RLock()


@contextmanager
def database():
    conn = sqlite3.connect(DATA / 'production.sqlite3', timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        with conn:
            yield conn
    finally:
        conn.close()


with database() as conn:
    conn.executescript(Path(__file__).with_name('schema.sql').read_text())


def now():
    return datetime.now(timezone.utc).isoformat()


def packed(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def revision(payload):
    return '"' + hashlib.sha256(payload.encode()).hexdigest() + '"'


def authenticate(request: Request):
    supplied = request.headers.get('authorization', '')
    if not hmac.compare_digest(supplied.encode(), ('Bearer ' + TOKEN).encode()):
        raise HTTPException(401, 'Unauthorized')


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, dependencies=[Depends(authenticate)])


@app.middleware('http')
async def headers(request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    return response


async def json_body(request, max_bytes=24_000_000):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > max_bytes:
            raise HTTPException(413, 'Too large')
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (ValueError, UnicodeError):
        raise HTTPException(400, 'Invalid JSON')


def save_master(conn, table, item):
    ident, name = item.get('id'), item.get('name')
    if not isinstance(ident, str) or not ident or len(ident) > 200 or not isinstance(name, str) or not name.strip():
        raise HTTPException(400, 'ID and name required')
    if table == 'equipment':
        category = item.get('category', '기타 장비')
        ownership = item.get('ownership', 'team')
        if category not in CATEGORIES or ownership not in ('team', 'personal'):
            raise HTTPException(400, 'Invalid equipment category or ownership')
        owner = item.get('ownerId') or None
        if owner and not conn.execute('SELECT 1 FROM members WHERE id=?', (owner,)).fetchone():
            raise HTTPException(400, 'Unknown owner')
        conn.execute('INSERT INTO equipment VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,owner_id=excluded.owner_id,ownership=excluded.ownership,payload=excluded.payload,deleted=excluded.deleted,updated_at=excluded.updated_at',
                     (ident, name, category, owner, ownership, packed(item), bool(item.get('deleted')), now()))
    else:
        conn.execute(f'INSERT INTO {table}(id,name,payload,deleted,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,payload=excluded.payload,deleted=excluded.deleted,updated_at=excluded.updated_at',
                     (ident, name, packed(item), bool(item.get('deleted')), now()))


def save_workspace(conn, data):
    projects = data.get('projects')
    if not isinstance(projects, list) or len(projects) > 10000:
        raise HTTPException(400, 'Invalid projects')
    conn.execute('PRAGMA defer_foreign_keys=ON')
    for key, table in [('members', 'members'), ('equipment', 'equipment'), ('rentalShops', 'rental_shops'), ('locations', 'locations')]:
        for item in data.get(key, []):
            save_master(conn, table, item)
    conn.execute('UPDATE productions SET deleted=1')
    for item in data.get('productions', []):
        save_master(conn, 'productions', item)
    conn.execute('UPDATE projects SET deleted=1')
    ids = {p.get('id') for p in projects}
    group_ids = {g['id'] for g in data.get('productions', [])}
    for p in projects:
        if not isinstance(p.get('id'), str) or not isinstance(p.get('title'), str):
            raise HTTPException(400, 'Invalid project')
        conn.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,production_id=excluded.production_id,parent_id=excluded.parent_id,payload=excluded.payload,deleted=excluded.deleted,updated_at=excluded.updated_at',
                     (p['id'], p['title'], p.get('productionId') if p.get('productionId') in group_ids else None,
                      p.get('parentId') if p.get('parentId') in ids else None, packed(p), bool(p.get('deleted')), now()))
    for table in ['tasks', 'schedules', 'modules', 'assets', 'feedback']:
        conn.execute(f'DELETE FROM {table}')
    for kind, records in [('production', data.get('productions', [])), ('project', projects)]:
        for p in records:
            for index, t in enumerate(p.get('tasks', [])):
                conn.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)', (kind, p['id'], t.get('id', str(index)), t.get('title', ''), t.get('owner', ''), t.get('due', ''), bool(t.get('done')), packed(t)))
    for p in projects:
        for index, m in enumerate(p.get('modules', [])):
            conn.execute('INSERT INTO modules VALUES(?,?,?,?,?)', (p['id'], m.get('id', str(index)), index, m.get('type'), packed(m)))
        for table, key in [('schedules', 'schedules'), ('assets', 'productionAssets'), ('feedback', 'feedback')]:
            for index, item in enumerate(p.get(key, [])):
                if table == 'schedules':
                    location = item.get('locationId')
                    if not conn.execute('SELECT 1 FROM locations WHERE id=?', (location,)).fetchone():
                        location = None
                    conn.execute('INSERT INTO schedules VALUES(?,?,?,?)', (p['id'], item.get('id', str(index)), location, packed(item)))
                else:
                    conn.execute(f'INSERT INTO {table} VALUES(?,?,?)', (p['id'], item.get('id', str(index)), packed(item)))
    conn.execute('INSERT INTO workspace VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at', (packed(data), now()))


@app.get('/api/health')
def health():
    with database() as conn:
        conn.execute('SELECT 1')
    return {'ok': True, 'schemaVersion': 1, 'storage': 'nas', 'features': {'archiveScopes': 1}}


@app.get('/api/data')
def workspace(request: Request):
    with database() as conn:
        row = conn.execute('SELECT payload FROM workspace WHERE id=1').fetchone()
    payload = row[0] if row else '{}'
    with database() as conn:
        actor=actor_for(conn,request);visible=apply_tab_visibility(conn,scope(json.loads(payload),actor),actor)
    return JSONResponse(visible, headers={'ETag': revision(payload)})


@app.put('/api/data')
async def put_workspace(request: Request):
    data = await json_body(request)
    with write_lock, database() as conn:
        old = conn.execute('SELECT payload FROM workspace').fetchone()
        expected = request.headers.get('If-Match')
        if expected and expected != revision(old[0] if old else '{}'):
            raise HTTPException(409, 'Data changed on another device; reload before saving')
        if request.headers.get('X-Import-Only') == '1' and old:
            if json.loads(old[0]) == data:
                return {'ok': True}
            raise HTTPException(409, 'Workspace already exists')
        actor=actor_for(conn,request)
        data=merge_workspace(conn,json.loads(old[0]) if old else {'projects':[],'productions':[],'members':[]},data,actor)
        save_workspace(conn, data)
        conn.execute('INSERT INTO access_audit(user_id,action,target,created_at) VALUES(?,?,?,?)',(actor['id'],'workspace-save','workspace',now()))
        conn.execute('INSERT INTO audit_log(action,collection,created_at) VALUES(?,?,?)', ('save', 'workspace', now()))
    return JSONResponse({'ok': True}, headers={'ETag': revision(packed(data))})


@app.get('/api/references')
def references(request: Request):
    with database() as conn:
        actor=actor_for(conn,request);visible=apply_tab_visibility(conn,scope(workspace_data(conn),actor),actor)
        return [item for row in conn.execute('SELECT payload FROM reference_records ORDER BY updated_at DESC') if ref_visible(item:=json.loads(row[0]),visible,actor)]


@app.put('/api/references/{ident}')
async def put_reference(ident: str, request: Request):
    data = await json_body(request, 1_500_000)
    if not ID.fullmatch(ident) or data.get('id') != ident or not isinstance(data.get('title'), str) or not data['title'].strip() or len(data['title']) > 200:
        raise HTTPException(400, 'Invalid reference')
    if not isinstance(data.get('tags', []), list) or len(data.get('tags', [])) > 30 or any(not isinstance(tag, str) or len(tag) > 100 for tag in data.get('tags', [])):
        raise HTTPException(400, 'Invalid tags')
    blocks = data.get('blocks', data.get('attachments', [data] if data.get('fileId') else []))
    if not isinstance(blocks, list) or len(blocks) > 100:
        raise HTTPException(400, 'Invalid blocks')
    with write_lock, database() as conn:
        actor=actor_for(conn,request);visible=apply_tab_visibility(conn,scope(workspace_data(conn),actor),actor)
        old = conn.execute('SELECT payload FROM reference_records WHERE id=?', (ident,)).fetchone()
        if actor['role']=='viewer' or old and not ref_visible(json.loads(old[0]),visible,actor):deny()
        if not is_admin(actor):
            allowed_groups={g['id'] for g in visible.get('productions',[])};allowed_projects={p['id'] for p in visible.get('projects',[])}
            if data.get('productionId') and data['productionId'] not in allowed_groups or data.get('projectId') and data['projectId'] not in allowed_projects:deny()
            data['ownerUserId']=json.loads(old[0]).get('ownerUserId',actor['id']) if old else actor['id']
        if old and request.headers.get('X-Import-Only') == '1':
            if json.loads(old[0]) == data:
                return data
            raise HTTPException(409, 'Reference already exists')
        if request.headers.get('X-Import-Only') != '1':
            data['updatedAt'] = now()
        data.setdefault('updatedAt', now())
        data.setdefault('createdAt', data['updatedAt'])
        conn.execute('INSERT INTO reference_records VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,deleted=excluded.deleted,favorite=excluded.favorite,payload=excluded.payload,updated_at=excluded.updated_at',
                     (ident, data['title'], data.get('category', ''), bool(data.get('deleted')), bool(data.get('favorite')), packed(data), data['updatedAt']))
        conn.execute('DELETE FROM reference_blocks WHERE reference_id=?', (ident,))
        for position, block in enumerate(blocks):
            if not isinstance(block, dict) or block.get('kind') not in ['text', 'table', 'event', 'check', 'link', 'image', 'video', 'audio', 'pdf', 'file']:
                raise HTTPException(400, 'Invalid block')
            if block['kind'] in ['text', 'table', 'event', 'check'] and (not isinstance(block.get('text'), str) or len(block['text']) > 10000):
                raise HTTPException(400, 'Invalid text block')
            if block['kind'] == 'link' and not re.match(r'^https?://', block.get('url', '')):
                raise HTTPException(400, 'Invalid link')
            file_id = block.get('fileId')
            if block['kind'] in ['image', 'video', 'audio', 'pdf', 'file'] and not file_id:
                raise HTTPException(400, 'Missing file')
            if file_id and not conn.execute('SELECT 1 FROM files WHERE id=?', (file_id,)).fetchone():
                raise HTTPException(400, 'Missing file')
            conn.execute('INSERT INTO reference_blocks VALUES(?,?,?,?,?,?)',
                         (ident, block.get('id', str(position)), position, block.get('kind', 'file'), file_id, packed(block)))
    return data


def can_edit_file(conn,actor,ident):
    if is_admin(actor):return True
    full=workspace_data(conn);visible=apply_tab_visibility(conn,scope(full,actor),actor)
    referenced=ident in file_ids(full)
    for key in ('projects','productions'):
        for owner in visible.get(key,[]):
            for field in ('modules','productionAssets'):
                if ident in file_ids(owner.get(field,[])) and permitted(conn,actor,owner['id'],'materials','edit'):return True
            for tab in owner.get('customTabs',[]):
                if ident in file_ids(tab) and permitted(conn,actor,owner['id'],'tab:'+tab['id'],'edit'):return True
    for row in conn.execute('SELECT payload FROM reference_records'):
        item=json.loads(row[0])
        if ident in file_ids(item):
            referenced=True
            if not item.get('deleted') and actor['role']!='viewer' and ref_visible(item,visible,actor):return True
    return not referenced and actor['role']!='viewer' and bool(conn.execute('SELECT 1 FROM file_uploaders WHERE file_id=? AND user_id=?',(ident,actor['id'])).fetchone())


@app.put('/api/ref-files/{ident}')
async def put_file(ident: str, request: Request):
    if not ID.fullmatch(ident):
        raise HTTPException(400, 'Invalid file ID')
    with database() as conn:
        actor=actor_for(conn,request)
        existing=conn.execute('SELECT 1 FROM files WHERE id=?',(ident,)).fetchone()
        if not existing:
            owner=request.headers.get('x-scope-owner','');tab=request.headers.get('x-scope-tab','materials')
            if owner:
                visible=scope(workspace_data(conn),actor)
                if owner not in {v['id'] for key in ('projects','productions') for v in visible.get(key,[])} or not permitted(conn,actor,owner,tab,'add'):deny()
            elif actor['role']=='viewer':deny()
    target = DATA / 'files' / ident
    digest, size = hashlib.sha256(), 0
    temp = tempfile.NamedTemporaryFile(dir=DATA / 'files', delete=False)
    try:
        async for chunk in request.stream():
            size += len(chunk)
            if size > 25 * 1024 * 1024:
                raise HTTPException(413, 'File exceeds 25 MB')
            digest.update(chunk)
            temp.write(chunk)
        temp.flush()
        os.fsync(temp.fileno())
        temp.close()
        with write_lock, database() as conn:
            old = conn.execute('SELECT sha256 FROM files WHERE id=?', (ident,)).fetchone()
            if old:
                if request.headers.get('X-Import-Only') == '1' and old[0] == digest.hexdigest():
                    return {'id': ident, 'sha256': old[0]}
                expected=request.headers.get('If-Match','').strip('"')
                if not expected:
                    raise HTTPException(409, 'File already exists')
                if not can_edit_file(conn,actor,ident):deny()
                if expected != old[0]:
                    raise HTTPException(409, 'File changed in another editor')
                os.replace(temp.name, target)
                conn.execute('UPDATE files SET mime=?,size=?,sha256=?,created_at=? WHERE id=?',
                             (request.headers.get('content-type','application/octet-stream'),size,digest.hexdigest(),now(),ident))
            else:
                if request.headers.get('If-Match'):
                    raise HTTPException(409, 'Original file no longer exists')
                os.replace(temp.name, target)
                conn.execute('INSERT INTO file_uploaders VALUES(?,?)',(ident,actor['id']))
                conn.execute('INSERT INTO files VALUES(?,?,?,?,?)', (ident, request.headers.get('content-type', 'application/octet-stream'), size, digest.hexdigest(), now()))
        return {'id': ident, 'sha256': digest.hexdigest()}
    finally:
        temp.close()
        Path(temp.name).unlink(missing_ok=True)


@app.get('/api/ref-files/{ident}')
def get_file(ident: str, request: Request):
    if not ID.fullmatch(ident):
        raise HTTPException(400, 'Invalid file ID')
    with database() as conn:
        actor=actor_for(conn,request)
        if not is_admin(actor):
            visible=apply_tab_visibility(conn,scope(workspace_data(conn),actor),actor);ids=file_ids(visible)
            for ref in conn.execute('SELECT payload FROM reference_records'):
                item=json.loads(ref[0])
                if ref_visible(item,visible,actor):ids.update(file_ids(item))
            owned=conn.execute('SELECT 1 FROM file_uploaders WHERE file_id=? AND user_id=?',(ident,actor['id'])).fetchone()
            if ident not in ids and not owned:deny()
        row = conn.execute('SELECT * FROM files WHERE id=?', (ident,)).fetchone()
    if not row or not (DATA / 'files' / ident).exists():
        raise HTTPException(404, 'Not found')
    safe = row['mime'] in ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'application/pdf']
    filename = (request.query_params.get('name') or 'reference')[:250]
    return FileResponse(DATA / 'files' / ident, media_type=row['mime'] if safe else 'application/octet-stream', filename=filename,
                        content_disposition_type='attachment' if 'download' in request.query_params or not safe else 'inline',
                        headers={'Content-Security-Policy': "default-src 'none'; sandbox", 'X-File-SHA256': row['sha256'], 'ETag': '"'+row['sha256']+'"', 'Cache-Control':'no-store'})


@app.get('/api/database/{collection}')
def list_records(collection: str, request:Request, q: str = ''):
    table = COLLECTIONS.get(collection)
    if not table:
        raise HTTPException(404, 'Unknown collection')
    with database() as conn:
        actor=actor_for(conn,request)
        visible=scope(workspace_data(conn),actor)
        allowed={r['id'] for r in visible.get(ROOT_KEYS[collection],[])}
        rows = conn.execute(f'SELECT payload FROM {table} WHERE deleted=0 ORDER BY name').fetchall()
        if not is_admin(actor):
            values=visible.get(ROOT_KEYS[collection],[])
            return [r for r in values if r['id'] in allowed and not r.get('deleted') and q.casefold() in packed(r).casefold()]
    return [item for row in rows if q.casefold() in packed(item := json.loads(row[0])).casefold()]


@app.put('/api/database/{collection}/{ident}')
async def put_record(collection: str, ident: str, request: Request):
    table = COLLECTIONS.get(collection)
    if not table or not ID.fullmatch(ident):
        raise HTTPException(400, 'Invalid record')
    item = await json_body(request, 1_500_000)
    item['id'] = ident
    with write_lock, database() as conn:
        actor=actor_for(conn,request)
        if collection=='members':
            full=workspace_data(conn);incoming=apply_tab_visibility(conn,scope(full,actor),actor)
            incoming['members']=[m for m in incoming.get('members',[]) if m['id']!=ident]+[item]
            merged=merge_workspace(conn,full,incoming,actor)
            item=next(m for m in merged['members'] if m['id']==ident)
        elif not is_admin(actor):deny()
        save_master(conn, table, item)
        row = conn.execute('SELECT payload FROM workspace WHERE id=1').fetchone()
        if row:
            data = json.loads(row[0])
            key = ROOT_KEYS[collection]
            items = data.get(key, [])
            data[key] = [r if r.get('id') != ident else item for r in items] + ([] if any(r.get('id') == ident for r in items) else [item])
            conn.execute('UPDATE workspace SET payload=?,updated_at=? WHERE id=1', (packed(data), now()))
        conn.execute('INSERT INTO audit_log(action,collection,record_id,created_at) VALUES(?,?,?,?)', ('save', collection, ident, now()))
    return item


@app.exception_handler(sqlite3.Error)
async def database_error(request, error):
    return JSONResponse({'error': 'Database write failed'}, status_code=409)

install(app,database,write_lock,save_workspace,now)

from local_auth import install_local
install_local(app,database,write_lock,save_workspace,now,TOKEN)

# Optional GitHub Pages entry point; existing Worker routes remain protected.
from browser_gateway import BrowserGateway
app = BrowserGateway(app, TOKEN, os.environ.get('PAGES_ORIGINS', ''))
