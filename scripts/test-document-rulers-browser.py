"""Isolated HTTPS integration test: requires Playwright, Chromium, openssl and NAS dependencies.
Only the generated local certificate is trusted using its exact SPKI fingerprint.
"""
import base64, hashlib, http.server, os, pathlib, re, socket, ssl, subprocess, tempfile, threading, time
from playwright.sync_api import sync_playwright, expect
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
    if mode=='nas':
     context.close();context=browser.new_context(viewport={'width':1400,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_default_timeout(15000)
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"')
    file_id=page.evaluate("""async data=>{const id=crypto.randomUUID(),blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());const upload=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:blob});if(!upload.ok)throw Error('file fixture');const row=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify({id,fileId:id,title:'Editor15.docx',filename:'Editor15.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind:'file',tags:[],properties:{}})});if(!row.ok)throw Error('record fixture');return id}""",original)
    page.goto(base+'?document='+file_id+'&name=Editor15.docx')
    body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for(timeout=60000)
    x=page.get_by_role('img',name='가로 눈금자 (cm)',exact=True);y=page.get_by_role('img',name='세로 눈금자 (cm)',exact=True);x.wait_for();sheet=page.locator('.document-sheet');viewport=page.locator('.document-scroll')
    def aligned():
     xr=x.bounding_box();sr=sheet.bounding_box();yr=y.bounding_box();assert abs(xr['x']-sr['x'])<1,(xr,sr);assert abs(xr['width']-sr['width'])<1,(xr,sr);assert abs(yr['y']-sr['y'])<1,(yr,sr)
    page.wait_for_timeout(300);aligned()
    page.get_by_label('문서 배율',exact=True).select_option('100');page.wait_for_timeout(300);aligned();width=x.bounding_box()['width'];assert abs(width-210*96/25.4)<1
    page.get_by_label('문서 배율',exact=True).select_option('50');page.wait_for_timeout(200);aligned();assert abs(x.bounding_box()['width']-width/2)<1
    toggle=page.get_by_role('button',name='사이드바',exact=True)
    if toggle.get_attribute('aria-expanded')!='true':toggle.click()
    page.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name='문서',exact=True).click();page.get_by_label('용지 크기',exact=True).select_option('a5');page.wait_for_timeout(250);aligned();assert abs(x.bounding_box()['width']-148*96/25.4/2)<1
    page.get_by_label('용지 크기',exact=True).select_option('a4');toggle.click();page.get_by_label('문서 배율',exact=True).select_option('fit');body.locator('p').first.click();page.keyboard.press('Control+End');page.keyboard.press('Enter');page.keyboard.insert_text('\n'.join('Ruler page line '+str(i) for i in range(130)))
    page.wait_for_function("Number(document.querySelector('.document-sheet').dataset.pageCount)>1");page.wait_for_timeout(300);assert y.locator('use').count()==int(sheet.get_attribute('data-page-count'))
    viewport.evaluate('e=>e.scrollTop=300');page.wait_for_timeout(100);assert abs(x.bounding_box()['y']-viewport.bounding_box()['y']-viewport.evaluate('e=>parseFloat(getComputedStyle(e).paddingTop)'))<2
    viewport.evaluate('e=>e.scrollTop=0');page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(400);aligned();assert viewport.evaluate('e=>e.scrollWidth<=e.clientWidth+2')
    from PIL import Image
    yr=y.bounding_box();pixel=Image.open(io.BytesIO(page.screenshot())).getpixel((int(yr['x']+14),int(yr['y']+50)));assert min(pixel[:3])>200,pixel
    page.screenshot(path='/tmp/rulers-'+mode+'.png');page.set_viewport_size({'width':1400,'height':1000});page.wait_for_timeout(300)
    toggle=page.get_by_role('button',name='사이드바',exact=True);toggle.click();page.get_by_role('navigation',name='문서 설정 종류').get_by_role('button',name='문서',exact=True).click()
    with page.expect_download(timeout=60000) as pdf:page.get_by_role('menuitem',name='PDF (.pdf)',exact=True).click()
    text=subprocess.run(['pdftotext',pdf.value.path(),'-'],check=True,capture_output=True,text=True).stdout;assert 'Selected text' in text and 'cm' not in text
    with page.expect_download(timeout=60000) as word:page.get_by_role('menuitem',name='Word (.docx)',exact=True).click()
    import xml.etree.ElementTree as ET
    with zipfile.ZipFile(word.value.path()) as z:content=''.join(ET.fromstring(z.read('word/document.xml')).itertext());assert 'Selected text' in content and 'cm' not in content
    page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'");assert not errors,errors
    print('PASS '+mode+': ruler/paper alignment, cm scale at 100/50/fit, A5 layout, page resets, sticky scrolling, mobile fit and exclusion from selectable-text PDF',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
