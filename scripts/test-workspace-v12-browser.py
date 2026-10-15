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
   context=browser.new_context(viewport={'width':1400,'height':1000});engine_requests=[];context.on('request',lambda request:engine_requests.append(request.url) if '.wasm' in request.url else None);page=context.new_page();errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('BROWSER ERROR',e.stack,flush=True)))
   context.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}")
   import io,json
   for mode in ['local','nas']:
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
    fixture=page.evaluate("""()=>{const w=window.productionBridge.read(),id=crypto.randomUUID(),member=crypto.randomUUID(),other=crypto.randomUUID(),day=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};w.productions=[{id,name:'검증 프로젝트',description:'',status:'진행 중',due:'',tasks:[{id:'flagged',title:'깃발 유지 할일',done:false,flagged:true,due:day(-30),stage:'기획',owner:'미지정',priority:'보통',description:''}],schedules:[{id:'today-open',title:'오늘 일정',date:day(0),endDate:day(0),location:'',note:''},{id:'today-done',title:'완료된 오늘 일정',done:true,date:day(0),endDate:day(0),location:'',note:''},{id:'past',title:'과거 숨김 일정',date:day(-3),endDate:day(-3),location:'',note:''}],customTabs:[],archives:[{id:'archive-fixture',name:'검증 아카이브',completedAt:new Date().toISOString(),outputs:[],candidates:[],snapshot:[]}]}];w.projects=[];w.members=[{id:member,name:'장비 보유자',kind:'personal',email:'',contact:''},{id:other,name:'빈 멤버',kind:'personal',email:'',contact:''}];w.equipment=[{id:crypto.randomUUID(),name:'장비 보유자',ownerId:member,ownership:'personal',inventory:[{id:crypto.randomUUID(),kind:'body',name:'Sony FX3',quantity:1}]}];window.productionBridge.write(w);window.productionRefresh?.();return {id,member,other,equipment:w.equipment[0]}}""")
    page.evaluate("""async ({equipment})=>{await window.flushDocumentModules();const r=await fetch('/production/api/database/equipment/'+equipment.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(equipment)});if(!r.ok)throw Error('equipment fixture failed')}""",fixture)
    page.reload();page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
    page.evaluate("window.openHomeSection('dashboard')")
    page.get_by_role('button',name='이번 주',exact=True).click()
    page.get_by_text('깃발 유지 할일',exact=True).first.wait_for()
    assert page.locator('[data-home-section]').count()==0
    page.get_by_role('button',name='모든 할 일 보기',exact=True).click()
    page.get_by_role('navigation',name='현재 위치').get_by_role('button',name='할 일',exact=True).wait_for()
    page.evaluate("window.openHomeSection('schedule')")
    page.get_by_role('region',name='전체 일정').wait_for()
    assert page.get_by_text('과거 숨김 일정',exact=True).count()==0
    page.locator('.home-completed summary').click()
    page.get_by_role('button',name='완료된 오늘 일정 미완료로 변경',exact=True).click()
    assert not page.evaluate("window.productionBridge.read().productions[0].schedules.find(s=>s.id==='today-done').done")
    timeline=page.get_by_role('region',name='전체 일정');timeline.hover();page.mouse.wheel(0,-400)
    page.get_by_text('과거 숨김 일정',exact=True).wait_for()
    # Task editor: segmented time input, normalization, stepping, Tab wrap and flag persistence.
    page.evaluate("({id})=>window.openProduction(undefined,'tasks',false,id)",fixture)
    page.get_by_text('깃발 유지 할일',exact=True).first.click()
    form=page.get_by_role('dialog',name='할 일 수정')
    form.get_by_label('시작 시간 시',exact=True).fill('13');form.get_by_label('시작 시간 시',exact=True).press('Tab')
    assert form.get_by_label('시작 시간 오전/오후',exact=True).input_value()=='오후'
    assert form.get_by_label('시작 시간 시',exact=True).input_value()=='1'
    form.get_by_label('시작 시간 분',exact=True).fill('10');form.get_by_label('시작 시간 분',exact=True).press('ArrowUp')
    assert form.get_by_label('시작 시간 분',exact=True).input_value()=='15'
    form.get_by_label('시작 시간 분',exact=True).press('Tab');assert form.get_by_label('종료 시간 오전/오후',exact=True).evaluate('e=>e===e.getRootNode().activeElement')
    form.get_by_label('종료 시간 시',exact=True).fill('14');form.get_by_label('종료 시간 시',exact=True).press('Tab');assert form.get_by_label('종료 시간 오전/오후',exact=True).input_value()=='오후';form.get_by_label('종료 시간 분',exact=True).fill('20');form.get_by_label('종료 시간 분',exact=True).press('Tab')
    assert form.get_by_label('시작 시간 오전/오후',exact=True).evaluate('e=>e===e.getRootNode().activeElement')
    picker=form.get_by_role('button',name='담당자 선택');picker.click();assert picker.get_attribute('aria-expanded')=='true';picker.locator('svg').click();assert picker.get_attribute('aria-expanded')=='false'
    assert form.locator('[name=flagged]').is_checked()
    form.get_by_role('button',name='저장',exact=True).click()
    page.wait_for_function("window.productionBridge.read().productions[0].tasks[0].startTime==='13:15'")
    # Existing mobile wheels remain usable with the new desktop controls.
    page.set_viewport_size({'width':390,'height':844});page.get_by_text('깃발 유지 할일',exact=True).first.click()
    mobile_form=page.get_by_role('dialog',name='할 일 수정');mobile_form.get_by_role('textbox',name='시작 시간',exact=True).click()
    wheel=mobile_form.get_by_role('group',name='시작 시간 휠 선택',exact=True)
    wheel.get_by_role('listbox',name='오전/오후',exact=True).get_by_role('option',name='오후',exact=True).click()
    wheel.get_by_role('listbox',name='시',exact=True).get_by_role('option',name='11',exact=True).click()
    wheel.get_by_role('listbox',name='분',exact=True).get_by_role('option',name='55',exact=True).click()
    wheel.get_by_role('button',name='완료',exact=True).click();assert mobile_form.locator('[name=startTime]').input_value()=='23:55'
    mobile_form.get_by_role('button',name='할 일 수정 닫기',exact=True).click();page.set_viewport_size({'width':1400,'height':1000})
    # Separate member and equipment lists, preserving inventory while editing a profile.
    page.evaluate("window.openDatabase('members')")
    page.get_by_role('button',name='장비 보유자 장비 추가',exact=True).wait_for()
    assert page.get_by_text('Sony FX3',exact=True).count()==0
    page.locator('[data-db-id="'+fixture['member']+'"]').click();assert page.locator('.inventory-sections').count()==0
    page.locator('#db-form [name=contact]').fill('010-1234');page.locator('#db-form [name=contact]').press('Tab')
    page.wait_for_function("document.querySelector('#owner-save-status')?.textContent==='저장됨'")
    page.get_by_role('button',name='목록으로',exact=True).click()
    page.get_by_role('button',name='장비 보유자 장비 추가',exact=True).wait_for()
    assert page.evaluate("async()=>fetch('/production/api/data').then(r=>r.json()).then(w=>w.equipment.filter(e=>!e.deleted)[0].inventory.length)")==1

    page.get_by_role('button',name='등록 멤버',exact=True).click();assert page.locator('[data-db-id="'+fixture['member']+'"]').count()==0
    page.get_by_role('button',name='미등록 멤버',exact=True).click();page.locator('[data-db-id="'+fixture['member']+'"]').wait_for();page.locator('[data-db-id="'+fixture['other']+'"]').wait_for()
    page.get_by_role('button',name='전체',exact=True).click()
    page.get_by_role('button',name='장비 보유자 장비 추가',exact=True).click()
    page.locator('.inventory-sections').wait_for();assert page.locator('.owner-profile').is_hidden()
    page.get_by_role('button',name='목록으로',exact=True).click()
    page.locator('[data-db-scope=equipment]').wait_for();expect(page.locator('[data-db-id]')).to_have_count(1)
    page.get_by_role('button',name='추가',exact=True).click();page.get_by_label('장비 소유 멤버',exact=True).select_option(fixture['other']);page.get_by_role('button',name='장비 추가',exact=True).click()
    page.locator('.inventory-sections').wait_for();page.get_by_role('button',name='목록으로',exact=True).click()
    # Materials sidebar, inline archive and a single trash browser for every record type.
    page.locator('[data-main-space=references]').first.click()
    assert page.locator('.sidebar-source-sections [data-source-section=documents]').count()==0
    page.locator('.sidebar-source-sections [data-source-section=resources]').get_by_text('모든 자료',exact=True).wait_for()
    ref=page.evaluate("async()=>window.referenceBridge.create({title:'삭제된 포트폴리오',recordType:'portfolio',deleted:true,deletedAt:new Date().toISOString()})")
    resource=page.evaluate("""async()=>{const id=crypto.randomUUID();await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'text/plain'},body:'trash document'});const r=await fetch('/production/api/database/resources/'+id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify({id,fileId:id,title:'삭제된 문서',filename:'trash.txt',kind:'file',mime:'text/plain',tags:[],properties:{},deleted:true,version:0})});if(!r.ok)throw Error('trash fixture failed');return r.json()}""")
    page.locator('.sidebar-source-sections [data-source-section=archive]').click()
    page.get_by_role('heading',name='아카이브',exact=True).wait_for();assert page.get_by_role('dialog',name='아카이브',exact=True).count()==0
    page.get_by_role('button',name='검증 아카이브 아카이브 휴지통',exact=True).click();page.get_by_role('button',name='모듈 삭제 확인',exact=True).click()
    page.locator('.sidebar-source-sections [data-source-section=trash]').click()
    page.get_by_role('heading',name='휴지통',exact=True).wait_for();page.get_by_text('검증 아카이브',exact=True).wait_for();page.get_by_text('삭제된 포트폴리오',exact=True).wait_for();page.get_by_text('삭제된 문서',exact=True).wait_for()
    tabs=page.get_by_role('navigation',name='휴지통 종류')
    tabs.get_by_role('button',name='문서',exact=True).click();assert page.get_by_text('삭제된 포트폴리오',exact=True).count()==0
    page.get_by_role('button',name='삭제된 문서 영구 삭제',exact=True).click();page.get_by_role('button',name='삭제된 문서 영구 삭제 확인',exact=True).click();page.get_by_text('삭제된 문서',exact=True).wait_for(state='detached')
    tabs.get_by_role('button',name='포트폴리오',exact=True).click();page.get_by_role('button',name='복원',exact=True).click();page.get_by_text('삭제된 포트폴리오',exact=True).wait_for(state='detached')
    tabs.get_by_role('button',name='아카이브',exact=True).click();page.get_by_role('button',name='복원',exact=True).click();page.get_by_text('검증 아카이브',exact=True).wait_for(state='detached')
    page.reload();page.get_by_role('heading',name='휴지통',exact=True).wait_for();assert '#/materials/trash' in page.url
    assert not errors,errors
    print('PASS '+mode+': home history/completion/flags, segmented time and Tab cycle, assignee toggle, separate DB views, archive page and unified trash restore/purge',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
