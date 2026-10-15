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
   context=browser.new_context(viewport={'width':1400,'height':1000});engine_requests=[];context.on('request',lambda request:engine_requests.append(request.url) if '.wasm' in request.url else None);page=context.new_page();errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',str(e),flush=True)))
   context.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}")
   import io,zipfile,json

   package=io.BytesIO()
   with zipfile.ZipFile(package,'w') as z:
    z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p><w:p><w:r><w:t>Selected text</w:t></w:r></w:p><w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>')
   original=base64.b64encode(package.getvalue()).decode()
   for mode in ['local','nas']:
    page.set_viewport_size({'width':1400,'height':1000})
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"')
    file_id=page.evaluate("""async data=>{const id=crypto.randomUUID(),blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());const uploaded=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:blob});if(!uploaded.ok)throw Error('File fixture '+uploaded.status+': '+await uploaded.text());const registered=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify({id,fileId:id,title:'Editor13.docx',filename:'Editor13.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind:'file',tags:[],properties:{}})});if(!registered.ok)throw Error('Resource fixture '+registered.status+': '+await registered.text());return id}""",original)
    page.goto(base+'?document='+file_id+'&name=Editor13.docx')
    body=page.get_by_role('textbox',name='문서 본문',exact=True)
    try:body.wait_for(timeout=60000)
    except Exception:
     print(page.locator('body').inner_text(),flush=True);raise
    def panel(name):
     toggle=page.get_by_role('button',name='사이드바',exact=True)
     if toggle.get_attribute('aria-expanded')!='true':toggle.click()
     page.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name=name,exact=True).click()
    def hide():
     toggle=page.get_by_role('button',name='사이드바',exact=True)
     if toggle.get_attribute('aria-expanded')=='true':toggle.click()
     page.wait_for_timeout(50)
    def saved():page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'")
    assert page.locator('.document-header [aria-label=내보내기]').count()==0
    assert page.get_by_role('heading',name='문서 설정',exact=True).count()==0
    assert page.get_by_role('button',name='페이지 설정 닫기',exact=True).count()==0
    page.get_by_role('button',name='목차',exact=True).click();page.get_by_role('navigation',name='목차 항목').get_by_role('button',name='Chapter One',exact=True).click()
    assert page.locator('.document-margin-mark:visible').count()==4
    print("PASS "+mode+": editor load and outline",flush=True)
    # Selection survives interaction with property inputs.
    body.locator('p').last.click();page.keyboard.press('Home');page.keyboard.press('Shift+End');panel('속성')
    page.get_by_label('하이라이트',exact=True).fill('#ffdd55')
    page.get_by_role('button',name='아래 첨자',exact=True).click();assert body.locator('sub').inner_text()=='Selected text'
    page.get_by_role('button',name='위 첨자',exact=True).click();assert body.locator('sup').inner_text()=='Selected text'
    assert body.locator('sub').count()==0
    assert body.locator('mark').count()>0
    # A separate subscript, bullet variants and a nested list.
    hide();page.keyboard.press('ArrowRight');page.keyboard.press('Control+End');page.keyboard.press('Enter');page.keyboard.insert_text('Subscript text');page.keyboard.press('Home');page.keyboard.press('Shift+End');panel('속성');page.get_by_role('button',name='아래 첨자',exact=True).click()
    hide();body.click();page.keyboard.press('Control+End');page.keyboard.press('ArrowRight');page.keyboard.press('Enter');page.keyboard.insert_text('First bullet');panel('속성');page.get_by_label('목록 기호 종류',exact=True).select_option('circle')
    hide();page.keyboard.press('End');page.keyboard.press('Enter');page.keyboard.insert_text('Nested bullet');panel('속성');page.get_by_role('button',name='목록 단계 늘리기',exact=True).click();assert body.locator('ul ul').count()==1,body.inner_html()
    hide();page.keyboard.press('Control+End');page.keyboard.press('Enter');page.keyboard.press('Enter');page.keyboard.press('Enter')
    print("PASS "+mode+": text marks and nested list",flush=True)
    # Insert table through the anchored 10x8 picker.
    page.get_by_label('표 삽입',exact=True).click();page.get_by_role('button',name='2행 4열 표 삽입',exact=True).hover();page.get_by_role('button',name='2행 4열 표 삽입',exact=True).click()
    assert body.locator('table tr').count()==2 and body.locator('table tr').first.locator('td').count()==4
    panel('속성');page.get_by_label('개체 맞춤',exact=True).select_option('center');page.get_by_label('표 너비 (%)',exact=True).fill('60');assert body.locator('table').get_attribute('data-object-align')=='center'
    hide();page.keyboard.press('Control+End');page.keyboard.press('ArrowDown');page.keyboard.press('Enter')
    print("PASS "+mode+": table sizing and alignment",flush=True)
    # Image device input and shapes use embedded PNG, independent of external files.
    from PIL import Image
    png=io.BytesIO();Image.new('RGB',(64,48),'blue').save(png,format='PNG')
    page.get_by_label('장치 이미지 선택',exact=True).set_input_files({'name':'device.png','mimeType':'image/png','buffer':png.getvalue()})
    body.locator('img[src]').wait_for();page.get_by_label('도형 추가',exact=True).click();page.get_by_role('button',name='삼각형',exact=True).click();assert body.locator('img[src]').count()==2
    body.locator('img[src]').last.click();panel('속성');page.get_by_label('개체 맞춤',exact=True).select_option('right');hide()
    page.keyboard.press('Control+End');page.keyboard.press('ArrowRight');page.keyboard.press('Enter')
    page.get_by_label('첨부 파일 선택',exact=True).set_input_files({'name':'notes.txt','mimeType':'text/plain','buffer':b'Attachment contents'})
    attachment=body.get_by_role('link',name='notes.txt',exact=True);attachment.wait_for()
    with page.expect_popup() as popup:attachment.click()
    opened=popup.value;opened.wait_for_url('blob:**');assert 'Attachment contents' in opened.locator('body').inner_text();opened.close()
    panel('문서');page.get_by_label('머리글',exact=True).fill('Weekly Notes');page.get_by_label('바닥글',exact=True).fill('Study archive');page.get_by_label('페이지 번호',exact=True).check()
    page.locator('.page-header-text',has_text='Weekly Notes').wait_for();page.locator('.page-footer-text',has_text='Study archive · 1').wait_for()
    assert body.locator('sup').count()>0 and body.locator('sub').count()>0,body.inner_text()
    saved();page.reload();body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for();panel('문서')
    assert page.get_by_label('머리글',exact=True).input_value()=='Weekly Notes'
    assert page.get_by_label('바닥글',exact=True).input_value()=='Study archive'
    assert page.get_by_label('페이지 번호',exact=True).is_checked()
    assert body.locator('sup').count()>0 and body.locator('sub').count()>0 and body.locator('mark').count()>0,body.inner_text()
    assert body.locator('ul ul').count()==1,body.inner_html()
    with page.expect_download(timeout=60000) as word:page.get_by_role('menuitem',name='Word (.docx)',exact=True).click()
    with zipfile.ZipFile(word.value.path()) as z:
     xml=z.read('word/document.xml').decode();assert 'vertAlign' in xml and 'superscript' in xml and 'subscript' in xml and 'FFDD55' in xml.upper(),xml
     
     import xml.etree.ElementTree as ET
     tree=ET.fromstring(xml);ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};wv='{'+ns['w']+'}val'
     assert any(n.get(wv)=='1' for n in tree.findall('.//w:ilvl',ns))
     assert any(n.get(wv)=='center' for n in tree.findall('.//w:tblPr/w:jc',ns))
     assert 'notes.txt' in xml and 'descr="도형: 삼각형"' in xml
     assert 'Weekly Notes' in z.read('word/production-header.xml').decode()
     assert 'PAGE' in z.read('word/production-footer.xml').decode()
     assert '○' in z.read('word/numbering.xml').decode()
    with page.expect_download(timeout=60000) as pdf:
     page.get_by_role('menuitem',name='PDF (.pdf)',exact=True).click()
     page.wait_for_function("!document.querySelector('.document-export [role=menuitem]').disabled",timeout=60000)
     assert page.locator('.document-error').count()==0,page.locator('.document-error').inner_text()
    text=subprocess.run(['pdftotext',pdf.value.path(),'-'],check=True,capture_output=True,text=True).stdout
    assert 'Weekly Notes' in text and 'Study archive' in text and 'Chapter One' in text,text
    print("PASS "+mode+": attachment, Word roundtrip and selectable PDF furniture",flush=True)
    # Live lower status and mobile floating-panel bounds.
    assert '페이지 1/' in page.locator('.document-footer').inner_text() and '단어' in page.locator('.document-footer').inner_text()
    page.get_by_label('문서 확대·축소',exact=True).fill('125');assert page.locator('.document-sheet').evaluate('e=>Number(getComputedStyle(e).zoom)')==1.25
    page.get_by_label('문서 배율',exact=True).select_option('fit')
    page.set_viewport_size({'width':390,'height':844});panel('속성');page.wait_for_timeout(250);page.screenshot(path='/tmp/editor-v13-'+mode+'-mobile.png')
    box=page.get_by_role('complementary',name='문서 설정 패널',exact=True).bounding_box();assert box['x']>=0 and box['x']+box['width']<=390,box
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('.document-toolbar').bounding_box()['height']<=55
    assert page.get_by_label('글자색',exact=True).bounding_box()['width']>=36
    hide();page.set_viewport_size({'width':1400,'height':1000})
    # Dismissable update prompt calls the existing save-before-update coordinator.
    page.evaluate("window.appUpdates={available:true,version:'test-1',apply:async()=>{window.updateApplied=await window.prepareAppUpdate()}};window.dispatchEvent(new Event('app-update-ready'))")
    page.locator('.document-update-toast').wait_for();page.get_by_role('button',name='업데이트 알림 닫기',exact=True).click();assert page.locator('.document-update-toast').count()==0
    page.evaluate("window.dispatchEvent(new Event('app-update-ready'))")
    assert page.locator('.document-update-toast').count()==0
    page.evaluate("window.appUpdates.version='test-2';window.dispatchEvent(new Event('app-update-ready'))")
    page.locator('.document-update-toast').get_by_role('button').first.click();page.wait_for_function('window.updateApplied===true')
    # A failed autosave keeps a real navigation confirmation active.
    page.evaluate("""id=>{window.v13Fetch=window.fetch;window.fetch=(input,options)=>String(input).includes('/api/ref-files/'+id)&&options?.method==='PUT'?Promise.resolve(new Response('offline',{status:503})):window.v13Fetch(input,options)}""",file_id)
    body.click();page.keyboard.press('Control+End');page.keyboard.insert_text(' pending change')
    page.wait_for_timeout(1400)
    dialogs=[]
    def dismiss(dialog):dialogs.append(dialog.type);dialog.dismiss()
    page.on('dialog',dismiss)
    try:page.reload(timeout=5000)
    except Exception:pass
    assert dialogs==['beforeunload'],dialogs
    assert 'pending change' in body.inner_text()
    page.remove_listener('dialog',dismiss);page.evaluate('window.fetch=window.v13Fetch')
    page.get_by_role('button',name='저장 다시 시도',exact=True).click();saved()
    panel('설정');page.get_by_role('button',name='문서 삭제',exact=True).click();page.get_by_role('button',name='취소',exact=True).click()
    page.get_by_role('button',name='문서 삭제',exact=True).click();page.get_by_role('button',name='휴지통으로 이동',exact=True).click()
    page.wait_for_url('**#/materials/trash');page.get_by_role('heading',name='휴지통',exact=True).wait_for()
    assert not errors,errors
    print('PASS '+mode+': floating UI, outline, highlights/scripts/nested lists, table grid/alignment, images/shapes/attachments, header/footer DOCX+text PDF, zoom, mobile, update and unsaved-exit protection, document trash',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
