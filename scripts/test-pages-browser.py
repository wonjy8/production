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
 httpd=http.server.ThreadingHTTPServer(('127.0.0.1',9443),Handler)
 ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(cert,key);httpd.socket=ctx.wrap_socket(httpd.socket,server_side=True)
 threading.Thread(target=httpd.serve_forever,daemon=True).start()
 nas=subprocess.Popen([nas_python,'-m','uvicorn','server:app','--host','127.0.0.1','--port','9444','--ssl-keyfile',str(key),'--ssl-certfile',str(cert),'--no-access-log'],cwd=root/'nas',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP pages.test 127.0.0.1, MAP nas.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
   context=browser.new_context();page=context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(e.stack))
   page.goto('https://pages.test:9443/production/')
   page.locator('#connection-form [name=endpoint]').fill('http://nas.test:9444')
   page.locator('#connection-form button').click()
   page.wait_for_function('document.querySelector("#status").textContent.includes("HTTPS")')
   page.locator('#connection-form [name=endpoint]').fill('https://nas.test:9444')
   page.locator('#connection-form button').click()
   page.locator('#account-form [name=email]').fill('admin@example.com')
   page.locator('#account-form [name=password]').fill('StrongPassword2026!')
   page.locator('#account-form button').click()
   page.wait_for_function('window.appAccount?.role === "superadmin"')
   page.wait_for_function('typeof window.mountProduction === "function"')
   assert page.locator('[data-main-space="references"]').get_attribute('aria-label')=='자료'
   result=page.evaluate('''async()=>{const r=await fetch('/production/api/data');return {status:r.status,data:await r.json()}}''')
   assert result['status']==200,result
   cookies=context.cookies('https://nas.test:9444')
   assert any(c['name']=='__Host-pn-pages' and c['httpOnly'] and c['secure'] and c.get('partitionKey') for c in cookies), 'Missing partitioned session cookie'
   page.locator('[data-main-space=references]').click()
   page.locator('#refadd').click()
   canvas_width=page.locator('.canvas').bounding_box()['width']
   page.locator('.sidebar-hub').click()
   page.wait_for_function("document.body.classList.contains('hub-visible')")
   page.wait_for_timeout(250)
   assert page.locator('.canvas').bounding_box()['width']<canvas_width-250
   assert page.locator('.hub-sidebar').evaluate('(el)=>getComputedStyle(el).boxShadow')=='none'
   page.get_by_role('button',name='학교',exact=True).click()
   card=page.get_by_role('button',name=re.compile('출석부'))
   assert card.locator('strong').inner_text()=='출석부'
   assert card.locator('.hub-preview').is_visible()
   if os.environ.get('HUB_SCREENSHOT'): page.screenshot(path=os.environ['HUB_SCREENSHOT'],full_page=True)
   card.click()
   page.get_by_role('button',name='항목 추가').wait_for()
   page.locator('.custom-module-tab .module-toolbar button[aria-label=추가]').click()
   page.get_by_role('button',name='학교',exact=True).click()
   page.get_by_role('button',name=re.compile('과제 현황')).drag_to(page.locator('.snap-canvas'),target_position={'x':20,'y':20})
   assert page.locator('.workspace-module').count()==2
   page.get_by_role('button',name='화면 나누기').click()
   page.get_by_role('button',name='학교',exact=True).click()
   page.get_by_role('button',name=re.compile('수업 관리')).click()
   assert page.locator('.workspace-module').count()==3
   page.locator('.custom-module-tab .module-toolbar button[aria-label=추가]').click()
   page.get_by_role('button',name='학교',exact=True).click()
   page.get_by_role('button',name=re.compile('학점 계산기')).click()
   calculator=page.locator('.grade-calculator')
   calculator.get_by_role('button',name='과목 추가',exact=True).click()
   calculator.get_by_label('과목 1 이름',exact=True).fill('전공')
   calculator.get_by_label('과목 1 성적',exact=True).select_option('A+')
   calculator.get_by_role('button',name='과목 추가',exact=True).click()
   calculator.get_by_label('과목 2 학점',exact=True).fill('1')
   calculator.get_by_label('과목 2 성적',exact=True).select_option('F')
   assert '3.38 / 4.5' in calculator.inner_text()
   assert not page.evaluate("document.body.classList.contains('hub-visible')")
   page.route('https://www.figma.com/**',lambda route:route.fulfill(status=200,content_type='text/html',body='<p>Figma test frame</p>'))
   page.locator('.custom-module-tab .module-toolbar button[aria-label=추가]').click()
   page.get_by_role('button',name='미디어',exact=True).click()
   page.get_by_role('button',name=re.compile('Figma 임베드')).click()
   page.get_by_label('링크 주소',exact=True).fill('https://www.figma.com/design/Ab123/Example')
   page.locator('dialog[open]').get_by_role('button',name='추가',exact=True).click()
   assert page.locator('.embed-frame').count()==1
   page.locator('.custom-module-tab .module-toolbar button[aria-label=추가]').click()
   page.get_by_role('button',name='미디어',exact=True).click()
   page.get_by_role('button',name=re.compile('Figma 임베드')).click()
   assert page.get_by_label('링크 주소',exact=True).input_value()=='https://www.figma.com/design/Ab123/Example'
   page.keyboard.press('Escape')
   media=page.evaluate('''async()=>{const id=crypto.randomUUID(),url='/production/api/ref-files/'+id;const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'image/png'},body:bytes});if(!r.ok)throw Error(await r.text());const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL().startsWith('data:image/png');}''')
   assert media
   cdp=context.new_cdp_session(page);cdp.send('ServiceWorker.enable');cdp.send('ServiceWorker.stopAllWorkers')
   page.reload();page.wait_for_function('window.appAccount?.role === "superadmin"')
   page.evaluate("async()=>{await fetch('/production/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}")
   assert page.evaluate("async()=>(await fetch('/production/api/data')).status")==401
   assert not errors,errors
   fresh=browser.new_context();fresh_page=fresh.new_page();fresh_page.goto('https://pages.test:9443/production/');fresh_page.locator('#connection-form').wait_for(state='visible');assert fresh_page.locator('[name=endpoint]').input_value()==''
   fresh_page.locator('#connection-form button').click()
   fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>fetch('/production/api/storage').then(r=>r.json()).then(x=>x.mode)")=='browser'
   local=fresh_page.evaluate('''async()=>{const url='/production/api/data',r=await fetch(url),data=await r.json();data.projects.push({id:crypto.randomUUID(),name:'로컬 프로젝트'});const saved=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':r.headers.get('ETag')},body:JSON.stringify(data)});if(!saved.ok)throw Error(await saved.text());const id=crypto.randomUUID(),bytes=new Uint8Array([1,2,3,4]);const file=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes});if(!file.ok)throw Error(await file.text());const refId=crypto.randomUUID();const ref=await fetch('/production/api/references/'+refId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:refId,title:'로컬 자료',category:'',tags:[],description:'',blocks:[]})});if(!ref.ok)throw Error(await ref.text());return {id,refId}}''')
   fresh_page.reload();fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/data')).json().then(x=>x.projects.some(p=>p.name==='로컬 프로젝트'))")
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/references')).json().then(x=>x.some(r=>r.title==='로컬 자료'))")
   assert fresh_page.evaluate("async(id)=>[...(new Uint8Array(await(await fetch('/production/api/ref-files/'+id)).arrayBuffer()))].join(',')",local['id'])=='1,2,3,4'
   fresh_page.goto('https://pages.test:9443/production/?connection=1');fresh_page.locator('#connection-form').wait_for(state='visible');assert fresh_page.locator('[name=endpoint]').input_value()==''
   fresh_page.locator('[name=endpoint]').fill('https://nas.test:9444');fresh_page.locator('#connection-form button').click();fresh_page.locator('#account-form').wait_for()
   fresh_page.goto('https://pages.test:9443/production/?connection=1');fresh_page.locator('#connection-form').wait_for(state='visible');fresh_page.locator('[name=endpoint]').fill('');fresh_page.locator('#connection-form button').click();fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/data')).json().then(x=>x.projects.some(p=>p.name==='로컬 프로젝트'))")
   fresh_page.locator('.sidebar-settings').click()
   fresh_page.locator('[data-settings-category=connections]').click()
   fresh_page.get_by_label('Figma 연결 주소').fill('https://www.figma.com/design/Local123/Example')
   fresh_page.get_by_role('button',name='연결 저장',exact=True).click()
   assert '저장했습니다' in fresh_page.locator('.figma-settings [data-status]').inner_text()
   fresh_page.reload();fresh_page.wait_for_function('window.appAccount?.localMode === true')
   fresh_page.locator('.sidebar-settings').click()
   fresh_page.locator('[data-settings-category=connections]').click()
   assert fresh_page.get_by_label('Figma 연결 주소').input_value()=='https://www.figma.com/design/Local123/Example'
   fresh_page.get_by_role('button',name='연결 해제',exact=True).click()
   assert fresh_page.get_by_label('Figma 연결 주소').input_value()==''
   fresh_page.set_viewport_size({'width':390,'height':844})
   fresh_page.locator('#menu').click()
   fresh_page.locator('.sidebar-hub').click()
   fresh_page.locator('.hub-sidebar').wait_for(state='visible')
   assert fresh_page.locator('.hub-sidebar').is_visible()
   assert fresh_page.locator('.hub-sidebar').bounding_box()['width']<=390
   fresh_page.get_by_role('button',name='Hub 닫기',exact=True).click()
   fresh_page.wait_for_function("!document.body.classList.contains('hub-visible')")
   fresh_page.set_viewport_size({'width':1280,'height':900})
   old_version=fresh_page.locator('meta[name=pn-build]').get_attribute('content')
   new_version='f'*64 if old_version!='f'*64 else 'a'*64
   fresh_page.route('**/version.json?*',lambda route:route.fulfill(status=200,content_type='application/json',body=__import__('json').dumps({'version':new_version})))
   new_html=(root/'dist/pages/app.html').read_text().replace(old_version,new_version)
   fresh_page.route('**/app.html?*',lambda route:route.fulfill(status=200,content_type='text/html',body=new_html))
   fresh_page.evaluate('window.prepareAppUpdate=async()=>false;window.dispatchEvent(new Event("focus"))')
   fresh_page.wait_for_timeout(300)
   assert fresh_page.locator('meta[name=pn-build]').get_attribute('content')==old_version
   fresh_page.get_by_label('Figma 연결 주소').focus()
   fresh_page.evaluate('window.prepareAppUpdate=async()=>true;window.dispatchEvent(new Event("focus"))')
   fresh_page.wait_for_timeout(300)
   assert fresh_page.locator('meta[name=pn-build]').get_attribute('content')==old_version
   fresh_page.get_by_label('Figma 연결 주소').evaluate('(el)=>el.blur()')
   fresh_page.wait_for_function("document.querySelector('meta[name=pn-build]')?.content === "+repr(new_version))
   fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/data')).json().then(x=>x.projects.some(p=>p.name==='로컬 프로젝트'))")
   fresh.close()
   print('PASS: automatic deployed-version refresh with edit/save deferral and persisted local data, floating Hub reflow/mobile, grade calculator, Figma address persistence/settings, NAS and browser-only modes, separate persistent data and files, HTTPS validation, login, media/canvas and worker restart')
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
