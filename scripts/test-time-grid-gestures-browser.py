"""Real touch/Pencil pointer gestures; no network or production data."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
entry="""
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{ScheduleGrid}from'./production/ScheduleGrid';import{installLongPressMenus}from'./ui/item-menu.js';
window.moves=[];window.edits=0;window.creates=[];installLongPressMenus(document);
function App(){const[items,setItems]=useState([{key:'all',id:'all',kind:'schedule',title:'종일 테스트',date:'2026-10-17',endDate:'2026-10-17',startTime:'',endTime:''},{key:'timed',id:'timed',kind:'schedule',title:'시간 테스트',date:'2026-10-17',endDate:'2026-10-17',startTime:'13:00',endTime:'14:00'}]);return <ScheduleGrid dates={['2026-10-17','2026-10-18']} items={items} start={480} end={1080} onMove={(item,patch)=>{window.moves.push({id:item.id,...patch});setItems(old=>old.map(i=>i.id===item.id?{...i,...patch}:i))}} onEdit={()=>window.edits++} onCreate={r=>window.creates.push(r)}/>};createRoot(document.querySelector('#app')).render(<App/>);
"""
script="import{buildSync}from'esbuild';process.stdout.write(buildSync({stdin:{contents:process.argv[1],resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'\"production\"'}}).outputFiles[0].text)"
js=subprocess.run(['node','--input-type=module','-e',script,entry],cwd=root,check=True,capture_output=True,text=True).stdout
css='\n'.join((root/'ui/design-system'/f).read_text() for f in ['tokens.css','buttons.css','time-grid.css'])
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;padding:20px;height:2600px;box-sizing:border-box}.schedule-grid{height:500px}.item-context-menu{position:fixed;background:white;z-index:9999;padding:10px}</style><div id="app"></div>');page.add_script_tag(content=js);page.locator('.sg-day').first.wait_for();page.wait_for_timeout(100);cdp=context.new_cdp_session(page)
 def touch(kind,x,y):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y}]})
 day=page.locator('.sg-day').first.bounding_box();touch('touchStart',day['x']+50,day['y']+day['height']-30)
 for dy in [50,100,160]:touch('touchMove',day['x']+50,day['y']+day['height']-30-dy);page.wait_for_timeout(30)
 touch('touchEnd',0,0);page.wait_for_timeout(350);assert page.evaluate('scrollY')>30;assert page.evaluate('moves.length')==0;assert page.evaluate('creates.length')==0
 page.wait_for_timeout(900);page.evaluate('scrollTo(0,0)');page.wait_for_timeout(250);source=page.get_by_role('button',name='종일 테스트',exact=True).bounding_box();target=page.locator('.sg-day').nth(1).bounding_box();x=source['x']+15;y=source['y']+10
 touch('touchStart',x,y);page.wait_for_timeout(180);assert page.evaluate('moves.length')==0;page.wait_for_timeout(210)
 destx=target['x']+30;desty=target['y']+target['height']*.2
 for step in range(1,7):touch('touchMove',x+(destx-x)*step/6,y+(desty-y)*step/6);page.wait_for_timeout(15)
 touch('touchEnd',0,0);page.wait_for_timeout(150);move=page.evaluate('moves.at(-1)');assert move['date']=='2026-10-18' and move['startTime']=='10:00' and move['endTime']=='11:00',move;assert page.evaluate('scrollY')==0
 # A stationary long tap opens the same context menu without opening the editor on release.
 source=page.get_by_role('button',name='종일 테스트 10:00',exact=True).bounding_box();touch('touchStart',source['x']+15,source['y']+10);page.wait_for_timeout(600);page.get_by_role('menuitem',name='수정',exact=True).wait_for();touch('touchEnd',0,0);page.wait_for_timeout(50);assert page.evaluate('edits')==0;page.get_by_role('menuitem',name='수정',exact=True).click();assert page.evaluate('edits')==1
 # Chromium Pencil-equivalent trusted pen pointers share the delay and preserve scrolling until held.
 page.evaluate('moves=[]');source=page.get_by_role('button',name='시간 테스트 13:00',exact=True).bounding_box();x=source['x']+12;y=source['y']+source['height']/2
 cdp.send('Input.dispatchMouseEvent',{'type':'mousePressed','x':x,'y':y,'button':'left','clickCount':1,'pointerType':'pen'});page.wait_for_timeout(180);assert page.evaluate('moves.length')==0;page.wait_for_timeout(210)
 cdp.send('Input.dispatchMouseEvent',{'type':'mouseMoved','x':x+5,'y':y+target['height']*.1,'button':'left','buttons':1,'pointerType':'pen'});cdp.send('Input.dispatchMouseEvent',{'type':'mouseReleased','x':x+5,'y':y+target['height']*.1,'button':'left','clickCount':1,'pointerType':'pen'});page.wait_for_timeout(120);assert len(page.evaluate('moves'))==1,page.evaluate('moves');assert not errors,errors
 b.close()
print('PASS real touch/pen: quick swipe scrolls, held all-day drag creates one hour, stationary long press opens context menu, pen waits then moves once')
