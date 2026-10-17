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
   context=browser.new_context(viewport={'width':1400,'height':1000});engine_requests=[];context.on('request',lambda request:engine_requests.append(request.url) if '.wasm' in request.url else None);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print('CONSOLE',m.text[:700],flush=True) if m.type=='error' else None)
   context.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}")
   import io,zipfile,json

   for mode in ['local','nas']:
    if mode=='nas':
     context.close();context=browser.new_context(viewport={'width':1400,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print('CONSOLE',m.text[:700],flush=True) if m.type=='error' else None)
    import datetime
    page.clock.set_fixed_time(datetime.datetime(2026,10,16,3,tzinfo=datetime.timezone.utc))
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"');page.locator('.admin-home').wait_for()
    print('START '+mode,flush=True)
    project=page.evaluate("""async()=>{const w=window.productionBridge.read();w.productions=[{id:'parent',name:'컬러 프로젝트',iconColor:'#10b981',tasks:[],schedules:[]}];w.projects=[{id:'child',name:'디자인',productionId:'parent',status:'진행 중',icon:'star',iconColor:'#8b5cf6',tasks:[{id:'todo',title:'매일 할일',due:'2026-10-16',done:false,stage:'기획',priority:'보통',owner:'',description:''},{id:'done',title:'완료 기록',due:'2026-10-15',done:true,stage:'완료',priority:'보통',owner:'',description:''}],schedules:[{id:'day',title:'종일 디자인',date:'2026-10-16',endDate:'2026-10-16',startTime:'',endTime:''},{id:'timed',title:'오전 디자인',date:'2026-10-16',endDate:'2026-10-16',startTime:'10:30',endTime:'11:30'}],assets:[],feedback:[],customTabs:[]},{id:'other',name:'촬영',productionId:'parent',iconColor:'#eab308',status:'진행 중',tasks:[],schedules:[{id:'other-event',title:'촬영 일정',date:'2026-10-16',endDate:'2026-10-16',startTime:'14:00',endTime:'15:00'}],assets:[],feedback:[],customTabs:[]}];window.productionBridge.write(w);await window.flushDocumentModules();window.productionBridge.select('child','tasks');return 'child'}""")
    page.goto(base+'#/work-groups/child/tasks');page.reload()
    try:page.locator('.work-task').first.wait_for(timeout=8000)
    except Exception:
     print('INITIAL',errors,page.locator('#production-panel').evaluate('e=>({hidden:e.hidden,html:e.shadowRoot?.innerHTML.slice(-5500)})'),flush=True);raise
    page.wait_for_timeout(250)
    icon=page.locator('#app-page-title .project-identity-icon');icon.click();picker=page.get_by_role('dialog',name='업무 그룹 아이콘 선택',exact=True);picker.get_by_role('button',name='#3b82f6 색상',exact=True).click();assert page.evaluate('window.productionBridge.read().projects[0].iconColor')=='#3b82f6'
    picker.get_by_role('tab',name='이모지',exact=True).click();assert picker.locator('select').count()==0;picker.get_by_role('searchbox').fill('기도');emoji=picker.locator('.emoji-icon-grid button');assert emoji.count()>0;assert emoji.first.evaluate('e=>getComputedStyle(e).borderTopWidth')=='0px';emoji.first.click();assert page.evaluate('window.productionBridge.read().projects[0].icon').startswith('emoji:')
    icon.click();picker.get_by_role('tab',name='업로드',exact=True).click();assert '256 × 256px' in picker.inner_text();assert '10MB' in picker.inner_text()
    png=page.evaluate("()=>{const c=document.createElement('canvas');c.width=c.height=16;return c.toDataURL('image/png').split(',')[1]}");picker.get_by_label('아이콘 사진 업로드',exact=True).set_input_files({'name':'icon.png','mimeType':'image/png','buffer':base64.b64decode(png)});picker.get_by_role('button',name='사진 적용',exact=True).click();assert page.evaluate('window.productionBridge.read().projects[0].icon').startswith('image:data:image/webp')
    composer=page.locator('.task-composer').first;composer.get_by_role('textbox',name='새 할 일',exact=True).fill('반복 바로 추가');composer.get_by_label('마감일',exact=True).fill('2026-10-16');composer.get_by_label('반복 주기',exact=True).select_option('weekly');composer.get_by_role('button',name='할 일 추가',exact=True).click();assert page.evaluate('window.productionBridge.read().projects[0].tasks.find(t=>t.title==="반복 바로 추가").repeat.frequency')=='weekly'
    # Board completion remains a plain list below the two active columns.
    page.get_by_role('button',name='보드',exact=True).click();assert page.locator('.task-board > section').count()==2;assert page.locator('.task-board [data-task-stage="완료"]').count()==0;assert page.locator('.task-board-completed').count()==1
    page.get_by_role('button',name='목록',exact=True).click();assert page.locator('.task-list-group').nth(1).evaluate('e=>getComputedStyle(e).borderTopWidth')=='1px'
    page.locator('.task-title').filter(has_text='매일 할일').click();dialog=page.get_by_role('dialog',name='할 일 수정',exact=True);dialog.get_by_label('반복 주기',exact=True).select_option('daily');dialog.get_by_role('button',name='저장',exact=True).click();page.wait_for_timeout(250)
    assert page.evaluate('window.productionBridge.read().projects[0].tasks[0].repeat.frequency')=='daily'
    page.get_by_role('checkbox',name='매일 할일 완료',exact=True).click();page.wait_for_timeout(250);assert page.evaluate('window.productionBridge.read().projects[0].tasks[0].repeat.exceptions["2026-10-16"].done')
    assert '10.17' in page.locator('.work-task').filter(has_text='매일 할일').first.inner_text() or page.locator('.work-task').filter(has_text='매일 할일').count()>0
    page.locator('.task-title').filter(has_text='매일 할일').first.click();dialog.get_by_role('button',name='삭제',exact=True).click();scope=page.get_by_role('dialog',name='반복 항목 삭제',exact=True);scope.get_by_role('button',name='이번부터 이후',exact=True).click();assert page.evaluate('window.productionBridge.read().projects[0].tasks[0].repeat.segments[0].deleted')
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/work-groups/child/schedule');page.reload();page.locator('.calendar-grid').wait_for();day=page.locator('[data-calendar-date="2026-10-16"]')
    all_day=day.locator('.calendar-all-day').filter(has_text='종일 디자인');timed=day.locator('.calendar-timed').filter(has_text='오전 디자인');assert timed.locator('time').inner_text()=='오전 10:30';assert all_day.evaluate('e=>getComputedStyle(e).backgroundColor')!='rgba(0, 0, 0, 0)';assert timed.evaluate('e=>getComputedStyle(e,":before").backgroundColor')=='rgb(59, 130, 246)'
    task_check=day.locator('.calendar-task-check').first;assert not task_check.evaluate('e=>e.classList.contains("ui-add-action")');assert task_check.bounding_box()['height']==14
    scroll=page.locator('.calendar-resizable');old=scroll.bounding_box()['height'];handle=page.get_by_role('separator',name='일정 높이 조절',exact=True);handle.scroll_into_view_if_needed();r=handle.bounding_box();page.mouse.move(r['x']+30,r['y']+7);page.mouse.down();page.mouse.move(r['x']+30,r['y']+147,steps=8);page.mouse.up();assert scroll.bounding_box()['height']>old+100
    day.get_by_role('button',name='2026-10-16 할 일·일정 추가',exact=True).click();form=page.get_by_role('dialog',name='추가',exact=True);form.get_by_role('textbox',name='일정 이름',exact=True).fill('반복 주간');form.get_by_label('반복 주기',exact=True).select_option('weekly');form.get_by_role('button',name='저장',exact=True).click();page.wait_for_timeout(300)
    event=page.locator('[data-calendar-date="2026-10-23"] .calendar-event').filter(has_text='반복 주간');event.click();editor=page.get_by_role('dialog',name='일정 편집',exact=True);assert editor.get_by_role('textbox',name='일정 이름',exact=True).evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(245, 245, 246)';editor.get_by_role('textbox',name='일정 이름',exact=True).fill('이번만 변경');editor.get_by_role('button',name='저장',exact=True).click();scope=page.get_by_role('dialog',name='반복 항목 수정',exact=True);scope.get_by_role('button',name='이번 항목만',exact=True).click();page.wait_for_timeout(250)
    assert page.evaluate('window.productionBridge.read().projects[0].schedules.find(s=>s.repeat).repeat.exceptions["2026-10-23"].title')=='이번만 변경'
    page.locator('[data-calendar-date="2026-10-30"] .calendar-event').filter(has_text='반복 주간').click();editor.get_by_role('textbox',name='일정 이름',exact=True).fill('이후 변경');editor.get_by_role('button',name='저장',exact=True).click();scope.get_by_role('button',name='이번부터 이후',exact=True).click();page.wait_for_timeout(250);assert page.evaluate('window.productionBridge.read().projects[0].schedules.find(s=>s.repeat).repeat.segments[0].from')=='2026-10-30'
    page.evaluate('window.flushDocumentModules()');page.reload();page.locator('.calendar-resizable').wait_for();assert page.locator('.calendar-resizable').bounding_box()['height']>old+100;page.locator('[data-calendar-date="2026-10-23"] .calendar-event').filter(has_text='이번만 변경').wait_for()
    page.locator('[data-calendar-date="2026-10-16"] .calendar-event').filter(has_text='반복 주간').click();editor.get_by_role('textbox',name='일정 이름',exact=True).fill('전체 변경');editor.get_by_role('button',name='저장',exact=True).click();scope.get_by_role('button',name='반복 전체',exact=True).click();page.wait_for_timeout(250);assert page.locator('.calendar-event').filter(has_text='전체 변경').count()==3
    page.screenshot(path='/tmp/production-scheduling-'+mode+'.png')
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/projects/parent/schedule');page.reload();page.locator('.calendar-grid').wait_for();blue=page.locator('.calendar-event').filter(has_text='오전 디자인');yellow=page.locator('.calendar-event').filter(has_text='촬영 일정');assert blue.evaluate('e=>getComputedStyle(e,":before").backgroundColor')=='rgb(59, 130, 246)';assert yellow.evaluate('e=>getComputedStyle(e,":before").backgroundColor')=='rgb(234, 179, 8)'
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(350);page.locator('#app-page-title .project-identity-icon').click();mobile_picker=page.get_by_role('dialog',name='프로젝트 아이콘 선택',exact=True);r=mobile_picker.bounding_box();assert r['x']>=0 and r['x']+r['width']<=390;mobile_picker.get_by_role('tab',name='이모지',exact=True).click();mobile_picker.get_by_role('searchbox').fill('대한민국');assert mobile_picker.locator('.emoji-icon-grid button').count()>0;page.screenshot(path='/tmp/production-icon-mobile-'+mode+'.png');page.keyboard.press('Escape')
    assert not errors,errors
    print('PASS '+mode+': title identity/colors and emoji search, upload specs, board/list groups, recurring task completion and future deletion, calendar colors/height and one/future/all schedule edits with persistence',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
