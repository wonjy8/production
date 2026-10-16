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
   browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP pages.test 127.0.0.1, MAP nas.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
   context=browser.new_context();context.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}");page=context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(e.stack))
   page.goto('https://pages.test:9443/production/http%3A%2F%2Fnas.test%3A9444')
   page.wait_for_function('document.body.textContent.includes("HTTPS")')
   assert page.locator('#connection-form').count()==0
   page.goto('https://pages.test:9443/production/nas.test:9444')
   page.locator('#account-form [name=email]').fill('admin@example.com')
   page.locator('#account-form [name=password]').fill('StrongPassword2026!')
   page.locator('#account-form button').click()
   page.wait_for_function('window.appAccount?.role === "superadmin"')
   page.wait_for_function('typeof window.mountProduction === "function"')
   assert page.locator('[data-main-space=database]').count()==0
   assert page.locator('.sidebar-main-spaces>[data-main-space]').count()==3
   page.locator('[data-main-space=references]').click()
   page.locator('.sidebar-reference-area').wait_for()
   assert page.locator('.sidebar-material-databases [data-db-scope]').count()==4
   assert page.locator('.sidebar-reference-area>.materials-divider').is_visible()
   page.evaluate("""async()=>{await window.referenceBridge.create({title:'분류가 있는 자료',category:'분류 탭 제거 검증',tags:['검증'],tabs:[{id:'inside',name:'내용 탭',modules:[]}]})}""")
   for section in ['references','sources','portfolios']:
    page.locator('.sidebar-reference-area [data-source-section='+section+']').click()
    page.wait_for_function('(section)=>document.querySelector(".sidebar-reference-area").dataset.sourceSection===section',arg=section)
    assert page.locator('.sidebar-reference-area [data-ref-category],.sidebar-reference-area [data-ref-tag],.sidebar-reference-area [data-ref-scope]').count()==0
    assert page.locator('.refpanel').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
   for key,title in [('members','멤버'),('equipment','장비'),('rental-shops','대여처'),('locations','장소')]:
    page.locator('.sidebar-material-databases [data-db-scope='+key+']').click()
    page.locator('#database-panel>.workspace-page-heading h1').filter(has_text=title).wait_for()
    assert page.locator('[data-main-space=references]').get_attribute('aria-pressed')=='true'
    assert page.locator('.breadcrumbs').inner_text().startswith('자료')
    assert page.locator('#database-panel').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
    assert page.locator('.sidebar-material-databases .active').get_attribute('data-db-scope')==key
   trash=page.locator('.sidebar-footer .sidebar-materials-trash')
   assert trash.is_visible()
   assert trash.evaluate('(e)=>[...e.parentNode.children].filter(c=>getComputedStyle(c).display!=="none").every(c=>c===e||c.getBoundingClientRect().bottom<=e.getBoundingClientRect().top+1)')
   trash.click()
   page.get_by_role('heading',name='휴지통',exact=True).wait_for()
   assert trash.get_attribute('aria-current')=='page'
   page.locator('.sidebar-material-databases [data-db-scope=members]').click()
   page.locator('#database-panel>.workspace-page-heading h1').wait_for()
   page.set_viewport_size({'width':390,'height':844})
   page.wait_for_timeout(100)
   assert page.locator('.mobile-bottom-nav [data-main-space]').count()==3
   assert page.locator('.mobile-bottom-nav').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
   page.locator('.mobile-workspace-back').click()
   page.locator('.workspace-landing').wait_for()
   assert page.locator('.workspace-landing h1').inner_text()=='자료'
   assert page.locator('.workspace-landing [data-workspace-section=members]').is_visible()
   assert page.locator('.workspace-landing-items>button').last.get_attribute('data-workspace-section')=='trash'
   page.locator('[data-workspace-section=equipment]').click()
   page.locator('#database-panel>.workspace-page-heading h1').filter(has_text='장비').wait_for()
   assert page.locator('[data-main-space=references]').get_attribute('aria-pressed')=='true'
   page.wait_for_function("location.hash==='#/materials/equipment'")
   page.reload()
   page.locator('#database-panel>.workspace-page-heading h1').filter(has_text='장비').wait_for()
   page.goto(page.url.split('#')[0]+'#/database/locations')
   page.reload()
   page.locator('#database-panel>.workspace-page-heading h1').filter(has_text='장소').wait_for()
   page.wait_for_function("location.hash==='#/materials/locations'")
   page.evaluate("localStorage.setItem('pn-space','database');localStorage.setItem('pn-start-space','last');history.replaceState(null,'',location.pathname)")
   page.reload()
   page.locator('.workspace-landing h1').filter(has_text='자료').wait_for()
   assert not errors,errors
   print('PASS unified Materials desktop/mobile routes, dividers, footer trash, no category tabs, no entrance motion, legacy DB start',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
