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
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"')
    file_id=page.evaluate("""async data=>{const id=crypto.randomUUID(),blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());const upload=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:blob});if(!upload.ok)throw Error('file fixture');const row=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify({id,fileId:id,title:'Editor15.docx',filename:'Editor15.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind:'file',tags:[],properties:{}})});if(!row.ok)throw Error('record fixture');return id}""",original)
    page.goto(base+'?document='+file_id+'&name=Editor15.docx')
    body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for(timeout=60000)
    def panel(name):
     toggle=page.get_by_role('button',name='사이드바',exact=True)
     if toggle.get_attribute('aria-expanded')!='true':toggle.click()
     page.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name=name,exact=True).click()
    def hide():
     toggle=page.get_by_role('button',name='사이드바',exact=True)
     if toggle.get_attribute('aria-expanded')=='true':toggle.click()
     page.wait_for_timeout(80)
    tabs=page.get_by_role('navigation',name='문서 설정 종류');assert tabs.get_by_role('button').all_text_contents()==['문서','속성']
    assert page.get_by_label('페이지 요소',exact=True).count()==0
    assert page.get_by_label('머리글',exact=True).count()==0
    assert page.get_by_role('button',name='전체 선택',exact=True).count()==0
    assert page.get_by_role('button',name='서식 지우기',exact=True).count()==0
    assert page.get_by_role('button',name='목차',exact=True).count()==0
    assert page.locator('.outline-rail i').count()==1
    # The header reserves its own row, separate from scrolling contents.
    panel('속성');nav=tabs.bounding_box();scroll=page.locator('.document-settings-body');assert scroll.bounding_box()['y']>=nav['y']+nav['height']
    scroll.evaluate('e=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(100);assert abs(tabs.bounding_box()['y']-nav['y'])<1
    assert tabs.get_by_role('button',name='문서',exact=True).evaluate('e=>e.contains(document.elementFromPoint(e.getBoundingClientRect().x+20,e.getBoundingClientRect().y+15))')
    scroll.evaluate('e=>e.scrollTop=0')
    body.locator('p').first.click();page.keyboard.press('Home');page.keyboard.press('Shift+End')
    page.get_by_role('group',name='문단 정렬',exact=True).get_by_role('button',name='가운데 정렬',exact=True).click()
    page.get_by_label('줄 간격',exact=True).fill('1.5');page.get_by_label('문단 앞 여백',exact=True).fill('12');page.get_by_label('문단 뒤 여백',exact=True).fill('18')
    page.get_by_label('왼쪽 들여쓰기',exact=True).fill('1');page.get_by_label('오른쪽 들여쓰기',exact=True).fill('0.5');page.get_by_label('첫 줄 들여쓰기 방식',exact=True).select_option('hanging')
    assert body.locator('p').first.evaluate("e=>e.style.lineHeight==='1.5'&&e.style.textIndent==='-0.5cm'&&e.style.marginTop==='12pt'")
    assert body.locator('p').first.inner_text()=='Selected text'
    # A separate list supports nested Tab indentation, capped at five levels.
    hide();page.keyboard.press('ArrowRight');page.keyboard.press('Control+End');page.keyboard.press('Enter');page.keyboard.insert_text('Root bullet');panel('속성')
    page.get_by_role('button',name='글머리 기호',exact=True).click();page.get_by_label('글머리 기호 종류',exact=True).click();page.get_by_role('menuitemradio',name='빈 원',exact=True).click()
    hide();page.keyboard.press('End')
    for i in range(2,6):
     page.keyboard.press('Enter');page.keyboard.insert_text('Level '+str(i));page.keyboard.press('Tab')
    assert body.locator('ul ul ul ul ul').count()==1
    page.keyboard.press('Enter');page.keyboard.insert_text('Limit item');page.keyboard.press('Tab');assert body.locator('ul ul ul ul ul ul').count()==0
    page.keyboard.press('Shift+Tab');page.keyboard.press('Tab');assert body.locator('ul ul ul ul ul ul').count()==0
    panel('속성');assert page.get_by_role('button',name='목록 단계 늘리기',exact=True).count()==0
    # Animated page movement accompanies the floating panel.
    page.wait_for_timeout(300);left_open=page.locator('.document-sheet').bounding_box()['x'];hide();page.wait_for_timeout(300);left_closed=page.locator('.document-sheet').bounding_box()['x'];assert left_closed>left_open+80,(left_open,left_closed)
    # The anchored insertion menu is above the canvas and receives pointer events.
    page.get_by_label('표 삽입',exact=True).click();cell=page.get_by_role('button',name='2행 4열 표 삽입',exact=True);r=cell.bounding_box();assert cell.evaluate('e=>e===document.elementFromPoint(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2,e.getBoundingClientRect().y+e.getBoundingClientRect().height/2)')
    page.screenshot(path='/tmp/editor-v15-'+mode+'-menu.png');cell.click();assert body.locator('table tr').count()==2
    assert 'Selected text' in body.inner_text()
    panel('문서')
    for label in ['위 여백','오른쪽 여백','아래 여백','왼쪽 여백']:assert float(page.get_by_label(label,exact=True).input_value())==25.4
    with page.expect_download(timeout=60000) as word:page.get_by_role('menuitem',name='Word (.docx)',exact=True).click()
    import xml.etree.ElementTree as ET
    with zipfile.ZipFile(word.value.path()) as z:
     tree=ET.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};w='{'+ns['w']+'}'
     paragraph=next(p for p in tree.findall('.//w:p',ns) if 'Selected text' in ''.join(p.itertext()))
     spacing=paragraph.find('w:pPr/w:spacing',ns);assert spacing.get(w+'line')=='360' and spacing.get(w+'before')=='240' and spacing.get(w+'after')=='360',ET.tostring(paragraph)
     indent=paragraph.find('w:pPr/w:ind',ns);assert indent.get(w+'left')=='567' and indent.get(w+'hanging')=='283',ET.tostring(paragraph)
     assert any(n.get(w+'val')=='4' for n in tree.findall('.//w:ilvl',ns))
    page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'");page.reload();body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for();panel('속성');body.locator('p',has_text='Selected text').click()
    try:page.wait_for_function("document.querySelector('[aria-label=\"줄 간격\"]').value==='1.5'",timeout=3000)
    except Exception:
     print('RESTORED',body.locator('p',has_text='Selected text').evaluate('e=>e.outerHTML'),page.get_by_label('줄 간격',exact=True).input_value(),flush=True);raise
    assert page.get_by_label('문단 앞 여백',exact=True).input_value()=='12'
    assert page.get_by_label('첫 줄 들여쓰기 방식',exact=True).input_value()=='hanging'
    # Removing the final heading hides the outline, without deleting its text.
    hide();body.locator('h1').click();panel('속성');page.get_by_label('문단 스타일',exact=True).select_option('paragraph');assert page.locator('.document-outline').count()==0
    panel('문서')
    with page.expect_download(timeout=60000) as pdf:page.get_by_role('menuitem',name='PDF (.pdf)',exact=True).click()
    text=subprocess.run(['pdftotext',pdf.value.path(),'-'],check=True,capture_output=True,text=True).stdout;assert 'Selected text' in text and 'Chapter One' in text,text
    page.set_viewport_size({'width':390,'height':844});panel('속성');page.wait_for_timeout(300);page.screenshot(path='/tmp/editor-v15-'+mode+'-mobile.png');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('.document-settings-body').bounding_box()['y']>=tabs.bounding_box()['y']+tabs.bounding_box()['height']
    assert not errors,errors
    page.set_viewport_size({'width':1400,'height':1000});hide();page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'")
    print('PASS '+mode+': fixed panel header, icon alignment, paragraph spacing/indent DOCX roundtrip, split lists and five levels, menu hit testing, conditional outline, animated canvas, text PDF and mobile',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
