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
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"')
    project=page.evaluate("""async()=>{const w=window.productionBridge.read(),id=crypto.randomUUID();w.productions=[];w.projects=[{id,name:'맞춤 검증',status:'진행 중',due:'',owner:'',tasks:[],schedules:[],assets:[],feedback:[],customTabs:[{id:'fit',name:'자동 크기',modules:[{id:'a',kind:'checklist',title:'자동 모듈',span:6,items:[{id:'first',text:'첫 항목'}]},{id:'b',kind:'checklist',title:'다른 모듈',span:6,items:[{id:'other',text:'다른 항목'}]},{id:'c',kind:'text',title:'아래 모듈',text:'아래쪽 내용'}]}]}];window.productionBridge.write(w);await window.flushDocumentModules();window.productionBridge.select(id,'tab:fit');return id}""")
    page.goto(base+'#/work-groups/'+project+'/tabs/fit')
    a=page.locator('[data-fluid-id=a]');b=page.locator('[data-fluid-id=b]');
    try:a.wait_for()
    except Exception:
     print(page.locator('body').inner_text(),flush=True);raise
    def h(box):return box.bounding_box()['height']
    def module_data():return page.evaluate("window.productionBridge.read().projects[0].customTabs.find(t=>t.id==='fit').modules.find(m=>m.id==='a')")
    def idle():page.wait_for_timeout(250)
    def drag_bottom(delta):
     edge=a.get_by_role('separator',name='모듈 높이 조절',exact=True);r=edge.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2;page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+delta,steps=12);page.mouse.up();idle()
    page.mouse.move(0,0);idle()
    removal=a.locator('.module-outside-title .compact-remove');assert removal.evaluate('e=>getComputedStyle(e).opacity')=='0'
    r=a.bounding_box();page.mouse.move(r['x']+r['width']+7,r['y']+5);idle();assert removal.evaluate('e=>getComputedStyle(e).opacity')=='1'
    page.mouse.move(0,0);idle();assert removal.evaluate('e=>getComputedStyle(e).opacity')=='0'
    # Keyboard-only access remains visible and confirmation never vanishes off hover.
    removal.focus();idle();assert removal.evaluate('e=>getComputedStyle(e).opacity')=='1'
    removal.click();page.mouse.move(0,0);a.get_by_role('button',name='모듈 삭제 확인',exact=True).wait_for();a.get_by_role('button',name='삭제 취소',exact=True).click()
    page.evaluate("document.querySelector('#production-panel')?.shadowRoot?.activeElement?.blur()");page.mouse.move(0,0);idle()
    row_remove=a.get_by_role('button',name='항목 삭제',exact=True);assert row_remove.evaluate('e=>getComputedStyle(e).opacity')=='0'
    r=row_remove.bounding_box();page.mouse.move(r['x']+r['width']+10,r['y']+r['height']/2);idle();assert row_remove.evaluate('e=>getComputedStyle(e).opacity')=='1'
    # Intrinsic content changes repack the board, independently of adjacent cards.
    first=h(a);other=h(b);a.get_by_role('button',name='항목 추가',exact=True).click();idle();natural=h(a);row_height=natural-first;assert row_height>20
    assert module_data().get('frameHeight') is None
    drag_bottom(200);fixed=h(a);assert module_data()['frameHeight']>natural+100
    a.get_by_role('button',name='항목 추가',exact=True).click();idle();assert abs(h(a)-fixed)<2
    assert abs(h(b)-other)<2
    target=natural+row_height
    drag_bottom(target-fixed+3);assert module_data().get('frameHeight') is None,module_data()
    assert a.get_attribute('data-height-mode')=='auto'
    fitted=h(a);a.get_by_role('button',name='항목 추가',exact=True).click();idle();assert h(a)>fitted+20
    c=page.locator('[data-fluid-id=c]');assert c.bounding_box()['y']>=a.bounding_box()['y']+h(a)
    # Fixed mode persists, keyboard reset and short content work after reload.
    drag_bottom(150);fixed=module_data()['frameHeight'];page.evaluate('window.flushDocumentModules()');page.reload();a=page.locator('[data-fluid-id=a]');a.wait_for();idle();assert abs(h(a)-fixed)<2
    a.get_by_role('separator',name='모듈 높이 조절',exact=True).focus();page.keyboard.press('Home');idle();assert module_data().get('frameHeight') is None
    # A wide pointer drag still preserves grid widths and saved height state.
    edge=a.get_by_role('separator',name='모듈 크기 단계 조절',exact=True);r=edge.bounding_box();x=r['x']+r['width']/2;y=r['y']+50;page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+200,y,steps=10);page.mouse.up();idle();assert module_data().get('span',12)>=8
    assert module_data().get('frameHeight') is None
    # Touch users see removal controls without requiring hover.
    page.emulate_media(media='screen')
    touch=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,storage_state=context.storage_state(indexed_db=True))
    mobile=touch.new_page();mobile.goto(base+'#/work-groups/'+project+'/tabs/fit');mobile.locator('[data-fluid-id=a]').wait_for()
    assert mobile.locator('[data-fluid-id=a] .module-outside-title .compact-remove').evaluate('e=>getComputedStyle(e).opacity')=='1'
    assert mobile.locator('[data-fluid-id=a] [data-removal-reveal=true]').first.evaluate('e=>getComputedStyle(e).opacity')=='1'
    touch.close()
    assert not errors,errors
    print('PASS '+mode+': near/hover/keyboard removal, stable confirmation, auto height growth, fixed persistence, magnetic reset, board packing and width resizing',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
