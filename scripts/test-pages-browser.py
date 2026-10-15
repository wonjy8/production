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
   browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP pages.test 127.0.0.1, MAP nas.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
   context=browser.new_context();context.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}");page=context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(e.stack))
   page.goto('https://pages.test:9443/production/http%3A%2F%2Fnas.test%3A9444')
   page.wait_for_function('document.body.textContent.includes("HTTPS")')
   assert page.locator('#connection-form').count()==0
   page.goto('https://pages.test:9443/production/nas.test:9444')
   page.locator('#account-form [name=email]').fill('admin@example.com')
   page.locator('#account-form [name=password]').fill('StrongPassword2026!')
   page.locator('#account-form button').click()
   page.wait_for_function('window.appAccount?.role === "superadmin"')
   page.wait_for_function('typeof window.mountProduction === "function"')
   assert page.locator('[data-main-space="references"]').get_attribute('aria-label')=='자료'
   page.wait_for_function('window.activeWorkspace === "home"')
   assert page.evaluate('window.appWorkspaces.map(w=>w.label)')==['홈','자료','DB','설정']
   assert page.locator('.sidebar-main-spaces [data-main-space]').count()==4
   assert page.locator('.breadcrumbs [data-location=home]').inner_text()=='홈'
   assert page.locator('.topbar').evaluate('(el)=>getComputedStyle(el).borderBottomWidth')=='0px'
   page.locator('.sidebar-settings').click()
   assert page.locator('[data-settings-category=connections]').count()==0
   page.locator('[data-settings-category=account]').click()
   assert page.get_by_role('heading',name='계정',exact=True).is_visible()
   assert page.locator('#settings-logout').count()==0
   assert page.get_by_role('button',name='회원탈퇴',exact=True).is_disabled()
   page.get_by_role('button',name='비밀번호 변경',exact=True).click()
   assert page.get_by_label('현재 비밀번호',exact=True).is_visible()
   page.get_by_role('button',name='계정으로',exact=True).click()
   page.get_by_role('button',name='연락처 변경',exact=True).click()
   page.get_by_label('연락처',exact=True).fill('010-0000-0000')
   page.locator('.account-profile').get_by_role('button',name='변경',exact=True).click()
   page.locator('.account-menu').wait_for()
   assert '010-0000-0000' in page.locator('.account-menu').inner_text()
   page.evaluate('async()=>{await new Promise((resolve,reject)=>{const channel=new MessageChannel();channel.port1.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data.value);navigator.serviceWorker.controller.postMessage({type:"alias:set",alias:"studio"},[channel.port2])});const u=new URL(location.href);u.pathname="/production/@studio";history.replaceState(null,"",u)}')
   assert 'nas.test' not in page.url
   page.reload()
   page.wait_for_function('window.appAccount?.role==="superadmin"')
   assert page.evaluate("async()=>(await fetch('/production/api/data')).status")==200
   page.locator('[data-main-space=home]').click()
   page.wait_for_function('location.hash==="#/home"')

   page.wait_for_function('location.hash==="#/home"')
   page.locator('[data-main-space=references]').click()
   page.wait_for_function('location.hash==="#/materials/references"')
   page.locator('.sidebar-source-sections button[data-source-section=sources]').click()
   page.wait_for_function('location.hash==="#/materials/sources"')
   source_url=page.url
   assert '/production/@studio' in source_url
   page.go_back()
   page.wait_for_function('window.activeWorkspace==="references" && location.hash==="#/materials/references"')
   page.go_back()
   page.wait_for_function('window.activeWorkspace==="home"')
   page.go_forward()
   page.wait_for_function('window.activeWorkspace==="references"')
   page.go_forward()
   page.wait_for_function('location.hash==="#/materials/sources"')
   page.reload()
   page.wait_for_function('document.querySelector(".breadcrumbs")?.textContent.includes("소스")')
   assert page.url==source_url
   page.goto('https://pages.test:9443/production/@studio?view=references&section=sources')
   page.wait_for_function('location.hash==="#/materials/sources" && !location.search.includes("view=")')

   page.locator('[data-main-space=home]').click()
   page.wait_for_function('location.hash==="#/home"')

   page.locator('#share').click();fresh_drawer=page.get_by_role('dialog',name='공유',exact=True)
   fresh_drawer.wait_for();assert fresh_drawer.bounding_box()['x']>700
   assert fresh_drawer.get_by_role('button',name='링크 복사',exact=True).is_visible()
   assert fresh_drawer.get_by_role('button',name='링크 복사',exact=True).evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='0px'
   assert fresh_drawer.get_by_role('button',name='공유 닫기',exact=True).evaluate('(el)=>getComputedStyle(el).outlineStyle')=='none'
   page.get_by_role('button',name='공유 ↗',exact=True).click();fresh_drawer.wait_for(state='hidden')
   page.get_by_role('button',name='검색',exact=True).click();page.locator('#app-search').wait_for(state='visible')
   assert page.locator('#app-search').bounding_box()['x']>700
   page.get_by_role('button',name='검색',exact=True).click();page.locator('#app-search').wait_for(state='hidden')
   page.keyboard.press('Control+k');page.locator('#app-search').wait_for(state='visible')
   assert page.get_by_role('button',name='검색',exact=True).evaluate('(el)=>getComputedStyle(el).outlineStyle')=='none'
   page.keyboard.press('Control+k');page.locator('#app-search').wait_for(state='hidden')
   page.locator('[data-main-space=references]').click()
   page.wait_for_function('window.activeWorkspace === "references"')
   assert page.locator('.sidebar-source-sections button[data-source-section]').all_text_contents()==['레퍼런스','소스','포트폴리오','문서','자료 DB']
   for ident,label in [('references','레퍼런스'),('sources','소스'),('portfolios','포트폴리오')]:
    page.locator('.sidebar-source-sections button[data-source-section='+ident+']').click()
    page.wait_for_function('document.querySelector(".breadcrumbs").textContent.includes('+repr(label)+')')
    assert page.locator('.breadcrumbs button').all_text_contents()==['자료',label]
   page.get_by_role('button',name='갤러리 보기',exact=True).click()
   page.locator('.source-gallery').wait_for(state='visible')
   assert page.evaluate('window.activeWorkspace')=='references'
   assert page.locator('.breadcrumbs button').all_text_contents()==['자료','포트폴리오','갤러리']
   page.locator('.sidebar-source-sections button[data-source-section=references]').click()
   page.locator('[data-main-space=database]').click()
   page.wait_for_function('window.activeWorkspace === "database"')
   assert page.locator('[data-db-scope]').count()==3
   page.locator('.member-select-row').first.wait_for()
   assert page.locator('#member-import').count()==0
   page.locator('#db-add').click()
   page.get_by_role('menuitem',name='일괄 추가',exact=True).wait_for()
   page.keyboard.press('Escape')
   sort_select=page.get_by_label('멤버 정렬',exact=True)
   sort_select.click()
   page.locator('.control-dropdown [role=option][aria-selected=true]').click()
   assert sort_select.get_attribute('data-sort-direction')=='desc'
   sort_select.click()
   assert page.locator('.dropdown-sort-direction').inner_text()=='Z→A'
   page.locator('.control-dropdown [role=option][aria-selected=true]').click()
   assert sort_select.get_attribute('data-sort-direction')=='asc'
   row_before=page.locator('.member-select-row').first.bounding_box()
   page.locator('#member-select-toggle').click()
   row_after=page.locator('.member-select-row').first.bounding_box()
   assert abs(row_before['x']-row_after['x'])<1 and abs(row_before['y']-row_after['y'])<1
   assert page.locator('[data-member-select]').count()==0
   page.locator('.member-select-row').first.locator('[data-db-id]').click()
   assert page.locator('.member-select-row.selected').count()==1
   page.locator('#member-select-clear').click()

   for ident,label in [('members','멤버·장비'),('rental-shops','대여처'),('locations','장소')]:
    page.locator('[data-db-scope='+ident+']').click()
    page.wait_for_function('document.querySelector(".breadcrumbs").textContent.includes('+repr(label)+')')
    assert page.locator('.breadcrumbs button').all_text_contents()==['DB',label]
   page.locator('[data-main-space=home]').click()
   page.wait_for_function('window.activeWorkspace === "home"')
   assert page.locator('.breadcrumbs button').all_text_contents()==['홈']
   page.locator('[data-main-space=references]').click()
   page.locator('.sidebar-source-sections button[data-source-section=references]').click()
   result=page.evaluate('''async()=>{const r=await fetch('/production/api/data');return {status:r.status,data:await r.json()}}''')
   assert result['status']==200,result
   local_tab=context.new_page();local_tab.goto('https://pages.test:9443/production/')
   local_tab.wait_for_function('window.appAccount?.localMode === true')
   assert local_tab.locator('#connection-form').count()==0
   assert local_tab.evaluate("async()=>fetch('/production/api/storage').then(r=>r.json()).then(x=>x.mode)")=='browser'
   assert page.evaluate("async()=>(await fetch('/production/api/data')).status")==200
   local_tab.close()
   cookies=context.cookies('https://nas.test:9444')
   assert any(c['name']=='__Host-pn-pages' and c['httpOnly'] and c['secure'] and c.get('partitionKey') for c in cookies), 'Missing partitioned session cookie'
   page.locator('[data-main-space=references]').click()
   page.locator('#refadd').click()
   page.wait_for_function('!!window.activeReferenceId')
   assert page.locator('.breadcrumbs button').all_text_contents()[:2]==['자료','레퍼런스']
   page.wait_for_function('location.hash.startsWith("#/materials/references/") && location.hash.includes("/tabs/") && !!window.activeReferenceId')
   reference_url=page.url
   page.go_back()
   page.wait_for_function('!window.activeReferenceId && window.activeWorkspace==="references"')
   page.go_forward()
   page.wait_for_function('!!window.activeReferenceId')
   page.reload()
   page.wait_for_function('!!window.activeReferenceId && !!window.activeReferenceTabId')
   assert page.url==reference_url
   title_rect=page.get_by_label('레퍼런스 제목',exact=True).bounding_box()
   delete_rect=page.get_by_role('button',name='레퍼런스 삭제',exact=True).bounding_box()
   assert abs(title_rect['y']+title_rect['height']/2-delete_rect['y']-delete_rect['height']/2)<2
   assert page.get_by_role('button',name='레퍼런스 삭제',exact=True).evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='0px'


   canvas_width=page.locator('.canvas').bounding_box()['width']
   page.locator('.custom-module-tab [data-module-add]').click()
   page.wait_for_function("document.body.classList.contains('hub-visible')")
   page.wait_for_timeout(250)
   assert page.locator('.canvas').bounding_box()['width']<canvas_width-250
   assert page.locator('.hub-sidebar').evaluate('(el)=>getComputedStyle(el).boxShadow')=='none'
   page.get_by_role('button',name='기본',exact=True).click()
   card=page.get_by_role('button',name=re.compile('^체크리스트'))
   assert card.locator('strong').inner_text()=='체크리스트'
   assert card.locator('.hub-preview').count()==0
   assert page.locator('.hub-switch [role=tab]').all_text_contents()==['모듈','템플릿','불러오기']
   page.get_by_role('tab',name='불러오기',exact=True).click()
   page.locator('.hub-import-content .module-browser').wait_for()
   page.get_by_role('tab',name='모듈',exact=True).click()
   assert page.get_by_role('button',name='자동 정렬',exact=True).count()==0
   assert page.locator('.module-toolbar').get_by_role('button',name='불러오기',exact=True).count()==0

   assert abs(page.locator('.hub-sidebar').bounding_box()['y']-page.locator('#sidebar').bounding_box()['y'])<2
   assert abs(page.locator('.hub-sidebar').bounding_box()['height']-page.locator('#sidebar').bounding_box()['height'])<2
   page.get_by_role('button',name='Hub 검색 열기',exact=True).click()
   page.get_by_label('Hub 검색',exact=True).fill('체크리스트')
   assert page.get_by_label('Hub 검색',exact=True).evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='0px'
   assert page.locator('.hub-search').evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='1px'
   assert abs(page.locator('.hub-search').bounding_box()['height']-page.get_by_role('button',name='Hub 검색 닫기',exact=True).bounding_box()['height'])<2

   assert not page.locator('.hub-categories').count()
   page.get_by_role('button',name='Hub 검색 닫기',exact=True).click()
   if os.environ.get('HUB_SCREENSHOT'): page.screenshot(path=os.environ['HUB_SCREENSHOT'],full_page=True)
   card.click()
   page.get_by_role('button',name='항목 추가').wait_for()
   page.locator('.custom-module-tab [data-module-add]').click()
   page.get_by_role('button',name='기본',exact=True).click()
   page.get_by_role('button',name=re.compile('^메모')).drag_to(page.locator('.snap-canvas'),target_position={'x':20,'y':20})
   assert page.locator('.workspace-module').count()==2
   remove=page.locator('.module-outside-title .inline-remove .compact-remove').first
   remove.click();assert page.get_by_role('button',name='모듈 삭제 확인',exact=True).is_visible()
   assert page.locator('dialog[open]').count()==0
   assert page.get_by_role('button',name='모듈 삭제 확인',exact=True).bounding_box()['height']==24
   confirmation=page.get_by_role('button',name='모듈 삭제 확인',exact=True)
   assert confirmation.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
   assert confirmation.evaluate('(el)=>getComputedStyle(el.closest(".inline-remove")).overflow')=='visible'
   assert confirmation.bounding_box()['x']>=0

   page.locator('.topbar').click(position={'x':5,'y':5});assert page.get_by_role('button',name='모듈 삭제 확인',exact=True).count()==0
   page.locator('.module-outside-title .inline-remove .compact-remove').first.click()
   page.evaluate('window.dispatchEvent(new Event("scroll"))')
   page.get_by_role('button',name='모듈 삭제 확인',exact=True).wait_for(state='detached')
   page.locator('.custom-module-tab [data-module-add]').click()
   page.get_by_role('button',name='기본',exact=True).click()
   page.get_by_role('button',name=re.compile('^구분선')).click()
   line=page.get_by_role('separator',name='구분선 이동',exact=True)
   line.wait_for();assert line.evaluate('(el)=>Math.abs(el.getBoundingClientRect().width-el.closest(".snap-canvas").getBoundingClientRect().width)')<2
   assert page.locator('.divider-box .fluid-resize-edge').count()==0
   line.evaluate('(el)=>el.scrollIntoView({block:"center",behavior:"instant"})')
   page.wait_for_timeout(200)
   line.hover();line.get_by_role('button',name='내용 제거',exact=True).click()
   line.get_by_role('button',name='모듈 삭제 확인',exact=True).click()
   assert page.get_by_role('separator',name='구분선 이동',exact=True).count()==0
   page.get_by_role('button',name='화면 나누기').click()
   page.get_by_role('button',name='기본',exact=True).click()
   page.get_by_role('button',name=re.compile('^빈 탭')).click()
   assert page.locator('.workspace-module').count()==0
   page.locator('.custom-module-tab [data-module-add]').click()
   page.get_by_role('button',name='학교',exact=True).click()
   page.get_by_role('button',name=re.compile('학점 계산기')).click()
   calculator=page.locator('.grade-calculator')
   calculator.get_by_role('button',name='과목 추가',exact=True).click()
   calculator.get_by_label('과목 1 이름',exact=True).fill('전공')
   calculator.get_by_label('과목 1 성적',exact=True).select_option('A+')
   calculator.get_by_role('button',name='과목 추가',exact=True).click()
   calculator.get_by_label('과목 2 학점',exact=True).fill('1')
   calculator.get_by_label('과목 2 성적',exact=True).select_option('F')
   assert '3.38 / 4.5' in calculator.inner_text()
   assert not page.evaluate("document.body.classList.contains('hub-visible')")
   page.route('https://www.figma.com/**',lambda route:route.fulfill(status=200,content_type='text/html',body='<p>Figma test frame</p>'))
   page.locator('.custom-module-tab [data-module-add]').click()
   page.get_by_role('button',name='미디어',exact=True).click()
   page.get_by_role('button',name=re.compile('Figma 임베드')).click()
   page.get_by_label('Figma 임베드 코드 또는 링크',exact=True).fill('https://www.figma.com/design/Ab123/Example')
   assert page.get_by_label('이 주소를 다음 Figma 모듈에서도 사용',exact=True).count()==0
   page.locator('dialog[open]').get_by_role('button',name='추가',exact=True).click()
   assert page.locator('.embed-frame').count()==1
   page.locator('.custom-module-tab [data-module-add]').click()
   page.get_by_role('button',name='미디어',exact=True).click()
   page.get_by_role('button',name=re.compile('Figma 임베드')).click()
   assert page.get_by_label('Figma 임베드 코드 또는 링크',exact=True).input_value()==''
   page.keyboard.press('Escape')
   figma_embed='https://embed.figma.com/design/EmbedExample123/%EB%94%94%EC%9E%90%EC%9D%B8?embed-host=share'
   page.route('https://embed.figma.com/**',lambda route:route.fulfill(body='<p>Figma embed fixture</p>',content_type='text/html'))
   page.locator('.custom-module-tab [data-module-add]').click()
   page.get_by_role('button',name='미디어',exact=True).click()
   page.get_by_role('button',name=re.compile('Figma 임베드')).click()
   page.get_by_label('Figma 임베드 코드 또는 링크',exact=True).fill('<iframe style="border: 1px solid rgba(0, 0, 0, 0.1);" width="800" height="450" src="'+figma_embed+'" allowfullscreen></iframe>')
   page.locator('dialog').get_by_role('button',name='추가',exact=True).click()
   figma_module=page.locator('.workspace-module').filter(has=page.locator('iframe.embed-frame')).last
   figma_module.locator('iframe.embed-frame').wait_for()
   assert figma_module.locator('iframe.embed-frame').get_attribute('src')==figma_embed
   assert figma_module.locator('.figma-bookmark strong').inner_text()=='디자인'
   assert figma_module.locator('.figma-bookmark small').count()==0
   assert figma_module.locator('.figma-module-actions').count()==0
   assert figma_module.locator('.figma-bookmark').bounding_box()['height']<60

   figma_module.get_by_role('button',name='임베드 수정',exact=True).click()
   page.get_by_label('임베드 코드 또는 링크 수정',exact=True).fill('<iframe src="'+figma_embed+'&amp;node-id=1-2"></iframe>')
   figma_module.get_by_label('Figma 파일 제목',exact=True).fill('로고 디자인')
   figma_module.get_by_role('button',name='저장',exact=True).click()
   assert figma_module.locator('iframe.embed-frame').get_attribute('src')==figma_embed+'&node-id=1-2'
   assert figma_module.locator('.figma-bookmark strong').inner_text()=='로고 디자인'
   page.locator('.custom-module-tab [data-module-add]').click()
   page.get_by_role('button',name='기본',exact=True).click()
   assert page.get_by_role('button',name=re.compile('Wordcraft 문서')).count()==0
   page.get_by_role('button',name=re.compile('^메모')).click()
   text_module=page.locator('.workspace-module').filter(has=page.get_by_label('텍스트',exact=True)).last
   text_module_id=text_module.get_attribute('data-module-id')
   text_module.get_by_label('텍스트',exact=True).fill('문서 전환 원문\n두 번째 문단')
   with page.expect_popup() as popup:
    text_module.get_by_role('button',name='문서편집기로 열기 ↗',exact=True).click()
   doc_page=popup.value;doc_page.on('pageerror',lambda e:errors.append(e.stack))
   doc_page.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   assert '문서 전환 원문' in doc_page.get_by_role('textbox',name='문서 본문',exact=True).inner_text()
   assert not doc_page.locator('.topbar').is_visible()
   assert doc_page.locator('.document-toolbar').is_visible()
   file_id=__import__('urllib.parse',fromlist=['urlparse']).parse_qs(__import__('urllib.parse',fromlist=['urlparse']).urlparse(doc_page.url).query)['document'][0]
   records=page.evaluate("async()=>fetch('/production/api/references').then(r=>r.json())")
   assert any(m.get('id')==text_module_id and m.get('kind')=='file' and any(f['id']==file_id for f in m.get('files',[])) and 'text' not in m for r in records for t in r.get('tabs',[]) for m in t.get('modules',[]))
   body=doc_page.get_by_role('textbox',name='문서 본문',exact=True)
   body.click();doc_page.keyboard.press('Control+End');doc_page.keyboard.press('Enter')
   end_selection=body.evaluate('(el)=>el.editor.state.selection.from')
   assert end_selection==body.evaluate('(el)=>el.editor.state.doc.content.size-1')
   doc_page.get_by_role('button',name='굵게',exact=True).click()
   assert body.evaluate('(el)=>el.editor.state.selection.from')==end_selection, 'Toolbar must preserve the writing cursor'
   with doc_page.expect_response(lambda r:'/api/ref-files/'+file_id in r.url and r.request.method=='PUT') as saved:
    doc_page.keyboard.type('Autosaved DOCX paragraph',delay=20)
   assert saved.value.status==200
   doc_page.wait_for_function("document.querySelector('.document-heading [role=status]').textContent === '모든 변경사항 저장됨'")
   def document_bytes(tab,id):return base64.b64decode(tab.evaluate("async id=>btoa(String.fromCharCode(...new Uint8Array(await (await fetch('/production/api/ref-files/'+id)).arrayBuffer())))",id))
   content=document_bytes(doc_page,file_id)
   with __import__('zipfile').ZipFile(__import__('io').BytesIO(content)) as document:
    document_xml=document.read('word/document.xml').decode()
    assert '문서 전환 원문' in document_xml and 'Autosaved DOCX paragraph' in document_xml
    assert '<w:b' in document_xml
   doc_page.reload();doc_page.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   assert 'Autosaved DOCX paragraph' in doc_page.get_by_role('textbox',name='문서 본문',exact=True).inner_text()
   conflict_page=context.new_page();conflict_page.goto(doc_page.url);conflict_page.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   doc_page.get_by_role('textbox',name='문서 본문',exact=True).click();doc_page.keyboard.press('Control+End')
   with doc_page.expect_response(lambda r:'/api/ref-files/'+file_id in r.url and r.request.method=='PUT') as saved:
    doc_page.keyboard.type(' Latest owner edit')
   assert saved.value.status==200
   conflict_page.get_by_role('textbox',name='문서 본문',exact=True).click();conflict_page.keyboard.press('Control+End')
   conflict_page.keyboard.type(' Stale overwrite')
   conflict_page.get_by_role('alert').wait_for()
   assert '자동저장을 중단' in conflict_page.get_by_role('alert').inner_text()
   with __import__('zipfile').ZipFile(__import__('io').BytesIO(document_bytes(doc_page,file_id))) as document:
    document_xml=document.read('word/document.xml').decode()
    assert 'Latest owner edit' in document_xml and 'Stale overwrite' not in document_xml
   conflict_page.close()
   doc_page.set_viewport_size({'width':390,'height':844})
   assert doc_page.locator('.document-sheet').bounding_box()['width']<=390
   doc_page.screenshot(path='/tmp/production-document-mobile.png')
   doc_page.close()
   with page.expect_popup() as reopened:
    page.locator('.file-document-open').first.click()
   reopened_doc=reopened.value;reopened_doc.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   assert 'Latest owner edit' in reopened_doc.get_by_role('textbox',name='문서 본문',exact=True).inner_text()
   reopened_doc.close()
   media=page.evaluate('''async()=>{const id=crypto.randomUUID(),url='/production/api/ref-files/'+id;const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'image/png'},body:bytes});if(!r.ok)throw Error(await r.text());const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL().startsWith('data:image/png');}''')
   assert media
   cdp=context.new_cdp_session(page);cdp.send('ServiceWorker.enable');cdp.send('ServiceWorker.stopAllWorkers')
   page.reload();page.wait_for_function('window.appAccount?.role === "superadmin"')
   page.wait_for_function('!!window.activeReferenceId')
   page.evaluate('''async()=>{const w=window.productionBridge.read();w.productions.push({id:"nas-complete-flow",name:"NAS 완료 검증",status:"진행 중",description:"",tasks:[],customTabs:[],teams:[],memberIds:[]});window.productionBridge.write(w);window.productionRefresh?.();await window.flushDocumentModules()}''')
   page.locator('[data-main-space=home]').click()
   page.locator('[data-production-id=nas-complete-flow]').click()
   nas_overview=page.locator('.production-overview')
   nas_overview.get_by_role('button',name='수정',exact=True).click()
   nas_overview.get_by_label('프로젝트 상태',exact=True).select_option('완료')
   nas_overview.get_by_role('button',name='확인',exact=True).click()
   nas_review=page.get_by_role('dialog',name='프로젝트 완료 점검',exact=True)
   nas_review.get_by_label('결과물 링크',exact=True).fill('https://example.com/final')
   page.evaluate('''()=>{window.lifecycleRealFetch=window.fetch;window.fetch=(url,options)=>String(url).endsWith("/auth/connection")?Promise.resolve(new Response(JSON.stringify({nasReachable:true,authenticationInstalled:true}),{headers:{"Content-Type":"application/json"}})):window.lifecycleRealFetch(url,options)}''')
   nas_review.get_by_role('button',name='완료하고 아카이빙',exact=True).click()
   nas_review.get_by_role('alert').wait_for()
   assert 'NAS 서버 업데이트' in nas_review.get_by_role('alert').inner_text()
   assert page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="nas-complete-flow").status')=='진행 중'
   page.evaluate('window.fetch=window.lifecycleRealFetch;delete window.lifecycleRealFetch')
   nas_review.get_by_role('button',name='완료하고 아카이빙',exact=True).click()
   nas_review.wait_for(state='detached')
   page.reload()
   page.wait_for_function('window.productionSearchContext?.productionId==="nas-complete-flow"')
   assert page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="nas-complete-flow").archives.length')==1
   page.evaluate("async()=>{await fetch('/production/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}")
   assert page.evaluate("async()=>(await fetch('/production/api/data')).status")==401
   assert not errors,errors
   fresh=browser.new_context();fresh.add_init_script("try{if(window===window.top)localStorage.setItem('production-document-editor','basic')}catch{}");fresh_page=fresh.new_page();fresh_page.on('pageerror',lambda e:errors.append(e.stack));fresh_page.goto('https://pages.test:9443/production/')
   fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>fetch('/production/api/storage').then(r=>r.json()).then(x=>x.mode)")=='browser'
   fresh_page.evaluate("()=>{const a=document.createElement('a');a.id='nas-install-download';a.href=new URL('production-nas-install.zip',document.baseURI).href;a.textContent='NAS 설치 파일';document.body.append(a)}")
   with fresh_page.expect_download() as package_download:
    fresh_page.locator('#nas-install-download').click()
   package_download.value.save_as('/tmp/production-nas-download-check.zip')
   with __import__('zipfile').ZipFile('/tmp/production-nas-download-check.zip') as package:
    assert {'Dockerfile','compose.yaml','install.sh','configure.py','README.md'}<=set(package.namelist())
    assert '.env' not in package.namelist()
   local=fresh_page.evaluate('''async()=>{const url='/production/api/data',r=await fetch(url),data=await r.json();data.projects.push({id:crypto.randomUUID(),name:'로컬 프로젝트'});data.productions.push({id:'workspace-project',name:'워크스페이스 프로젝트',tasks:[],customTabs:[],memberIds:[],teams:[]});const saved=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':r.headers.get('ETag')},body:JSON.stringify(data)});if(!saved.ok)throw Error(await saved.text());const id=crypto.randomUUID(),bytes=new Uint8Array([1,2,3,4]);const file=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes});if(!file.ok)throw Error(await file.text());const refId=crypto.randomUUID();const ref=await fetch('/production/api/references/'+refId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:refId,title:'로컬 자료',category:'',tags:[],description:'',blocks:[]})});if(!ref.ok)throw Error(await ref.text());return {id,refId}}''')
   fresh_page.reload();fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/data')).json().then(x=>x.projects.some(p=>p.name==='로컬 프로젝트'))")
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/references')).json().then(x=>x.some(r=>r.title==='로컬 자료'))")
   assert fresh_page.evaluate("async(id)=>[...(new Uint8Array(await(await fetch('/production/api/ref-files/'+id)).arrayBuffer()))].join(',')",local['id'])=='1,2,3,4'
   trash_ids=fresh_page.evaluate("""async()=>{const ids=[crypto.randomUUID(),crypto.randomUUID()];for(const [index,id]of ids.entries()){const r=await fetch('/production/api/references/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,title:'Trash selection '+index,category:'',tags:[],description:'',blocks:[],deleted:true})});if(!r.ok)throw Error('Trash seed failed')}return ids}""")
   fresh_page.locator('[data-main-space=references]').click()
   fresh_page.locator('button[data-source-section=references]').click()
   fresh_page.wait_for_function('(ids)=>refPage&&sourceSection==="references"&&ids.every(id=>refs.some(r=>r.id===id))',arg=trash_ids)
   assert fresh_page.locator('[data-ref-scope=all]').count()==0
   assert fresh_page.locator('[data-reference-archive]').count()==1
   fresh_page.locator('.sidebar-footer [data-ref-scope=trash]').click()
   first_card=fresh_page.locator('[data-ref="'+trash_ids[0]+'"]').locator('..')
   before_card=first_card.bounding_box()
   fresh_page.locator('[data-trash-select]').click()
   fresh_page.locator('[data-ref="'+trash_ids[0]+'"]').click()
   fresh_page.locator('[data-ref="'+trash_ids[1]+'"]').click()
   assert fresh_page.locator('#refgrid .refcard.selected').count()==2
   assert fresh_page.locator('#refgrid input[type=checkbox]').count()==0
   after_card=first_card.bounding_box()
   assert abs(before_card['x']-after_card['x'])<1 and abs(before_card['y']-after_card['y'])<1
   fresh_page.once('dialog',lambda d:d.accept())
   fresh_page.locator('[data-trash-delete]').click()
   fresh_page.wait_for_function('async(ids)=>{const rows=await fetch("/production/api/references").then(r=>r.json());return ids.every(id=>!rows.some(r=>r.id===id))}',arg=trash_ids)
   restore_id=fresh_page.evaluate("""async()=>{const id=crypto.randomUUID();await fetch('/production/api/references/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,title:'Restore test',category:'',tags:[],description:'',blocks:[],deleted:true})});await window.openRefs();return id}""")
   fresh_page.locator('[data-ref="'+restore_id+'"]').click()
   fresh_page.locator('[data-trash-restore]').click()
   fresh_page.wait_for_function('async(id)=>{const rows=await fetch("/production/api/references").then(r=>r.json());return rows.some(r=>r.id===id&&!r.deleted&&!r.deletedAt)}',arg=restore_id)
   retention=fresh_page.evaluate("""async()=>{const id=crypto.randomUUID(),fileId=crypto.randomUUID();await fetch('/production/api/ref-files/'+fileId,{method:'PUT',headers:{'Content-Type':'text/plain'},body:'expired original'});const item={id,title:'Expired trash fixture',deleted:true,deletedAt:new Date(Date.now()-31*86400000).toISOString(),updatedAt:new Date().toISOString(),createdAt:new Date().toISOString(),blocks:[{id:'block',kind:'file',fileId}]};await new Promise((resolve,reject)=>{const request=indexedDB.open('production-local:'+new URL(document.baseURI).href);request.onsuccess=()=>{const db=request.result,tx=db.transaction('references','readwrite');tx.objectStore('references').put(item,id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}});const rows=await fetch('/production/api/references').then(r=>r.json());return {present:rows.some(r=>r.id===id),fileStatus:(await fetch('/production/api/ref-files/'+fileId)).status}}""")
   assert retention=={'present':False,'fileStatus':404},retention

   fresh_page.locator('[data-main-space=home]').click()
   assert fresh_page.get_by_label('홈 프로젝트 필터',exact=True).count()==0
   fresh_page.get_by_role('button',name='할 일 전체 보기',exact=True).click()
   fresh_page.get_by_role('heading',name='모든 할 일',exact=True).wait_for()
   fresh_page.wait_for_function('location.hash==="#/home/tasks"')
   fresh_page.reload();fresh_page.get_by_role('heading',name='모든 할 일',exact=True).wait_for()
   fresh_page.locator('[data-home-section=schedule]').click()
   fresh_page.get_by_role('heading',name='모든 일정',exact=True).wait_for()
   fresh_page.locator('#sidebar-project-list').click()
   fresh_page.locator('[data-home-view=projects]').wait_for()
   fresh_page.locator('[data-main-space=home]').click()
   fresh_page.locator('[data-production-id=workspace-project]').click()
   fresh_page.get_by_role('heading',name='오늘 할 일',exact=True).wait_for()
   assert fresh_page.locator('.project-page-heading .archive-access').count()==0
   original_viewport=fresh_page.viewport_size
   for width in [1280,1920,2560]:
    fresh_page.set_viewport_size({'width':width,'height':900})
    overview_rect=fresh_page.locator('.overview-activity').bounding_box()
    workbench_rect=fresh_page.locator('.merged-workspace.project-page').bounding_box()
    assert abs(overview_rect['width']-workbench_rect['width'])<2,(width,overview_rect,workbench_rect)
   fresh_page.set_viewport_size(original_viewport)

   fresh_page.wait_for_function('location.hash.startsWith("#/projects/") && location.hash.endsWith("/overview") && window.productionSearchContext?.productionId==="workspace-project"')
   fresh_page.locator('[data-tab-id=schedule]').click()
   fresh_page.wait_for_function('location.hash.endsWith("/schedule")')
   group_schedule_url=fresh_page.url
   fresh_page.go_back()
   fresh_page.get_by_role('heading',name='오늘 할 일',exact=True).wait_for()
   fresh_page.go_forward()
   fresh_page.wait_for_function('window.productionSearchContext?.section==="schedule"')
   fresh_page.reload()
   fresh_page.wait_for_function('window.productionSearchContext?.section==="schedule"')
   assert fresh_page.url==group_schedule_url
   fresh_page.go_back()
   fresh_page.get_by_role('heading',name='오늘 할 일',exact=True).wait_for()

   calendar_dates=fresh_page.evaluate('''()=>{const day=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};const w=window.productionBridge.read(),p=w.productions.find(p=>p.id==="workspace-project");p.tasks=[{id:"drag-task",title:"날짜 이동 할 일",done:false,due:day(2),stage:"기획"}];p.schedules=[{id:"drag-event",title:"날짜 이동 일정",date:day(2),endDate:day(4),startTime:"10:00",endTime:"11:00"}];p.customTabs=[{id:"calendar-module-tab",name:"일정 모듈",modules:[{id:"calendar-module",kind:"schedule"}]}];window.productionBridge.write(w);window.productionRefresh();return {start:day(2),target:day(3),end:day(5),taskTarget:day(6),moduleTarget:day(4),moduleEnd:day(6)}}''')
   fresh_page.locator('[data-tab-id=schedule]').click()
   calendar_event=fresh_page.locator('.calendar-event').filter(has_text='날짜 이동 일정').first
   calendar_event.wait_for()
   calendar_transfer=fresh_page.evaluate_handle('new DataTransfer()')
   calendar_transfer.evaluate('(transfer)=>{const native=transfer.setDragImage.bind(transfer);transfer.setDragImage=(image,x,y)=>{window.calendarDragPreview={text:document.querySelector("[data-drag-preview]").textContent,width:document.querySelector("[data-drag-preview]").getBoundingClientRect().width};native(image,x,y)}}')
   calendar_plus=fresh_page.locator('.calendar-add').first
   assert calendar_plus.bounding_box()['height']==24
   assert calendar_plus.evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='0px'
   assert calendar_plus.evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgba(0, 0, 0, 0)'
   calendar_event.dispatch_event('dragstart',{'dataTransfer':calendar_transfer})
   assert fresh_page.evaluate('window.calendarDragPreview.text.includes("날짜 이동 일정")&&window.calendarDragPreview.width>0')
   fresh_page.locator('body').dispatch_event('dragover',{'dataTransfer':calendar_transfer,'clientX':500,'clientY':400})
   fresh_page.wait_for_function('document.querySelector("[data-drag-preview]").style.left==="500px"&&document.querySelector("[data-drag-preview]").style.top==="400px"')
   assert fresh_page.evaluate('!document.elementFromPoint(510,410)?.closest("[data-drag-preview]")')

   target_day=fresh_page.locator('[data-calendar-date="'+calendar_dates['target']+'"]')
   target_day.dispatch_event('dragover',{'dataTransfer':calendar_transfer})
   target_day.dispatch_event('drop',{'dataTransfer':calendar_transfer})
   assert fresh_page.locator('[data-drag-preview]').count()==0
   fresh_page.wait_for_function('(date)=>window.productionBridge.read().productions.find(p=>p.id==="workspace-project").schedules[0].date===date',arg=calendar_dates['target'])
   assert fresh_page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").schedules[0].endDate')==calendar_dates['end']
   calendar_task=fresh_page.locator('.calendar-task-row').filter(has_text='날짜 이동 할 일').first
   task_transfer=fresh_page.evaluate_handle('new DataTransfer()')
   calendar_task.dispatch_event('dragstart',{'dataTransfer':task_transfer})
   fresh_page.locator('[data-calendar-date="'+calendar_dates['taskTarget']+'"]').dispatch_event('drop',{'dataTransfer':task_transfer})
   fresh_page.wait_for_function('(date)=>window.productionBridge.read().productions.find(p=>p.id==="workspace-project").tasks[0].due===date',arg=calendar_dates['taskTarget'])
   fresh_page.locator('[data-tab-id="tab:calendar-module-tab"]').click()
   module_event=fresh_page.locator('.workspace-module .calendar-event').filter(has_text='날짜 이동 일정').first
   module_event.wait_for()
   module_transfer=fresh_page.evaluate_handle('new DataTransfer()')
   module_event.dispatch_event('dragstart',{'dataTransfer':module_transfer})
   fresh_page.locator('.workspace-module [data-calendar-date="'+calendar_dates['moduleTarget']+'"]').dispatch_event('drop',{'dataTransfer':module_transfer})
   fresh_page.wait_for_function('(date)=>window.productionBridge.read().productions.find(p=>p.id==="workspace-project").schedules[0].date===date',arg=calendar_dates['moduleTarget'])
   assert fresh_page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").schedules[0].endDate')==calendar_dates['moduleEnd']
   fresh_page.evaluate('()=>{const w=window.productionBridge.read();w.productions.find(p=>p.id==="workspace-project").tasks.push({id:"order-task",title:"순서 이동 할 일",done:false,stage:"기획"});window.productionBridge.write(w);window.productionRefresh()}')
   fresh_page.locator('[data-tab-id=tasks]').click()
   order_card=fresh_page.locator('.work-task').filter(has_text='순서 이동 할 일')
   order_transfer=fresh_page.evaluate_handle('new DataTransfer()')
   order_card.dispatch_event('dragstart',{'dataTransfer':order_transfer})
   fresh_page.locator('.work-task').filter(has_text='날짜 이동 할 일').dispatch_event('drop',{'dataTransfer':order_transfer})
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").tasks[0].id==="order-task"')
   fresh_page.get_by_role('button',name='보드',exact=True).click()
   board_transfer=fresh_page.evaluate_handle('new DataTransfer()')
   fresh_page.locator('.work-task').filter(has_text='순서 이동 할 일').dispatch_event('dragstart',{'dataTransfer':board_transfer})
   fresh_page.locator('.task-board>section[data-task-stage="진행"]').dispatch_event('drop',{'dataTransfer':board_transfer})
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").tasks.find(t=>t.id==="order-task").stage==="진행"')
   fresh_page.wait_for_function('location.hash.endsWith("/tasks")')
   fresh_page.evaluate('async()=>{await window.flushDocumentModules()}')
   fresh_page.reload()
   fresh_page.locator('.work-task').first.wait_for()
   assert fresh_page.locator('.work-task').last.inner_text().startswith('순서 이동 할 일')
   assert fresh_page.get_by_role('button',name='보드',exact=True).get_attribute('aria-pressed')=='true'
   assert fresh_page.locator('.task-board>section').first.evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgba(0, 0, 0, 0)'

   fresh_page.locator('[data-tab-id=projects]').click()
   overview=fresh_page.locator('.production-overview')
   assert overview.evaluate('(el)=>getComputedStyle(el).backgroundImage')=='none'
   assert overview.locator('.overview-team-section').count()==0
   assert fresh_page.locator('.project-page-heading .project-icon-choice').bounding_box()['x']<fresh_page.locator('.project-page-heading h1').bounding_box()['x']
   assert overview.locator('.overview-health button').count()==3
   assert overview.get_by_text('기한 초과',exact=True).is_visible()
   assert overview.locator('.overview-current-stage').count()==0
   assert overview.locator('.overview-facts dt').filter(has_text='상태').count()==0
   fresh_page.get_by_role('button',name='프로젝트 아이콘 변경',exact=True).click()
   fresh_page.get_by_role('dialog',name='프로젝트 아이콘 선택',exact=True).get_by_role('button',name='십자가 아이콘',exact=True).click()
   overview.get_by_role('button',name='수정',exact=True).click()
   assert overview.get_by_label('프로젝트 아이콘 검색',exact=True).count()==0
   assert overview.get_by_label('마감일 없음',exact=True).is_checked()
   assert overview.get_by_label('프로젝트 상태',exact=True).input_value()=='상시'
   overview.get_by_label('마감일 없음',exact=True).uncheck()
   overview.get_by_label('프로젝트 마감일',exact=True).fill('2099-01-01')
   assert overview.get_by_label('프로젝트 상태',exact=True).input_value()=='진행 중'
   overview.get_by_label('마감일 없음',exact=True).check()
   assert overview.locator('.overview-edit').evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='0px'
   assert overview.locator('.overview-top-actions').is_visible()
   assert overview.locator('.production-heading-actions [data-control-icon=plus]').count()==0
   assert overview.get_by_role('button',name='확인',exact=True).evaluate('(el)=>{const probe=document.createElement("i");probe.style.background="var(--accent)";el.append(probe);const ok=getComputedStyle(el).backgroundColor===getComputedStyle(probe).backgroundColor;probe.remove();return ok}')
   assert overview.locator('.overview-edit input[type=text],.overview-edit input:not([type])').first.evaluate('(el)=>getComputedStyle(el).backgroundColor')==overview.locator('.overview-edit select').first.evaluate('(el)=>getComputedStyle(el).backgroundColor')
   assert overview.evaluate('(el)=>getComputedStyle(el).backgroundImage').startswith('linear-gradient')
   overview.get_by_role('button',name='확인',exact=True).click()
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").icon==="cross"')
   fresh_page.get_by_role('button',name='프로젝트 아이콘 변경',exact=True).click()
   icon_menu=fresh_page.get_by_role('dialog',name='프로젝트 아이콘 선택',exact=True)
   assert icon_menu.locator('.project-icon-grid button span:not(.ui-icon)').count()==0
   icon_menu.get_by_role('tab',name=re.compile('^이모지')).click()
   icon_menu.get_by_label('프로젝트 아이콘 검색',exact=True).fill('🎬')
   icon_menu.get_by_role('button',name='🎬 이모지',exact=True).click()
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").icon==="emoji:🎬"')
   assert fresh_page.locator('[data-production-id=workspace-project] .ui-emoji').inner_text()=='🎬'
   fresh_page.get_by_role('button',name='프로젝트 아이콘 변경',exact=True).click()
   icon_menu=fresh_page.get_by_role('dialog',name='프로젝트 아이콘 선택',exact=True)
   assert icon_menu.get_by_label('프로젝트 아이콘 검색').evaluate('(el)=>getComputedStyle(el).outlineStyle')=='none'
   assert icon_menu.evaluate('(el)=>getComputedStyle(el).overscrollBehaviorY')=='contain'
   icon_menu.get_by_role('tab',name='아이콘',exact=True).click()
   assert icon_menu.get_by_role('button',name='노트북 아이콘',exact=True).count()==1
   assert icon_menu.get_by_role('button',name='피자 아이콘',exact=True).count()==1
   icon_menu.evaluate('(el)=>{el.scrollTop=el.scrollHeight}')
   scroll_before=fresh_page.evaluate('window.scrollY')
   icon_box=icon_menu.bounding_box()
   fresh_page.mouse.move(icon_box['x']+icon_box['width']/2,icon_box['y']+icon_box['height']-12)
   fresh_page.mouse.wheel(0,500)
   fresh_page.wait_for_timeout(120)
   assert fresh_page.evaluate('window.scrollY')==scroll_before
   icon_menu.evaluate('(el)=>{el.scrollTop=0}')
   icon_menu.get_by_role('tab',name='사진',exact=True).click()
   icon_menu.get_by_label('아이콘 사진 업로드').set_input_files({'name':'icon.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')})
   icon_menu.get_by_role('button',name='사진 적용',exact=True).wait_for()
   assert icon_menu.locator('canvas').evaluate('(el)=>el.width===256&&el.height===256')
   icon_menu.get_by_role('button',name='사진 적용',exact=True).click()
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").icon.startsWith("image:data:image/")')
   assert fresh_page.locator('[data-production-id=workspace-project] .ui-photo-icon').count()==1


   assert fresh_page.get_by_role('heading',name='업무 그룹',exact=True).is_visible()
   assert fresh_page.locator('.project-direct-content').bounding_box()['y']>fresh_page.locator('.overview-activity').bounding_box()['y']
   assert fresh_page.locator('.project-direct-content .module-toolbar [data-module-add]').count()==1
   fresh_page.wait_for_function('document.querySelector(".breadcrumbs").textContent.includes("워크스페이스 프로젝트")')
   assert fresh_page.locator('.breadcrumbs button').all_text_contents()[:2]==['홈','워크스페이스 프로젝트']
   assert fresh_page.evaluate('window.activeWorkspace')=='home'
   fresh_page.evaluate('''()=>{const w=window.productionBridge.read();w.members.push({id:"team-z",name:"팀원Z",kind:"personal"},{id:"team-a",name:"팀원A",kind:"personal"});const p=w.productions.find(p=>p.id==="workspace-project");p.memberIds=["team-z","team-a"];p.teams=[{id:"people-team",name:"제작팀",leaderId:"team-z",members:[{memberId:"team-a",role:""},{memberId:"team-z",role:""}]}];window.productionBridge.write(w);window.productionRefresh()}''')
   fresh_page.locator('[data-tab-id=people]').click()
   fresh_page.locator('.team-detail').wait_for()
   assert fresh_page.locator('.team-member-row').first.inner_text().startswith('팀원Z')
   assert fresh_page.locator('.teams-heading-actions').get_by_role('button').all_text_contents()==['그룹 관리','팀 추가']
   add_team=fresh_page.locator('.teams-heading-actions').get_by_role('button',name='팀 추가',exact=True)
   assert add_team.bounding_box()['height']==36
   assert fresh_page.locator('.team-footer').get_by_role('button',name='멤버 추가',exact=True).bounding_box()['height']==36
   assert add_team.evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='0px'
   group_manage=fresh_page.locator('.teams-heading-actions').get_by_role('button',name='그룹 관리',exact=True)
   assert group_manage.evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='1px'
   assert group_manage.evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgba(0, 0, 0, 0)'
   assert group_manage.bounding_box()['height']==36
   assert fresh_page.locator('.team-head select').bounding_box()['height']==36, fresh_page.locator('.team-head select').evaluate('(el)=>({height:getComputedStyle(el).height,minHeight:getComputedStyle(el).minHeight,padding:getComputedStyle(el).padding,box:el.getBoundingClientRect().height})')
   assert fresh_page.locator('.team-head .sort-direction button').count()==0

   assert fresh_page.locator('.team-directory-item.active').evaluate('(el)=>{const probe=document.createElement("i");probe.style.cssText="color:var(--accent);background:var(--accent-soft)";el.append(probe);const selected=getComputedStyle(el),accent=getComputedStyle(probe);const ok=selected.color===accent.color&&selected.backgroundColor===accent.backgroundColor&&getComputedStyle(el.querySelector("span")).color===accent.color;probe.remove();return ok}')

   assert fresh_page.locator('.team-head select').evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='1px'
   assert int(fresh_page.locator('.team-member-row').first.locator('span').first.evaluate('(el)=>getComputedStyle(el).fontWeight'))>=600
   assert fresh_page.locator('.team-member-row').first.evaluate('(el)=>getComputedStyle(el.querySelector("span")).color===getComputedStyle(el.querySelector("select")).color')
   assert fresh_page.locator('.team-role-chip').first.bounding_box()['width']<90
   assert fresh_page.locator('.team-member-row button').first.evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='0px'
   fresh_page.get_by_label('멤버 정렬 기준',exact=True).first.select_option('custom')
   team_drag=fresh_page.evaluate_handle('new DataTransfer()')
   fresh_page.locator('.team-member-row').first.dispatch_event('dragstart',{'dataTransfer':team_drag})
   fresh_page.locator('.team-member-row').last.dispatch_event('dragover',{'dataTransfer':team_drag})
   assert fresh_page.locator('.production-member-list .member-drop-target').count()==0
   fresh_page.locator('.production-member-list .production-member-row').first.dispatch_event('dragover',{'dataTransfer':team_drag})
   assert fresh_page.locator('.production-member-list .member-drop-target').count()==0
   fresh_page.locator('.team-member-row').first.dispatch_event('dragend',{'dataTransfer':team_drag})

   assert fresh_page.get_by_label('제작팀 팀장',exact=True).count()==0
   assert fresh_page.get_by_label('팀원A 역할',exact=True).input_value()=='멤버'
   fresh_page.get_by_label('팀원A 역할',exact=True).select_option('팀장')
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").teams[0].leaderId==="team-a"')
   assert fresh_page.locator('.team-member-row').first.inner_text().startswith('팀원A')
   fresh_page.get_by_label('팀원Z 역할',exact=True).select_option('__custom__')
   role_input=fresh_page.get_by_role('textbox',name='팀원Z 역할 직접 입력',exact=True)
   assert fresh_page.get_by_role('dialog',name='역할 입력',exact=True).count()==0
   role_input.fill('촬영감독')
   role_input.press('Enter')
   assert fresh_page.get_by_label('팀원Z 역할',exact=True).input_value()=='촬영감독'
   fresh_page.get_by_role('button',name='팀 이름 변경',exact=True).click()
   team_name=fresh_page.get_by_role('dialog',name='팀 이름 변경',exact=True)
   team_name.get_by_label('팀 이름',exact=True).fill('영상팀')
   team_name.get_by_role('button',name='완료',exact=True).click()
   team_name.wait_for(state='detached')
   assert fresh_page.get_by_role('button',name='팀 이름 변경',exact=True).inner_text()=='영상팀'
   assert fresh_page.locator('.team-head').get_by_label('멤버 정렬 기준').count()==1
   delete_team=fresh_page.get_by_role('button',name='영상팀 팀 삭제',exact=True)
   assert delete_team.bounding_box()['y']>=fresh_page.locator('.team-detail-members').bounding_box()['y']
   delete_height=delete_team.bounding_box()['height']
   delete_team.click()
   fresh_page.get_by_role('button',name='팀 삭제 확인',exact=True).wait_for()
   delete_confirmation=fresh_page.get_by_role('button',name='팀 삭제 확인',exact=True)
   assert delete_confirmation.bounding_box()['height']==delete_height
   assert delete_confirmation.evaluate('(el)=>getComputedStyle(el).color')=='rgb(220, 38, 38)'

   fresh_page.get_by_role('button',name='삭제 취소',exact=True).click()
   assert fresh_page.locator('.team-detail').count()==1
   delete_team.click()
   fresh_page.get_by_role('button',name='팀 삭제 확인',exact=True).click()
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="workspace-project").teams.length===0')
   fresh_page.get_by_role('button',name='팀 추가',exact=True).click()
   team_add=fresh_page.get_by_role('dialog',name='팀 추가',exact=True)
   team_add.get_by_label('새 팀 이름',exact=True).fill('새 제작팀')
   team_add.get_by_role('button',name='팀 추가',exact=True).click()
   team_add.wait_for(state='detached')
   assert fresh_page.get_by_role('button',name='팀 이름 변경',exact=True).inner_text()=='새 제작팀'
   fresh_page.evaluate('()=>{const w=window.productionBridge.read(),p=w.productions.find(p=>p.id==="workspace-project");p.teams.push({id:"second-team",name:"두번째 팀",members:[]});window.productionBridge.write(w);window.productionRefresh()}')
   team_directory=fresh_page.locator('.team-directory')
   first_team=team_directory.locator('.team-directory-item').first
   second_team=team_directory.locator('.team-directory-item').last
   sort_team_transfer=fresh_page.evaluate_handle('new DataTransfer()')
   first_team.dispatch_event('dragstart',{'dataTransfer':sort_team_transfer})
   assert fresh_page.locator('.team-empty-insert').count()==0
   second_team.dispatch_event('dragover',{'dataTransfer':sort_team_transfer,'clientY':second_team.bounding_box()['y']+1})
   assert second_team.evaluate('(el)=>el.classList.contains("team-insert-before")')
   assert fresh_page.locator('.team-detail.team-drop-target,.team-directory-group.team-drop-target').count()==0
   assert fresh_page.locator('.team-directory-item.team-drop-target').count()==0
   second_team.dispatch_event('drop',{'dataTransfer':sort_team_transfer,'clientY':second_team.bounding_box()['y']+1})
   assert fresh_page.locator('.team-insert-before,.team-insert-after').count()==0

   fresh_page.evaluate('()=>{const w=window.productionBridge.read(),p=w.productions.find(p=>p.id==="workspace-project");p.customTabs.push({id:"timeline-regression",name:"타임라인 검사",modules:[{id:"timeline-ui",kind:"timetable",title:"타임라인",config:{start:"2026-02-03",end:"2026-02-05",days:3,projectIds:[]}}]});window.productionBridge.write(w);window.productionRefresh()}')
   fresh_page.locator('[data-tab-id="tab:timeline-regression"]').click()
   timeline_slot=fresh_page.locator('.tt-slot').first
   timeline_slot.wait_for(state='attached')
   assert timeline_slot.evaluate('(el)=>!el.classList.contains("ui-add-action")')
   assert timeline_slot.evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgba(0, 0, 0, 0)'
   assert timeline_slot.evaluate('(el)=>Math.abs(el.getBoundingClientRect().height-parseFloat(getComputedStyle(el.closest(".timetable-module")).getPropertyValue("--tt-slot-height")))<1')

   fresh_page.evaluate("""()=>{const w=window.productionBridge.read();w.timetableSchedules.push({id:'resize-ui',moduleId:'timeline-ui',productionId:'workspace-project',title:'시간 조절 검증',date:'2026-02-03',endDate:'2026-02-03',startTime:'09:00',endTime:'10:00',note:'메모 유지'});window.productionBridge.write(w);window.productionRefresh()}""")
   timed_event=fresh_page.locator('.tt-event').filter(has_text='시간 조절 검증')
   timed_event.click()
   timed_detail=fresh_page.get_by_role('dialog',name='시간 조절 검증',exact=True)
   assert timed_detail.get_by_text('메모 유지',exact=True).is_visible()
   fresh_page.get_by_role('button',name='시간 조절 검증 닫기',exact=True).click()
   for edge,delta,target in [('end',36,'10:20'),('start',-18,'08:50')]:
    handle=timed_event.locator('[data-tt-resize='+edge+']')
    handle.scroll_into_view_if_needed()
    b=handle.bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2
    fresh_page.mouse.move(x,y);fresh_page.mouse.down();fresh_page.mouse.move(x,y+delta,steps=6);fresh_page.mouse.up()
    field='endTime' if edge=='end' else 'startTime'
    fresh_page.wait_for_function('(v)=>window.productionBridge.read().timetableSchedules.find(s=>s.id==="resize-ui")[v.field]===v.target',arg={'field':field,'target':target})
   assert fresh_page.evaluate('window.productionBridge.read().timetableSchedules.find(s=>s.id==="resize-ui").note')=='메모 유지'
   fresh_page.get_by_role('button',name='타임테이블 일정 추가',exact=True).click()
   time_form=fresh_page.get_by_role('dialog',name='일정 추가',exact=True)
   time_form.get_by_label('시작 시간',exact=True).fill('오전 9:00')
   time_form.get_by_label('시작 시간',exact=True).press('Enter')
   time_form.get_by_label('시작 시간',exact=True).press('ArrowUp')
   assert time_form.locator('[name=startTime]').input_value()=='09:05'
   time_form.get_by_label('종료 시간',exact=True).fill('오후 1:30')
   time_form.get_by_label('종료 시간',exact=True).press('Tab')
   assert time_form.locator('[name=endTime]').input_value()=='13:30'
   old_start=time_form.get_by_label('시작일',exact=True).input_value();old_end=time_form.get_by_label('종료일',exact=True).input_value()
   time_form.get_by_label('시작일',exact=True).fill('2026-02-04')
   from datetime import date as calendar_date,timedelta
   expected_end=calendar_date(2026,2,4)+(calendar_date.fromisoformat(old_end)-calendar_date.fromisoformat(old_start))
   assert time_form.get_by_label('종료일',exact=True).input_value()==expected_end.isoformat()
   saved_viewport=fresh_page.viewport_size;fresh_page.set_viewport_size({'width':390,'height':844})
   time_form.get_by_label('시작 시간',exact=True).click()
   picker=time_form.get_by_role('group',name='시작 시간 휠 선택',exact=True)
   picker.get_by_role('option',name='오후',exact=True).click()
   picker.get_by_role('listbox',name='시',exact=True).get_by_role('option',name='11',exact=True).click()
   picker.get_by_role('listbox',name='분',exact=True).get_by_role('option',name='05',exact=True).click()
   picker.get_by_role('button',name='완료',exact=True).click()
   assert time_form.locator('[name=startTime]').input_value()=='23:05'
   fresh_page.get_by_role('button',name='일정 추가 닫기',exact=True).click()
   fresh_page.set_viewport_size(saved_viewport)

   fresh_page.locator('[data-tab-id=projects]').click()
   lifecycle_file=fresh_page.evaluate("""async()=>{const id=crypto.randomUUID(),r=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'text/plain'},body:'완료 당시 문서'});if(!r.ok)throw Error('fixture file');const w=window.productionBridge.read();w.productions.push({id:'film-flow',name:'단편영화 검증',status:'진행 중',description:'',tasks:[{id:'overdue-flow',title:'색보정 확인',done:false,stage:'편집',due:'2000-01-01'}],feedback:[{id:'feedback-flow',body:'최종 색상 수정',resolved:false}],schedules:[{id:'next-flow',title:'시사회',date:'2099-01-01'}],customTabs:[{id:'script-tab-flow',name:'시나리오',modules:[{id:'script-flow',kind:'text',title:'촬영 대본',text:'완료 당시 대본'},{id:'file-flow',kind:'file',title:'결과 문서',files:[{id,name:'결과.txt',kind:'file',mime:'text/plain'}]}]}],teams:[],memberIds:[]},{id:'brand-flow',name:'브랜드 영상 검증',status:'진행 중',description:'',tasks:[],customTabs:[],teams:[],memberIds:[]});window.productionBridge.write(w);window.productionRefresh();await window.flushDocumentModules();return id}""")

   sidebar_transfer=fresh_page.evaluate_handle('new DataTransfer()')
   fresh_page.locator('#sidebar-projects [data-production-id=brand-flow]').dispatch_event('dragstart',{'dataTransfer':sidebar_transfer})
   sidebar_target=fresh_page.locator('#sidebar-projects [data-production-id=workspace-project]')
   sidebar_y=sidebar_target.bounding_box()['y']+1
   sidebar_target.dispatch_event('dragover',{'dataTransfer':sidebar_transfer,'clientY':sidebar_y})
   sidebar_target.dispatch_event('drop',{'dataTransfer':sidebar_transfer,'clientY':sidebar_y})
   assert fresh_page.locator('#sidebar-projects .sidebar-project').first.get_attribute('data-production-id')=='brand-flow'
   fresh_page.evaluate('async()=>{await window.flushDocumentModules()}')
   fresh_page.reload()
   fresh_page.locator('#sidebar-projects .sidebar-project').first.wait_for()
   assert fresh_page.locator('#sidebar-projects .sidebar-project').first.get_attribute('data-production-id')=='brand-flow'
   assert fresh_page.locator('[data-production-id=workspace-project] .ui-photo-icon').count()==1
   fresh_page.locator('[data-production-id=film-flow]').click()
   film_overview=fresh_page.locator('.production-overview')
   film_overview.get_by_text('기한 초과',exact=True).wait_for()
   assert film_overview.get_by_text('시사회',exact=True).is_visible()
   film_overview.get_by_role('button',name='수정',exact=True).click()
   film_overview.get_by_label('프로젝트 상태',exact=True).select_option('완료')
   film_overview.get_by_role('button',name='확인',exact=True).click()
   review=fresh_page.get_by_role('dialog',name='프로젝트 완료 점검',exact=True)
   review.wait_for()
   assert review.get_by_role('heading',name='미완료 업무 1').is_visible()
   assert review.get_by_role('heading',name='미해결 피드백 1').is_visible()
   review.get_by_role('button',name='완료하고 아카이빙',exact=True).click()
   review.get_by_role('alert').wait_for()
   assert fresh_page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="film-flow").status')=='진행 중'
   review.get_by_role('button',name='해결됨 표시',exact=True).click()
   review.get_by_role('heading',name='미해결 피드백 0').wait_for()
   review.get_by_label('회고',exact=True).fill('촬영 준비를 앞당기자')
   review.get_by_label('성과',exact=True).fill('시사회 준비 완료')
   review.get_by_label('예외 완료 사유',exact=True).fill('추가 색보정은 다음 버전으로 이관')
   for checkbox in review.locator('[name=candidate]').all():checkbox.check()
   review.get_by_role('button',name='완료하고 아카이빙',exact=True).click()
   review.wait_for(state='detached')
   archive_info=fresh_page.evaluate('''()=>{const a=window.productionBridge.read().productions.find(p=>p.id==="film-flow").archives.at(-1);return {id:a.id,file:a.candidates.find(c=>c.module.kind==="file").module.files[0].id,checks:a.checks,text:a.candidates.find(c=>c.module.kind==="text").module.text}}''')
   assert archive_info['file']!=lifecycle_file
   assert archive_info['checks']['pending']==1 and archive_info['text']=='완료 당시 대본'
   assert fresh_page.evaluate("async(id)=>(await fetch('/production/api/ref-files/'+id)).text()",archive_info['file'])=='완료 당시 문서'
   fresh_page.locator('[data-main-space=references]').click()
   fresh_page.locator('[data-reference-archive]').click()
   library=fresh_page.get_by_role('dialog',name='완료 아카이브',exact=True)
   library.get_by_role('button',name=re.compile('^단편영화 검증')).click()
   assert library.get_by_text('촬영 준비를 앞당기자',exact=True).is_visible()
   library.get_by_role('button',name='다음 프로젝트로 가져오기',exact=True).click()
   library.get_by_label('대상 프로젝트').select_option('production:brand-flow')
   library.get_by_role('button',name='가져오기',exact=True).click()
   library.get_by_role('status').wait_for()
   imported=fresh_page.evaluate('''()=>window.productionBridge.read().productions.find(p=>p.id==="brand-flow").customTabs.at(-1).modules.map(m=>({kind:m.kind,source:m.source,file:m.files?.[0]?.id}))''')
   assert len(imported)==2 and all(not m.get('source') for m in imported)
   assert next(m['file'] for m in imported if m['kind']=='file')!=archive_info['file']
   library.get_by_role('button',name='다음 프로젝트로 가져오기',exact=True).click()
   library.get_by_label('대상 프로젝트').select_option('production:brand-flow')
   library.get_by_label('가져오기 방식').select_option('link')
   library.get_by_role('button',name='가져오기',exact=True).click()
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="brand-flow").customTabs.length===2')
   fresh_page.get_by_role('button',name='완료 아카이브 닫기',exact=True).click()
   fresh_page.locator('[data-main-space=home]').click()
   fresh_page.locator('[data-production-id=brand-flow]').click()
   fresh_page.locator('[data-tab-id^="tab:"]').last.click()
   fresh_page.locator('.shared-source').first.wait_for()
   fresh_page.wait_for_function('window.productionBridge.read().productions.find(p=>p.id==="brand-flow").customTabs.at(-1).modules.every(m=>m.sourceCopy)')
   assert fresh_page.locator('.source-breadcrumb').count()==0
   assert fresh_page.locator('.shared-source').first.get_by_role('button',name='원본에 저장',exact=True).is_enabled()
   first_import=fresh_page.locator('.workspace-module').first
   first_import.locator('textarea').fill('사본에서 수정한 대본')
   assert fresh_page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="film-flow").customTabs[0].modules.find(m=>m.id==="script-flow").text')=='완료 당시 대본'
   first_import.get_by_role('button',name='원본에 저장',exact=True).click()
   first_import.get_by_role('button',name='취소',exact=True).click()
   assert fresh_page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="film-flow").customTabs[0].modules.find(m=>m.id==="script-flow").text')=='완료 당시 대본'
   first_import.get_by_role('button',name='원본에 저장',exact=True).click()
   confirmation=first_import.get_by_role('button',name='원본에 저장할까요?',exact=True)
   assert confirmation.evaluate('(el)=>getComputedStyle(el).color')=='rgb(37, 99, 235)'
   confirmation.click()
   first_import.get_by_role('status').wait_for()
   assert fresh_page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="film-flow").customTabs[0].modules.find(m=>m.id==="script-flow").text')=='사본에서 수정한 대본'
   copied_file=fresh_page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="brand-flow").customTabs.at(-1).modules.find(m=>m.kind==="file").files[0].id')
   assert copied_file!=lifecycle_file
   fresh_page.evaluate("""()=>{const w=window.productionBridge.read();w.productions.find(p=>p.id==='film-flow').customTabs[0].modules=w.productions.find(p=>p.id==='film-flow').customTabs[0].modules.filter(m=>m.id!=='script-flow');window.productionBridge.write(w);window.productionRefresh()}""")
   first_import.locator('textarea').wait_for()
   assert first_import.locator('textarea').input_value()=='사본에서 수정한 대본'
   assert first_import.get_by_role('button',name='원본에 저장',exact=True).is_disabled()
   first_import.get_by_role('button',name='새 원본 연결',exact=True).click()
   reconnect=fresh_page.get_by_role('dialog',name='새 원본 연결',exact=True)
   reconnect.get_by_role('button',name=re.compile('^프로젝트')).click()
   reconnect.get_by_role('button',name=re.compile('^브랜드 영상 검증')).click()
   reconnect.get_by_role('button',name=re.compile('^단편영화 검증 재사용')).first.click()
   reconnect.get_by_role('button',name=re.compile('^촬영 대본')).click()
   reconnect.wait_for(state='detached')
   assert fresh_page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="brand-flow").customTabs.at(-1).modules[0].importSource.ownerId')=='brand-flow'
   await_archive=fresh_page.evaluate('''async()=>{await window.flushDocumentModules();return window.productionBridge.read().productions.find(p=>p.id==="film-flow").archives.length}''')
   assert await_archive==1
   fresh_page.reload()
   fresh_page.wait_for_function('window.productionSearchContext?.productionId==="brand-flow" && window.productionBridge.read().productions.find(p=>p.id==="film-flow")?.archives.length===1')

   fresh_page.goto('https://pages.test:9443/production/@unknown')
   fresh_page.wait_for_function('document.body.textContent.includes("등록되지 않은")')
   fresh_page.goto('https://pages.test:9443/production/nas.test:9444/')
   fresh_page.locator('#account-form').wait_for()
   fresh_page.goto('https://pages.test:9443/production/')
   fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/data')).json().then(x=>x.projects.some(p=>p.name==='로컬 프로젝트'))")
   fresh_page.locator('.sidebar-settings').click()
   fresh_page.locator('[data-settings-category=general]').click()
   assert fresh_page.locator('[data-accent]').count()==4
   fresh_page.locator('[data-accent=purple]').click()
   assert fresh_page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")=='#7c3aed'
   fresh_page.reload();fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("localStorage.getItem('pn-accent')")=='purple'
   fresh_page.locator('.sidebar-settings').click()
   assert fresh_page.locator('[data-settings-category=connections]').count()==0
   local_file_id=fresh_page.evaluate("""async()=>{const id=crypto.randomUUID();const r=await fetch('/production/api/ref-files/'+id,{method:'PUT',headers:{'Content-Type':'text/plain'},body:'Local original text'});if(!r.ok)throw Error('Local upload failed');return id}""")
   local_doc=fresh.new_page();local_doc.on('pageerror',lambda e:errors.append(e.stack))
   local_doc.goto('https://pages.test:9443/production/?document='+local_file_id+'&name=Local.txt')
   local_doc.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   offline_script="window.originalDocumentFetch=window.fetch;window.fetch=(input,init)=>String(input).includes('/api/ref-files/"+local_file_id+"')&&init?.method==='PUT'?Promise.resolve(new Response('offline',{status:503})):window.originalDocumentFetch(input,init)"
   local_doc.add_init_script(offline_script);local_doc.evaluate(offline_script)
   local_doc.get_by_role('textbox',name='문서 본문',exact=True).fill('Local unsaved recovery text')
   local_doc.get_by_role('alert').wait_for()
   assert local_doc.evaluate("async id=>(await fetch('/production/api/ref-files/'+id)).text()",local_file_id)=='Local original text'
   local_doc.reload();local_doc.get_by_role('textbox',name='문서 본문',exact=True).wait_for()
   assert local_doc.get_by_role('textbox',name='문서 본문',exact=True).inner_text()=='Local unsaved recovery text'
   local_doc.get_by_role('alert').wait_for()
   local_doc.evaluate('window.fetch=window.originalDocumentFetch')
   with local_doc.expect_response(lambda r:'/api/ref-files/'+local_file_id in r.url and r.request.method=='PUT') as saved:
    local_doc.get_by_role('button',name='저장 다시 시도',exact=True).click()
   assert saved.value.status==200
   local_doc.wait_for_function("document.querySelector('.document-heading [role=status]').textContent === '모든 변경사항 저장됨'")
   assert local_doc.evaluate("async id=>(await fetch('/production/api/ref-files/'+id)).text()",local_file_id)=='Local unsaved recovery text'
   local_doc.close()
   fresh_page.set_viewport_size({'width':390,'height':844})
   assert fresh_page.locator('.mobile-bottom-nav').is_visible()
   fresh_page.wait_for_function('document.querySelectorAll(".mobile-bottom-nav [data-main-space]").length === 4')
   assert not fresh_page.locator('#sidebar').is_visible()
   fresh_page.locator('.mobile-bottom-nav [data-main-space=references]').click()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=sources]').wait_for()
   assert fresh_page.locator('.workspace-landing-card').all_text_contents()==['레퍼런스','소스','포트폴리오','문서','자료 DB','아카이브','휴지통']
   fresh_page.locator('.workspace-landing-card[data-workspace-section=archive]').click()
   fresh_page.get_by_role('dialog',name='완료 아카이브',exact=True).wait_for()
   fresh_page.get_by_role('button',name='완료 아카이브 닫기',exact=True).click()
   fresh_page.locator('.mobile-bottom-nav [data-main-space=references]').click()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=trash]').click()
   fresh_page.locator('[data-trash-select]').wait_for()
   fresh_page.locator('.mobile-bottom-nav [data-main-space=references]').click()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=sources]').click()
   fresh_page.locator('#refpanel').wait_for(state='visible')
   fresh_page.get_by_role('button',name='워크스페이스 첫 화면으로 돌아가기').click()
   fresh_page.locator('.workspace-landing-card').first.wait_for()
   fresh_page.locator('.mobile-bottom-nav [data-main-space=database]').click()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=locations]').wait_for()
   assert fresh_page.locator('.workspace-landing-card').all_text_contents()==['멤버·장비','대여처','장소']
   fresh_page.locator('.workspace-landing-card[data-workspace-section=locations]').click()
   fresh_page.locator('#database-panel').wait_for(state='visible')
   fresh_page.locator('.mobile-bottom-nav [data-main-space=settings]').click()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=account]').wait_for()
   fresh_page.locator('.workspace-landing-card[data-workspace-section=account]').click()
   fresh_page.get_by_role('heading',name='계정',exact=True).wait_for()
   fresh_page.locator('.mobile-bottom-nav [data-main-space=home]').click()
   fresh_page.wait_for_function('window.activeWorkspace === "home" && !window.mobileWorkspaceHome')
   fresh_page.locator('.admin-projects>button').filter(has_text='워크스페이스 프로젝트').click()
   fresh_page.locator('[data-module-add]').click()
   fresh_page.locator('.hub-sidebar').wait_for(state='visible')
   mobile_hub=fresh_page.locator('.hub-sidebar').bounding_box()
   assert mobile_hub['y']+mobile_hub['height']<fresh_page.locator('.mobile-bottom-nav').bounding_box()['y']
   fresh_page.get_by_role('button',name='Hub 닫기',exact=True).click()
   fresh_page.set_viewport_size({'width':1280,'height':900})
   fresh_page.wait_for_function('document.querySelector("#sidebar .sidebar-settings") !== null')
   fresh_page.locator('.sidebar-settings').click()
   fresh_page.locator('[data-settings-category=account]').click()
   fresh_page.get_by_role('heading',name='계정',exact=True).wait_for()
   old_version=fresh_page.locator('meta[name=pn-build]').get_attribute('content')
   new_version='f'*64 if old_version!='f'*64 else 'a'*64
   fresh_page.route('**/version.json?*',lambda route:route.fulfill(status=200,content_type='application/json',body=__import__('json').dumps({'version':new_version})))
   new_html=(root/'dist/pages/app.html').read_text().replace(old_version,new_version)
   fresh_page.route('**/app.html?*',lambda route:route.fulfill(status=200,content_type='text/html',body=new_html))
   fresh_page.evaluate('window.prepareAppUpdate=async()=>false;window.dispatchEvent(new Event("focus"))')
   fresh_page.wait_for_timeout(300)
   assert fresh_page.locator('meta[name=pn-build]').get_attribute('content')==old_version
   fresh_page.wait_for_function('window.appUpdates.available === true')
   update_icon=fresh_page.locator('#app-update .app-update-icon')
   assert update_icon.locator('svg').count()==1
   assert update_icon.locator('svg').bounding_box()['width']==18
   assert fresh_page.locator('#app-update').evaluate('(el)=>getComputedStyle(el).borderTopWidth')=='0px'
   assert update_icon.evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgba(0, 0, 0, 0)'
   assert update_icon.evaluate('(el)=>getComputedStyle(el).color')=='rgb(124, 58, 237)'
   assert fresh_page.locator('#app-update').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgba(0, 0, 0, 0)'

   fresh_page.get_by_role('button',name='앱 업데이트',exact=True).click()
   fresh_page.wait_for_timeout(200)
   assert fresh_page.locator('meta[name=pn-build]').get_attribute('content')==old_version
   fresh_page.evaluate('window.prepareAppUpdate=async()=>true')
   fresh_page.get_by_role('button',name='연락처 변경',exact=True).click()
   fresh_page.get_by_label('연락처',exact=True).focus()
   fresh_page.get_by_label('연락처',exact=True).evaluate('(el)=>el.blur()')
   fresh_page.wait_for_timeout(200)
   assert fresh_page.locator('meta[name=pn-build]').get_attribute('content')==old_version
   fresh_page.get_by_role('button',name='앱 업데이트',exact=True).click()
   fresh_page.wait_for_function("document.querySelector('meta[name=pn-build]')?.content === "+repr(new_version))
   fresh_page.wait_for_function('window.appAccount?.localMode === true')
   assert fresh_page.evaluate("async()=>(await fetch('/production/api/data')).json().then(x=>x.projects.some(p=>p.name==='로컬 프로젝트'))")
   assert not errors,errors
   fresh.close()
   failure=context.new_page()
   failure.route('**/app.html?*',lambda route:route.fulfill(status=503,body='unavailable'))
   failure.goto('https://pages.test:9443/production/')
   failure.locator('#boot-help').wait_for(state='visible')
   assert failure.get_by_role('button',name='다시 시도',exact=True).is_visible()
   assert failure.get_by_role('button',name='연결 확인',exact=True).is_visible()
   assert failure.get_by_role('link',name='웹에서 열기',exact=True).get_attribute('href')=='/production/'
   assert failure.locator('#status').inner_text()=='앱 화면에 실패했습니다.'
   failure.get_by_role('button',name='연결 확인',exact=True).click()
   assert '인터넷' in failure.locator('#boot-reason').inner_text()
   failure.close()
   print('PASS: schedule/task date drag in tabs and modules, emoji selection and sidebar sync, compact named Figma bookmark, completion checks and frozen archive files, independent/link reuse, missing source reconnection, NAS archive capability/persistence, loading failure alternatives, browser-local NAS aliases/reload and unknown alias isolation, legacy URL migration, readable word routes, transparent left-aligned overview and editable project icon, URL screen history/back/forward, reference detail/tab reload, project schedule tab reload, preserved NAS path, three-workspace hierarchy and section/project breadcrumbs, NAS installer download, direct URL NAS connection, fresh 404 entry, per-tab local/NAS isolation, root browser mode, writing-only new document tab, text-to-DOCX module conversion, original-file autosave and reopen, stale-editor conflict protection, local original TXT autosave and offline draft recovery, manual update icon with save deferral and persisted local data, aligned floating panels, Hub search motion and removed previews, inline deletion, full-width divider, four accent colors, sidebar archive and multi-select reference trash with retention and overview activity, mobile bottom navigation/category landing/back, grade calculator, Figma iframe code addition/editing and address persistence/settings, NAS and browser-only modes, separate persistent data and files, HTTPS validation, login, media/canvas and worker restart')
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);httpd.shutdown()
