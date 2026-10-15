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
    base='https://pages.test:19443/production/'+('nas.test:19444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"')
    page.evaluate("""async()=>{const w=window.productionBridge.read(),date=new Date(),day=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const today=day(date);date.setDate(date.getDate()-2);w.productions=[];w.projects=[{id:'cal',name:'캘린더 검증',status:'진행 중',tasks:[],assets:[],feedback:[],schedules:[{id:'today',title:'오늘 일정',date:today,endDate:today,startTime:'10:00',endTime:'11:00',location:'',note:''},{id:'past',title:'이전 일정',date:day(date),endDate:day(date),startTime:'10:00',endTime:'11:00',location:'',note:''}]}];window.productionBridge.write(w);await window.flushDocumentModules()}""")
    page.goto(base+'#/home/schedule');page.reload();page.get_by_role('heading',name='모든 일정',exact=True).wait_for()
    assert page.get_by_text('위로 스크롤하여 이전 일정 보기',exact=True).count()==0
    page.get_by_role('button',name='캘린더',exact=True).click();calendar=page.get_by_role('region',name='일정 캘린더',exact=True);assert calendar.locator('.schedule-month-day').count()==42
    calendar.locator('.schedule-month-event',has_text='이전 일정').wait_for();oldmonth=calendar.locator('h2').inner_text();calendar.get_by_role('button',name='이전 달',exact=True).click();assert calendar.locator('h2').inner_text()!=oldmonth;calendar.get_by_role('button',name='오늘',exact=True).click()
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.set_viewport_size({'width':1400,'height':1000})
    file_id=page.evaluate("""async data=>{const id=crypto.randomUUID(),blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());const upload=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:blob});if(!upload.ok)throw Error('file fixture');const row=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify({id,fileId:id,title:'Editor15.docx',filename:'Editor15.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind:'file',tags:[],properties:{}})});if(!row.ok)throw Error('record fixture');return id}""",original)
    page.goto(base+'?document='+file_id+'&name=Editor15.docx')
    body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for(timeout=60000)
    toolbar=page.get_by_role('toolbar',name='문서 삽입',exact=True);box=toolbar.bounding_box();page.screenshot(path='/tmp/toolbar-v20.png');assert box['x']==0 and abs(box['width']-1400)<2
    body.locator('p').first.click();page.keyboard.press('Home');page.keyboard.press('Shift+End')
    toolbar=page.get_by_role('toolbar',name='선택 텍스트 서식',exact=True);toolbar.wait_for();toolbar.get_by_label('색상',exact=True).click();palette=toolbar.get_by_role('group',name='글자색과 배경색',exact=True);palette.wait_for();assert palette.locator('.format-color-grid').nth(2).get_by_role('button').count()==10;assert palette.locator('.has-pack-icon').count()==0
    assert toolbar.locator('input[type=color]').count()==0;palette.get_by_role('button',name='배경색 노랑',exact=True).click()
    assert body.locator('mark').count()>0;assert body.locator('mark').first.evaluate("e=>getComputedStyle(e).backgroundColor")=='rgb(255, 248, 215)'
    page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'");page.reload();body=page.get_by_role('textbox',name='문서 본문',exact=True);body.wait_for(timeout=60000);assert body.locator('mark').count()>0
    page.set_viewport_size({'width':390,'height':844});toggle=page.get_by_role('button',name='사이드바',exact=True)
    if toggle.get_attribute('aria-expanded')=='true':toggle.click()
    page.wait_for_timeout(300);body.locator('p').first.click();page.keyboard.press('Home');page.keyboard.press('Shift+End');toolbar=page.get_by_role('toolbar',name='선택 텍스트 서식',exact=True);toolbar.get_by_label('색상',exact=True).click()
    palette=toolbar.get_by_role('group',name='글자색과 배경색',exact=True);box=palette.bounding_box();assert box['x']>=0 and box['x']+box['width']<=390,box
    page.screenshot(path='/tmp/editor-v20-'+mode+'.png');palette.get_by_role('button',name='배경 없음',exact=True).click();assert body.locator('mark').count()==0
    page.wait_for_function("document.querySelector('.document-save-status').textContent==='모든 변경사항 저장됨'")
    assert not errors,errors
    print('PASS '+mode+': calendar month navigation and past dates, removed history hint, fixed preset highlight selection/persistence/removal and flat toolbar with shared desktop/mobile selection palette',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
