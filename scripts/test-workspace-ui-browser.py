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
   page.evaluate("""()=>{const w=window.productionBridge.read();const date='2099-10-20';w.productions.push({id:'ui26',name:'UI 검증',status:'상시',tasks:[{id:'pending',title:'미완료 업무',done:false,stage:'기획',due:'',priority:'보통',owner:'',description:''},{id:'done',title:'완료 업무',done:true,stage:'완료',due:'',priority:'보통',owner:'',description:''}],schedules:[{id:'s1',title:'긴 일정 제목 '.repeat(15),date,endDate:date,startTime:'11:00',endTime:'14:00',note:'긴 일정 메모 '.repeat(20)},{id:'s2',title:'두 번째 일정',date,endDate:date,startTime:'16:00',endTime:'20:00'}],customTabs:[],teams:[],memberIds:[],hiddenTabs:['schedule']});window.productionBridge.write(w);window.productionRefresh()}""")
   page.locator('[data-production-id=ui26]').click()
   actions=page.locator('.merge-sections .tab-context-action');actions.first.wait_for(state='attached');assert actions.count()==2,actions.count()
   page.mouse.move(5,5);page.wait_for_timeout(200)
   assert actions.first.evaluate('e=>getComputedStyle(e).opacity')=='0'
   page.locator('.merge-sections').hover();page.wait_for_timeout(200)
   assert actions.first.evaluate('e=>getComputedStyle(e).opacity')=='1'
   assert actions.first.bounding_box()['height']==actions.last.bounding_box()['height']==32
   assert actions.first.evaluate('e=>getComputedStyle(e).borderTopWidth')=='0px'
   assert page.locator('.production-overview .overview-facts').count()==0
   assert page.locator('.production-overview').evaluate('e=>getComputedStyle(e).paddingBottom')=='12px'
   page.locator('[data-tab-id=tasks]').click()
   pending=page.locator('.task-list-group[data-task-status="시작 전"]')
   assert pending.locator('.task-composer').count()==1
   done=page.locator('.task-list-group[data-task-status="완료"]')
   toggle=done.get_by_role('button',name='완료',exact=True)
   assert toggle.get_attribute('aria-expanded')=='false'
   assert not done.get_by_text('완료 업무',exact=True).is_visible()
   toggle.click();assert done.get_by_text('완료 업무',exact=True).is_visible()
   assert done.locator(':scope>div').evaluate('e=>getComputedStyle(e).opacity')=='0.65'
   page.get_by_role('button',name='보드',exact=True).click()
   assert page.locator('.task-board .task-composer').count()==1
   assert page.locator('.task-board>[data-task-stage="시작 전"] .task-composer').count()==1
   page.screenshot(path='/tmp/ui26-tasks.png')
   page.evaluate("window.openHomeSection('tasks')")
   page.get_by_role('heading',name='모든 할 일',exact=True).wait_for()
   assert page.get_by_text('미완료 업무',exact=True).is_visible()
   assert page.get_by_text('완료 업무',exact=True).count()==0
   back=page.get_by_role('button',name='뒤로가기',exact=True);assert back.inner_text()==''
   assert back.bounding_box()['x']<page.get_by_role('heading',name='모든 할 일',exact=True).bounding_box()['x']
   back.click();page.evaluate("window.openHomeSection('schedule')")
   page.get_by_role('heading',name='모든 일정',exact=True).wait_for()
   assert page.get_by_role('button',name='캘린더',exact=True).get_attribute('aria-pressed')=='true'
   page.get_by_role('button',name='목록',exact=True).click()
   entries=page.locator('.admin-schedule-entry');entries.first.wait_for()
   first,second=entries.nth(0).bounding_box(),entries.nth(1).bounding_box()
   assert first['y']+first['height']<=second['y']+1,(first,second)
   assert entries.first.locator('strong').bounding_box()['height']>20
   page.screenshot(path='/tmp/ui26-schedule.png')
   page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
   first,second=entries.nth(0).bounding_box(),entries.nth(1).bounding_box()
   assert first['y']+first['height']<=second['y']+1
   assert not errors,errors
   print('PASS borderless nearby tab actions, grouped composer/completed toggle, hidden completed home tasks, calendar default/back navigation and long schedule non-overlap on desktop/mobile',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
