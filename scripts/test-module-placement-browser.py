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
    project=page.evaluate("""async()=>{const w=window.productionBridge.read(),id=crypto.randomUUID();w.productions=[];w.projects=[{id,name:'배치 검증',status:'진행 중',tasks:[],schedules:[],assets:[],feedback:[],customTabs:[{id:'drag',name:'모듈 이동',modules:['a','b','c','d'].map((id,i)=>({id,title:'모듈 '+id,kind:'checklist',span:i===3?6:4,items:[{id:id+'-row',text:'내용 '+id}]}))}]}];window.productionBridge.write(w);await window.flushDocumentModules();window.productionBridge.select(id,'tab:drag');return id}""")
    route=base+'#/work-groups/'+project+'/tabs/drag';page.goto(route);page.reload();a=page.locator('[data-fluid-id=a]');b=page.locator('[data-fluid-id=b]');d=page.locator('[data-fluid-id=d]');a.wait_for();page.wait_for_timeout(300)
    def start_drag(box):
     handle=box.locator('.module-name-button');handle.scroll_into_view_if_needed();r=handle.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down()
    def data():return page.evaluate('window.productionBridge.read().projects[0].customTabs[0].modules')
    original_y=a.evaluate('e=>e.offsetTop');start_drag(d);r=b.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+25,steps=15)
    line=page.locator('.module-insertion-line');page.get_by_role('status',name='이 모듈 위에 놓기',exact=True).wait_for();assert abs(line.bounding_box()['width']-r['width'])<2
    page.screenshot(path='/tmp/module-placement-'+mode+'-line.png');page.mouse.up();line.wait_for(state='detached');page.wait_for_timeout(350)
    assert abs(d.bounding_box()['x']-b.bounding_box()['x'])<2
    assert b.bounding_box()['y']>=d.bounding_box()['y']+d.bounding_box()['height']-2
    assert abs(a.evaluate('e=>e.offsetTop')-original_y)<3
    assert next(m for m in data() if m['id']=='d')['columnId']==next(m for m in data() if m['id']=='b')['columnId']
    # Full-width insertion is a separate row, irrespective of the dragged module's width.
    start_drag(d);r=a.bounding_box();page.mouse.move(r['x']+30,r['y']+2,steps=15);page.get_by_role('status',name='이 줄 위에 놓기',exact=True).wait_for();assert line.bounding_box()['width']>r['width']*2.5;page.mouse.up();line.wait_for(state='detached');page.wait_for_timeout(350)
    assert a.bounding_box()['y']>=d.bounding_box()['y']+d.bounding_box()['height']-2
    assert next(m for m in data() if m['id']=='d').get('rowBreakAfter')
    # Escape restores the original arrangement and removes the guide without writing.
    saved=data();start_drag(d);r=b.bounding_box();page.mouse.move(r['x']+30,r['y']+25,steps=10);line.wait_for();page.keyboard.press('Escape');page.mouse.up();line.wait_for(state='detached');assert data()==saved
    # Container width animation must not enqueue another card position transition.
    page.set_viewport_size({'width':1100,'height':1000});page.wait_for_timeout(550)
    a.evaluate("e=>{window.cardMotions=[];e.addEventListener('transitionrun',event=>{if(event.target===e)window.cardMotions.push(event.propertyName)})}")
    page.locator('.mobilemenu').click();page.wait_for_timeout(80)
    canvas=page.locator('.snap-canvas');assert canvas.evaluate("e=>e.classList.contains('canvas-width-changing')")
    assert a.evaluate('e=>getComputedStyle(e).transitionDuration')=='0s'
    page.wait_for_timeout(650);assert not canvas.evaluate("e=>e.classList.contains('canvas-width-changing')")
    assert not page.evaluate('window.cardMotions'),page.evaluate('window.cardMotions')
    page.evaluate('window.flushDocumentModules()');page.reload();d=page.locator('[data-fluid-id=d]');d.wait_for();a=page.locator('[data-fluid-id=a]');assert a.bounding_box()['y']>=d.bounding_box()['y']+d.bounding_box()['height']-2
    # Cross-tab drag and double-click rename, including built-in content boards.
    page.evaluate("""async id=>{const w=window.productionBridge.read(),p=w.projects.find(p=>p.id===id);p.customTabs.push({id:'target',name:'대상 탭',modules:[{id:'original-file',kind:'file',files:[]}]});p.customTabs[0].modules.push({id:'file-copy',kind:'file',title:'불러온 파일',files:[],sourceCopy:true,importSource:{kind:'project',ownerId:id,moduleId:'original-file'}});window.productionBridge.write(w);await window.flushDocumentModules()}""",project)
    page.reload();target=page.locator('[data-tab-id="tab:target"]');target.dblclick();dialog=page.get_by_role('dialog',name='탭 수정',exact=True);dialog.get_by_role('textbox',name='탭 이름',exact=True).fill('보관');dialog.get_by_role('button',name='완료',exact=True).click()
    page.locator('[data-tab-id="tab:drag"]').click();file=page.locator('[data-fluid-id=file-copy]');file.wait_for();file.scroll_into_view_if_needed();page.wait_for_timeout(200)
    save=file.get_by_role('button',name='원본에 저장',exact=True);add=file.locator('.material-upload');sr=save.bounding_box();ar=add.bounding_box();page.screenshot(path='/tmp/save-row-'+mode+'.png');assert abs(sr['y']+sr['height']/2-ar['y']-ar['height']/2)<3
    assert abs(sr['height']-ar['height'])<3;assert file.locator('.workspace-module > .shared-source-footer').count()==0
    d=page.locator('[data-fluid-id=d]');start_drag(d);r=target.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2,steps=18);page.get_by_role('status',name='보관 탭으로 이동',exact=True).wait_for();page.mouse.up()
    page.get_by_role('heading',name='보관',exact=True).wait_for();d=page.locator('[data-fluid-id=d]');d.wait_for();tabs=page.evaluate('window.productionBridge.read().projects[0].customTabs');assert not any(m['id']=='d' for m in tabs[0]['modules']);assert any(m['id']=='d' for m in tabs[1]['modules'])
    start_drag(d);tasktab=page.locator('[data-module-tab-target="board:tasks"]');r=tasktab.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2,steps=15);page.get_by_role('status',name='할 일 탭으로 이동',exact=True).wait_for();page.mouse.up();page.locator('[data-fluid-id=d]').wait_for()
    tabs=page.evaluate('window.productionBridge.read().projects[0].customTabs');assert any(m['id']=='d' for t in tabs if t.get('boardSection')=='tasks' for m in t['modules'])
    # Multiple fonts install sequentially; duplicates fail without stopping later files.
    settings=page.locator('.sidebar-main-spaces [data-main-space=settings]').first
    if not settings.is_visible():page.locator('.mobilemenu').click()
    settings.click();page.locator('[data-settings-category=fonts]').click()
    regular=str(root/'assets/document-fonts/NanumGothic-Regular.ttf');bold=str(root/'assets/document-fonts/NanumGothic-Bold.ttf')
    page.get_by_label('글꼴 파일 추가',exact=True).set_input_files([regular,regular,bold]);page.locator('.font-manager [role=status]').filter(has_text='2개 설치 · 1개 실패').wait_for(timeout=120000)
    assert page.locator('.font-list>div',has_text='NanumGothic').count()==2
    assert '이미 추가' in page.locator('.font-manager [role=alert]').inner_text()
    rid=page.evaluate("""async()=>{const r=await window.referenceBridge.create({title:'탭 이동 자료',tabs:[{id:'r-one',name:'첫 자료탭',modules:[{id:'r-module',title:'이동 자료 모듈',kind:'checklist',items:[]}]},{id:'r-two',name:'둘째 자료탭',modules:[]}]});await window.openRefs();await window.openReferenceModules(r);return r.id}""")
    second=page.locator('[data-tab-id=r-two]');second.dblclick();dialog=page.get_by_role('dialog',name='탭 수정',exact=True);dialog.get_by_role('textbox',name='탭 이름',exact=True).fill('자료 보관');dialog.get_by_role('button',name='완료',exact=True).click();page.locator('[data-tab-id=r-one]').click()
    refmod=page.locator('[data-fluid-id=r-module]');refmod.wait_for();start_drag(refmod);r=second.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2,steps=15);page.get_by_role('status',name='자료 보관 탭으로 이동',exact=True).wait_for();page.mouse.up()
    page.get_by_role('tabpanel',name='자료 보관',exact=True).wait_for();savedref=page.evaluate('id=>window.referenceBridge.get(id)',rid);assert not savedref['tabs'][0]['modules'];assert savedref['tabs'][1]['modules'][0]['id']=='r-module'
    assert not errors,errors
    print('PASS '+mode+': pointer guide matches per-card stack and whole-row placement, neighboring columns stable, Escape cancellation, persisted layout no second sidebar transition, project/reference cross-tab moves and renaming, same-row original save and multi-font partial success',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
