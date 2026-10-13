"""Verify real touch scroll and held drag using Chromium's touch input."""
from pathlib import Path
from playwright.sync_api import sync_playwright
source=(Path(__file__).resolve().parent.parent/'ui/touch-drag.js').read_text().replace('export ','')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 page=context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('''<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}#handle{height:300px;background:#ddd;touch-action:manipulation}#spacer{height:2400px}</style><div id="handle">drag</div><div id="spacer"></div>''')
 page.add_script_tag(content=source+''';window.calls=[];const h=document.querySelector('#handle');h.onpointerdown=e=>{calls.push('down');h.setPointerCapture(e.pointerId)};h.onpointermove=e=>calls.push('move');h.onpointerup=e=>{calls.push('up');if(h.hasPointerCapture(e.pointerId))h.releasePointerCapture(e.pointerId)};h.onpointercancel=e=>calls.push('cancel');installDelayedPointerDrag(h);''')
 c=context.new_cdp_session(page)
 def touch(kind,y):c.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':150,'y':y}]})
 touch('touchStart',250)
 for y in [220,180,130,80]:touch('touchMove',y);page.wait_for_timeout(30)
 touch('touchEnd',0);page.wait_for_timeout(450)
 assert page.evaluate('scrollY')>30,'Quick swipe must scroll'
 assert page.evaluate('calls')==[],'Quick swipe must not begin reorder'
 page.evaluate('scrollTo(0,0)');page.wait_for_timeout(300)
 touch('touchStart',150);page.wait_for_timeout(200)
 assert page.evaluate('calls')==[],'Drag began before hold delay'
 page.wait_for_timeout(200)
 assert page.evaluate('calls')==['down'],'Hold must begin drag'
 for y in [140,110,80]:touch('touchMove',y);page.wait_for_timeout(30)
 touch('touchEnd',0);page.wait_for_timeout(100)
 calls=page.evaluate('calls');assert calls[0]=='down' and 'move' in calls and calls[-1]=='up',calls
 assert page.evaluate('scrollY')==0,'Held reorder must not scroll page'
 # DOM catalog handles install their move/up handlers on a parent after down.
 page.evaluate("""calls=[];const parent=document.createElement('div'),h=document.createElement('div');parent.id='catalog';h.style='height:300px;touch-action:manipulation';parent.append(h);document.body.prepend(parent);h.onpointerdown=e=>{calls.push('parent-down');parent.onpointermove=e=>calls.push('parent-move');parent.onpointerup=e=>calls.push('parent-up');parent.setPointerCapture(e.pointerId)};installDelayedPointerDrag(h);scrollTo(0,0)""")
 touch('touchStart',150);page.wait_for_timeout(400);touch('touchMove',110);touch('touchEnd',0);page.wait_for_timeout(100)
 assert page.evaluate('calls')==['parent-down','parent-move','parent-up'],page.evaluate('calls')
 assert not errors,errors
 browser.close()
print('Touch drag: quick swipe scrolls without reorder; 350ms hold enables drag, prevents scroll, and finishes correctly')
