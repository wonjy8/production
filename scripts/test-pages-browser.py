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
   context=browser.new_context();page=context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(e.stack))
   page.goto('https://pages.test:9443/production/http%3A%2F%2Fnas.test%3A9444')
   page.wait_for_function('document.querySelector("#status").textContent.includes("HTTPS")')
   assert page.locator('#connection-form').count()==0
   page.goto('https://pages.test:9443/production/nas.test:9444')
   page.locator('#account-form [name=email]').fill('admin@example.com')
   page.locator('#account-form [name=password]').fill('StrongPassword2026!')
   page.locator('#account-form button').click()
   page.wait_for_function('window.appAccount?.role === "superadmin"')
   page.wait_for_function('typeof window.mountProduction === "function"')
   assert page.locator('[data-main-space="references"]').get_attribute('aria-label')=='자료'
   page.wait_for_function('window.activeWorkspace === "home"')
   assert page.evaluate('window.appWorkspaces.map(w=>w.label)')==['홈','자료','데이터베이스']
   assert page.locator('.sidebar-main-spaces [data-main-space]').count()==3
   assert page.locator('.breadcrumbs [data-location=home]').inner_text()=='홈'
   page.locator('[data-main-space=references]').click()
   page.wait_for_function('window.activeWorkspace === "references"')
   assert page.locator('.sidebar-source-sections button[data-source-section]').count()==3
   for ident,label in [('references','레퍼런스'),('sources','소스'),('portfolios','포트폴리오')]:
    page.locator('.sidebar-source-sections button[data-source-section='+ident+']').click()
    page.wait_for_function('document.querySelector(".breadcrumbs").textContent.includes('+repr(label)+')')
    assert page.locator('.breadcrumbs button').all_text_contents()==['자료',label]
   page.get_by_role('button',name='갤러리 보기',exact=True).click()
   page.locator('.source-gallery').wait_for(state='visible')
   assert page.evaluate('window.activeWorkspace')=='references'
   assert page.locator('.breadcrumbs button').all_text_contents()==['자료','포트폴리오','갤러리']
   page.locator('.sidebar-source-sections button[data-source-section=references]').click()
   page.locator('[data-main-space=database]').click()
   page.wait_for_function('window.activeWorkspace === "database"')
   assert page.locator('[data-db-scope]').count()==3
   for ident,label in [('members','멤버·장비'),('rental-shops','대여처'),('locations','장소')]:
    page.locator('[data-db-scope='+ident+']').click()
    page.wait_for_function('document.querySelector(".breadcrumbs").textContent.includes('+repr(label)+')')
    assert page.locator('.breadcrumbs button').all_text_contents()==['데이터베이스',label]
   page.locator('[data-main-space=home]').click()
   page.wait_for_function('window.activeWorkspace === "home"')
   assert page.locator('.breadcrumbs button').all_text_contents()==['홈']
   page.locator('[data-main-space=references]').click()
   page.locator('.sidebar-source-sections button[data-source-section=references]').click()
   result=page.evaluate('''async()=>{const r=await fetch('/production/api/data');return {status:r.status,data:await r.json()}}''')
   assert result['status']==200,result
   local_tab=context.new_page();local_tab.goto('https://pages.test:9443/production/')
   local_tab.wait_for_function('window.appAccount?.localMode === true')
   assert local_tab.locator('#connection-form').count()==0
   assert local_tab.evaluate("async()=>fetch('/production/api/storage').then(r=>r.json()).then(x=>x.mode)")=='browser'
   assert page.evaluate("async()=>(await fetch('/production/api/data')).status")==200
   local_tab.close()
   cookies=context.cookies('https://nas.test:9444')
   assert any(c['name']=='__Host-pn-pages' and c['httpOnly'] and c['secure'] and c.get('partitionKey') for c in cookies), 'Missing partitioned session cookie'
   page.locator('[data-main-space=references]').click()
   page.locator('#refadd').click()
   page.wait_for_function('!!window.activeReferenceId')
   assert page.locator('.breadcrumbs button').all_text_contents()[:2]==['자료','레퍼런스']
   canvas_width=page.locator('.canvas').bounding_box()['width']
   page.locator('.custom-module-tab .module-toolbar button[aria-label=추가]').click()
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
   page.locator('.custom-module-tab .module-toolbar button[aria-label=추가]').click()
   page.get_by_role('button',name='기본',exact=True).click()
   page.get_by_role('button',name=re.compile('Wordcraft 문서')).click()
   wordcraft=page.locator('.wordcraft-module')
   wordcraft.get_by_role('button',name='문서 편집 시작',exact=True).click()
   editor=page.frame_locator('iframe.wordcraft-frame')
   editor.locator('#wordcraft_canvas').wait_for(state='visible',timeout=90000)
   editor.locator('#wordcraft_loading').wait_for(state='detached',timeout=90000)
   assert page.evaluate('window.wordcraftOpenCount')==1
   editor.locator('#wordcraft_canvas').click(position={'x':300,'y':160})
   page.keyboard.type('Wordcraft integration smoke',delay=40)
   editor.locator('#wordcraft_canvas').evaluate('()=>window.showSaveFilePicker=undefined')
   with page.expect_download(timeout=20000) as exported:
    page.keyboard.press('Control+s')
   download=exported.value
   assert download.suggested_filename.endswith('.docx')
   download.save_as('/tmp/wordcraft-smoke.docx')
   with __import__('zipfile').ZipFile('/tmp/wordcraft-smoke.docx') as document:
    assert 'Wordcraft integration smoke' in document.read('word/document.xml').decode()
   editor.locator('#wordcraft_canvas').click(position={'x':28,'y':54})
   editor.locator('#wordcraft_canvas').click(position={'x':45,'y':167})
   page.wait_for_timeout(200)
   page.locator('iframe.wordcraft-frame').screenshot(path='/tmp/wordcraft-open.png')
   with page.expect_file_chooser(timeout=15000) as chooser:
    editor.locator('#wordcraft_canvas').click(position={'x':280,'y':90})
   chooser.value.set_files('/tmp/wordcraft-smoke.docx')
   page.wait_for_timeout(500)
   with page.expect_download(timeout=20000) as reopened:
    page.keyboard.press('Control+s')
   reopened.value.save_as('/tmp/wordcraft-reopened.docx')
   with __import__('zipfile').ZipFile('/tmp/wordcraft-reopened.docx') as document:
    assert 'Wordcraft integration smoke' in document.read('word/document.xml').decode()
   page.locator('iframe.wordcraft-frame').screenshot(path='/tmp/wordcraft-module.png')
   media=page.evaluate('''async()=>{const id=crypto.randomUUID(),url='/production/api/ref-files/'+id;const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'image/png'},body:bytes});if(!r.ok)throw Error(await r.text());const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL().startsWith('data:image/png');}''')
   assert media
   cdp=context.new_cdp_session(page);cdp.send('ServiceWorker.enable');cdp.send('ServiceWorker.stopAllWorkers')
   page.reload();page.wait_for_function('window.appAccount?.role === "superadmin"')
   page.evaluate("async()=>{await fetch('/production/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}")
   assert page.evaluate("async()=>(await fetch('/production/api/data')).status")==401
   assert not errors,errors
   fresh=browser.new_context();fresh_page=fresh.new_page();fresh_page.goto('https://pages.test:9443/production/')
   fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>fetch('/production/api/storage').then(r=>r.json()).then(x=>x.mode)")=='browser'
   fresh_page.evaluate("()=>{const a=document.createElement('a');a.id='nas-install-download';a.href=new URL('production-nas-install.zip',document.baseURI).href;a.textContent='NAS 설치 파일';document.body.append(a)}")
   with fresh_page.expect_download() as package_download:
    fresh_page.locator('#nas-install-download').click()
   package_download.value.save_as('/tmp/production-nas-download-check.zip')
   with __import__('zipfile').ZipFile('/tmp/production-nas-download-check.zip') as package:
    assert {'Dockerfile','compose.yaml','install.sh','configure.py','README.md'}<=set(package.namelist())
    assert '.env' not in package.namelist()
   local=fresh_page.evaluate('''async()=>{const url='/production/api/data',r=await fetch(url),data=await r.json();data.projects.push({id:crypto.randomUUID(),name:'로컬 프로젝트'});data.productions.push({id:'workspace-project',name:'워크스페이스 프로젝트',tasks:[],customTabs:[],memberIds:[],teams:[]});const saved=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':r.headers.get('ETag')},body:JSON.stringify(data)});if(!saved.ok)throw Error(await saved.text());const id=crypto.randomUUID(),bytes=new Uint8Array([1,2,3,4]);const file=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes});if(!file.ok)throw Error(await file.text());const refId=crypto.randomUUID();const ref=await fetch('/production/api/references/'+refId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:refId,title:'로컬 자료',category:'',tags:[],description:'',blocks:[]})});if(!ref.ok)throw Error(await ref.text());return {id,refId}}''')
   fresh_page.reload();fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/data')).json().then(x=>x.projects.some(p=>p.name==='로컬 프로젝트'))")
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/references')).json().then(x=>x.some(r=>r.title==='로컬 자료'))")
   assert fresh_page.evaluate("async(id)=>[...(new Uint8Array(await(await fetch('/production/api/ref-files/'+id)).arrayBuffer()))].join(',')",local['id'])=='1,2,3,4'
   fresh_page.locator('[data-main-space=home]').click()
   fresh_page.locator('[data-production-id=workspace-project]').click()
   fresh_page.wait_for_function('document.querySelector(".breadcrumbs").textContent.includes("워크스페이스 프로젝트")')
   assert fresh_page.locator('.breadcrumbs button').all_text_contents()[:2]==['홈','워크스페이스 프로젝트']
   assert fresh_page.evaluate('window.activeWorkspace')=='home'
   fresh_page.goto('https://pages.test:9443/production/nas.test:9444/')
   fresh_page.locator('#account-form').wait_for()
   fresh_page.goto('https://pages.test:9443/production/')
   fresh_page.wait_for_function('window.appAccount?.localMode === true')
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
   assert fresh_page.locator('.mobile-bottom-nav').is_visible()
   fresh_page.wait_for_function('document.querySelectorAll(".mobile-bottom-nav [data-main-space]").length === 4')
   assert not fresh_page.locator('#sidebar').is_visible()
   fresh_page.locator('.mobile-bottom-nav [data-main-space=references]').click()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=sources]').wait_for()
   assert fresh_page.locator('.workspace-landing-card').all_text_contents()==['레퍼런스','소스','포트폴리오']
   fresh_page.locator('.workspace-landing-card[data-workspace-section=sources]').click()
   fresh_page.locator('#refpanel').wait_for(state='visible')
   fresh_page.get_by_role('button',name='워크스페이스 첫 화면으로 돌아가기').click()
   fresh_page.locator('.workspace-landing-card').first.wait_for()
   fresh_page.locator('.mobile-bottom-nav [data-main-space=database]').click()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=locations]').wait_for()
   assert fresh_page.locator('.workspace-landing-card').all_text_contents()==['멤버·장비','대여처','장소']
   fresh_page.locator('.workspace-landing-card[data-workspace-section=locations]').click()
   fresh_page.locator('#database-panel').wait_for(state='visible')
   fresh_page.locator('.mobile-bottom-nav [data-main-space=settings]').click()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=connections]').wait_for()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=connections]').click()
   fresh_page.get_by_label('Figma 연결 주소').wait_for()
   fresh_page.locator('.mobile-bottom-nav [data-main-space=home]').click()
   fresh_page.wait_for_function('window.activeWorkspace === "home" && !window.mobileWorkspaceHome')
   fresh_page.set_viewport_size({'width':1280,'height':900})
   fresh_page.wait_for_function('document.querySelector("#sidebar .sidebar-settings") !== null')
   fresh_page.locator('.sidebar-settings').click()
   fresh_page.locator('[data-settings-category=connections]').click()
   fresh_page.get_by_label('Figma 연결 주소').wait_for()
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
   print('PASS: three-workspace hierarchy and section/project breadcrumbs, NAS installer download, direct URL NAS connection, fresh 404 entry, per-tab local/NAS isolation, root browser mode, Wordcraft WASM startup, text editing, DOCX download and reopen, automatic deployed-version refresh with edit/save deferral and persisted local data, floating Hub reflow, mobile bottom navigation/category landing/back, grade calculator, Figma address persistence/settings, NAS and browser-only modes, separate persistent data and files, HTTPS validation, login, media/canvas and worker restart')
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
