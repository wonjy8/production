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
   if 'sidebar-collapsed' in (page.locator('body').get_attribute('class') or ''):page.locator('#menu').click()
   nav=page.locator('#sidebar .sidebar-main-spaces');expect(nav).to_be_visible()
   assert nav.locator('[data-main-space]').evaluate_all('(buttons)=>buttons.map(b=>b.dataset.mainSpace)')==['home','references','documents','settings']
   assert page.locator('.app-release-version').count()==0
   metrics=page.evaluate("""()=>{const side=document.querySelector('#sidebar').getBoundingClientRect(),rail=document.querySelector('.sidebar-fixed-top').getBoundingClientRect(),scroll=document.querySelector('.sidebar-scroll').getBoundingClientRect(),settings=document.querySelector('.sidebar-main-spaces [data-main-space=settings]').getBoundingClientRect();return {inside:Math.abs(rail.left-side.left)<=1&&rail.right<side.right,divider:getComputedStyle(document.querySelector('.sidebar-fixed-top')).borderRightWidth,content:scroll.left>=rail.right-1,bottom:side.bottom-settings.bottom}}""")
   assert metrics['inside'] and metrics['divider']=='1px' and metrics['content'] and 5<=metrics['bottom']<=25,metrics
   page.locator('[data-main-space=references]').first.click()
   expect(page.locator('[data-main-space=references]').first).to_have_attribute('aria-pressed','true')
   assert page.locator('[data-main-space=references]').first.locator('.nav-solid').evaluate('(g)=>getComputedStyle(g).display')!='none'
   assert page.locator('[data-main-space=home]').first.locator('.nav-solid').evaluate('(g)=>getComputedStyle(g).display')=='none'
   colors=nav.locator('[data-main-space]').evaluate_all("bs=>bs.map(b=>({space:b.dataset.mainSpace,color:getComputedStyle(b).color,bg:getComputedStyle(b).backgroundColor}))")
   assert next(c for c in colors if c['space']=='references')['color']=='rgb(24, 25, 27)',colors
   assert next(c for c in colors if c['space']=='home')['bg']=='rgba(0, 0, 0, 0)',colors
   page.screenshot(path='/tmp/production-sidebar-materials.png',full_page=True)
   page.locator('[data-main-space=settings]').first.click()
   page.locator('#sidebar [data-settings-category=general]').click()
   expect(page.locator('.app-version-row')).to_contain_text('v0.1.4')
   page.screenshot(path='/tmp/production-sidebar-settings.png',full_page=True)
   with page.expect_popup() as opened:page.locator('[data-main-space=documents]').first.click()
   document=opened.value;document.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   rail=document.locator('.document-workspace-rail');expect(rail).to_be_visible();expect(rail.locator('[data-main-space=documents]')).to_have_attribute('aria-pressed','true')
   box=document.locator('#document-editor-root').bounding_box();assert box['x']==64 and box['x']+box['width']<=1401,box
   document.get_by_role('textbox',name='문서 본문',exact=True).fill('Saved before leaving the document rail')
   file_id=document.evaluate('new URLSearchParams(location.search).get("document")')
   document.screenshot(path='/tmp/production-sidebar-document.png',full_page=True)
   rail.locator('[data-main-space=home]').click()
   document.wait_for_function('!new URLSearchParams(location.search).has("document")&&!!window.productionBridge')
   expect(document.locator('[data-main-space=home]').first).to_have_attribute('aria-pressed','true')
   raw=document.evaluate("async id=>btoa(String.fromCharCode(...new Uint8Array(await fetch('/production/api/ref-files/'+id).then(r=>r.arrayBuffer()))))",file_id)
   import io,zipfile
   with zipfile.ZipFile(io.BytesIO(base64.b64decode(raw))) as saved:assert b'Saved before leaving the document rail' in saved.read('word/document.xml')
   document.close()
   page.locator('#menu').click()
   expect(nav).to_be_visible();assert page.locator('#sidebar').bounding_box()['width']==64
   page.locator('[data-main-space=home]').first.click()
   page.set_viewport_size({'width':390,'height':844})
   expect(page.locator('.mobile-bottom-nav [data-main-space=documents]')).to_be_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.locator('.mobile-bottom-nav [data-main-space=references]').click()
   expect(page.locator('.mobile-bottom-nav [data-main-space=references]')).to_have_attribute('aria-pressed','true')
   with page.expect_popup() as opened:page.locator('.mobile-bottom-nav [data-main-space=documents]').click()
   document=opened.value;document.set_viewport_size({'width':390,'height':844});document.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   box=document.locator('#document-editor-root').bounding_box();assert box['x']==52 and box['x']+box['width']<=391,box
   document.screenshot(path='/tmp/production-sidebar-document-mobile.png',full_page=True);document.close()
   page.screenshot(path='/tmp/production-sidebar-mobile.png',full_page=True)
   assert not errors,errors
   print('PASS sidebar: interior rail/divider, filled selection, stacked materials glyph, bottom settings, version only in settings, document rail + saved navigation, collapsed rail, four mobile icons and mobile editor bounds',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
