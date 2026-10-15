"""Install the pinned official WordCraft web release without a Rust build."""
import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'third_party/wordcraft/source.json').read_text())
cache = root / '.cache/wordcraft'
cache.mkdir(parents=True, exist_ok=True)
archive = cache / ('wordcraft-web-' + source['version'] + '.zip')
if not archive.exists():
    temporary = archive.with_suffix('.download')
    with urllib.request.urlopen(source['url'], timeout=60) as response, temporary.open('wb') as target:
        shutil.copyfileobj(response, target)
    temporary.replace(archive)
if hashlib.sha256(archive.read_bytes()).hexdigest() != source['sha256']:
    archive.unlink()
    raise RuntimeError('WordCraft release checksum mismatch; refusing to install')
output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
prefix = 'wordcraft-web-' + source['version'] + '/'
with zipfile.ZipFile(archive) as package:
    for item in package.infolist():
        if item.is_dir():
            continue
        if not item.filename.startswith(prefix):
            raise RuntimeError('Unexpected WordCraft archive path')
        relative = Path(item.filename[len(prefix):])
        if relative.is_absolute() or '..' in relative.parts:
            raise RuntimeError('Unsafe WordCraft archive path')
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        with package.open(item) as data, target.open('wb') as file:
            shutil.copyfileobj(data, file)
for notice in (root / 'third_party/wordcraft').iterdir():
    if notice.is_file():
        shutil.copy2(notice, output / notice.name)
print('WordCraft ' + source['version'] + ': official web release verified and installed')

# Keep every upstream file untouched; the app host loads a verified compressed copy.
import gzip
wasm=next(output.glob('*_bg.wasm'))
script=next(output.glob('wordcraft-web-*.js'))
raw=wasm.read_bytes()
compressed=gzip.compress(raw,compresslevel=9,mtime=0)
(output/(wasm.name+'.gz')).write_bytes(compressed)
expected=hashlib.sha256(raw).hexdigest()
host='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f6f6f6}#wordcraft_canvas{position:absolute;inset:0;width:100%;height:100%;display:block}#wordcraft_loading{position:absolute;inset:0;display:grid;place-items:center;font:14px system-ui;color:#888;pointer-events:none}</style></head><body><canvas id="wordcraft_canvas"></canvas><div id="wordcraft_loading">문서 편집기 준비 중…</div><script type="module">
import init,* as bindings from './__SCRIPT__';
const target=new URL('./__WASM__',location.href),key=target.href+'?verified=__HASH__';
try{
 let cache;try{cache=await caches.open('production-wordcraft-0.6.1')}catch{}
 let response=await cache?.match(key);
 if(!response){
  let bytes;
  if(typeof DecompressionStream==='function'){
   try{const packed=await fetch(target.href+'.gz');if(!packed.ok)throw Error('compressed engine');const data=await packed.arrayBuffer();bytes=new Uint8Array(data)[0]===31?await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():data}catch{}
  }
  if(!bytes){const direct=await fetch(target);if(!direct.ok)throw Error('편집기 엔진을 불러오지 못했습니다.');bytes=await direct.arrayBuffer()}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!=='__HASH__')throw Error('편집기 파일 검증에 실패했습니다. 새로고침해 주세요.');
  response=new Response(bytes,{headers:{'Content-Type':'application/wasm'}});
  try{await cache?.put(key,response.clone())}catch{}
 }
 const wasm=await init({module_or_path:response});window.wasmBindings=bindings;dispatchEvent(new CustomEvent('TrunkApplicationStarted',{detail:{wasm}}));
}catch(error){document.querySelector('#wordcraft_loading').textContent=error.message;parent.postMessage({type:'wordcraft-load-error',message:error.message},location.origin)}
</script></body></html>'''.replace('__SCRIPT__',script.name).replace('__WASM__',wasm.name).replace('__HASH__',expected)
(output/'app.html').write_text(host)
print('WordCraft engine transfer: '+str(len(raw))+' -> '+str(len(compressed))+' bytes; verified persistent cache enabled')
