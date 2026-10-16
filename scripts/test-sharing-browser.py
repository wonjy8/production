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
 subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=pages.test','-addext','subjectAltName=DNS:pages.test,DNS:nas.test,DNS:localhost'],check=True,capture_output=True)
 pub=subprocess.run(['openssl','x509','-in',str(cert),'-pubkey','-noout'],check=True,capture_output=True).stdout
 der=subprocess.run(['openssl','pkey','-pubin','-outform','DER'],input=pub,check=True,capture_output=True).stdout
 spki=base64.b64encode(hashlib.sha256(der).digest()).decode()
 env={**os.environ,'ADMIN_EMAIL':'admin@example.com','ADMIN_NAME':'Example Administrator','DATA_DIR':str(t/'data'),'NAS_API_TOKEN':'test-'+ 'x'*40,'PAGES_ORIGINS':'https://pages.test:9443','PUBLIC_VIEWER_URL':'https://localhost:9443/production/share-view.html','SSL_CERT_FILE':str(cert)}
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
 subprocess.run([nas_python,'-c',"import server; from local_auth import hash_password; c=server.database(); db=c.__enter__(); db.execute(\"INSERT INTO app_users VALUES('share-viewer','viewer@example.com','share-member','viewer',1,'now')\"); db.execute('INSERT INTO local_credentials VALUES(?,?,NULL,NULL,-1)',('share-viewer',hash_password('ViewerPassword2026!'))); c.__exit__(None,None,None)"],cwd=root/'nas',env=env,check=True)
 nas=subprocess.Popen([nas_python,'-m','uvicorn','server:app','--host','127.0.0.1','--port','9444','--ssl-keyfile',str(key),'--ssl-certfile',str(cert),'--no-access-log'],cwd=root/'nas',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--host-resolver-rules=MAP pages.test 127.0.0.1, MAP nas.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
   context=browser.new_context(viewport={'width':1400,'height':1000});engine_requests=[];context.on('request',lambda request:engine_requests.append(request.url) if '.wasm' in request.url else None);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   context.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}")
   import io,zipfile,json
   page.goto('https://pages.test:9443/production/')
   page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
   page.locator('#share').click()
   expect(page.get_by_text('외부 공유는 NAS 연결이 필요합니다.',exact=False)).to_be_visible()
   page.get_by_role('button',name='공유 닫기',exact=True).click()
   page.goto('https://pages.test:9443/production/nas.test:9444/')
   page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
   page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
   fixture=page.evaluate("""async()=>{const id=crypto.randomUUID(),owner=crypto.randomUUID();const upload=await fetch('/production/api/ref-files/'+id+'?name=public.txt',{method:'PUT',headers:{'Content-Type':'text/plain'},body:'shared document original'});if(!upload.ok)throw Error('upload');const w=window.productionBridge.read();w.productions.push({id:owner,name:'외부 공유 프로젝트',status:'진행 중',due:'2030-01-01',tasks:[],teams:[],memberIds:[],customTabs:[{id:'public-tab',name:'공개 탭',modules:[{id:'public-text',kind:'text',text:'공개 본문'},{id:'public-files',kind:'file',files:[{id,name:'public.txt',kind:'file',mime:'text/plain'}]}]},{id:'private-tab',name:'비공개 탭',modules:[{id:'private-text',kind:'text',text:'숨겨야 하는 본문'}]}]});window.productionBridge.write(w);await window.flushDocumentModules();return {id,owner}}""")
   pdf_objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 4 0 R >>',b'<< /Length 0 >>\nstream\n\nendstream']
   pdf=b'%PDF-1.4\n';offsets=[0]
   for i,obj in enumerate(pdf_objects,1):
    offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
   xref=len(pdf);pdf+=b'xref\n0 5\n0000000000 65535 f \n'+b''.join(('%010d 00000 n \n'%offset).encode() for offset in offsets[1:])+b'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF'
   pdf_id=page.evaluate("""async ({owner,bytes})=>{const id=crypto.randomUUID();const r=await fetch('/production/api/ref-files/'+id+'?name=preview.pdf',{method:'PUT',headers:{'Content-Type':'application/pdf'},body:Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))});if(!r.ok)throw Error('PDF upload');const w=window.productionBridge.read();w.productions.find(p=>p.id===owner).customTabs[0].modules[1].files.push({id,kind:'pdf',name:'preview.pdf',mime:'application/pdf'});window.productionBridge.write(w);await window.flushDocumentModules();return id}""",{'owner':fixture['owner'],'bytes':base64.b64encode(pdf).decode()})
   page.locator('[data-production-id="'+fixture['owner']+'"]').click();page.locator('#share').click()
   page.wait_for_function("()=>{const s=document.querySelector('#share-settings-host')?.shadowRoot;return s?.querySelector('[role=alert]')||s?.querySelector('select')}")
   page.get_by_role('combobox',name='공유 위치',exact=True).wait_for()
   page.get_by_label('탭 전체 · 공개 탭',exact=True).check()
   page.get_by_role('button',name='공유 링크 만들기',exact=True).click()
   address=page.get_by_role('textbox',name='발급한 공유 링크',exact=True);address.wait_for();url=address.input_value();token=url.split('/')[-1]
   public=context.new_page();public_console=[];public.on('console',lambda m:public_console.append(m.text) if m.type=='error' else None);public.goto(url);public.get_by_text('공개 본문',exact=True).wait_for();public.get_by_text('shared document original',exact=True).wait_for()
   public.locator('iframe[title="preview.pdf"]').wait_for()
   pdf_frame=None
   for attempt in range(50):
    pdf_frame=next((f for f in public.frames if f.url.startswith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')),None)
    if pdf_frame:break
    public.wait_for_timeout(100)
   assert pdf_frame,'Chromium PDF viewer did not load'
   pdf_frame.locator('#plugin').wait_for(state='visible')
   assert not any('sandbox' in m.lower() for m in public_console),public_console
   assert '숨겨야 하는 본문' not in public.locator('#content').inner_text()
   assert public.get_by_role('link',name='파일 다운로드',exact=True).count()==0
   assert public.evaluate("async ({token,id})=>(await fetch('/public/shares/'+token+'/files/'+id+'?download=1')).status",{'token':token,'id':fixture['id']})==403
   assert public.evaluate("async ()=>(await fetch('/api/data')).status")==401
   page.get_by_label('파일 다운로드 허용',exact=True).check();page.get_by_role('button',name='공유 설정 저장',exact=True).click()
   page.get_by_text('공유 링크를 저장했습니다. 아래에서 링크를 복사하세요.',exact=True).wait_for()
   public.get_by_role('button',name='새로고침',exact=True).click();public.get_by_role('link',name='파일 다운로드',exact=True).first.wait_for()
   page.get_by_role('button',name='새 링크 만들기',exact=True).click()
   page.get_by_label('항목 · 공개 탭 / 공개 본문',exact=True).check()
   page.get_by_role('combobox',name='공유 접근 방식',exact=True).select_option('users');page.get_by_role('textbox',name='허용할 이메일',exact=True).fill('viewer@example.com')
   page.get_by_role('button',name='공유 링크 만들기',exact=True).click()
   expect(page.get_by_role('textbox',name='발급한 공유 링크',exact=True)).to_have_count(2)
   rows=page.evaluate("fetch('/production/api/shares').then(r=>r.json())");named=next(r for r in rows if r['audience']=='users')
   named_page=context.new_page();named_page.goto('https://nas.test:9444/public/share/'+named['token']);named_page.locator('#login').wait_for(state='visible')
   named_page.get_by_label('이메일',exact=True).fill('viewer@example.com');named_page.get_by_label('비밀번호',exact=True).fill('ViewerPassword2026!');named_page.get_by_role('button',name='로그인',exact=True).click()
   named_page.get_by_text('공개 본문',exact=True).wait_for();assert named_page.get_by_text('shared document original',exact=True).count()==0
   page.get_by_role('button',name='공유 닫기',exact=True).click()
   page.evaluate("""async owner=>{const w=window.productionBridge.read();const p=w.productions.find(p=>p.id===owner);p.customTabs[0].modules.push({id:'added',kind:'text',text:'나중에 추가한 내용'});window.productionBridge.write(w);await window.flushDocumentModules()}""",fixture['owner'])
   public.get_by_role('button',name='새로고침',exact=True).click();public.get_by_text('나중에 추가한 내용',exact=True).wait_for()
   named_page.get_by_role('button',name='새로고침',exact=True).click();named_page.get_by_text('공개 본문',exact=True).wait_for();assert '나중에 추가한 내용' not in named_page.locator('#content').inner_text()
   page.locator('.production-overview').get_by_role('button',name='수정',exact=True).click();page.get_by_role('combobox',name='프로젝트 상태',exact=True).select_option('완료');page.get_by_role('button',name='확인',exact=True).click()
   review=page.get_by_role('dialog',name='프로젝트 완료 점검',exact=True);review.get_by_role('button',name='완료하고 아카이빙',exact=True).click();expect(review).not_to_be_visible(timeout=30000)
   public.get_by_role('button',name='새로고침',exact=True).click();public.get_by_text('완료 보존본 · 읽기 전용',exact=False).wait_for();public.get_by_text('shared document original',exact=True).wait_for()
   payload=public.evaluate("token=>fetch('/public/shares/'+token).then(r=>r.json())",token);preserved=next(f['id'] for item in payload['items'] for f in item['files']);assert preserved!=fixture['id']
   page.get_by_role('button',name='다시 진행',exact=True).click();page.wait_for_function('(owner)=>!window.productionBridge.read().productions.find(p=>p.id===owner).completion',arg=fixture['owner'])
   public.get_by_role('button',name='새로고침',exact=True).click();public.get_by_text('실시간 공유 · 읽기 전용',exact=False).wait_for()
   page.locator('#share').click();page.get_by_role('button',name='공유 중지',exact=True).first.click()
   page.get_by_text('공유를 중지했습니다. 기존 링크로 열 수 없습니다.',exact=True).wait_for()
   rows=page.evaluate("fetch('/production/api/shares').then(r=>r.json())");revoked=next(r for r in rows if r['revoked']);assert public.evaluate("async token=>(await fetch('/public/shares/'+token)).status",revoked['token'])==404
   page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert not errors,errors
   print('PASS local: explicit NAS requirement; PASS NAS: create/edit/share UI, anonymous selected-only view, preview/download policy, named login, live tab vs fixed item, completion/reopen same link, revoke, mobile bounds',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
