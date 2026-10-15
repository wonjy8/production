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
 env={**os.environ,'ADMIN_EMAIL':'admin@example.com','ADMIN_NAME':'Example Administrator','DATA_DIR':str(t/'data'),'NAS_API_TOKEN':'test-'+ 'x'*40,'PAGES_ORIGINS':'https://pages.test:19443'}
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
 httpd=http.server.ThreadingHTTPServer(('127.0.0.1',19443),Handler)
 ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(cert,key);httpd.socket=ctx.wrap_socket(httpd.socket,server_side=True)
 threading.Thread(target=httpd.serve_forever,daemon=True).start()
 nas=subprocess.Popen([nas_python,'-m','uvicorn','server:app','--host','127.0.0.1','--port','19444','--ssl-keyfile',str(key),'--ssl-certfile',str(cert),'--no-access-log'],cwd=root/'nas',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--host-resolver-rules=MAP pages.test 127.0.0.1, MAP nas.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
   context=browser.new_context(viewport={'width':1400,'height':1000},has_touch=True);engine_requests=[];context.on('request',lambda request:engine_requests.append(request.url) if '.wasm' in request.url else None);page=context.new_page();errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',str(e),flush=True)))
   context.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}")
   import io,zipfile,json

   package=io.BytesIO()
   with zipfile.ZipFile(package,'w') as z:
    z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p><w:p><w:r><w:t>Selected text</w:t></w:r></w:p><w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>')
   original=base64.b64encode(package.getvalue()).decode()

   for mode in ['local','nas']:
    if mode=='nas':
     context.close();context=browser.new_context(viewport={'width':1400,'height':1000},has_touch=True);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    context.grant_permissions(['clipboard-read','clipboard-write']);page.set_default_timeout(15000)
    base='https://pages.test:19443/production/'+('nas.test:19444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"')
    file_id=page.evaluate("""async data=>{const id=crypto.randomUUID(),blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());const upload=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:blob});if(!upload.ok)throw Error('file fixture');const row=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify({id,fileId:id,title:'Editor15.docx',filename:'Editor15.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind:'file',tags:[],properties:{}})});if(!row.ok)throw Error('record fixture');return id}""",original)
    page.goto(base+'?document='+file_id+'&name=Editor15.docx')
    body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for(timeout=60000)
    toolbar=page.get_by_role('toolbar',name='문서 삽입',exact=True);assert toolbar.evaluate('e=>getComputedStyle(e).borderRadius')=='0px';assert toolbar.bounding_box()['x']==0
    ruler=page.locator('.document-rulers-viewport');ruler.wait_for();assert abs(ruler.bounding_box()['x']-toolbar.bounding_box()['x'])<1
    page.evaluate('document.fonts.ready');assert 'Selected text' in body.inner_text()
    def select_text():
     body.locator('p,h4').filter(has_text='Selected text').first.click();body.focus();page.keyboard.press('Home');page.keyboard.press('Shift+End')
    select_text();bubble=page.get_by_role('toolbar',name='선택 텍스트 서식',exact=True);bubble.wait_for()
    sidebar=page.get_by_role('complementary',name='문서 설정 패널');side_tools=sidebar.get_by_role('group',name='텍스트 서식',exact=True)
    labels="e=>[...e.querySelectorAll(':scope>button,:scope>details>summary')].map(n=>n.getAttribute('aria-label'))"
    expected_labels=side_tools.evaluate(labels);assert expected_labels==bubble.locator('.editor-format-tools').evaluate(labels)
    bubble.get_by_role('button',name='굵게',exact=True).click();assert side_tools.get_by_role('button',name='굵게',exact=True).get_attribute('aria-pressed')=='true'
    bubble.get_by_label('문단 종류',exact=True).click();bubble.get_by_role('menuitemradio',name='제목 4',exact=True).click();body.locator('h4',has_text='Selected text').wait_for()
    bubble.get_by_label('색상',exact=True).click();colors=bubble.get_by_role('group',name='글자색과 배경색',exact=True);assert colors.locator('.format-color-grid').nth(1).get_by_role('button').count()==10
    colors.get_by_role('button',name='글자색 빨강',exact=True).click();assert body.locator('[style*="color"]').count()>0
    bubble.get_by_label('색상',exact=True).click();colors.get_by_role('button',name='배경색 노랑',exact=True).click();assert body.locator('mark').count()>0
    page.once('dialog',lambda dialog:dialog.accept('https://example.com/editor-link'));bubble.get_by_role('button',name='링크',exact=True).click();body.locator('a[href="https://example.com/editor-link"]').first.wait_for()
    side_tools.get_by_label('색상',exact=True).click();sidebar.get_by_role('button',name='최근 배경색 노랑',exact=True).wait_for();sidebar.get_by_label('색상',exact=True).click()
    select_text();page.evaluate("window.testWrite=navigator.clipboard.write;window.testExec=document.execCommand;navigator.clipboard.write=async()=>{throw Error('denied')};document.execCommand=()=>false")
    body.locator('h4',has_text='Selected text').click(button='right');denied=page.get_by_role('menu',name='클립보드',exact=True);denied.get_by_role('menuitem',name='잘라내기',exact=True).click();denied.wait_for(state='detached');assert body.inner_text().count('Selected text')==1;page.get_by_role('alert').filter(has_text='복사하지 못했습니다').wait_for()
    page.evaluate("()=>{navigator.clipboard.write=window.testWrite;document.execCommand=window.testExec}")
    select_text();body.locator('h4',has_text='Selected text').click(button='right');clip=page.get_by_role('menu',name='클립보드',exact=True);assert clip.get_by_role('menuitem').all_text_contents()==['잘라내기','복사','붙여넣기'];clip.get_by_role('menuitem',name='복사',exact=True).click();clip.wait_for(state='detached');assert page.evaluate('navigator.clipboard.readText()')=='Selected text'
    page.keyboard.press('ArrowRight');page.keyboard.press('Control+End');page.keyboard.press('Enter');body.locator('p').last.click(button='right');clip.get_by_role('menuitem',name='붙여넣기',exact=True).click();clip.wait_for(state='detached');page.wait_for_timeout(150);assert body.inner_text().count('Selected text')==2
    body.locator('h4',has_text='Selected text').last.click();page.keyboard.press('Home');page.keyboard.press('Shift+End');body.locator('h4',has_text='Selected text').last.click(button='right');clip.get_by_role('menuitem',name='잘라내기',exact=True).click();clip.wait_for(state='detached');assert body.inner_text().count('Selected text')==1
    body.locator('h4').last.click(button='right');clip.get_by_role('menuitem',name='붙여넣기',exact=True).click();clip.wait_for(state='detached');assert body.inner_text().count('Selected text')==2
    page.screenshot(path='/tmp/editor22-'+mode+'-desktop.png')
    # Mobile input bar and selection bar use the same controls and track the visual viewport.
    toggle=page.get_by_role('button',name='사이드바',exact=True)
    if toggle.get_attribute('aria-expanded')=='true':toggle.click()
    page.set_viewport_size({'width':390,'height':844});body.locator('h4').first.click();page.keyboard.press('End');dock=page.get_by_role('toolbar',name='입력 도구',exact=True);dock.wait_for();assert not toolbar.is_visible()
    dock.locator(':scope > .editor-format-menu > summary[aria-label="이미지 추가"]').tap();dock.get_by_role('button',name='자료에서 이미지 추가',exact=True).wait_for();dock.locator(':scope > .editor-format-menu > summary[aria-label="이미지 추가"]').tap()
    dock.get_by_label('삽입',exact=True).tap();dock.get_by_label('표 삽입',exact=True).tap();dock.get_by_role('button',name='2행 2열 표 삽입',exact=True).tap();assert body.locator('table tr').count()==2
    dock.get_by_role('button',name='서식 패널',exact=True).click();sidebar.wait_for();assert sidebar.get_by_role('group',name='텍스트 서식',exact=True).evaluate(labels)==expected_labels;toggle.click()
    body.locator('h4',has_text='Selected text').first.click();body.focus();page.keyboard.press('Home');page.keyboard.press('Shift+End');mobile=page.get_by_role('toolbar',name='선택 텍스트 서식',exact=True);mobile.wait_for();assert mobile.locator('.editor-format-tools').evaluate(labels)==expected_labels
    page.evaluate("Object.defineProperty(window.visualViewport,'height',{configurable:true,value:480});window.visualViewport.dispatchEvent(new Event('resize'))")
    page.wait_for_timeout(200);rect=mobile.bounding_box();assert rect['y']+rect['height']<=480,rect
    mobile.get_by_label('색상',exact=True).tap();palette=mobile.get_by_role('group',name='글자색과 배경색',exact=True);palette.wait_for();rect=palette.bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=390 and rect['y']>=0,rect
    page.screenshot(path='/tmp/editor22-'+mode+'-mobile.png');palette.get_by_role('button',name='배경 없음',exact=True).tap()
    page.evaluate("delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'))");page.set_viewport_size({'width':1400,'height':1000});page.wait_for_timeout(250)
    if toggle.get_attribute('aria-expanded')!='true':toggle.click()
    page.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name='문서',exact=True).click()
    with page.expect_download(timeout=60000) as word:page.get_by_role('menuitem',name='Word (.docx)',exact=True).click()
    import xml.etree.ElementTree as ET
    with zipfile.ZipFile(word.value.path()) as z:
     tree=ET.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};assert 'Selected text' in ''.join(tree.itertext());assert tree.findall('.//w:color',ns);assert tree.findall('.//w:b',ns)
    page.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name='속성',exact=True).click();body.locator('h1',has_text='Chapter One').click();page.keyboard.press('Home');page.keyboard.press('Shift+End');side_tools.get_by_label('문단 종류',exact=True).click();side_tools.get_by_role('menuitemradio',name='인용',exact=True).click();body.locator('blockquote',has_text='Chapter One').wait_for()
    page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'");page.reload();body=page.get_by_role('textbox',name='문서 본문',exact=True);body.locator('blockquote',has_text='Chapter One').wait_for(timeout=60000)
    page.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name='문서',exact=True).click()
    with page.expect_download(timeout=60000) as pdf:page.get_by_role('menuitem',name='PDF (.pdf)',exact=True).click()
    pdf_text=subprocess.run(['pdftotext',pdf.value.path(),'-'],check=True,capture_output=True,text=True).stdout;assert 'Chapter One' in pdf_text and 'Selected text' in pdf_text
    page.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name='속성',exact=True).click()
    body.locator('blockquote p').first.click();body.focus();page.keyboard.press('Home');page.keyboard.press('Shift+End');side_tools.get_by_label('문단 종류',exact=True).click();side_tools.get_by_role('menuitemradio',name='본문',exact=True).click();assert body.locator('blockquote').count()==0
    page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'");page.reload();body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for(timeout=60000);assert body.locator('blockquote').count()==0
    page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'");assert not errors,errors
    print('PASS '+mode+': flat toolbar/edge rulers, automatic shared formatting, heading/color/background recents, clipboard copy/paste, mobile insertion/selection and keyboard anchoring, Quote DOCX/PDF roundtrip and clipboard failure safety',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
