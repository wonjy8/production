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
    if mode=='nas':
     context.close();context=browser.new_context(viewport={'width':1400,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"');page.locator('.admin-home').wait_for()
    page.evaluate("""async()=>{const w=window.productionBridge.read();w.productions=[];w.projects=['진행 프로젝트','완료 프로젝트'].map((name,i)=>({id:'project-'+i,name,status:i?'완료':'진행 중',tasks:[],schedules:[],assets:[],feedback:[],customTabs:[]}));window.productionBridge.write(w);await window.flushDocumentModules()}""")
    page.reload();page.get_by_role('button',name='프로젝트 전체 보기',exact=True).click();page.locator('.admin-home').get_by_text('완료 프로젝트',exact=True).wait_for()
    page.goto(base+'#/materials/resources');page.reload();page.locator('.resource-database').wait_for()
    page.get_by_role('navigation',name='자료 유형',exact=True).get_by_role('button',name='전체',exact=True).click()
    page.get_by_role('button',name='데이터베이스 속성 설정',exact=True).click();dialog=page.get_by_role('dialog',name='데이터베이스 속성 설정',exact=True)
    assert dialog.get_by_label('분류 선택지',exact=True).input_value()==''
    assert '설교자' not in dialog.inner_text()
    dialog.get_by_label('자료 프리셋',exact=True).select_option('podcast');assert dialog.get_by_label('속성 표시 이름',exact=True).count()==6
    dialog.get_by_role('button',name='적용',exact=True).click();dialog.wait_for(state='detached')
    page.reload();page.get_by_role('button',name='데이터베이스 속성 설정',exact=True).click();dialog=page.get_by_role('dialog',name='데이터베이스 속성 설정',exact=True)
    assert dialog.get_by_label('속성 표시 이름',exact=True).nth(4).input_value()=='게스트'
    dialog.get_by_role('button',name='데이터베이스 속성 설정 닫기',exact=True).click()
    ident=page.evaluate("""async()=>{const id=crypto.randomUUID(),r=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify({id,title:'참고 녹음',kind:'link',filename:'podcast-original.wav',url:'https://example.com/podcast-guide',tags:[],properties:{guest:'게스트 보존'},version:0})});if(!r.ok)throw Error(await r.text());return id}""")
    page.reload();search=page.get_by_role('searchbox',name='자료 검색',exact=True)
    for needle in ['podcast-original.wav','example.com/podcast-guide','게스트 보존']:
     search.fill(needle);page.get_by_role('button',name='참고 녹음',exact=True).wait_for()
    search.fill('없는 자료');page.get_by_text('등록된 자료가 없습니다. 새 문서를 만들거나 파일을 업로드하세요.',exact=True).wait_for()
    assert page.get_by_role('button',name='기존 자료 연결',exact=True).count()==0
    assert not errors,errors
    print('PASS '+mode+': complete project visibility, generic resource defaults, shared schema preset persistence and preserved metadata, filename/URL search, global empty-state actions',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
