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
   page.goto('https://pages.test:9443/production/')
   page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
   nav=page.locator('.workspace-rail .sidebar-main-spaces');expect(nav).to_be_visible()
   assert nav.locator('[data-main-space]').evaluate_all('(buttons)=>buttons.map(b=>b.dataset.mainSpace)')==['home','references','documents','settings']
   assert page.locator('#menu').count()==0
   metrics=page.evaluate("""()=>{const rail=document.querySelector('.workspace-rail').getBoundingClientRect(),side=document.querySelector('#sidebar').getBoundingClientRect(),settings=document.querySelector('.workspace-rail [data-main-space=settings]').getBoundingClientRect();return {outside:rail.right<=side.left,size:getComputedStyle(document.querySelector('.workspace-rail svg')).width,bottom:innerHeight-settings.bottom}}""")
   assert metrics['outside'] and metrics['size']=='18px' and 5<=metrics['bottom']<=25,metrics
   home=nav.locator('[data-main-space=home]');home.click()
   expect(page.locator('body')).to_have_class(re.compile('sidebar-collapsed'))
   assert page.locator('.sidebar-resize').get_attribute('aria-disabled')=='true'
   before=page.evaluate("localStorage.getItem('pn-sidebar-width')")
   page.locator('.sidebar-resize').dispatch_event('keydown',{'key':'ArrowRight'})
   page.locator('.sidebar-resize').dispatch_event('pointerdown',{'clientX':100,'pointerId':1})
   page.locator('.sidebar-resize').dispatch_event('pointermove',{'clientX':200,'pointerId':1})
   assert page.evaluate("localStorage.getItem('pn-sidebar-width')")==before
   home.click();expect(page.locator('.sidebar-resize')).to_have_attribute('aria-disabled','false')
   page.locator('.sidebar-resize').focus();page.keyboard.press('ArrowRight')
   assert int(page.evaluate("localStorage.getItem('pn-sidebar-width')"))==int(before)+10
   home.click()
   nav.locator('[data-main-space=references]').click()
   expect(nav.locator('[data-main-space=references]')).to_have_attribute('aria-pressed','true')
   expect(nav.locator('[data-main-space=references]')).to_have_attribute('aria-expanded','true')
   assert not page.evaluate("document.body.classList.contains('sidebar-collapsed')")
   assert nav.locator('[data-main-space=references] .nav-solid').evaluate('(g)=>getComputedStyle(g).display')!='none'
   # The front document has an opaque surface, covering the rear outline.
   fill=nav.locator('[data-main-space=references] .nav-outline>path').first.evaluate('(g)=>getComputedStyle(g).fill')
   assert fill!='none',fill
   page.screenshot(path='/tmp/production-sidebar-materials.png',full_page=True)
   nav.locator('[data-main-space=settings]').click()
   page.locator('#sidebar [data-settings-category=general]').click()
   expect(page.locator('.app-version-row')).to_contain_text('v0.1.5')
   page.screenshot(path='/tmp/production-sidebar-settings.png',full_page=True)
   page_count=len(context.pages)
   nav.locator('[data-main-space=documents]').click()
   document=page.frame_locator('#inline-document-panel iframe')
   editor=document.get_by_role('textbox',name='문서 본문',exact=True);editor.wait_for()
   assert len(context.pages)==page_count
   box=page.locator('#inline-document-panel iframe').bounding_box();side=page.locator('#sidebar').bounding_box()
   assert box['x']>=side['x']+side['width'] and box['x']+box['width']<=1401,box
   assert document.locator('#document-editor-root').bounding_box()['width']<=box['width']+1
   editor.fill('Saved before leaving inline document')
   file_id=document.locator('body').evaluate('()=>new URLSearchParams(location.search).get("document")')
   page.screenshot(path='/tmp/production-sidebar-document.png',full_page=True)
   document.locator('body').evaluate('()=>{window.testSaveHook=window.prepareDocumentNavigation;window.prepareDocumentNavigation=async()=>false}')
   nav.locator('[data-main-space=home]').click()
   expect(nav.locator('[data-main-space=documents]')).to_have_attribute('aria-pressed','true')
   expect(page.locator('#inline-document-panel')).to_be_visible()
   document.locator('body').evaluate('()=>{window.prepareDocumentNavigation=window.testSaveHook}')
   nav.locator('[data-main-space=home]').click()
   expect(nav.locator('[data-main-space=home]')).to_have_attribute('aria-pressed','true')
   expect(page.locator('#inline-document-panel')).to_be_hidden()
   raw=page.evaluate("async id=>btoa(String.fromCharCode(...new Uint8Array(await fetch('/production/api/ref-files/'+id).then(r=>r.arrayBuffer()))))",file_id)
   with zipfile.ZipFile(io.BytesIO(base64.b64decode(raw))) as saved:assert b'Saved before leaving inline document' in saved.read('word/document.xml')
   page.wait_for_function("location.hash==='#/home'")
   page.go_back();expect(nav.locator('[data-main-space=documents]')).to_have_attribute('aria-pressed','true');expect(editor).to_contain_text('Saved before leaving inline document')
   page.go_forward();expect(nav.locator('[data-main-space=home]')).to_have_attribute('aria-pressed','true')
   nav.locator('[data-main-space=documents]').click();expect(editor).to_contain_text('Saved before leaving inline document')
   page.set_viewport_size({'width':390,'height':844})
   mobile=page.locator('.mobile-bottom-nav')
   expect(mobile.locator('[data-main-space=documents]')).to_be_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   mobile.locator('[data-main-space=home]').click()
   mobile.locator('[data-main-space=references]').click()
   expect(mobile.locator('[data-main-space=references]')).to_have_attribute('aria-pressed','true')
   expect(page.locator('#sidebar')).to_have_class(re.compile('open'))
   mobile.locator('[data-main-space=references]').click()
   assert 'open' not in (page.locator('#sidebar').get_attribute('class') or '')
   mobile.locator('[data-main-space=documents]').click()
   # Close its contextual drawer without opening another document.
   mobile.locator('[data-main-space=documents]').click()
   expect(editor).to_be_visible()
   assert len(context.pages)==page_count
   box=page.locator('#inline-document-panel iframe').bounding_box();assert box['x']>=0 and box['x']+box['width']<=391,box
   page.screenshot(path='/tmp/production-sidebar-document-mobile.png',full_page=True)
   page.wait_for_function("location.hash==='#/documents'")
   page.reload();editor=page.frame_locator('#inline-document-panel iframe').get_by_role('textbox',name='문서 본문',exact=True);expect(editor).to_contain_text('Saved before leaving inline document')
   assert len(context.pages)==page_count
   mobile.locator('[data-main-space=home]').click();expect(mobile.locator('[data-main-space=home]')).to_have_attribute('aria-pressed','true')
   page.evaluate("window.openInlineDocument(location.pathname+'?document=00000000-0000-0000-0000-000000000000&name=missing.txt&mime=text/plain')")
   expect(page.frame_locator('#inline-document-panel iframe').locator('.document-header [role=status]')).to_contain_text('문서를 열지 못했습니다')
   mobile.locator('[data-main-space=home]').click();expect(mobile.locator('[data-main-space=home]')).to_have_attribute('aria-pressed','true')
   assert not errors,errors
   print('PASS sidebar: external compact rail, spacing, filled/opaque icons, settings version, icon toggle, resize guards, embedded editor + save on navigation/resume, mobile bounds and toggle',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
