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
   release=(root/'VERSION').read_text().strip()
   assert page.locator('.app-release-version').inner_text()=='v'+release
   assert page.locator('meta[name=pn-release]').get_attribute('content')==release
   measurements={}
   def measure(key,selector):
    heading=page.locator(selector);heading.wait_for();page.wait_for_timeout(260)
    measurements[key]=heading.evaluate("e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,height:e.getBoundingClientRect().height,font:getComputedStyle(e.querySelector('h1')).fontSize,margin:getComputedStyle(e).marginBottom,nextY:e.nextElementSibling.getBoundingClientRect().y})")
   page.locator('[data-main-space=settings]').click()
   page.locator('[data-settings-category=general]').click()
   assert page.locator('.app-version-row').inner_text().replace('\n','').endswith('v'+release)
   page.locator('[data-settings-category=projects]').click()
   measure('settings','#settings-panel>.workspace-page-heading')
   page.locator('[data-main-space=database]').click()
   page.locator('[data-db-scope=members]').click()
   page.get_by_role('heading',name='멤버',exact=True).wait_for()
   measure('database','#database-panel>.workspace-page-heading')
   page.locator('[data-main-space=references]').click()
   page.locator('[data-source-section=resources]').click()
   measure('resources','.resource-library>.workspace-page-heading')
   page.evaluate("""()=>{const w=window.productionBridge.read();w.productions.push({id:'head27',name:'제목 정렬 검증',status:'상시',tasks:[],customTabs:[],teams:[],memberIds:[]});window.productionBridge.write(w);window.productionRefresh()}""")
   page.locator('[data-main-space=home]').click()
   page.locator('[data-production-id=head27]').click()
   measure('project','.project-page-heading')
   print(measurements,flush=True)
   assert all(row['font']=='24px' and row['height']==40 for row in measurements.values()),measurements
   assert max(row['x'] for row in measurements.values())-min(row['x'] for row in measurements.values())<2,measurements
   assert max(row['y'] for row in measurements.values())-min(row['y'] for row in measurements.values())<2,measurements
   assert max(row['nextY'] for row in measurements.values())-min(row['nextY'] for row in measurements.values())<2,measurements
   page.screenshot(path='/tmp/ui27-project.png')
   page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250)
   heading=page.locator('.project-page-heading');assert heading.evaluate("e=>getComputedStyle(e.querySelector('h1')).fontSize")=='24px'
   assert heading.bounding_box()['x']>=0 and heading.bounding_box()['x']+heading.bounding_box()['width']<=390
   page.screenshot(path='/tmp/ui27-mobile.png')
   assert not errors,errors
   print('PASS consistent headings across Settings, DB, Resources and Projects',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
