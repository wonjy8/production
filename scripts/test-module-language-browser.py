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
    page.on('response',lambda r:print('HTTP',r.status,r.url,r.text()[:500],flush=True) if r.status>=400 and '/api/data' in r.url else None)
    page.evaluate("()=>{const fetch=window.fetch;window.fetch=async(...args)=>{try{const r=await fetch(...args);if(!r.ok)console.log('SAVE_HTTP',r.status,await r.clone().text());return r}catch(e){console.log('SAVE_ERROR',String(e));throw e}}}")
    page.on('console',lambda m:print(m.text[:1000],flush=True) if m.text.startswith('SAVE_') else None)
    print('START '+mode,flush=True)
    project=page.evaluate("""async()=>{const w=window.productionBridge.read();w.productions=[{id:'parent',name:'검증 프로젝트',tasks:[],schedules:[]}];const seeded=[{id:'event',title:'이동 일정',moduleId:'tt',productionId:'parent',date:'2026-10-16',endDate:'2026-10-16',startTime:'10:00',endTime:'11:00',note:'원본 메모'},{id:'all-day',title:'종일 이동',moduleId:'tt',productionId:'parent',date:'2026-10-16',endDate:'2026-10-16',startTime:'',endTime:''}];w.projects=[{id:'p',name:'모듈 검증',productionId:'parent',status:'진행 중',iconColor:'#8b5cf6',tasks:[{id:'task',title:'표시 할일',due:'2026-10-16',startTime:'12:00',endTime:'13:00',done:false}],schedules:[{id:'schedule',title:'프로젝트 일정',date:'2026-10-16',endDate:'2026-10-16',startTime:'09:00',endTime:'10:00'}],assets:[],feedback:[],customTabs:[{id:'test',name:'검증',modules:[{id:'tt',kind:'timetable',title:'타임테이블',frameHeight:700,blockLayout:true,config:{start:'2026-10-16',end:'2026-10-18',days:3,projectIds:['p'],startTime:'08:00',endTime:'20:00'}},{id:'old',kind:'checklist',title:'보존 목록',items:[{id:'olditem',text:'보존할 내용',done:true}],blockLayout:true},{id:'note',kind:'text',title:'긴 메모',text:Array(25).fill('내용을 보존하는 메모입니다.').join('\\n'),frameHeight:160,blockLayout:true}]}]}];w.timetableSchedules=[];window.productionBridge.write(w);await window.flushDocumentModules();const next=window.productionBridge.read();next.timetableSchedules=seeded;window.productionBridge.write(next);await window.flushDocumentModules();return 'p'}""")
    page.goto(base+'#/work-groups/p/tabs/test');page.reload();tt=page.locator('[data-fluid-id=tt]');tt.wait_for();page.wait_for_timeout(400)
    grid=tt.locator('.schedule-grid');assert grid.count()==1
    assert grid.evaluate('e=>e.scrollHeight<=e.clientHeight+2'),grid.evaluate('e=>[e.scrollHeight,e.clientHeight]')
    assert tt.locator('.sg-event').count()==3
    before=tt.locator('.sg-body').bounding_box()['height'];tt.locator('.module-resize-bottom').scroll_into_view_if_needed();r=tt.locator('.module-resize-bottom').bounding_box();page.mouse.move(r['x']+30,r['y']+6);page.mouse.down();page.mouse.move(r['x']+30,r['y']+126,steps=8);page.mouse.up();page.wait_for_timeout(300);assert tt.locator('.sg-body').bounding_box()['height']>before+70
    settings=tt.get_by_role('button',name='타임테이블 설정',exact=True);settings.click();dialog=page.get_by_role('dialog',name='타임테이블 설정',exact=True);dialog.get_by_label('할일 표시',exact=True).uncheck();dialog.get_by_label('시작 시간',exact=True).select_option('06:00');dialog.get_by_label('종료 시간',exact=True).select_option('18:00');dialog.get_by_label('일정 포함',exact=True).select_option('exclude');dialog.get_by_role('button',name='완료',exact=True).click();assert tt.locator('.sg-event').count()==2
    assert page.evaluate('window.productionBridge.read().timetableSchedules[0].calendarExcluded')
    event=tt.get_by_role('button',name='이동 일정 10:00',exact=True);event.scroll_into_view_if_needed();r=event.bounding_box();col=tt.locator('.sg-day').nth(1).bounding_box();page.mouse.move(r['x']+15,r['y']+r['height']/2);page.mouse.down();page.mouse.move(col['x']+20,r['y']+r['height']/2+30,steps=12);page.mouse.up();page.wait_for_timeout(300)
    moved=page.evaluate('window.productionBridge.read().timetableSchedules[0]');assert moved['date']=='2026-10-17',moved;assert moved['note']=='원본 메모';assert moved['startTime']!='10:00'
    tt.get_by_role('button',name=re.compile('이동 일정')).click();page.get_by_role('dialog',name='이동 일정',exact=True).get_by_role('button',name='수정',exact=True).click();editor=page.get_by_role('dialog',name='일정 수정',exact=True);assert editor.locator('input[type=color]').count()==0;assert editor.get_by_role('group',name='일정 색 프리셋').get_by_role('button').count()==10;editor.get_by_role('button',name='#f59e0b 일정 색',exact=True).click();editor.get_by_role('button',name='저장',exact=True).click();assert page.evaluate('window.productionBridge.read().timetableSchedules[0].color')=='#f59e0b'
    all_day=tt.get_by_role('button',name='종일 이동',exact=True);all_day.scroll_into_view_if_needed();r=all_day.bounding_box();target=tt.locator('.sg-day').nth(2).bounding_box();page.mouse.move(r['x']+10,r['y']+8);page.mouse.down();page.mouse.move(target['x']+25,target['y']+target['height']*5/12,steps=14);page.mouse.up();page.wait_for_timeout(250)
    converted=page.evaluate('window.productionBridge.read().timetableSchedules.find(s=>s.id==="all-day")');assert converted['date']=='2026-10-18',converted;assert converted['startTime']=='11:00' and converted['endTime']=='12:00',converted
    page.get_by_role('button',name='모듈 추가',exact=True).click();hub=page.locator('.hub-sidebar');hub.get_by_text('섹션 제목',exact=True).click();heading=page.locator('.plan-section').last;heading.get_by_role('button',name='섹션 제목 편집',exact=True).click();heading.get_by_label('섹션 제목',exact=True).fill('제목을 직접 편집');heading.get_by_label('섹션 제목',exact=True).press('Enter');page.wait_for_timeout(150);assert '제목을 직접 편집' in heading.inner_text();assert heading.locator('.plan-section-number').count()==0
    heading.get_by_role('button',name='섹션 제목 편집',exact=True).click(button='right');page.get_by_role('menuitem',name='제목 4',exact=True).click();expect(heading).to_have_attribute('data-heading-level','4');assert heading.evaluate('e=>getComputedStyle(e).borderBottomWidth')=='0px'
    page.get_by_role('button',name='모듈 추가',exact=True).click();page.locator('.hub-sidebar').get_by_text('섹션 제목 2',exact=True).click();second=page.locator('.plan-section').last;expect(second).to_have_attribute('data-heading-level','2');second.get_by_role('button',name='섹션 제목 편집',exact=True).click();second.get_by_label('섹션 제목',exact=True).fill('이동할 제목');second.get_by_label('섹션 제목',exact=True).press('Enter');page.wait_for_timeout(150)
    headings=page.locator('.plan-section');assert float(headings.nth(0).locator('.section-heading-title').first.evaluate('e=>getComputedStyle(e).fontSize').replace('px',''))<float(headings.nth(1).locator('.section-heading-title').first.evaluate('e=>getComputedStyle(e).fontSize').replace('px',''))
    handle=second.get_by_role('button',name='섹션 제목 편집',exact=True);handle.scroll_into_view_if_needed();r=handle.bounding_box();target=page.locator('.plan-section').first.bounding_box();page.mouse.move(r['x']+30,r['y']+r['height']/2);page.mouse.down();page.mouse.move(target['x']+80,target['y']-8,steps=18);page.mouse.up();page.wait_for_timeout(250);assert page.locator('.section-heading-input:visible').count()==0;assert page.evaluate('window.productionBridge.read().projects[0].customTabs[0].modules.filter(m=>m.kind==="section-heading")[0].title')=='이동할 제목'
    old=page.locator('[data-fluid-id=old]');assert '보존할 내용' in old.locator('textarea').input_value();old.locator('textarea').fill(old.locator('textarea').input_value()+' 수정');page.evaluate('window.flushDocumentModules()');saved=page.evaluate('window.productionBridge.read().projects[0].customTabs[0].modules');assert next(m for m in saved if m['id']=='old')['kind']=='text'
    note=page.locator('[data-fluid-id=note] textarea');assert note.evaluate('e=>e.scrollHeight<=e.clientHeight+2')
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/work-groups/p/schedule');page.reload();page.locator('.calendar-view-switch button').first.wait_for();assert page.locator('.calendar-view-switch button').all_text_contents()==['일간','주간','월간'];assert page.get_by_role('button',name='월간',exact=True).get_attribute('aria-pressed')=='true';page.get_by_role('button',name='주간',exact=True).click();assert page.locator('.schedule-grid .sg-day').count()==7;page.get_by_role('button',name='일간',exact=True).click();assert page.locator('.schedule-grid .sg-day').count()==1;page.get_by_role('button',name='월간',exact=True).click();assert page.locator('.calendar-grid').count()==1
    assert not errors,errors
    print('PASS '+mode+': fitting timetable height, settings/tasks/hours/exclusion, date/time drag, color edit, preserved retired content, natural memo height and calendar month/week/day',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);print(nas.stderr.read().decode()[-4000:]);httpd.shutdown()
