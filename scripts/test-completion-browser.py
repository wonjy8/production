"""Isolated HTTPS integration test: requires Playwright, Chromium, openssl and NAS dependencies.
Only the generated local certificate is trusted using its exact SPKI fingerprint.
"""
import base64, hashlib, http.server, os, pathlib, re, socket, ssl, subprocess, tempfile, threading, time
from playwright.sync_api import sync_playwright,expect
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
    page.evaluate("localStorage.removeItem('pn-show-completed')") if mode=='nas' else None
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
    fixture=page.evaluate("""async()=>{const id=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID();const upload=await fetch('/production/api/ref-files/'+id+'?name=preserve.txt',{method:'PUT',headers:{'Content-Type':'text/plain'},body:'completion original'});if(!upload.ok)throw Error('upload');const w=window.productionBridge.read();for(const [key,name] of [[a,'완료 테스트'],[b,'진행 테스트']])w.productions.push({id:key,name,status:'진행 중',due:'2030-01-01',tasks:[],teams:[],memberIds:[],customTabs:[{id:key+'-tab',name:'자료 탭',modules:[{id:key+'-db',kind:'database',files:[{id,name:'preserve.txt',kind:'file',mime:'text/plain'}]}]}]});window.productionBridge.write(w);await window.flushDocumentModules();return {id,a,b}}""")
    page.locator('[data-production-id="'+fixture['a']+'"]').click()
    page.locator('.production-overview').get_by_role('button',name='수정',exact=True).click()
    page.get_by_role('combobox',name='프로젝트 상태',exact=True).select_option('완료')
    page.get_by_role('button',name='확인',exact=True).click()
    review=page.get_by_role('dialog',name='프로젝트 완료 점검',exact=True)
    review.get_by_role('button',name='완료하고 아카이빙',exact=True).click()
    expect(review).not_to_be_visible(timeout=30000)
    page.get_by_text('완료된 프로젝트 · 읽기 전용',exact=True).wait_for()
    result=page.evaluate("""async ({id,a,b})=>{const w=window.productionBridge.read(),p=w.productions.find(p=>p.id===a),other=w.productions.find(p=>p.id===b),frozen=p.customTabs[0].modules[0].files[0].id;const rows=await fetch('/production/api/database/resources').then(r=>r.json()),row=rows.find(r=>r.id===frozen),raw=await fetch('/production/api/ref-files/'+frozen);const blocked=await fetch('/production/api/ref-files/'+frozen,{method:'PUT',headers:{'Content-Type':'text/plain','If-Match':raw.headers.get('ETag')},body:'bad'});const meta=await fetch('/production/api/database/resources/'+frozen,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"'+row.version+'"'},body:JSON.stringify({...row,title:'bad'})});const old=await fetch('/production/api/ref-files/'+id);const edit=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'text/plain','If-Match':old.headers.get('ETag')},body:'ongoing edit'});return {frozen,completion:!!p.completion,other:other.customTabs[0].modules[0].files[0].id,blocked:blocked.status,meta:meta.status,edit:edit.status,copy:await fetch('/production/api/ref-files/'+frozen).then(r=>r.text()),canEdit:row.canEdit}}""",fixture)
    assert result['frozen']!=fixture['id'] and result['completion'] and result['other']==fixture['id'],(mode,result)
    assert result['blocked'] in [403,409] and result['meta'] in [403,409] and result['edit']==200 and result['copy']=='completion original' and not result['canEdit'],(mode,result)
    expect(page.locator('.production-overview').get_by_role('button',name='수정',exact=True)).to_be_disabled()
    frozen=result['frozen']
    page.locator('[data-main-space=references]').first.click();page.locator('button[data-source-section=resources]').click()
    page.get_by_role('button',name='완료 자료 보이기',exact=True).wait_for()
    assert page.locator('.resource-card').count()==1,(mode,page.locator('.resource-card').count())
    page.get_by_role('button',name='완료 자료 보이기',exact=True).click()
    folders=page.get_by_role('navigation',name='완료된 프로젝트 폴더')
    folders.get_by_role('button',name='완료 테스트',exact=True).click()
    card=page.locator('.resource-card');expect(card).to_have_count(1)
    with page.expect_popup() as opened:card.get_by_role('button',name='preserve.txt',exact=True).click()
    document=opened.value;prompt=document.get_by_role('dialog',name='완료 보존본 · 읽기 전용',exact=True);prompt.wait_for()
    assert prompt.get_by_role('button',name='원본 수정',exact=True).count()==0
    prompt.get_by_role('button',name='사본을 만들어 편집',exact=True).click()
    document.wait_for_function('(id)=>new URLSearchParams(location.search).get("document")!==id',arg=frozen)
    document.close()
    page.locator('[data-main-space=home]').first.click()
    page.locator('[data-production-id="'+fixture['a']+'"]').click()
    page.get_by_role('button',name='다시 진행',exact=True).click()
    page.wait_for_function('(id)=>!window.productionBridge.read().productions.find(p=>p.id===id).completion',arg=fixture['a'])
    result=page.evaluate("""async ({a,frozen,id})=>{const p=window.productionBridge.read().productions.find(p=>p.id===a),raw=await fetch('/production/api/ref-files/'+frozen),edit=await fetch('/production/api/ref-files/'+frozen,{method:'PUT',headers:{'Content-Type':'text/plain','If-Match':raw.headers.get('ETag')},body:'resumed edit'}),row=(await fetch('/production/api/database/resources').then(r=>r.json())).find(r=>r.id===frozen);return {status:p.status,same:p.customTabs[0].modules[0].files[0].id===frozen,edit:edit.status,original:await fetch('/production/api/ref-files/'+id).then(r=>r.text()),folder:!!row.completionOwner,archives:p.archives.length}}""",{**fixture,'frozen':frozen})
    assert result=={'status':'진행 중','same':True,'edit':200,'original':'ongoing edit','folder':False,'archives':0},(mode,result)
    print('PASS '+mode+': UI completion, independent preserved bytes, readonly APIs, hidden/project folders, copy-only editor, resume same copy',flush=True)
    page.reload();page.wait_for_function('!!window.productionBridge')
   assert not errors,errors
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
