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
   page.goto('https://pages.test:9443/production/')
   page.wait_for_function('window.appAccount?.localMode === true')
   import io,zipfile,json
   package=io.BytesIO()
   with zipfile.ZipFile(package,'w') as z:
    z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Original document</w:t></w:r></w:p><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Word table cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>')
   expanded=io.BytesIO()
   with zipfile.ZipFile(io.BytesIO(package.getvalue())) as source,zipfile.ZipFile(expanded,'w') as target:
    for filename in source.namelist():
     data=source.read(filename)
     if filename=='word/document.xml':
      single=b'<w:tr><w:tc><w:p><w:r><w:t>Word table cell</w:t></w:r></w:p></w:tc></w:tr>'
      data=data.replace(single,b''.join(single.replace(b'Word table cell',('Word table cell '+str(i)).encode()) for i in range(32)))
     target.writestr(filename,data)
   package=expanded
   original=base64.b64encode(package.getvalue()).decode()
   file_id=page.evaluate("""async data=>{const id=crypto.randomUUID();const blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());const r=await fetch('/production/api/ref-files/'+id,{method:'PUT',body:blob});if(!r.ok)throw Error('fixture upload');return id}""",original)
   page.wait_for_function('typeof window.mountProduction === "function" && !!window.productionBridge')
   page.evaluate("""async id=>{const w=window.productionBridge.read();w.productions.push({id:'documents-project',name:'문서 프로젝트',status:'진행 중',customTabs:[{id:'documents-tab',name:'기획 문서',modules:[{id:'documents-module',kind:'file',files:[{id,name:'Restored.docx',kind:'file',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}]}]}],tasks:[],teams:[],memberIds:[],schedules:[...Array.from({length:8},(_,i)=>({id:'past-'+i,title:'과거 일정 '+i,date:'2000-01-01'})),{id:'geometry-timed',title:'시간 일정',date:'2099-01-01',startTime:'09:00',endTime:'10:00'},{id:'geometry-all',title:'종일 일정',date:'2099-01-02'}]});window.productionBridge.write(w);await window.flushDocumentModules();await window.referenceBridge.create({title:'문서 자료',modules:[{id:'reference-doc',kind:'file',files:[{id,name:'Restored.docx',kind:'file',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}]}]})}""",file_id)
   page.locator('[data-main-space=references]').click()
   page.locator('button[data-source-section=documents]').click()
   page.locator('.document-library').wait_for()
   page.get_by_role('button',name='프로젝트 폴더 열기',exact=True).click()
   page.get_by_role('button',name='문서 프로젝트 폴더 열기',exact=True).click()
   page.get_by_role('button',name='기획 문서 폴더 열기',exact=True).click()
   link=page.locator('.document-library-row',has_text='Restored.docx')
   assert 'owner=documents-project' in link.get_attribute('href')
   assert 'tab=tab%3Adocuments-tab' in link.get_attribute('href')
   page.get_by_role('searchbox',name='문서 검색',exact=True).fill('문서 자료')
   reference_link=page.locator('.document-library-row',has_text='Restored.docx')
   assert 'owner=' not in reference_link.get_attribute('href')
   page.reload();page.locator('.document-library').wait_for()
   assert '/materials/documents' in page.url
   page.get_by_role('searchbox',name='문서 검색',exact=True).fill('문서 자료')
   with page.expect_popup() as opened:page.locator('.document-library-row',has_text='Restored.docx').click()
   editor=opened.value
   editor.wait_for_function("document.querySelector('.document-heading [role=status]')?.textContent.endsWith('저장됨')",timeout=120000)
   editor.close()
   print('PASS Materials Documents folders, search, scoped editor links, reload and opening',flush=True)
   page.set_viewport_size({'width':390,'height':844})
   page.goto('https://pages.test:9443/production/#/home/schedule')
   page.locator('.admin-schedule-list>button').first.wait_for()
   positions=page.locator('.home-schedule-future .admin-schedule-list>button>div').evaluate_all('(nodes)=>nodes.map(n=>n.getBoundingClientRect().left)')
   assert len(positions)==2 and max(positions)-min(positions)<1,positions
   timeline=page.get_by_role('region',name='전체 일정',exact=True)
   assert timeline.evaluate('(el)=>el.scrollTop')>100
   assert page.get_by_text('과거 일정 0',exact=True).evaluate('(el)=>el.getBoundingClientRect().bottom') < timeline.evaluate('(el)=>el.getBoundingClientRect().top')
   timeline.hover();page.mouse.wheel(0,-3000);page.wait_for_timeout(400)
   assert timeline.evaluate('(el)=>el.scrollTop')==0
   def bottom_inside():
    return page.locator('.mobile-bottom-nav').evaluate('(nav)=>{const r=nav.getBoundingClientRect();return [...nav.querySelectorAll("[data-main-space]")].every(b=>{const p=b.getBoundingClientRect();return p.left>=r.left && p.right<=r.right})}')
   assert bottom_inside()
   page.locator('.mobile-bottom-nav [data-main-space=settings]').click()
   assert bottom_inside()
   page.set_viewport_size({'width':1400,'height':1000})
   for space in ['references','database','settings','references','home','references']:
    page.locator('.sidebar-main-spaces [data-main-space='+space+']').first.click()
    assert page.locator('.sidebar-project-area:visible,.sidebar-reference-area:visible,.sidebar-database-area:visible,.sidebar-settings-area:visible').count()==1
   nav=page.locator('.sidebar .sidebar-main-spaces');nav.evaluate('(el)=>el.style.setProperty("width","170px","important")')
   page.wait_for_function('document.querySelector(".sidebar .sidebar-main-spaces").classList.contains("nav-icons-only")')
   assert nav.locator('button>span:visible').count()==0
   nav.evaluate('(el)=>el.style.removeProperty("width")')
   print('PASS past schedules above today, mobile geometry, compact tabs and workspace isolation',flush=True)

   # Dashboard defaults to today, limits upcoming schedules, and marks today's group.
   page.evaluate("""async()=>{const w=window.productionBridge.read(),d=new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');w.productions.push({id:'home-preview',name:'일정 미리보기',status:'진행 중',tasks:[],teams:[],memberIds:[],schedules:[...Array.from({length:10},(_,i)=>({id:'today-'+i,date:today,title:'오늘 미리보기 '+i})),{id:'ended-today',date:today,title:'지난 시간 일정',startTime:'00:00',endTime:'00:00'}]});window.productionBridge.write(w);await window.flushDocumentModules()}""")
   page.goto('https://pages.test:9443/production/?home-preview=1#/home')
   page.locator('.admin-home[data-home-view=dashboard]').wait_for()
   period=page.locator('.admin-home-heading .admin-segment>button')
   assert period.all_text_contents()==['오늘','이번 주','전체']
   assert period.first.get_attribute('aria-pressed')=='true'
   assert page.locator('.admin-home .admin-schedule-list>button').count()==5
   assert page.get_by_text('지난 시간 일정',exact=True).count()==0
   page.get_by_role('button',name='모든 일정 보기',exact=True).click()
   today_group=page.locator('.home-schedule-today-group')
   today_group.get_by_text('지난 시간 일정',exact=True).wait_for()
   assert today_group.locator('.admin-schedule-list>button').count()==11
   assert today_group.evaluate("e=>getComputedStyle(e).borderTopWidth==='1px'&&getComputedStyle(e).borderBottomWidth==='1px'")
   print('PASS today/week/all order, five upcoming previews and today separators',flush=True)

   url='https://pages.test:9443/production/?document='+file_id+'&name=Restored.docx'
   page.goto(url)
   page.wait_for_function("document.querySelector('.document-heading [role=status]')?.textContent.endsWith('저장됨')",timeout=120000)
   assert not engine_requests,engine_requests
   assert page.get_by_role('textbox',name='문서 본문',exact=True).is_visible()
   body=page.get_by_role('textbox',name='문서 본문',exact=True)
   body.click();page.keyboard.press('Control+End');page.keyboard.press('Enter');page.keyboard.type('Native editor saved content')
   page.wait_for_timeout(1500)
   page.wait_for_function("document.querySelector('.document-heading [role=status]')?.textContent.endsWith('저장됨')")
   page.reload();body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for()
   assert 'Native editor saved content' in body.inner_text()
   # Upgrade recovery: a pending old-editor DOCX is restored and uploaded once.
   recovery=io.BytesIO()
   with zipfile.ZipFile(io.BytesIO(package.getvalue())) as source, zipfile.ZipFile(recovery,'w') as target:
    for name in source.namelist():
     data=source.read(name)
     if name=='word/document.xml':data=data.replace(b'Original document',b'Recovered legacy document')
     target.writestr(name,data)
    target.writestr('customXml/legacy-draft.xml','preserved recovery package')
   page.evaluate("""async ({id,data})=>{const response=await fetch('/production/api/ref-files/'+id);const version=response.headers.get('ETag');const blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());await new Promise((resolve,reject)=>{const request=indexedDB.open('production-wordcraft-recovery',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onerror=reject;request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({blob,version},location.pathname+':'+id+':'+sessionStorage.getItem('production-document-session'));tx.oncomplete=()=>{db.close();resolve()}}})}""",{'id':file_id,'data':base64.b64encode(recovery.getvalue()).decode()})
   page.reload();page.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   page.wait_for_function("document.querySelector('.document-heading [role=status]')?.textContent.endsWith('저장됨')")
   assert 'Recovered legacy document' in page.get_by_role('textbox',name='문서 본문',exact=True).inner_text()
   restored=page.evaluate("async id=>btoa(String.fromCharCode(...new Uint8Array(await fetch('/production/api/ref-files/'+id).then(r=>r.arrayBuffer()))))",file_id)
   with zipfile.ZipFile(io.BytesIO(base64.b64decode(restored))) as z:
    assert z.read('customXml/legacy-draft.xml')==b'preserved recovery package'
   # Rename metadata persists across reload without changing file identity.
   page.get_by_role('button',name='문서 이름 바꾸기',exact=True).click()
   page.get_by_role('textbox',name='문서 제목',exact=True).fill('새 문서 제목')
   page.get_by_role('textbox',name='문서 제목',exact=True).press('Enter')
   page.get_by_role('button',name='문서 이름 바꾸기',exact=True).filter(has_text='새 문서 제목').wait_for()
   page.reload();page.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   assert page.get_by_role('button',name='문서 이름 바꾸기',exact=True).inner_text()=='새 문서 제목'
   page.get_by_role('navigation',name='문서 메뉴').get_by_text('파일',exact=True).click();page.get_by_role('menuitem',name='페이지 설정',exact=True).click()
   page.get_by_label('용지 크기',exact=True).select_option('a4')
   page.get_by_role('button',name='페이지 설정 닫기',exact=True).click()
   body=page.get_by_role('textbox',name='문서 본문',exact=True);body.click();page.keyboard.press('Control+End')
   for i in range(75):
    page.keyboard.press('Enter');page.keyboard.insert_text('일정 말씀 노트 PDF selectable line '+str(i))
   page.keyboard.press('Enter');page.keyboard.insert_text('LONGSTART '+('긴 문단 paragraph wrapping test ' * 180)+' cafe\u0301 LONGEND')
   page.keyboard.press('Enter')
   png=page.evaluate("()=>{const c=document.createElement('canvas');c.width=128;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#2563eb';ctx.fillRect(0,0,128,96);ctx.fillStyle='#facc15';ctx.fillRect(20,20,40,40);return c.toDataURL('image/png').split(',')[1]}")
   page.get_by_label('문서 이미지 추가',exact=True).set_input_files({'name':'diagram.png','mimeType':'image/png','buffer':base64.b64decode(png)})
   page.locator('.document-sheet img[src]').wait_for()
   page.wait_for_timeout(1400)
   assert int(page.locator('.document-sheet').get_attribute('data-page-count'))>=2
   page.evaluate("() => {window.print=()=>{throw Error('Browser printing forbidden')}; window.open=()=>{throw Error('Print popup forbidden')};}")
   assert not page.evaluate('!!window.productionDocumentPDF')
   page.get_by_label('내보내기',exact=True).click()
   with page.expect_download(timeout=60000) as export:
    page.get_by_role('menuitem',name='PDF (.pdf)',exact=True).click()
   pdf=pathlib.Path(export.value.path()).read_bytes();(t/'export.pdf').write_bytes(pdf);pathlib.Path('/tmp/editor-v8.pdf').write_bytes(pdf)
   images=subprocess.run(['pdfimages','-list',str(t/'export.pdf')],check=True,capture_output=True,text=True).stdout
   assert 'image' in images and '128' in images and '96' in images,images
   info=subprocess.run(['pdfinfo',str(t/'export.pdf')],check=True,capture_output=True,text=True).stdout
   assert '595.276 x 841.89' in info,info
   text=subprocess.run(['pdftotext','-layout',str(t/'export.pdf'),'-'],check=True,capture_output=True,text=True).stdout
   assert 'PDF selectable line 74' in text,text[-1000:]
   assert '말씀' in text,text[-1000:]
   assert text.count('PDF selectable line')==75,text
   assert text.count('Word table cell')==32,text
   assert 'LONGEND' in ''.join(text.split()),text[-1000:]
   assert 'café' in text,text[-1000:]
   subprocess.run(['pdftoppm','-f','1','-singlefile','-scale-to','1024','-png',str(t/'export.pdf'),'/tmp/editor-v8-pdf'],check=True,capture_output=True)
   page.get_by_role('navigation',name='문서 메뉴').get_by_text('파일',exact=True).click();page.get_by_role('menuitem',name='페이지 설정',exact=True).click()
   page.get_by_label('용지 크기',exact=True).select_option('a5')
   page.get_by_role('button',name='용지 방향 전환',exact=True).click()
   page.get_by_role('button',name='페이지 설정 닫기',exact=True).click()
   page.get_by_label('내보내기',exact=True).click()
   with page.expect_download(timeout=60000) as smaller:page.get_by_role('menuitem',name='PDF (.pdf)',exact=True).click()
   smallinfo=subprocess.run(['pdfinfo',smaller.value.path()],check=True,capture_output=True,text=True).stdout
   assert '595.276 x 419.528' in smallinfo,smallinfo
   page.get_by_label('내보내기',exact=True).click()
   with page.expect_download() as word:page.get_by_role('menuitem',name='Word (.docx)',exact=True).click()
   with zipfile.ZipFile(word.value.path()) as saved:
    xml=saved.read('word/document.xml').decode();assert 'document-page-break' not in xml and 'LONGEND' in xml
   page.screenshot(path='/tmp/editor-v8-desktop.png')
   page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
   assert page.locator('.document-toolbar').evaluate('e=>e.scrollWidth>e.clientWidth')
   page.get_by_label('내보내기',exact=True).click()
   with page.expect_download(timeout=60000) as mobile:page.get_by_role('menuitem',name='PDF (.pdf)',exact=True).click()
   mobiletext=subprocess.run(['pdftotext',mobile.value.path(),'-'],check=True,capture_output=True,text=True).stdout
   assert mobiletext.count('PDF selectable line')==75 and mobiletext.count('Word table cell')==32
   assert 'LONGEND' in ''.join(mobiletext.split())
   page.screenshot(path='/tmp/editor-v8-mobile.png')
   assert not errors,errors
   print('PASS native editor, persisted title, layout/zoom, multipage A4 selectable Korean PDF, toolbar/mobile, legacy draft recovery and no print/WordCraft',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
