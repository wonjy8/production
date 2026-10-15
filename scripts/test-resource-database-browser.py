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
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
    page.locator('.sidebar-main-spaces [data-main-space=settings]').first.click()
    page.locator('[data-settings-category=fonts]').click()
    page.get_by_label('글꼴 파일 추가',exact=True).set_input_files(str(root/'assets/document-fonts/LiberationSans-Regular.ttf'))
    page.locator('.font-list>div',has_text='Liberation Sans').wait_for()
    page.reload();page.locator('.font-list>div',has_text='Liberation Sans').wait_for()

    fixture=page.evaluate("""async()=>{const id=crypto.randomUUID();await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'text/plain'},body:'legacy original'});await window.referenceBridge.create({title:'기존 자료',modules:[{id:crypto.randomUUID(),kind:'file',files:[{id,name:'legacy.txt',kind:'file',mime:'text/plain'}]}]});return id}""")
    page.locator('[data-main-space=references]').first.click();page.locator('button[data-source-section=resources]').click()
    page.get_by_role('heading',name='자료',exact=True).wait_for();page.get_by_role('button',name='legacy.txt',exact=True).wait_for()
    page.wait_for_function('location.hash==="#/materials/resources"')
    page.get_by_label('DB 파일 추가',exact=True).set_input_files({'name':'pixel.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==')})
    page.get_by_role('button',name='pixel.png',exact=True).wait_for()
    with page.expect_popup() as preview:page.get_by_role('button',name='pixel.png',exact=True).click()
    image=preview.value;image.wait_for_url('blob:**');assert image.locator('img').count()==1;image.close()
    page.get_by_role('button',name='새 문서',exact=True).click()
    page.get_by_role('textbox',name='자료 제목',exact=True).fill('주일 말씀 '+mode)
    page.get_by_label('분류',exact=True).fill('예배');page.get_by_role('textbox',name='장소',exact=True).fill('교회');page.get_by_role('textbox',name='설교자',exact=True).fill('설교자');page.get_by_role('textbox',name='본문 구절',exact=True).fill('요한복음 1:1')
    with page.expect_popup() as popup:page.get_by_role('button',name='만들고 문서 열기',exact=True).click()
    editor=popup.value;editor.get_by_role('textbox',name='문서 본문',exact=True).wait_for(timeout=60000)
    editor.get_by_role('textbox',name='문서 본문',exact=True).click();editor.keyboard.press('Control+End');editor.keyboard.press('Enter');editor.keyboard.type('Saved sermon content',delay=20)
    editor.keyboard.press('Control+a');editor.get_by_role('button',name='문서 설정',exact=True).click();editor.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name='속성',exact=True).click();editor.get_by_label('글꼴',exact=True).select_option('Liberation Sans')
    editor.wait_for_timeout(1200);editor.wait_for_function("document.querySelector('.document-header [role=status]')?.textContent.endsWith('저장됨')",timeout=30000)
    editor.get_by_role('button',name='페이지 설정 닫기',exact=True).click()
    editor.get_by_role('textbox',name='문서 본문',exact=True).click();editor.keyboard.press('Control+End');editor.keyboard.press('Enter')
    editor.get_by_role('button',name='이미지 추가',exact=True).click()
    picker=editor.get_by_role('dialog',name='자료에서 이미지 선택',exact=True)
    picker.get_by_role('searchbox',name='자료 이미지 검색').fill('pixel.png')
    picker.get_by_role('button',name='pixel.png',exact=True).click();picker.wait_for(state='detached')
    editor.locator('.document-sheet img[src]').wait_for()
    editor.get_by_label('내보내기',exact=True).click()
    with editor.expect_download(timeout=60000) as pdf_export:editor.get_by_role('menuitem',name='PDF (.pdf)',exact=True).click()
    fontinfo=subprocess.run(['pdffonts',pdf_export.value.path()],check=True,capture_output=True,text=True).stdout
    assert 'LiberationSans' in fontinfo,fontinfo
    editor.close()
    # Restore masonry browsing alongside list mode; tabs filter the same catalog.
    page.get_by_role('button',name='갤러리',exact=True).click();page.locator('.resource-masonry').wait_for()
    page.locator('.resource-masonry .photo-preview img').wait_for()
    tabs=page.get_by_role('navigation',name='자료 유형',exact=True)
    tabs.get_by_role('button',name='이미지',exact=True).click()
    assert page.locator('.resource-card').count()==1
    page.get_by_role('button',name='목록',exact=True).click();page.locator('.resource-table').wait_for()
    page.reload();page.locator('.resource-table').wait_for();assert page.get_by_role('button',name='목록',exact=True).get_attribute('aria-pressed')=='true'
    tabs=page.get_by_role('navigation',name='자료 유형',exact=True);tabs.get_by_role('button',name='문서',exact=True).click()
    folder_height=page.locator('button.document-library-row').first.evaluate('e=>e.getBoundingClientRect().height')
    page.get_by_role('searchbox',name='문서 검색',exact=True).fill('주일 말씀')
    file_height=page.locator('a.document-library-row').first.evaluate('e=>e.getBoundingClientRect().height')
    assert folder_height==file_height==64,(folder_height,file_height)
    tabs.get_by_role('button',name='전체',exact=True).click()
    page.get_by_role('button',name='갤러리',exact=True).click()
    with page.expect_popup() as blank:page.locator('[data-open-document-editor]').click()
    fresh=blank.value;fresh.get_by_role('textbox',name='문서 본문',exact=True).wait_for();assert fresh.get_by_role('button',name='문서 이름 바꾸기',exact=True).inner_text()=='제목 없는 문서';fresh.close()
    shortcut=page.locator('[data-open-document-editor]')
    assert shortcut.evaluate("e=>!!e.closest('.sidebar-footer')")
    page.screenshot(path='/tmp/resources-v8-'+mode+'.png')
    page.get_by_role('button',name='주일 말씀 '+mode,exact=True).wait_for()
    rows=page.evaluate("fetch('/production/api/database/resources').then(r=>r.json())")
    note=next(r for r in rows if r['title']=='주일 말씀 '+mode);assert note['properties']['category']=='예배' and note['properties']['scripture']=='요한복음 1:1'
    data=page.evaluate("async id=>btoa(String.fromCharCode(...new Uint8Array(await fetch('/production/api/ref-files/'+id).then(r=>r.arrayBuffer()))))",note['fileId'])
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data))) as z:assert 'Saved sermon content' in z.read('word/document.xml').decode()
    if mode=='local':
     full=context.new_page();full.add_init_script("localStorage.setItem('production-document-editor','full')")
     full.goto(base+'?document='+note['fileId']+'&name=Note.docx&mime='+note['mime'])
     full.wait_for_function("document.querySelector('.document-header [role=status]')?.textContent.endsWith('저장됨')",timeout=120000);full.close()
    page.reload();page.get_by_role('button',name='주일 말씀 '+mode,exact=True).wait_for()
    page.get_by_role('button',name='주일 말씀 '+mode+' 속성 수정',exact=True).click();page.get_by_label('분류',exact=True).fill('QT');page.get_by_role('button',name='적용',exact=True).click();page.get_by_role('dialog',name='자료 속성',exact=True).wait_for(state='detached')
    page.get_by_role('combobox',name='자료 분류 필터',exact=True).select_option('QT');assert page.locator('.resource-card').count()==1
    page.get_by_role('button',name='보드',exact=True).click();assert page.locator('.resource-board .resource-card').count()==1
    # Seed one empty tab, then add the actual template through the Hub UI.
    page.evaluate("""async()=>{const w=window.productionBridge.read();w.productions.push({id:'notes-project',name:'말씀 프로젝트',status:'진행 중',tasks:[],teams:[],memberIds:[],schedules:[],customTabs:[{id:'notes-tab',name:'노트',modules:[]}]});window.productionBridge.write(w);await window.flushDocumentModules();await openProduction(undefined,'tab:notes-tab',false,'notes-project')}""")
    page.get_by_role('button',name='모듈 추가',exact=True).click();page.get_by_role('button',name=re.compile('말씀 노트 예배')).click()
    page.get_by_role('region',name='데이터베이스 모듈',exact=True).wait_for()
    module=page.locator('.resource-database').first
    module.get_by_role('button',name='기존 자료 연결',exact=True).click()
    choice=page.locator('.resource-picker>div',has_text='주일 말씀 '+mode)
    choice.get_by_role('button',name='연결',exact=True).click()
    choice.wait_for(state='detached');page.get_by_role('button',name='기존 자료 연결 닫기',exact=True).click()
    module.get_by_role('button',name='주일 말씀 '+mode,exact=True).wait_for()
    module.get_by_role('button',name='기존 자료 연결',exact=True).click()
    page.locator('.resource-picker>div',has_text='legacy.txt').get_by_role('button',name='사본으로 추가',exact=True).click()
    page.locator('.resource-picker>div',has_text='legacy.txt 사본').wait_for(state='detached')
    page.get_by_role('button',name='기존 자료 연결 닫기',exact=True).click()
    module.get_by_role('button',name='legacy.txt 사본',exact=True).wait_for()
    copies=page.evaluate("fetch('/production/api/database/resources').then(r=>r.json())");copy=next(r for r in copies if r['title']=='legacy.txt 사본');assert copy['fileId']!=fixture
    module.get_by_role('button',name='데이터베이스 속성 설정',exact=True).click();page.get_by_role('textbox',name='새 속성 이름',exact=True).fill('기도 제목');page.get_by_role('button',name='텍스트 속성 추가',exact=True).click();page.get_by_role('button',name='적용',exact=True).click()
    module.get_by_role('button',name='주일 말씀 '+mode+' 속성 수정',exact=True).click();page.get_by_role('textbox',name='기도 제목',exact=True).fill('감사');page.get_by_role('button',name='적용',exact=True).click();page.get_by_role('dialog',name='자료 속성',exact=True).wait_for(state='detached')
    meta=page.evaluate("fetch('/production/api/database/resources').then(r=>r.json())");saved=next(r for r in meta if r['id']==note['id']);assert '기도 제목' in saved['propertyLabels'].values()
    page.reload();page.get_by_role('button',name='주일 말씀 '+mode,exact=True).wait_for();assert page.locator('.resource-card',has_text='주일 말씀 '+mode).inner_text().find('감사')>=0
    # Concurrent edits must reject a stale metadata version.
    conflict=page.evaluate("""async id=>{const row=(await fetch('/production/api/database/resources').then(r=>r.json())).find(r=>r.id===id),options={method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"'+row.version+'"'},body:JSON.stringify({...row,title:row.title+' 변경'})};return [(await fetch('/production/api/database/resources/'+id,options)).status,(await fetch('/production/api/database/resources/'+id,options)).status]}""",note['id']);assert conflict==[200,409],conflict
    page.locator('[data-main-space=references]').first.click();page.locator('button[data-source-section=documents]').click();page.get_by_role('searchbox',name='문서 검색',exact=True).fill('자료');page.locator('.document-library-row',has_text='주일 말씀').wait_for()
    page.locator('button[data-source-section=resources]').click();page.set_viewport_size({'width':390,'height':844});page.get_by_role('heading',name='자료',exact=True).wait_for();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size({'width':1400,'height':1000})
    page.locator('.sidebar-main-spaces [data-main-space=settings]').first.click();page.locator('[data-settings-category=fonts]').click()
    font=page.locator('.font-list>div',has_text='Liberation Sans')
    font.get_by_role('button',name='Liberation Sans 글꼴 제거',exact=True).click();font.get_by_role('button',name='글꼴 제거 확인',exact=True).click();font.wait_for(state='detached')
    page.reload();assert page.locator('.font-list>div',has_text='Liberation Sans').count()==0
    assert not errors,errors
    print('PASS '+mode+': migration, independent DOCX creation/edit/reload, category/filter/board, Hub database, links/copies, custom properties, conflicts, document browser and mobile',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
