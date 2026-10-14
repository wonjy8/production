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
   context=browser.new_context(viewport={'width':1400,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('https://pages.test:9443/production/')
   page.wait_for_function('window.appAccount?.localMode === true')
   import io,zipfile,json
   package=io.BytesIO()
   with zipfile.ZipFile(package,'w') as z:
    z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Original document</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
   original=base64.b64encode(package.getvalue()).decode()
   file_id=page.evaluate("""async data=>{const id=crypto.randomUUID();const blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());const r=await fetch('/production/api/ref-files/'+id,{method:'PUT',body:blob});if(!r.ok)throw Error('fixture upload');return id}""",original)
   page.wait_for_function('typeof window.mountProduction === "function" && !!window.productionBridge')
   page.evaluate("""async id=>{const w=window.productionBridge.read();w.productions.push({id:'documents-project',name:'문서 프로젝트',status:'진행 중',customTabs:[{id:'documents-tab',name:'기획 문서',modules:[{id:'documents-module',kind:'file',files:[{id,name:'Restored.docx',kind:'file',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}]}]}],tasks:[],teams:[],memberIds:[],schedules:[]});window.productionBridge.write(w);await window.flushDocumentModules();await window.referenceBridge.create({title:'문서 자료',modules:[{id:'reference-doc',kind:'file',files:[{id,name:'Restored.docx',kind:'file',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}]}]})}""",file_id)
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
   editor.wait_for_function("document.querySelector('.document-heading [role=status]')?.textContent==='저장됨'",timeout=120000)
   editor.close()
   print('PASS Materials Documents folders, search, scoped editor links, reload and opening',flush=True)
   url='https://pages.test:9443/production/?document='+file_id+'&name=Restored.docx'
   page.goto(url)
   page.wait_for_function("document.querySelector('.document-heading [role=status]')?.textContent==='저장됨'",timeout=120000)
   print('READY full editor',flush=True)
   frame=page.frame_locator('iframe[title="WordCraft 전체 문서 편집기"]')
   canvas=frame.locator('canvas');canvas.click(position={'x':500,'y':400});page.keyboard.press('Control+End');page.keyboard.press('Enter');page.keyboard.press('Control+b');page.keyboard.type('RESTORED BOLD FEATURES',delay=30);page.keyboard.press('Control+b')
   page.wait_for_function("document.querySelector('.document-heading [role=status]').textContent==='저장됨'",timeout=30000)
   def saved_xml():
    data=page.evaluate("async id=>{const b=await fetch('/production/api/ref-files/'+id).then(r=>r.arrayBuffer());return btoa(String.fromCharCode(...new Uint8Array(b)))}",file_id)
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data))) as z:return z.read('word/document.xml').decode()
   xml=saved_xml();assert 'RESTORED BOLD FEATURES' in xml,xml;assert '<w:b' in xml,xml
   print('PASS full editor opens original DOCX and saves bold text',flush=True)
   page.reload();page.wait_for_function("document.querySelector('.document-heading [role=status]')?.textContent==='저장됨'",timeout=120000)
   # Saving an unchanged, reopened document must not rewrite its file version.
   before=page.evaluate("async id=>(await fetch('/production/api/ref-files/'+id)).headers.get('ETag')",file_id)
   page.get_by_role('button',name='지금 저장',exact=True).click()
   after=page.evaluate("async id=>(await fetch('/production/api/ref-files/'+id)).headers.get('ETag')",file_id);assert before==after
   # Failed writes survive a reload as a local recovery copy.
   offline_script="window.fullTestFetch=window.fetch;window.fetch=(input,init)=>sessionStorage.getItem('full-test-offline')==='1'&&String(input).includes('/api/ref-files/')&&init?.method==='PUT'?Promise.resolve(new Response('offline',{status:503})):window.fullTestFetch(input,init)"
   page.evaluate("sessionStorage.setItem('full-test-offline','1')")
   page.add_init_script(offline_script);page.evaluate(offline_script)
   canvas=page.frame_locator('iframe').locator('canvas');canvas.click(position={'x':500,'y':400});page.keyboard.press('Control+End');page.keyboard.type(' RECOVERY COPY',delay=30)
   page.get_by_role('alert').wait_for(timeout=30000)
   assert 'RECOVERY COPY' not in saved_xml()
   page.reload();page.get_by_role('alert').filter(has_text='원본에 저장하지').wait_for(timeout=120000)
   page.evaluate("sessionStorage.removeItem('full-test-offline')")
   page.get_by_role('button',name='저장 다시 시도',exact=True).click()
   page.wait_for_function("document.querySelector('.document-heading [role=status]').textContent==='저장됨'",timeout=30000)
   assert 'RECOVERY COPY' in saved_xml()
   print('PASS offline recovery survives reload and saves after reconnecting',flush=True)
   # A concurrent writer wins; the stale editor keeps a recoverable local copy.
   page.evaluate("""async ({id,data})=>{const blob=await fetch('data:application/octet-stream;base64,'+data).then(r=>r.blob());const version=(await fetch('/production/api/ref-files/'+id)).headers.get('ETag');const saved=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'If-Match':version},body:blob});if(!saved.ok)throw Error('Concurrent fixture upload failed')}""",{'id':file_id,'data':original})
   canvas=page.frame_locator('iframe').locator('canvas');canvas.click(position={'x':500,'y':400});page.keyboard.press('Control+End');page.keyboard.type(' STALE CHANGE',delay=30)
   page.get_by_role('alert').filter(has_text='다른 곳에서').wait_for(timeout=30000)
   assert 'STALE CHANGE' not in saved_xml()
   with page.expect_download() as download:page.get_by_role('button',name='사본 내려받기',exact=True).click()
   with zipfile.ZipFile(download.value.path()) as z:assert 'STALE CHANGE' in z.read('word/document.xml').decode()
   assert not errors,errors
   print('PASS unchanged save, stale-original protection and edited-copy download',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
