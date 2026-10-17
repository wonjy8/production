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
    import datetime
    page.clock.set_fixed_time(datetime.datetime(2026,10,17,3,tzinfo=datetime.timezone.utc))
    base='https://pages.test:9443/production/'+('nas.test:9444/' if mode=='nas' else '')
    page.goto(base)
    if mode=='nas':
     page.locator('#account-form [name=email]').fill('admin@example.com');page.locator('#account-form [name=password]').fill('StrongPassword2026!');page.locator('#account-form button').click()
    page.wait_for_function('!!window.productionBridge && typeof window.mountProduction==="function"');page.locator('.admin-home').wait_for()
    page.evaluate("""async()=>{const w=window.productionBridge.read();w.members=Array.from({length:4},(_,i)=>({id:'member'+i,name:'멤버'+i}));w.productions=[{id:'parent',name:'테스트 프로젝트',iconColor:'#8b5cf6',tasks:[],schedules:[{id:'own',title:'프로젝트 일정',date:'2026-10-17',endDate:'2026-10-17',location:'',note:''}],memberIds:w.members.map(m=>m.id),teams:[{id:'team',name:'제작팀',members:[],leaderId:''}]}];w.projects=['a','b'].map((id,i)=>({id,name:'그룹'+id,productionId:'parent',iconColor:i?'#3b82f6':'#f59e0b',status:'진행 중',tasks:[{id:'task'+id,title:'할일'+id,done:false,stage:'기획',owner:'미지정',due:'2026-10-17',description:'',priority:'보통'}],schedules:[{id:'schedule'+id,title:'일정'+id,date:'2026-10-17',endDate:'2026-10-17',startTime:'10:00',endTime:'11:00',location:'',note:''}],assets:[],feedback:[],customTabs:id==='a'?[{id:'media',name:'미디어',modules:[{id:'photo',kind:'image',title:'사진',files:[],frameHeight:450,blockLayout:true},{id:'files',kind:'file',title:'파일',files:[],blockLayout:true},{id:'link',kind:'link',title:'처음 링크',url:'https://example.com',blockLayout:true}]}]:[]}));window.productionBridge.write(w);await window.flushDocumentModules()}""")
    # Global navigation alignment, readable holiday label and date-specific creation.
    page.evaluate('window.openHomeSection("schedule")');page.locator('.schedule-month-grid').wait_for()
    for selector in ['.admin-home-nav','.sidebar-home-section']:
     buttons=page.locator('#sidebar '+selector)
     for i in range(buttons.count()):
      assert abs(buttons.nth(i).locator('svg').first.bounding_box()['x']-page.locator('#sidebar [data-production-id="parent"] svg').first.bounding_box()['x'])<1
    holiday=page.locator('.schedule-month-day[data-date="2026-10-05"] .calendar-holiday');assert holiday.bounding_box()['width']>60
    event=page.locator('.schedule-month-event').filter(has_text='프로젝트 일정').first
    assert event.evaluate('e=>getComputedStyle(e).color') in ['rgb(34, 34, 34)','rgb(36, 37, 38)']
    assert event.evaluate('e=>getComputedStyle(e).backgroundColor')!='rgb(241, 245, 249)'
    page.get_by_role('button',name='2026-10-22 일정 추가',exact=True).click();new=page.get_by_role('dialog',name='일정 추가',exact=True)
    assert new.locator('input[type=date]').first.input_value()=='2026-10-22'
    new.get_by_label('일정 이름',exact=True).fill('날짜 지정 일정');new.get_by_label('일정 프로젝트',exact=True).select_option('project:b');new.get_by_role('button',name='저장',exact=True).click()
    expect(page.locator('.schedule-month-day[data-date="2026-10-22"] .schedule-month-event')).to_contain_text('날짜 지정 일정')
    page.evaluate("""async()=>{const w=window.productionBridge.read();w.projects.find(p=>p.id==='b').schedules=w.projects.find(p=>p.id==='b').schedules.filter(s=>s.title!=='날짜 지정 일정');window.productionBridge.write(w);await window.flushDocumentModules()}""")
    page.locator('#sidebar [data-home-section=tasks]').click();page.locator('[data-home-view=tasks]').wait_for()
    page.locator('#sidebar [data-home-section=schedule]').click();page.locator('.schedule-month-grid').wait_for()
    page.goto(base+'#/work-groups/a/schedule');page.reload();page.locator('.calendar-grid').wait_for();assert page.locator('.calendar-event').count()==3
    # Working plus; attachments, custom properties and reusable property definitions.
    page.get_by_role('button',name='일정 추가',exact=True).click();editor=page.get_by_role('dialog',name='추가',exact=True);editor.get_by_label('일정 이름',exact=True).fill('첨부 일정');editor.get_by_label('첨부 링크 이름').fill('행사 안내');editor.get_by_label('첨부 링크 주소').fill('https://example.com/event');editor.get_by_role('button',name='일정 링크 추가',exact=True).click();editor.get_by_label('일정 파일',exact=True).set_input_files({'name':'안내.txt','mimeType':'text/plain','buffer':'일정 첨부 본문'.encode()});editor.get_by_text('안내.txt',exact=True).wait_for()
    png=page.evaluate("()=>{const c=document.createElement('canvas');c.width=160;c.height=100;c.getContext('2d').fillRect(0,0,160,100);return c.toDataURL('image/png').split(',')[1]}")
    editor.get_by_label('일정 사진',exact=True).set_input_files({'name':'사진.png','mimeType':'image/png','buffer':base64.b64decode(png)});editor.get_by_text('사진.png',exact=True).wait_for();editor.get_by_label('새 속성 이름').fill('인원');editor.get_by_label('새 속성 유형').select_option('number');editor.get_by_role('button',name='일정 속성 추가',exact=True).click();editor.get_by_label('인원',exact=True).fill('30');editor.get_by_label('속성 템플릿 이름').fill('행사 속성');editor.get_by_role('button',name='템플릿 저장',exact=True).click();editor.get_by_role('button',name='저장',exact=True).click();page.wait_for_timeout(250)
    saved=page.evaluate('window.productionBridge.read().projects.find(p=>p.id==="a").schedules.find(s=>s.title==="첨부 일정")');assert len(saved['attachments'])==3 and saved['properties'][0]['value']=='30',saved
    page.evaluate('window.flushDocumentModules()');page.reload();page.locator('.calendar-grid').wait_for();assert page.locator('.calendar-event').count()==4
    page.get_by_role('button',name='일정 설정',exact=True).click();settings=page.get_by_role('dialog',name='일정 설정');settings.get_by_role('button',name='선택 해제',exact=True).click();settings.get_by_role('button',name='완료',exact=True).click();expect(page.locator('.calendar-event')).to_have_count(0);page.get_by_role('button',name='일정 설정',exact=True).click();settings.locator('.calendar-source-list label').nth(1).locator('input').check();settings.get_by_role('switch',name='할일 표시',exact=True).uncheck();settings.get_by_role('button',name='완료',exact=True).click();expect(page.locator('.calendar-event')).to_have_count(2);assert page.locator('.calendar-task').count()==0
    assert page.evaluate('window.productionBridge.read().projects.find(p=>p.id==="b").schedules.length')==1
    # Hover resize, today placement, holiday labels.
    resize=page.get_by_role('separator',name='일정 높이 조절',exact=True);resize.scroll_into_view_if_needed();r=resize.bounding_box();before=page.locator('.calendar-resizable').bounding_box()['height'];page.mouse.move(r['x']+100,r['y']+9);page.mouse.down();page.mouse.move(r['x']+100,r['y']+109,steps=8);page.mouse.up();assert page.locator('.calendar-resizable').bounding_box()['height']>before+70
    page.get_by_role('button',name='오늘',exact=True).click();assert '한글날' in page.locator('[data-calendar-date="2026-10-09"]').inner_text();assert '개천절 대체공휴일' in page.locator('[data-calendar-date="2026-10-05"]').inner_text();assert page.locator('[data-calendar-date="2026-10-17"]').evaluate('e=>getComputedStyle(e).color')=='rgb(180, 35, 24)'
    # Upgrade existing schedule, preserving all attachments/properties.
    page.locator('.calendar-event').filter(has_text='첨부 일정').first.click();editor=page.get_by_role('dialog',name='일정 편집',exact=True);editor.get_by_role('button',name='행사 그룹으로 전환',exact=True).click();page.wait_for_timeout(250);event=page.evaluate('window.productionBridge.read().projects.find(p=>p.groupType==="event")');assert event and len(event['schedules'][0]['attachments'])==3;assert event['schedules'][0]['properties'][0]['value']=='30'
    # Overview: fresh colored upcoming schedules, assigned creation.
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/projects/parent');page.reload();page.locator('.overview-activity').wait_for();page.get_by_role('button',name='개요 일정 추가',exact=True).click();new=page.get_by_role('dialog',name='일정 추가',exact=True);new.get_by_label('일정 이름',exact=True).fill('개요에서 그룹 지정');new.get_by_label('일정 프로젝트',exact=True).select_option('project:b');new.get_by_role('button',name='저장',exact=True).click();page.wait_for_timeout(200);assert page.evaluate('window.productionBridge.read().projects.find(p=>p.id==="b").schedules.some(s=>s.title==="개요에서 그룹 지정")');assert page.locator('.overview-activity .admin-schedule-list button').first.evaluate('e=>getComputedStyle(e).borderLeftColor')!='rgb(0, 0, 0)'
    # Save a workgroup template and create a clean group from it.
    page.locator('.project-work-groups .admin-projects > button').filter(has_text='그룹a').click(button='right');page.get_by_role('menuitem',name='업무그룹 템플릿 저장',exact=True).click();tpl=page.get_by_role('dialog',name='업무그룹 템플릿 저장',exact=True);tpl.get_by_label('업무그룹 템플릿 이름',exact=True).fill('제작 기본');tpl.get_by_role('button',name='저장',exact=True).click();page.get_by_role('button',name='업무 그룹 추가',exact=True).click();new=page.get_by_role('dialog',name='새 업무 그룹',exact=True);new.get_by_label('이름',exact=True).fill('템플릿 그룹');new.get_by_label('업무그룹 템플릿',exact=True).select_option(label='제작 기본');new.get_by_role('button',name='추가',exact=True).click();page.wait_for_timeout(200);copy=page.evaluate('window.productionBridge.read().projects.find(p=>p.name==="템플릿 그룹")');assert len(copy['customTabs'])==1 and len(copy['tasks'])==1;assert copy['tasks'][0]['ownerId']=='';page.evaluate('window.flushDocumentModules()');page.goto(base+'#/projects/parent');page.reload();page.locator('.overview-activity').wait_for()
    # Create peer event group in project UI.
    page.get_by_role('button',name='행사 그룹',exact=True).click();new=page.get_by_role('dialog',name='새 행사 그룹',exact=True);new.get_by_label('이름',exact=True).fill('신규 행사');new.get_by_label('행사 시작일',exact=True).fill('2026-10-20');new.get_by_label('행사 종료일',exact=True).fill('2026-10-21');new.get_by_role('button',name='추가',exact=True).click();page.wait_for_timeout(200);created=page.evaluate('window.productionBridge.read().projects.find(p=>p.name==="신규 행사")');assert created['schedules'][0]['date']=='2026-10-20' and created['due']=='2026-10-21'
    # Project roster range selection and team select-all.
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/projects/parent/people');page.reload();page.locator('.production-member-row').first.wait_for();rows=page.locator('.production-member-row');rows.nth(0).locator('input[type=checkbox]').click();rows.nth(2).locator('input[type=checkbox]').click(modifiers=['Shift']);assert page.locator('.production-member-row[aria-selected=true]').count()==3;page.get_by_role('button',name='멤버 추가',exact=True).last.click();picker=page.get_by_role('dialog',name='제작팀 · 멤버 추가',exact=True);picker.get_by_role('button',name='전체 선택',exact=True).click();assert picker.locator('input:checked').count()==4;picker.get_by_role('button',name='4명 추가',exact=True).click();expect(page.locator('.team-detail-members .team-member-row')).to_have_count(4)
    # Documents embed locally, photos transfer atomically with original ID.
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/work-groups/a/tabs/media');page.reload();page.locator('[data-media-module=photo]').wait_for();photo=page.locator('[data-media-module=photo]');photo.locator('input[type=file]').first.set_input_files([{'name':f'사진{i}.png','mimeType':'image/png','buffer':base64.b64decode(png)} for i in range(4)]);expect(photo.locator('.gallery-photo')).to_have_count(4)
    files=page.locator('[data-media-module=files]');files.locator('input[type=file]').set_input_files({'name':'문서.txt','mimeType':'text/plain','buffer':'앱 안 문서 미리보기'.encode()});expect(files.locator('.source-file-card')).to_have_count(1);files.locator('.fluid-media-item').first.click(button='right');page.get_by_role('menuitem',name='임베드로 보기',exact=True).click();expect(files.locator('.document-embed pre')).to_have_text('앱 안 문서 미리보기');files.locator('.fluid-media-item').first.click(button='right');page.get_by_role('menuitem',name='일반으로 보기',exact=True).click();expect(files.locator('.source-file-card')).to_have_count(1)
    frame=page.locator('.snap-canvas > [data-fluid-id=photo]');frame.locator('.module-resize-bottom').scroll_into_view_if_needed();r=frame.locator('.module-resize-bottom').bounding_box();old_height=photo.locator('.photo-gallery-host').bounding_box()['height'];page.mouse.move(r['x']+40,r['y']+6);page.mouse.down();page.mouse.move(r['x']+40,r['y']+166,steps=10);page.mouse.up();page.wait_for_timeout(200);assert photo.locator('.photo-gallery-host').bounding_box()['height']>old_height+100;assert photo.evaluate('e=>e.scrollHeight<=e.clientHeight+2')
    page.set_viewport_size({'width':1400,'height':1800});fid=page.evaluate('window.productionBridge.read().projects.find(p=>p.id==="a").customTabs[0].modules.find(m=>m.id==="photo").files[0].id');page.wait_for_timeout(200);photo.locator('.gallery-photo').first.scroll_into_view_if_needed();assert photo.locator('.gallery-photo').first.bounding_box()['height']>40;src=photo.locator('.gallery-photo').first.bounding_box();target=files.bounding_box();page.mouse.move(src['x']+15,src['y']+15);page.mouse.down();page.mouse.move(target['x']+50,target['y']+30,steps=16);page.mouse.up();page.wait_for_timeout(200);media=page.evaluate('window.productionBridge.read().projects.find(p=>p.id==="a").customTabs[0].modules');assert len(media[0]['files'])==3 and any(f['id']==fid for f in media[1]['files']),media
    # Generic HTTPS link name editing + sandboxed embed switch.
    link=page.locator('[data-media-module=link]');link.get_by_role('button',name='주소 수정',exact=True).click();link.get_by_label('링크 이름',exact=True).fill('변경된 링크');link.get_by_role('button',name='저장',exact=True).click();expect(link.locator('.link-bookmark strong')).to_have_text('변경된 링크');link.locator('.link-bookmark').click(button='right');page.get_by_role('menuitem',name='임베드로 보기',exact=True).click();assert link.locator('iframe').get_attribute('sandbox')=='allow-scripts allow-forms allow-presentation';assert link.locator('iframe').get_attribute('referrerpolicy')=='no-referrer'
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/home/tasks');page.reload();back=page.get_by_role('button',name='뒤로가기',exact=True);back.wait_for();assert back.bounding_box()['x']<page.locator('.admin-home').bounding_box()['x']+60
    page.evaluate('openResourceLibrary()');page.locator('.resource-database').wait_for();page.get_by_role('button',name='목록',exact=True).click();page.locator('.resource-table').wait_for();assert page.locator('.resource-table .resource-card').count()>0;assert page.locator('.resource-table .resource-row-actions').evaluate_all('rows=>rows.every(r=>[...r.children].every(c=>c.getBoundingClientRect().right<=r.getBoundingClientRect().right+2))')
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.set_viewport_size({'width':1400,'height':1000});assert page.locator('#sidebar').evaluate('e=>getComputedStyle(e).overflowX')=='hidden';page.locator('#sidebar').evaluate('e=>e.scrollLeft=100');page.wait_for_timeout(80);assert page.locator('#sidebar').evaluate('e=>e.scrollLeft')==0;assert not errors,errors
    page.evaluate('window.flushDocumentModules()');page.screenshot(path='/workspace/artifacts/production-workflow-'+mode+'-0.1.12.png',full_page=False);print('PASS '+mode+': schedule attachments/properties/templates/sources, holidays/today/resize, event upgrade/create, overview assignment/colors, roster Shift/team-all, local document embeds, cross-module photo transfer, named sandboxed links',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);print(nas.stderr.read().decode()[-4000:]);httpd.shutdown()
