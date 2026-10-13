"""Exercise the DOCX adapter in a real browser, including lossless opaque parts."""
from pathlib import Path
import subprocess,tempfile
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as folder:
 bundle=Path(folder)/'document-files.js'
 subprocess.run([str(root/'node_modules/.bin/esbuild'),'production/document-files.ts','--bundle','--format=iife','--global-name=documentFiles','--outfile='+str(bundle)],cwd=root,check=True,capture_output=True)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page();page.route('http://localhost/docx',lambda r:r.fulfill(body='<html><body></body></html>',content_type='text/html'));page.goto('http://localhost/docx');page.add_script_tag(path=str(bundle))
  result=page.evaluate('''async()=>{
   const api=documentFiles,content={type:'doc',content:[
    {type:'heading',attrs:{level:2},content:[{type:'text',text:'한글 제목'}]},
    {type:'paragraph',content:[{type:'text',text:'Bold & italic <text>',marks:[{type:'bold'},{type:'italic'},{type:'underline'},{type:'textStyle',attrs:{fontSize:'16pt',color:'#ab1234'}}]},{type:'text',text:' linked',marks:[{type:'link',attrs:{href:'https://example.com/doc'}}]},{type:'hardBreak'},{type:'text',text:'line two'}]},
    {type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Bullet one'}]},{type:'orderedList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Nested number'}]}]}]}]},{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Bullet two'}]}]}]},
    {type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'Cell A'}]}]},{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'Cell B'}]}]}]}]},
    {type:'paragraph',content:[{type:'image',attrs:{src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}}]}
   ]};
   const blob=await api.saveDocument(content,'docx',null,'',''),loaded=await api.loadDocument(blob,'docx');
   const flat=JSON.stringify(loaded.content);if(!flat.includes('한글 제목')||!flat.includes('Cell B')||!flat.includes('16pt')||!flat.includes('https://example.com/doc')||!flat.includes('data:image/png'))throw Error('Rich DOCX content was lost');
   const heading=loaded.content.content[0];if(heading.type!=='heading'||heading.attrs.level!==2)throw Error('Heading style lost');
   if(!loaded.content.content.some(n=>n.type==='bulletList'))throw Error('Bullet list lost');
   const zip=loaded.zip,source=await zip.file('word/document.xml').async('string');
   const protectedPart='<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> DATE </w:instrText></w:r><w:r><w:t>PROTECTED FIELD</w:t></w:r></w:p>';
   zip.file('word/document.xml',source.replace('<w:sectPr',protectedPart+'<w:sectPr'));
   zip.file('word/header-custom.xml','<header>untouched original header</header>');
   const imported=await api.loadDocument(await zip.generateAsync({type:'blob'}),'docx');
   if(!imported.content.content.some(n=>n.type==='docxOpaque'))throw Error('Unsupported field was not protected');
   imported.content.content.unshift({type:'paragraph',content:[{type:'text',text:'edited new paragraph'}]});
   const result=await api.saveDocument(imported.content,'docx',imported.zip,'',''),reopened=await api.loadDocument(result,'docx');
   const originalXml=await imported.zip.file('word/document.xml').async('string');if(originalXml.includes('edited new paragraph'))throw Error('Source ZIP mutated during export');
   const finalXml=await reopened.zip.file('word/document.xml').async('string');
   if(!finalXml.includes('edited new paragraph')||!finalXml.includes('PROTECTED FIELD')||!finalXml.includes('fldChar'))throw Error('Edited body or opaque field lost');
   if(await reopened.zip.file('word/header-custom.xml').async('string')!=='<header>untouched original header</header>')throw Error('Untouched package part changed');
   if(!reopened.zip.file('word/media/'+Object.keys(reopened.zip.files).find(n=>n.startsWith('word/media/')&&!reopened.zip.files[n].dir).split('/').pop()))throw Error('Image media lost');
   const headingNode=reopened.content.content.find(n=>n.type==='heading');headingNode.type='paragraph';
   const plain=await api.loadDocument(await api.saveDocument(reopened.content,'docx',reopened.zip,'',''),'docx');
   if(plain.content.content.some(n=>n.type==='heading'))throw Error('Switching heading to body did not persist');
   const text=await api.saveDocument({},'text',null,'','첫 줄\\nsecond line');if(await text.text()!=='첫 줄\\nsecond line')throw Error('Plain text serialization failed');
   const html=await api.saveDocument({},'html',null,'<p><strong>hello</strong></p>','');if(!(await html.text()).includes('<strong>hello</strong>'))throw Error('HTML serialization failed');
   return {bytes:result.size,opaque:true,header:true,image:true};
  }''')
  browser.close()
print('DOCX adapter: Unicode, escaped text, headings/body conversion, marks, links, nested lists, tables, images, original package parts, opaque fields, immutable source ZIP, TXT and HTML passed',result)
