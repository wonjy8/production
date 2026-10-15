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
    project=page.evaluate("""async()=>{const w=window.productionBridge.read(),id=crypto.randomUUID();w.productions=[];w.projectCatalog=[{id:'test',name:'범용',stages:['대기열','작업','발행'],stageGroups:{'대기열':'시작 전','작업':'진행 중','발행':'완료'}}];w.projects=[{id,name:'메뉴 검증',categoryId:'test',status:'진행 중',tasks:[{id:'t',title:'그룹 검증',stage:'대기열',done:false,owner:'미지정',priority:'보통',due:''}],schedules:[],assets:[],feedback:[],customTabs:[{id:'one',name:'첫 탭',modules:[{id:'a',title:'메뉴 모듈',kind:'text',text:'내용'}]},{id:'two',name:'대상 탭',modules:[]}]}];window.productionBridge.write(w);await window.flushDocumentModules();window.productionBridge.select(id,'tab:one');return id}""")
    route=base+'#/work-groups/'+project+'/tabs/one';page.goto(route);page.reload()
    page.set_default_timeout(10000);print('CHECK '+mode+' loaded',flush=True)
    title=page.locator('[data-fluid-id=a] .module-name-button');title.wait_for();title.click(button='right')
    page.get_by_role('menuitem',name='탭 이동',exact=True).click()
    page.get_by_role('dialog',name='탭 이동',exact=True).get_by_role('button',name='대상 탭',exact=True).click()
    page.locator('[data-fluid-id=a]').wait_for();assert page.locator('[data-tab-id="tab:two"]').get_attribute('aria-current')=='page'
    page.locator('[data-tab-id="tab:two"]').dblclick();dialog=page.get_by_role('dialog',name='탭 수정',exact=True)
    dialog.get_by_role('button',name='탭 아이콘 변경',exact=True).click();dialog.get_by_role('tab',name='아이콘',exact=True).click();dialog.locator('.project-icon-grid button').first.click();dialog.get_by_role('button',name='완료',exact=True).click()
    page.evaluate('window.flushDocumentModules()');page.reload();page.locator('[data-fluid-id=a]').wait_for();assert page.evaluate('window.productionBridge.read().projects[0].customTabs[1].icon')
    title=page.locator('[data-fluid-id=a] .module-name-button');title.click(button='right');page.get_by_role('menuitem',name='삭제',exact=True).click()
    confirm=page.get_by_role('button',name='모듈 삭제 확인',exact=True);assert confirm.evaluate('e=>getComputedStyle(e).color')=='rgb(220, 38, 38)';page.get_by_role('button',name='삭제 취소',exact=True).click()
    page.get_by_role('button',name='모듈 추가',exact=True).click();hub=page.get_by_role('complementary',name='모듈 허브',exact=True)
    headings=hub.locator('.hub-result-group>h3').all_text_contents();assert '미디어' in headings and headings.index('미디어')<headings.index('교회·사역')
    hub.get_by_role('tab',name='템플릿',exact=True).click();hub.get_by_role('button',name='학교',exact=True).click();assert hub.locator('.hub-pinned-blank').is_visible();hub.get_by_role('button',name='Hub 닫기',exact=True).click()
    page.locator('[data-tab-id=tasks]').click();groups=page.locator('.work-task-list>.task-list-group');assert groups.count()==3
    page.get_by_role('checkbox',name='그룹 검증 완료',exact=True).check();assert page.locator('[data-task-status="완료"] [data-task-id=t]').count()==1
    page.get_by_role('checkbox',name='그룹 검증 완료',exact=True).uncheck();assert page.locator('[data-task-status="시작 전"] [data-task-id=t]').count()==1
    page.locator('[data-task-id=t] .task-title').click();dialog=page.get_by_role('dialog').filter(has=page.locator('select[name=stage]'));dialog.locator('select[name=stage]').select_option(label='발행');dialog.get_by_role('button',name='저장',exact=True).click()
    assert page.locator('[data-task-status="완료"] [data-task-id=t]').count()==1
    page.get_by_role('checkbox',name='그룹 검증 완료',exact=True).uncheck();assert page.locator('[data-task-status="시작 전"] [data-task-id=t]').count()==1
    page.locator('[data-tab-id=tasks]').dblclick();dialog=page.get_by_role('dialog',name='탭 수정',exact=True);dialog.get_by_role('button',name='탭 아이콘 변경',exact=True).click();dialog.locator('.project-icon-grid button').nth(1).click();dialog.get_by_role('button',name='완료',exact=True).click()
    page.evaluate('window.flushDocumentModules()');page.reload();page.locator('[data-task-id=t]').wait_for();assert page.evaluate('!!window.productionBridge.read().projects[0].tabIcons.tasks')
    # Shared settings add choices inside an immutable parent group.
    page.locator('.sidebar-main-spaces [data-main-space=settings]').first.click();page.locator('[data-settings-category=projects]').click()
    page.locator('.project-status-group').first.wait_for();assert page.locator('.project-status-group>h3').all_text_contents()==['시작 전','진행 중','완료']
    form=page.locator('#project-stage-add');form.locator('select[name=group]').select_option(label='진행 중');form.locator('input[name=name]').fill('검수중');form.get_by_role('button',name='단계 추가',exact=True).click()
    assert page.locator('.project-status-group').nth(1).locator('input[value="검수중"]').count()==1
    page.evaluate('window.flushDocumentModules()');page.reload();page.locator('[data-settings-category=projects]').click();page.locator('input[value="검수중"]').wait_for()
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
    assert page.locator('.project-stage-list').evaluate('e=>e.scrollWidth<=e.clientWidth+2')
    assert not errors,errors
    print('PASS '+mode+': module context transfer, tab icon persistence, red confirmation, grouped Hub/pinned blank and fixed task completion groups',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
