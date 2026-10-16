"""Isolated HTTPS integration test: requires Playwright, Chromium, openssl and NAS dependencies.
Only the generated local certificate is trusted using its exact SPKI fingerprint.
"""
import base64, hashlib, http.server, os, pathlib, re, socket, ssl, subprocess, tempfile, threading, time
from playwright.sync_api import sync_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent
nas_python=os.environ.get('NAS_PYTHON', __import__('sys').executable)
with tempfile.TemporaryDirectory() as td:
 t=pathlib.Path(td)
 cert=t/'cert.pem';key=t/'key.pem'
 subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=pages.test','-addext','subjectAltName=DNS:pages.test,DNS:nas.test'],check=True,capture_output=True)
 pub=subprocess.run(['openssl','x509','-in',str(cert),'-pubkey','-noout'],check=True,capture_output=True).stdout
 der=subprocess.run(['openssl','pkey','-pubin','-outform','DER'],input=pub,check=True,capture_output=True).stdout
 spki=base64.b64encode(hashlib.sha256(der).digest()).decode()
 env={**os.environ,'ADMIN_EMAIL':'admin@example.com','ADMIN_NAME':'Example Administrator','DATA_DIR':str(t/'data'),'NAS_API_TOKEN':'test-'+ 'x'*40,'PAGES_ORIGINS':'https://pages.test:9443'}
 subprocess.run([nas_python,'-c',"import server; from local_auth import bootstrap_admin; bootstrap_admin(server.database,server.write_lock,server.save_workspace,server.now,'StrongPassword2026!')"],cwd=root/'nas',env=env,check=True)
 subprocess.run(['npm','run','build:pages'],cwd=root,env=env,check=True)
 (t/'production').symlink_to(root/'dist/pages',target_is_directory=True)
 class Handler(http.server.SimpleHTTPRequestHandler):
  def __init__(self,*args,**kwargs):super().__init__(*args,directory=td,**kwargs)
  def log_message(self,*args):pass
  def do_GET(self):
   if self.path.startswith('/production/') and not pathlib.Path(self.translate_path(self.path)).exists():
    body=(root/'dist/pages/404.html').read_bytes()
    self.send_response(404);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    return
   super().do_GET()
 httpd=http.server.ThreadingHTTPServer(('127.0.0.1',9443),Handler)
 ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(cert,key);httpd.socket=ctx.wrap_socket(httpd.socket,server_side=True)
 threading.Thread(target=httpd.serve_forever,daemon=True).start()
 nas=subprocess.Popen([nas_python,'-m','uvicorn','server:app','--host','127.0.0.1','--port','9444','--ssl-keyfile',str(key),'--ssl-certfile',str(cert),'--no-access-log'],cwd=root/'nas',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--host-resolver-rules=MAP pages.test 127.0.0.1, MAP nas.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
   context=browser.new_context(viewport={'width':1400,'height':1000});engine_requests=[];context.on('request',lambda request:engine_requests.append(request.url) if '.wasm' in request.url else None);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   context.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}")
   import io,zipfile,json
   for mode in ['local','nas']:
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
    fixture=page.evaluate("""async()=>{const id=crypto.randomUUID();const upload=await fetch('/production/api/ref-files/'+id+'?name=central.txt',{method:'PUT',headers:{'Content-Type':'text/plain'},body:'one original'});if(!upload.ok)throw Error('upload failed');const rows=await fetch('/production/api/database/resources').then(r=>r.json());return {id,row:rows.find(r=>r.id===id)}}""")
    assert fixture['row']['title']=='central.txt' and fixture['row']['origins']==[],fixture
    assert fixture['row']['canTrash'] is True
    page.locator('[data-main-space=references]').first.click();page.locator('button[data-source-section=resources]').click()
    page.get_by_role('button',name='central.txt',exact=True).wait_for()
    page.evaluate("""async id=>{const w=window.productionBridge.read();for(const [key,name,hidden] of [['catalog-a','프로젝트 A',false],['catalog-b','프로젝트 B',true]])w.productions.push({id:key,name,status:'진행 중',tasks:[],teams:[],memberIds:[],customTabs:[{id:key+'-tab',name:'자료 탭',hidden,modules:[{id:key+'-db',kind:'database',files:[{id,name:'central.txt',kind:'file',mime:'text/plain'}]}]}]});window.productionBridge.write(w);await window.flushDocumentModules()}""",fixture['id'])
    page.get_by_role('button',name='새로고침',exact=True).click()
    card=page.locator('.resource-card').filter(has=page.get_by_role('button',name='central.txt',exact=True))
    card.get_by_role('button',name='central.txt 사용처',exact=True).click()
    usage=page.get_by_role('dialog',name='원본 사용처',exact=True)
    usage.get_by_text('프로젝트 A',exact=True).wait_for();assert usage.get_by_text('프로젝트 B',exact=True).is_visible()
    assert '사용 중인 원본은 삭제할 수 없습니다' in usage.inner_text()
    usage.get_by_role('button',name='원본 사용처 닫기',exact=True).click()
    status=page.evaluate("""async id=>{const row=(await fetch('/production/api/database/resources').then(r=>r.json())).find(r=>r.id===id);return (await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"'+row.version+'"'},body:JSON.stringify({...row,deleted:true})})).status}""",fixture['id'])
    assert status==409,(mode,status)
    card.get_by_role('button',name='central.txt 속성 수정',exact=True).click()
    props=page.get_by_role('dialog',name='자료 속성',exact=True)
    assert '원본을 수정하면 연결된 사용처에도 반영됩니다' in props.inner_text()
    props.get_by_role('button',name='사본을 만들어 편집',exact=True).click()
    page.wait_for_function("async()=>{const rows=await fetch('/production/api/database/resources').then(r=>r.json());return rows.some(r=>r.title==='central.txt 사본')}")
    props.get_by_role('textbox',name='자료 제목',exact=True).wait_for()
    expect(props.get_by_role('textbox',name='자료 제목',exact=True)).to_have_value('central.txt 사본')
    props.get_by_role('button',name='자료 속성 닫기',exact=True).click()
    rows=page.evaluate("fetch('/production/api/database/resources').then(r=>r.json())")
    original=next(r for r in rows if r['id']==fixture['id']);copy=next(r for r in rows if r['title']=='central.txt 사본')
    assert copy['fileId']!=original['fileId'] and len(original['origins'])==2
    # A shared document must offer original/copy selection before autosaving.
    with page.expect_popup() as opened:card.get_by_role('button',name='central.txt',exact=True).click()
    document=opened.value
    prompt=document.get_by_role('dialog',name='원본 문서 편집',exact=True);prompt.wait_for()
    assert '프로젝트 A' in prompt.inner_text()
    prompt.get_by_role('button',name='원본 수정',exact=True).click()
    document.locator('.tiptap').wait_for();document.get_by_role('textbox',name='문서 본문',exact=True).fill('saved through original editor')
    document.wait_for_function("document.querySelector('.document-header [role=status]')?.textContent.endsWith('저장됨')")
    assert page.evaluate("id=>fetch('/production/api/ref-files/'+id).then(r=>r.text())",fixture['id'])=='saved through original editor'
    document.close()
    with page.expect_popup() as opened:card.get_by_role('button',name='central.txt',exact=True).click()
    document=opened.value
    document.get_by_role('dialog',name='원본 문서 편집',exact=True).get_by_role('button',name='사본을 만들어 편집',exact=True).click()
    document.wait_for_function('(id)=>new URLSearchParams(location.search).get("document")!==id',arg=fixture['id'])
    document.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
    assert document.get_by_role('dialog',name='원본 문서 편집',exact=True).count()==0
    document.close()
    # Editing one original never changes an explicitly created independent copy.
    result=page.evaluate("""async ({original,copy})=>{const file=await fetch('/production/api/ref-files/'+original.fileId);const update=await fetch('/production/api/ref-files/'+original.fileId,{method:'PUT',headers:{'Content-Type':'text/plain','If-Match':file.headers.get('ETag')},body:'edited original'});return {status:update.status,copy:await fetch('/production/api/ref-files/'+copy.fileId).then(r=>r.text())}}""",{'original':original,'copy':copy})
    assert result=={'status':200,'copy':'one original'},result
    page.evaluate("""async()=>{const w=window.productionBridge.read();for(const p of w.productions)if(['catalog-a','catalog-b'].includes(p.id))p.customTabs=[];window.productionBridge.write(w);await window.flushDocumentModules()}""")
    result=page.evaluate("""async id=>{const rows=await fetch('/production/api/database/resources').then(r=>r.json());const row=rows.find(r=>r.id===id);const trashed=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"'+row.version+'"'},body:JSON.stringify({...row,deleted:true})});const trash=await trashed.json();const restored=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"'+trash.version+'"'},body:JSON.stringify({...trash,deleted:false})});return {canTrash:row.canTrash,origins:row.origins.length,trash:trashed.status,restore:restored.status,bytes:await fetch('/production/api/ref-files/'+id).then(r=>r.text())}}""",fixture['id'])
    assert result=={'canTrash':True,'origins':0,'trash':200,'restore':200,'bytes':'edited original'},(mode,result)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size({'width':1400,'height':1000})
    print('PASS '+mode+': immediate catalog, shared ID, hidden usage, delete protection, usage/copy UI, document consent, independent copy, detach/restore retention',flush=True)
   assert not errors,errors
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
