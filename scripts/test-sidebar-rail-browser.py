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
   document_requests=[];context.on('request',lambda r:document_requests.append(r.url))
   import io,zipfile,json
   page.goto('https://pages.test:9443/production/')
   page.wait_for_function('!!window.productionBridge && typeof window.mountProduction === "function"')
   nav=page.locator('.workspace-rail .sidebar-main-spaces');expect(nav).to_be_visible()
   assert nav.locator('[data-main-space]').evaluate_all('(buttons)=>buttons.map(b=>b.dataset.mainSpace)')==['home','references','documents','settings']
   expect(nav.locator('[data-main-space=home]')).to_have_attribute('aria-label','프로덕션')
   home_markup=nav.locator('[data-main-space=home] svg').inner_html()
   expect(nav.locator('[data-main-space=documents]')).to_be_disabled()
   expect(page.get_by_role('heading',name='홈',exact=True)).to_be_visible()
   expect(page.locator('.breadcrumbs')).to_have_text('프로덕션/홈')
   expect(page.locator('#sidebar .sidebar-home-link')).to_be_visible()
   assert page.locator('#menu').count()==0
   page.wait_for_function('document.body.classList.contains("workspace-layout-ready")')
   geometry=page.evaluate("""()=>{const side=document.querySelector('#sidebar'),box=side.getBoundingClientRect(),bar=document.querySelector('.topbar').getBoundingClientRect(),main=document.querySelector('.layout').getBoundingClientRect();return {top:box.top,height:box.height,right:box.right,title:bar.left,main:main.left,position:getComputedStyle(side).position,radius:getComputedStyle(side).borderTopLeftRadius,shadow:getComputedStyle(side).boxShadow}}""")
   assert geometry['top']==0 and geometry['height']==1000 and geometry['position']=='fixed' and geometry['radius']=='0px' and geometry['shadow']=='none',geometry
   assert abs(geometry['right']-geometry['title'])<1 and abs(geometry['title']-geometry['main'])<1,geometry
   fixture=page.evaluate("""async()=>{const id=crypto.randomUUID();state.productions.push({id,name:'이름 변경 프로젝트',status:'진행 중',tasks:[],schedules:[],customTabs:[],memberIds:[]});changed();await flushWorkspace();await openProduction(undefined,'overview',false,id);return id}""")
   title_button=page.get_by_role('button',name='페이지 제목 편집',exact=True)
   expect(title_button).to_be_visible();title_button.click()
   title_input=page.get_by_role('textbox',name='페이지 제목',exact=True)
   title_input.fill('취소할 이름');title_input.press('Escape')
   expect(page.get_by_role('heading',name='이름 변경 프로젝트',exact=True)).to_be_visible()
   title_button.click();title_input.fill('정리한 프로젝트');title_input.press('Enter');expect(title_input).to_be_hidden()
   expect(page.get_by_role('heading',name='정리한 프로젝트',exact=True)).to_be_visible()
   assert page.evaluate("async id=>(await fetch('/production/api/data').then(r=>r.json())).productions.find(p=>p.id===id).name",fixture)=='정리한 프로젝트'
   expect(page.locator('.breadcrumbs')).to_have_text('프로덕션/정리한 프로젝트')
   page.screenshot(path='/tmp/production-project-title.png',full_page=True)
   # Sidebar actions share the title editor, completion review and deletion confirmation.
   page.evaluate("id=>{state.productions.find(p=>p.id===id).iconColor='#8b5cf6';syncSidebar()}",fixture)
   side=page.locator('.sidebar-project[data-production-id="'+fixture+'"]');assert side.evaluate('e=>getComputedStyle(e).color')!='rgb(139, 92, 246)';assert side.locator('svg').evaluate('e=>getComputedStyle(e).color')=='rgb(139, 92, 246)';assert side.locator('svg').get_attribute('fill')=='currentColor'
   side.click(button='right');menu=page.get_by_role('menu',name='항목 메뉴',exact=True);expect(menu).to_be_visible();assert menu.get_by_role('menuitem').count()==3
   menu.get_by_role('menuitem',name='이름 변경',exact=True).click();expect(title_input).to_be_visible();title_input.press('Escape')
   side.click(button='right');page.get_by_role('menuitem',name='아카이브',exact=True).click();review=page.get_by_role('dialog',name='프로젝트 완료 점검',exact=True);expect(review).to_be_visible();review.get_by_role('button',name='취소',exact=True).click()
   side.click(button='right');page.get_by_role('menuitem',name='삭제',exact=True).click();deletion=page.get_by_role('dialog',name='삭제',exact=True);expect(deletion).to_be_visible();deletion.get_by_role('button',name='삭제 닫기',exact=True).click()

   page.evaluate("""()=>{window.savedTitleFetch=window.fetch;window.injectedTitleFailure=false;window.fetch=async(input,options)=>{if(String(input).endsWith('/api/data')&&options?.method==='PUT'&&!window.injectedTitleFailure){window.injectedTitleFailure=true;return new Response(JSON.stringify({error:'검증용 저장 실패'}),{status:503,headers:{'Content-Type':'application/json'}})}return window.savedTitleFetch(input,options)}}""")
   title_button.click();title_input.fill('저장 실패 제목');title_input.press('Enter')
   page.wait_for_function('window.injectedTitleFailure===true')
   expect(title_input).to_be_enabled();title_input.press('Escape')
   expect(page.get_by_role('heading',name='정리한 프로젝트',exact=True)).to_be_visible()
   page.evaluate('window.fetch=window.savedTitleFetch;delete window.savedTitleFetch')
   page.evaluate('flushWorkspace()')
   assert page.evaluate("async id=>(await fetch('/production/api/data').then(r=>r.json())).productions.find(p=>p.id===id).name",fixture)=='정리한 프로젝트'
   page.get_by_role('button',name='모듈 추가',exact=True).click()
   right_panel=page.locator('.hub-sidebar');expect(right_panel).to_be_visible()
   assert right_panel.evaluate('(p)=>getComputedStyle(p).position')=='fixed'
   assert right_panel.evaluate('(p)=>getComputedStyle(p).borderTopLeftRadius')=='18px'
   right_panel.get_by_role('button',name='Hub 닫기',exact=True).click()

   # Existing completion and permission rules keep the shared title editor read-only.
   page.evaluate("id=>{state.productions.find(p=>p.id===id).status='완료';window.refreshAppPageHeading()}",fixture)
   expect(title_button).to_be_hidden()
   page.evaluate("id=>{state.productions.find(p=>p.id===id).status='진행 중';window.refreshAppPageHeading()}",fixture)
   expect(title_button).to_be_visible()
   group=page.evaluate("""async parent=>{const p=makeProject('업무 그룹');p.productionId=parent;state.projects.push(p);changed();await flushWorkspace();await openProduction(p.id);return p.id}""",fixture)
   expect(title_button).to_be_visible();title_button.click();title_input.fill('변경한 업무 그룹')
   # Leaving a page commits the same title input before navigation.
   page.locator('#sidebar .sidebar-home-link').click()
   expect(page.get_by_role('heading',name='홈',exact=True)).to_be_visible()
   assert page.evaluate("async id=>(await fetch('/production/api/data').then(r=>r.json())).projects.find(p=>p.id===id).title",group)=='변경한 업무 그룹'
   reference=page.evaluate("""async()=>{sourceSection='references';await openRefs();const row=await referenceBridge.create({title:'자료 이름',recordType:'reference'});await openReferenceModules(row);return row.id}""")
   expect(title_button).to_be_visible();title_button.click();title_input.fill('정리한 자료');title_input.press('Enter');expect(title_input).to_be_hidden()
   expect(page.get_by_role('heading',name='정리한 자료',exact=True)).to_be_visible()
   assert page.evaluate("async id=>(await fetch('/production/api/references').then(r=>r.json())).find(r=>r.id===id).title",reference)=='정리한 자료'
   assert page.locator('.reference-title').count()==0
   assert nav.locator('[data-main-space=home] svg').inner_html()==home_markup
   member=page.evaluate("async()=>{await openDatabase('members');await databaseForm();return databasePanel.dataset.searchOwnerId}")
   expect(title_button).to_be_visible();title_button.click();title_input.fill('공통 이름 멤버');title_input.press('Enter');expect(title_input).to_be_hidden()
   expect(page.get_by_role('heading',name='공통 이름 멤버',exact=True)).to_be_visible()
   assert page.evaluate("async id=>(await fetch('/production/api/database/members').then(r=>r.json())).find(r=>r.id===id).name",member)=='공통 이름 멤버'

   page.evaluate("openDatabase('members')");expect(page.locator('#member-total-count')).to_have_text('1')
   order=page.locator('.member-list-toolbar').evaluate("e=>['.member-list-label','.member-total-count','.member-sort-control','#db-add'].map(s=>e.querySelector(s).getBoundingClientRect().x)");assert order==sorted(order),order
   assert page.locator('#db-add').inner_text().strip()=='멤버';assert page.locator('#app-page-title .app-page-icon').is_hidden()
   assert page.locator('.sidebar-reference-area .sidebar-source-sections').evaluate('e=>getComputedStyle(e).borderBottomWidth')=='0px'
   assert page.locator('.sidebar-reference-area>.materials-divider').count()==1
   trash=page.locator('.sidebar-materials-trash');assert trash.evaluate('e=>parseFloat(getComputedStyle(e).marginBottom)')>=12
   page.evaluate("openProduction(undefined,'dashboard')")
   expect(page.get_by_role('heading',name='홈',exact=True)).to_be_visible()
   page.evaluate("()=>{const fixture=document.createElement('div');fixture.style.height='2400px';fixture.dataset.scrollFixture='';document.querySelector('.canvas').append(fixture);window.scrollTo(0,500)}")
   page.wait_for_function('scrollY>400')
   assert page.locator('#sidebar').bounding_box()['y']==0 and page.locator('#sidebar').bounding_box()['height']==1000
   assert page.locator('.topbar').bounding_box()['y']==0
   # Match the content lane and sidebar edge at intermediate animation frames.
   motion=page.evaluate("""async()=>{document.querySelector('.workspace-rail [data-main-space=home]').click();const samples=[];for(let i=0;i<24;i++){await new Promise(requestAnimationFrame);const s=document.querySelector('#sidebar').getBoundingClientRect(),b=document.querySelector('.topbar').getBoundingClientRect(),m=document.querySelector('.layout').getBoundingClientRect();samples.push({side:s.right,bar:b.left,main:m.left})}return samples}""")
   assert all(abs(s['bar']-s['main'])<1.5 and abs(s['side']-s['bar'])<1.5 for s in motion),motion
   assert motion[-1]['bar']==48 and any(50<s['bar']<300 for s in motion),motion
   expect(page.locator('.sidebar-resize')).to_have_attribute('aria-disabled','true')
   width=page.evaluate("localStorage.getItem('pn-sidebar-width')")
   page.locator('.sidebar-resize').dispatch_event('keydown',{'key':'ArrowRight'})
   page.locator('.sidebar-resize').dispatch_event('pointerdown',{'clientX':100,'pointerId':1})
   page.locator('.sidebar-resize').dispatch_event('pointermove',{'clientX':200,'pointerId':1})
   assert page.evaluate("localStorage.getItem('pn-sidebar-width')")==width
   nav.locator('[data-main-space=home]').click()
   page.wait_for_function('Math.abs(document.querySelector(".topbar").getBoundingClientRect().left-(48+Number(localStorage.getItem("pn-sidebar-width"))))<1')
   expect(page.locator('.sidebar-resize')).to_have_attribute('aria-disabled','false')
   page.locator('.sidebar-resize').focus();page.keyboard.press('ArrowRight')
   assert int(page.evaluate("localStorage.getItem('pn-sidebar-width')"))==int(width)+10
   page.evaluate('scrollTo(0,0)')
   page.locator('[data-scroll-fixture]').evaluate('e=>e.remove()')
   nav.locator('[data-main-space=settings]').click();page.locator('#sidebar [data-settings-category=general]').click()
   expect(page.locator('.app-version-row')).to_contain_text('v'+(root/'VERSION').read_text().strip())
   page.screenshot(path='/tmp/production-sidebar-settings.png',full_page=True)
   nav.locator('[data-main-space=home]').click()
   count=page.evaluate("fetch('/production/api/database/resources').then(r=>r.json()).then(r=>r.length)")
   assert page.evaluate('window.showInlineDocument()') is False
   assert page.evaluate('window.openInlineDocument(location.href)') is False
   assert '준비 중' in page.evaluate("window.openBlankDocument(null).then(()=>'',e=>e.message)")
   assert page.evaluate("fetch('/production/api/database/resources').then(r=>r.json()).then(r=>r.length)")==count
   assert page.locator('#inline-document-panel iframe').count()==0
   file_id=page.evaluate("""async()=>{const id=crypto.randomUUID();const r=await fetch('/production/api/ref-files/'+id+'?name=paused.txt',{method:'PUT',headers:{'Content-Type':'text/plain'},body:'preserved document bytes'});if(!r.ok)throw Error('fixture');return id}""")
   base='https://pages.test:9443/production/'
   page.goto(base+'?document='+file_id+'&name=paused.txt')
   page.wait_for_url(re.compile(r'#/home$'))
   expect(page.get_by_role('heading',name='홈',exact=True)).to_be_visible()
   assert page.evaluate("id=>fetch('/production/api/ref-files/'+id).then(r=>r.text())",file_id)=='preserved document bytes'
   assert not any('/document-app' in r or '/document-style' in r for r in document_requests),document_requests
   page.screenshot(path='/tmp/production-sidebar-paused.png',full_page=True)
   page.set_viewport_size({'width':390,'height':844})
   mobile=page.locator('.mobile-bottom-nav');expect(mobile.locator('[data-main-space=documents]')).to_be_disabled()
   mobile.locator('[data-main-space=home]').click()
   expect(page.locator('#sidebar')).to_have_class(re.compile('open'))
   page.wait_for_function('getComputedStyle(document.querySelector(".topbar")).transform.includes("260")')
   assert page.locator('#sidebar').bounding_box()['y']==0 and page.locator('#sidebar').bounding_box()['height']==844,page.locator('#sidebar').bounding_box()
   transforms=page.evaluate('[".topbar",".layout"].map(s=>getComputedStyle(document.querySelector(s)).transform)');assert transforms[0]==transforms[1],transforms
   mobile.locator('[data-main-space=home]').click()
   page.wait_for_function('!document.querySelector("#sidebar").classList.contains("open")')
   page.wait_for_function('getComputedStyle(document.querySelector(".topbar")).transform==="matrix(1, 0, 0, 1, 0, 0)"||getComputedStyle(document.querySelector(".topbar")).transform==="none"')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.evaluate('[document.documentElement.scrollWidth,innerWidth]')
   page.screenshot(path='/tmp/production-sidebar-mobile.png',full_page=True)
   assert not errors,errors
   print('PASS workspace: namespace/home paths, fixed full-height plain sidebar, synchronized title/page/sidebar motion, scroll isolation, resize guards, shared project/group/reference title persistence/cancel/blur and completion guard, paused editor + intact originals/direct URL guard, mobile layout',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
