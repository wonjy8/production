export function figmaFileURL(raw) {
 try {const url=new URL(String(raw).trim());return url.protocol==='https:'&&!url.username&&!url.password&&['figma.com','www.figma.com'].includes(url.hostname)&&/^\/(file|design|proto|board)\/[A-Za-z0-9_-]+(?:\/|$)/.test(url.pathname)?url.href:''}catch{return ''}
}
function key(){const account=globalThis.window?.appAccount;return 'pn-figma-file:'+encodeURIComponent(account?.id||account?.userId||account?.email||(account?.localMode?'local':'anonymous'))}
export function savedFigmaFile(){try{return figmaFileURL(localStorage.getItem(key())||'')}catch{return ''}}
export function saveFigmaFile(raw){const url=raw?figmaFileURL(raw):'';if(raw&&!url)throw Error('Figma 디자인·파일·프로토타입·보드의 HTTPS 주소를 입력하세요');if(url)localStorage.setItem(key(),url);else localStorage.removeItem(key());window.dispatchEvent(new Event('figma-connection-changed'));return url}
// Only the iframe's Figma URL is retained; pasted markup is never rendered.
function iframeSource(raw){
 const text=String(raw||'').trim();if(!text.includes('<'))return text;
 const frames=[...text.matchAll(/<iframe\b([^>]*)>/gi)];if(frames.length!==1)return '';
 const source=/(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(frames[0][1]);
 return (source?.[1]??source?.[2]??source?.[3]??'').replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([a-f0-9]+));/gi,(entity,decimal,hex)=>{if(decimal||hex){const code=parseInt(decimal||hex,hex?16:10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):''}return {'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[entity.toLowerCase()]||entity});
}
export function figmaModuleURL(raw){
 const source=iframeSource(raw);if(figmaFileURL(source))return figmaFileURL(source);
 try{const url=new URL(source);if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
 if(url.hostname==='embed.figma.com'&&/^\/(file|design|proto|board)\/[A-Za-z0-9_-]+(?:\/|$)/.test(url.pathname))return url.href;
 if(['figma.com','www.figma.com'].includes(url.hostname)&&url.pathname==='/embed'&&figmaFileURL(url.searchParams.get('url')||''))return url.href;
 }catch{}return '';
}
export function figmaDesignURL(raw){
 const source=figmaModuleURL(raw);if(figmaFileURL(source))return figmaFileURL(source);if(!source)return '';
 const url=new URL(source);if(url.pathname==='/embed')return figmaFileURL(url.searchParams.get('url')||'');url.hostname='www.figma.com';url.searchParams.delete('embed-host');url.searchParams.delete('embed_host');return figmaFileURL(url.href);
}
export function figmaEmbedURL(raw){const source=figmaModuleURL(raw);if(!source)return '';return figmaFileURL(source)?'https://www.figma.com/embed?embed_host=share&url='+encodeURIComponent(source):source}
export function figmaFileTitle(raw){const source=figmaDesignURL(raw);if(!source)return '';try{const parts=new URL(source).pathname.split('/').filter(Boolean);return parts.length>=3?decodeURIComponent(parts.slice(2).join('/')).replace(/-+/g,' ').trim():''}catch{return ''}}
