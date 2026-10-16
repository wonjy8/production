"""Isolated HTTPS integration test: requires Playwright, Chromium, openssl and NAS dependencies.
Only the generated local certificate is trusted using its exact SPKI fingerprint.
"""
import base64, hashlib, http.server, os, pathlib, re, socket, ssl, subprocess, tempfile, threading, time
from playwright.sync_api import sync_playwright
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
    if mode=='nas':
     context.close();context=browser.new_context(viewport={'width':1400,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"');page.locator('.admin-home').wait_for()
    print('START '+mode,flush=True)
    project=page.evaluate("""async()=>{const w=window.productionBridge.read(),id=crypto.randomUUID();w.productions=[];w.projects=[{id,name:'열 검증',status:'진행 중',tasks:[],schedules:[],assets:[],feedback:[],customTabs:[{id:'columns',name:'열',modules:[{id:'outer',kind:'columns',blockLayout:true,columnSlots:['l','m','r']},{id:'inner',kind:'columns',parentSlot:'l',columnSlots:['ll','lr']},{id:'a',title:'A',kind:'text',parentSlot:'ll',text:'A 원본'},{id:'b',title:'B',kind:'text',parentSlot:'lr',items:[]},{id:'c',title:'C',kind:'text',parentSlot:'r',items:[]},{id:'d',title:'D',kind:'text',items:[]}]}]}];w.projects[0].customTabs.push({id:'legacy',name:'기존 배치',modules:['e','f'].map(id=>({id,kind:'text',title:id,span:6,text:id}))});window.productionBridge.write(w);await window.flushDocumentModules();window.productionBridge.select(id,'tab:columns');return id}""")
    route=base+'#/work-groups/'+project+'/tabs/columns';page.goto(route);page.reload()
    try:page.locator('[data-fluid-id=a]').wait_for(timeout=8000)
    except Exception:
     print('INITIAL FAILURE',mode,errors,page.evaluate('window.productionBridge?.read()?.projects'),page.locator('body').inner_text()[:1500],flush=True);raise
    page.wait_for_timeout(350)
    def data():return page.evaluate('window.productionBridge.read().projects[0].customTabs[0].modules')
    assert page.locator('.column-boundary').count()==3
    assert page.locator('[data-fluid-id=outer]').count()==0
    assert page.locator('.fluid-resize-edge:visible').count()==0
    a=page.locator('[data-fluid-id=a]');b=page.locator('[data-fluid-id=b]');d=page.locator('[data-fluid-id=d]')
    assert abs(a.bounding_box()['y']-b.bounding_box()['y'])<2
    assert b.bounding_box()['x']>a.bounding_box()['x']+a.bounding_box()['width']
    # The empty middle lane offers nested templates, with all further splits disabled at four lanes.
    empty=page.locator('.column-slot-empty .column-add');empty.click();menu=page.get_by_role('menu',name='열에 추가할 모듈')
    for n in [2,3,4]:assert menu.get_by_role('menuitem',name=str(n)+'단 열',exact=True).is_disabled()
    menu.get_by_role('menuitem',name='메모',exact=True).click();page.wait_for_timeout(350)
    assert any(m.get('parentSlot')=='m' and m['kind']=='text' for m in data())
    # Pointer placement into a nested lane; saved parent and geometry survive a reload.
    handle=d.locator('.module-name-button');handle.scroll_into_view_if_needed();r=handle.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down();r=b.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']*.8,steps=15);page.locator('.module-insertion-line').wait_for();page.mouse.up();page.wait_for_timeout(450)
    assert next(m for m in data() if m['id']=='d')['parentSlot']=='lr'
    page.evaluate("window.flushDocumentModules()");page.reload();a.wait_for();page.wait_for_timeout(250);assert next(m for m in data() if m['id']=='d').get('parentSlot')=='lr';assert d.bounding_box()['y']>=b.bounding_box()['y']+b.bounding_box()['height']-2
    # Divider proximity reveals both the line and its X; resizing saves only once released.
    boundary=page.locator('.column-boundary').last;line=boundary.get_by_role('separator');r=boundary.bounding_box();page.mouse.move(1000,900);assert line.evaluate('e=>getComputedStyle(e).opacity')=='0';page.mouse.move(r['x']+8,r['y']+35);assert line.evaluate('e=>getComputedStyle(e).opacity')=='1';assert boundary.get_by_role('button').evaluate('e=>getComputedStyle(e).opacity')=='1'
    page.mouse.down();page.mouse.move(r['x']+28,r['y']+35,steps=6);page.mouse.up();page.wait_for_timeout(350);assert next(m for m in data() if m['id']=='outer').get('columnWeights')
    page.screenshot(path='/tmp/production-columns-'+mode+'.png')
    # Merge the inner boundary: B then D append after A, preserving text/checklist bytes.
    page.locator('.column-boundary').first.get_by_role('button').click(force=True);page.wait_for_timeout(350)
    saved=data();assert not any(m['id']=='inner' for m in saved);assert [m['id'] for m in saved if m.get('parentSlot')=='l']==['a','b','d']
    assert next(m for m in saved if m['id']=='a')['text']=='A 원본'
    while page.locator('.column-boundary').count():
     page.locator('.column-boundary').first.get_by_role('button').click(force=True);page.wait_for_timeout(200)
    assert not any(m['kind']=='columns' for m in data());assert all(not m.get('parentSlot') for m in data())
    page.evaluate("window.flushDocumentModules()");page.reload();a.wait_for();assert page.locator('.column-boundary').count()==0
    # New templates support 2/3/4 lanes and no card framing.
    page.get_by_role('button',name='모듈 추가',exact=True).click();page.locator('.hub-card').filter(has=page.get_by_text('2단 열',exact=True)).click();page.wait_for_timeout(300);assert page.locator('.column-boundary').count()==1
    # Create nested columns through the actual + menu, not just seeded data.
    page.locator('.column-slot-empty .column-add').first.click();menu=page.get_by_role('menu',name='열에 추가할 모듈');assert menu.get_by_role('menuitem',name='2단 열',exact=True).is_enabled();menu.get_by_role('menuitem',name='2단 열',exact=True).click();page.wait_for_timeout(250);assert page.locator('.column-boundary').count()==2
    page.locator('.column-slot-empty .column-add').last.click();menu=page.get_by_role('menu',name='열에 추가할 모듈');assert menu.get_by_role('menuitem',name='3단 열',exact=True).is_disabled();menu.get_by_role('menuitem',name='2단 열',exact=True).click();page.wait_for_timeout(250);assert page.locator('.column-boundary').count()==3
    page.locator('.column-slot-empty .column-add').first.click();menu=page.get_by_role('menu',name='열에 추가할 모듈');assert menu.get_by_role('menuitem',name='2단 열',exact=True).is_disabled();page.keyboard.press('Escape');menu.wait_for(state='detached')
    # Legacy side-by-side layout is displayed as explicit columns and persisted on edit.
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/work-groups/'+project+'/tabs/legacy');page.locator('[data-fluid-id=e]').wait_for();assert page.locator('.column-boundary').count()==1
    page.locator('[data-fluid-id=e] textarea').fill('기존 메모 수정');page.evaluate('window.flushDocumentModules()')
    legacy=page.evaluate('window.productionBridge.read().projects[0].customTabs[1].modules');assert len(legacy)==3;assert legacy[0]['kind']=='columns';assert {m['id'] for m in legacy if m['kind']!='columns'}=={'e','f'}
    page.reload();page.locator('[data-fluid-id=e]').wait_for();assert page.locator('.column-boundary').count()==1
    page.locator('.merged-workspace.project-page').evaluate('e=>e.dataset.projectReadonly="true"');assert page.locator('.column-boundary:visible').count()==0;assert page.locator('.column-add:visible').count()==0
    page.locator('.merged-workspace.project-page').evaluate('e=>delete e.dataset.projectReadonly')
    assert not errors,errors
    print('PASS '+mode+': nested four-lane cap, empty-lane add, pointer drop, persistence, hidden/revealed guides, resize, lossless ordered merges and templates',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
