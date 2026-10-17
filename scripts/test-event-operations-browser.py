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
    page.evaluate("""async()=>{const w=window.productionBridge.read();w.members=[{id:'person1',name:'동명',contact:'01011111111'},{id:'person2',name:'동명',contact:'01022222222'}];w.projects=[];w.productions=[{id:'parent',name:'행사 프로젝트',status:'기획 중',tasks:[],memberIds:['person1','person2'],teams:[{id:'team',name:'현장팀',members:[{memberId:'person1'}]}],schedules:[{id:'rehearsal',title:'리허설',date:'2026-10-20',endDate:'2026-10-20',startTime:'10:00',endTime:'11:00',assignments:[{memberId:'person1'}]}],customTabs:[{id:'budget',name:'예산',modules:[{id:'accounting',kind:'accounting',title:'회계',budget:1000,rows:[{id:'expense',label:'무대',amount:100,type:'expense'}]}]}]}];window.productionBridge.write(w);await window.flushDocumentModules()}""")
    # Separate planning fields round-trip and representative calendar synchronization.
    page.goto(base+'#/projects/parent');page.reload();page.get_by_role('button',name='상세 정보 수정',exact=True).click()
    panel=page.locator('.event-planning-panel');panel.get_by_label('행사 시작일',exact=True).fill('2026-10-20');panel.get_by_label('행사 종료일',exact=True).fill('2026-10-21');panel.get_by_label('행사 장소',exact=True).fill('서울 공연장');panel.get_by_label('예산 하한',exact=True).fill('1000');panel.get_by_label('예산 상한',exact=True).fill('5000');panel.get_by_label('행사 담당자',exact=True).select_option('person2');panel.get_by_label('행사 목표',exact=True).fill('발표회');panel.get_by_label('리스크',exact=True).fill('우천');panel.get_by_role('button',name='행사 정보 저장',exact=True).click()
    expect(panel).to_contain_text('서울 공연장');page.evaluate('window.flushDocumentModules()');page.reload();expect(page.locator('.event-planning-panel')).to_contain_text('발표회');saved=page.evaluate('window.productionBridge.read().productions[0]');assert saved['planning']['leadId']=='person2';assert any(s.get('location')=='서울 공연장' for s in saved['schedules'])
    page.screenshot(path='/workspace/artifacts/event-planning-'+mode+'-0.1.14.png',full_page=False)
    page.get_by_role('button',name='업무 그룹 추가',exact=True).click();group=page.get_by_role('dialog',name='새 업무 그룹',exact=True);group.get_by_role('group',name='팀',exact=True).wait_for();assert group.get_by_label('이름',exact=True).get_attribute('maxlength')=='160';page.keyboard.press('Escape')
    # Duplicate advisory without blocking legitimate namesakes; no-date status stays planning.
    page.locator('#sidebar-project-add').click();new=page.get_by_role('dialog',name='새 프로젝트',exact=True);new.get_by_label('이름',exact=True).fill('행사 프로젝트');expect(new).to_contain_text('같은 이름이 있습니다');new.get_by_role('button',name='추가',exact=True).click();page.wait_for_timeout(200);assert page.evaluate('window.productionBridge.read().productions.at(-1).status')=='기획 중'
    # Per-person IDs, overlap warning, persistence and call sheet export.
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/projects/parent/schedule');page.reload();page.locator('.calendar-grid').wait_for();page.get_by_role('button',name='일정 추가',exact=True).click();editor=page.get_by_role('dialog',name='추가',exact=True);editor.get_by_label('일정 이름',exact=True).fill('본 행사');editor.locator('input[type=date]').first.fill('2026-10-20');editor.locator('input[type=date]').nth(1).fill('2026-10-20');editor.get_by_label('일정 인력 추가',exact=True).select_option('person1');editor.get_by_label('동명 콜타임',exact=True).fill('10:30');editor.get_by_label('동명 종료 시간',exact=True).fill('12:00');expect(editor.locator('.staffing-warnings')).to_contain_text('시간 중복');editor.get_by_label('동명 역할',exact=True).fill('무대감독');editor.get_by_role('button',name='저장',exact=True).click();page.get_by_role('dialog',name='인력 배정 확인',exact=True).get_by_role('button',name='확인 후 저장',exact=True).click();page.wait_for_timeout(200)
    assigned=page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="parent").schedules.find(s=>s.title==="본 행사")');assert assigned['assignments'][0]['memberId']=='person1'
    page.get_by_role('button',name='콜시트',exact=True).click();sheet=page.get_by_role('dialog',name='콜시트',exact=True);sheet.get_by_label('콜시트 날짜',exact=True).fill('2026-10-20');expect(sheet).to_contain_text('무대감독');expect(sheet).to_contain_text('10:30')
    with page.expect_download() as download:sheet.get_by_role('button',name='CSV 다운로드',exact=True).click()
    page.screenshot(path='/workspace/artifacts/event-callsheet-'+mode+'-0.1.14.png',full_page=False);assert '무대감독' in pathlib.Path(download.value.path()).read_text(encoding='utf-8-sig');page.keyboard.press('Escape')
    print('PASS '+mode+' planning + staffing + callsheet',flush=True)
    # Budget drafts never overwrite invalid values; stage comparison, VAT, split payment and original evidence.
    page.evaluate('window.flushDocumentModules()');page.goto(base+'#/projects/parent/tabs/budget');page.reload();budget=page.locator('.event-budget');budget.wait_for();amount=budget.get_by_label('실제 지출 금액',exact=True);amount.fill('');amount.blur();expect(budget.get_by_role('alert')).to_contain_text('기존 금액은 유지');assert page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="parent").customTabs[0].modules[0].rows[0].amount')==100
    amount.fill('150');amount.blur();budget.get_by_label('계약 금액',exact=True).fill('1200');budget.get_by_label('계약 금액',exact=True).blur();budget.get_by_role('button',name='상세',exact=True).click();budget.get_by_label('VAT 처리',exact=True).select_option('exclusive');budget.get_by_label('공급사',exact=True).fill('제작 업체');budget.get_by_role('button',name='+ 지급',exact=True).click();budget.get_by_label('지급 금액',exact=True).fill('200');budget.get_by_label('지급 금액',exact=True).blur();budget.get_by_label('지급 예정일',exact=True).fill('2026-10-19');budget.get_by_label('지급 상태',exact=True).select_option('requested');budget.get_by_label('일정 파일',exact=True).set_input_files({'name':'증빙.txt','mimeType':'text/plain','buffer':'증빙 원본'.encode()});expect(budget).to_contain_text('증빙.txt');expect(budget.locator('.budget-warning')).to_contain_text('초과')
    page.evaluate('window.flushDocumentModules()');page.reload();budget=page.locator('.event-budget');budget.wait_for();row=page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="parent").customTabs[0].modules[0].rows[0]');assert row['amount']==150 and row['contract']==1200 and row['vendor']=='제작 업체' and len(row['attachments'])==1 and row['payments'][0]['amount']==200
    page.screenshot(path='/workspace/artifacts/event-budget-'+mode+'-0.1.14.png',full_page=False)
    if mode=='nas':
     status=page.evaluate("""async()=>{const r=await fetch('/production/api/data'),d=await r.json();d.productions.find(p=>p.id==='parent').customTabs[0].modules[0].rows[0].amount='';return (await fetch('/production/api/data',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':r.headers.get('ETag')},body:JSON.stringify(d)})).status}""");assert status==422,status
    # Accounting is available both as a new module and through the module browser.
    page.locator('[data-module-add]').first.click();hub=page.get_by_role('complementary',name='모듈 허브',exact=True);hub.locator('.hub-card').filter(has=page.get_by_text('회계',exact=True)).click();expect(page.locator('.event-budget')).to_have_count(2)
    page.locator('[data-module-add]').first.click();hub=page.get_by_role('complementary',name='모듈 허브',exact=True);hub.get_by_role('tab',name='불러오기',exact=True).click();browser_view=hub.locator('.module-browser');browser_view.locator('.browser-folder').filter(has_text='프로젝트').click();browser_view.locator('.browser-folder').filter(has_text='행사 프로젝트').first.click();browser_view.locator('.browser-folder').filter(has_text='예산').click();browser_view.locator('.browser-file').filter(has_text='회계').first.click();expect(page.locator('.event-budget')).to_have_count(3)
    copied=page.locator('.event-budget').nth(2);copied.get_by_label('실제 지출 금액',exact=True).fill('165');copied.get_by_label('실제 지출 금액',exact=True).blur();modules=page.evaluate('window.productionBridge.read().productions.find(p=>p.id==="parent").customTabs[0].modules');assert modules[0]['rows'][0]['amount']==150 and modules[2]['rows'][0]['amount']==165 and modules[2]['rows'][0]['attachments'][0]['id']==modules[0]['rows'][0]['attachments'][0]['id']
    # Bulk import keeps namesakes and exposes an explicit existing-member choice.
    page.evaluate('openDatabase("members")');page.locator('#db-add').click();page.get_by_role('menuitem',name='일괄 추가',exact=True).click();imp=page.locator('#dialog');imp.get_by_label('멤버 명단',exact=True).fill('동명,,,01033333333,\n동명,,,01044444444,');expect(imp.locator('[data-import-choice]')).to_have_count(2);imp.get_by_role('button',name='2명 확인 후 추가',exact=True).click();page.wait_for_timeout(300);assert page.evaluate('window.productionBridge.read().members.filter(m=>m.name==="동명").length')==4
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');assert not errors,errors
    print('PASS '+mode+': planning reload/calendar sync, duplicate advisory/date-free status, staffing IDs/conflicts/callsheet CSV, safe amounts/VAT/payments/evidence reload, namesake imports, mobile overflow',flush=True)
   browser.close()
 finally:
  nas.terminate();nas.wait(timeout=10);print(nas.stderr.read().decode()[-4000:]);httpd.shutdown()
