"""Verify shared UI rules in document/shadow roots and native browser states."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
css='\n'.join((root/'ui/design-system'/f'{name}.css').read_text() for name in ['tokens','typography','buttons','navigation','surfaces','motion'])
markup='''<header class="workspace-page-heading"><h1>자료</h1></header><button class="ui-button" id="action">추가</button><button class="ui-button" disabled>비활성</button><div class="ui-drop-target">여기에 이동</div>'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page()
 page.set_content('<style>'+css+'</style>'+markup+'<div id="shadow"></div>')
 page.evaluate('([css,markup])=>{document.querySelector("#shadow").attachShadow({mode:"open"}).innerHTML="<style>"+css+"</style>"+markup}',[css,markup])
 for shadow in [False,True]:
  values=page.evaluate('''shadow=>{const root=shadow?document.querySelector('#shadow').shadowRoot:document;const button=getComputedStyle(root.querySelector('button'));const title=getComputedStyle(root.querySelector('h1'));const drop=getComputedStyle(root.querySelector('.ui-drop-target'));return {height:button.minHeight,radius:button.borderRadius,corner:button.cornerShape,font:title.fontSize,weight:title.fontWeight,drop:drop.outlineWidth,disabled:getComputedStyle(root.querySelector(':disabled')).opacity}}''',shadow)
  assert values['height']=='40px' and values['radius']=='12px',values
  assert values['font']=='24px' and values['weight']=='600',values
  assert values['drop']=='2px' and values['disabled']=='0.45',values
  if page.evaluate('CSS.supports("corner-shape","squircle")'): assert values['corner'] in ('squircle','superellipse(2)'),values
 page.keyboard.press('Tab')
 assert page.locator('#action').first.evaluate('(b)=>b.matches(":focus-visible")&&getComputedStyle(b).outlineWidth==="2px"')
 page.emulate_media(reduced_motion='reduce')
 assert page.locator('#action').first.evaluate('(b)=>getComputedStyle(b).transitionDuration')=='0s'
 mobile=browser.new_context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True)
 mp=mobile.new_page();mp.set_content('<style>'+css+'</style>'+markup)
 assert mp.locator('#action').evaluate('(b)=>getComputedStyle(b).minHeight')=='44px'
 print('PASS: document/shadow parity, Squircle support/fallback, typography, drop target, disabled/focus states, reduced motion, touch target')
 browser.close()
