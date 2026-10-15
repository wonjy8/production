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
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"');page.locator('.admin-home').wait_for()
    import json
    template=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createHubTab} from './production/module-hub.js'; console.log(JSON.stringify(createHubTab('filming-operations')));"],cwd=root))
    ids=page.evaluate("""async tab=>{const w=window.productionBridge.read(),id=crypto.randomUUID();w.members=[...w.members,{id:'alice',name:'하나',kind:'personal'},{id:'bob',name:'둘',kind:'personal'}];w.productions=[{id:'event',name:'테스트 프로젝트',memberIds:['alice','bob'],teams:[{id:'setup',name:'준비팀',members:[{memberId:'alice',role:'멤버'}]},{id:'host',name:'진행팀',members:[{memberId:'bob',role:'멤버'}]}],tasks:[],schedules:[]}];w.projects=[{id,name:'범용 모듈 검증',productionId:'event',status:'진행 중',owner:'',due:'',tasks:[],schedules:[{id:'meeting',title:'준비 회의',date:'2026-10-15',endDate:'2026-10-15',startTime:'10:00',endTime:'11:00',note:'',location:''}],assets:[],feedback:[],customTabs:[tab]}];window.productionBridge.write(w);await window.flushDocumentModules();window.productionBridge.select(id,'tab:'+tab.id);return {project:id,tab:tab.id,list:tab.modules[1].id,progress:tab.modules[3].id,info:tab.modules[5].id,assignment:tab.modules[7].id}}""",template)
    route=base+'#/work-groups/'+ids['project']+'/tabs/'+ids['tab'];page.goto(route);page.reload()
    def module(key):return page.locator('[data-module-id="'+ids[key]+'"]')
    listing=module('list');progress=module('progress');assignment=module('assignment')
    listing.locator('.planning-module').wait_for()
    assert page.locator('.plan-section').count()==4
    assert listing.locator('.plan-group-header').count()==2
    assert progress.get_by_text('09:00',exact=True).count()==1
    # The module's own editor mutates shared data, retaining hidden columns.
    listing.get_by_role('button',name='★ 첫 순서 · 제목을 입력하세요',exact=True).click()
    editor=page.get_by_role('dialog',name='항목 편집',exact=True)
    editor.get_by_label('항목',exact=True).fill('공통 데이터 검증')
    editor.get_by_label('시작',exact=True).fill('09:30')
    editor.get_by_role('button',name='적용',exact=True).click()
    progress.get_by_role('button',name='★ 공통 데이터 검증',exact=True).wait_for()
    assert progress.get_by_text('09:30',exact=True).count()==1
    progress.get_by_role('button',name='표 보기',exact=True).click();assert progress.locator('tbody tr').count()==3
    progress.get_by_role('button',name='카드 보기',exact=True).click()
    # Custom schema, group names and connection fields use the same UI.
    listing.get_by_role('button',name='모듈 구성',exact=True).click();config=page.get_by_role('dialog',name='모듈 구성',exact=True)
    config.get_by_label('모듈 제목',exact=True).fill('자유로운 목록')
    config.get_by_label('그룹 이름',exact=True).first.fill('준비 단계')
    for label,kind in [('분류','select'),('참고 자료','resource'),('연결 일정','schedule')]:
     config.get_by_label('새 속성 이름',exact=True).fill(label);config.get_by_label('새 속성 종류',exact=True).select_option(kind);config.get_by_role('button',name='속성 추가',exact=True).click()
    config.get_by_label('분류 선택지',exact=True).fill('준비, 확인')
    config.get_by_role('button',name='닫기',exact=True).click()
    resource=page.evaluate("""async()=>{const id=crypto.randomUUID();const r=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify({id,title:'공유 참고 링크',kind:'link',url:'https://example.com/guide',tags:[],properties:{},version:0})});if(!r.ok)throw Error(await r.text());window.dispatchEvent(new Event('resources-changed'));return id}""")
    listing.get_by_role('button',name='★ 공통 데이터 검증',exact=True).click();editor=page.get_by_role('dialog',name='항목 편집',exact=True)
    editor.get_by_label('분류',exact=True).select_option('확인')
    editor.get_by_label('참고 자료',exact=True).select_option(resource)
    editor.get_by_label('연결 일정',exact=True).select_option('project:'+ids['project']+':meeting')
    editor.get_by_role('button',name='적용',exact=True).click()
    assert listing.get_by_role('link',name='공유 참고 링크',exact=True).get_attribute('href')=='https://example.com/guide'
    assert progress.get_by_text('확인',exact=True).count()==1
    # Team grouping is arbitrary, not hard-coded A/B. Member choices follow the team.
    assignment.get_by_role('button',name='자리 1',exact=True).click();editor=page.get_by_role('dialog',name='항목 편집',exact=True)
    editor.get_by_label('팀',exact=True).select_option('event:setup')
    assert editor.get_by_label('담당자',exact=True).locator('option').all_text_contents()==['선택하세요','하나']
    editor.get_by_label('담당자',exact=True).select_option('alice')
    editor.get_by_label('팀',exact=True).select_option('event:host')
    assert editor.get_by_label('담당자',exact=True).input_value()==''
    editor.get_by_label('담당자',exact=True).select_option('bob')
    editor.get_by_role('button',name='적용',exact=True).click()
    assignment.get_by_role('heading',name='테스트 프로젝트 / 진행팀',exact=True).wait_for()
    assert assignment.get_by_text('둘',exact=True).count()==1
    # Adding within a derived team group prefills that team.
    team_group=assignment.locator('.plan-group').filter(has=page.get_by_role('heading',name='테스트 프로젝트 / 진행팀',exact=True))
    team_group.get_by_role('button',name='항목 추가',exact=True).click();editor=page.get_by_role('dialog',name='항목 추가',exact=True)
    assert editor.get_by_label('팀',exact=True).input_value()=='event:host'
    editor.get_by_label('역할 / 자리',exact=True).fill('추가 역할');editor.get_by_role('button',name='적용',exact=True).click()
    page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(300)
    page.screenshot(path='/tmp/planning-'+mode+'-desktop.png',full_page=True)
    # Narrow layouts fit the viewport; tables have their own scroll region.
    page.set_viewport_size({'width':390,'height':844});listing.scroll_into_view_if_needed();page.wait_for_timeout(300)
    assert listing.locator('.plan-group').first.bounding_box()['width']<390
    assert listing.locator('.plan-group').nth(1).bounding_box()['y']>listing.locator('.plan-group').first.bounding_box()['y']
    page.screenshot(path='/tmp/planning-'+mode+'-mobile.png')
    page.set_viewport_size({'width':1400,'height':1000})
    # Deleting the data owner materializes every dependent view before removing it.
    box=page.locator('[data-fluid-id="'+ids['list']+'"]');heading=box.locator('.module-outside-title');heading.scroll_into_view_if_needed();page.wait_for_timeout(700);heading.hover();heading.get_by_role('button',name='내용 제거',exact=True).click()
    box.get_by_role('button',name='모듈 삭제 확인',exact=True).click();listing.wait_for(state='detached')
    progress.get_by_role('button',name='★ 공통 데이터 검증',exact=True).wait_for()
    page.evaluate('window.flushDocumentModules()');page.reload();module('progress').get_by_role('button',name='★ 공통 데이터 검증',exact=True).wait_for()
    state=page.evaluate('window.productionBridge.read().projects[0].customTabs[0].modules')
    saved=next(m for m in state if m['id']==ids['progress']);assert not saved.get('dataModuleId');assert saved['planData']['entries'][0]['values']['time']=='09:30'
    page.get_by_role('button',name='모듈 추가',exact=True).click();hub=page.get_by_role('complementary',name='모듈 허브',exact=True)
    hub.get_by_role('tab',name='템플릿',exact=True).click();hub.locator('.hub-card').filter(has_text='수업 계획').click()
    page.get_by_role('heading',name='수업 계획',exact=True).wait_for()
    created=page.evaluate('window.productionBridge.read().projects[0].customTabs.at(-1)');assert created['name']=='수업 계획';assert created['modules'][3]['dataModuleId']==created['modules'][1]['id'];assert created['modules'][1]['id']!=ids['list']
    assert not errors,errors
    print('PASS '+mode+': template rendering, shared edits, card/table switch, custom fields, resource/schedule links, arbitrary teams and member filtering, mobile stacking, safe source removal and persisted reload',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
