"""Local DOCX/text/HTML preview: no external renderer or HTML subresource requests."""
from pathlib import Path
from zipfile import ZipFile
import io,json,base64,subprocess
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parent.parent
buf=io.BytesIO()
with ZipFile(buf,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>로컬 DOCX 본문</w:t></w:r></w:p></w:body></w:document>')
entry="""import React from'react';import{createRoot}from'react-dom/client';import{DocumentEmbed}from'./production/DocumentEmbed';window.show=f=>createRoot(document.querySelector('#app')).render(<DocumentEmbed file={f}/>);"""
script="import{buildSync}from'esbuild';process.stdout.write(buildSync({stdin:{contents:process.argv[1],resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'}).outputFiles[0].text)"
js=subprocess.run(['node','--input-type=module','-e',script,entry],cwd=root,check=True,capture_output=True,text=True).stdout
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();requests=[];errors=[];page.on('request',lambda r:requests.append(r.url));page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',lambda route:route.abort())
 for f,body in [({'id':'html','name':'안내.html','mime':'text/html'},'<script>window.leaked=true</script><img src="https://external.invalid/leak"><iframe src="https://external.invalid/frame"></iframe><style>p{color:red}</style><p>안전한 본문</p>'),({'id':'txt','name':'메모.txt','mime':'text/plain'},'<script>일반 텍스트</script>'),({'id':'empty','name':'빈 문서.txt','mime':'text/plain'},''),({'id':'docx','name':'문서.docx','mime':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},buf.getvalue())]:
  page.set_content('<div id="app"></div>');data=base64.b64encode(body.encode() if isinstance(body,str) else body).decode();page.add_script_tag(content='window.fetch=async()=>new Response(Uint8Array.from(atob('+json.dumps(data)+'),c=>c.charCodeAt(0)));');page.add_script_tag(content=js);page.evaluate('f=>window.show(f)',f)
  if f['id']=='empty':expect(page.get_by_text('내용이 없는 문서입니다.',exact=True)).to_be_visible()
  else:expect(page.locator('.document-embed pre')).to_have_text({'html':'안전한 본문','txt':'<script>일반 텍스트</script>','docx':'로컬 DOCX 본문'}[f['id']])
 assert not page.evaluate('!!window.leaked');assert not requests,requests;assert not errors,errors;b.close()
print('PASS local document embeds: DOCX, escaped text, empty document, inert HTML without scripts or external subresource requests')
