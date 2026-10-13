export function figmaFileURL(raw) {
 try {const url=new URL(String(raw).trim());return url.protocol==='https:'&&!url.username&&!url.password&&['figma.com','www.figma.com'].includes(url.hostname)&&/^\/(file|design|proto|board)\/[A-Za-z0-9_-]+(?:\/|$)/.test(url.pathname)?url.href:''}catch{return ''}
}
function key(){const account=globalThis.window?.appAccount;return 'pn-figma-file:'+encodeURIComponent(account?.id||account?.userId||account?.email||(account?.localMode?'local':'anonymous'))}
export function savedFigmaFile(){try{return figmaFileURL(localStorage.getItem(key())||'')}catch{return ''}}
export function saveFigmaFile(raw){const url=raw?figmaFileURL(raw):'';if(raw&&!url)throw Error('Figma 디자인·파일·프로토타입·보드의 HTTPS 주소를 입력하세요');if(url)localStorage.setItem(key(),url);else localStorage.removeItem(key());window.dispatchEvent(new Event('figma-connection-changed'));return url}
