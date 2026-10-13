/* Shared by the page and service worker: the URL, never a saved preference, selects storage. */
globalThis.productionConnectionFromURL=(href,scope)=>{
 const url=new URL(href),base=new URL(scope);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('올바른 앱 주소가 아닙니다.');
 let address;
 try{address=decodeURIComponent(url.pathname.slice(base.pathname.length)).replace(/\/+$/,'')}catch{throw Error('NAS 주소의 URL 인코딩을 확인하세요.')}
 if(!address||address==='index.html')return 'local';
 if(address.startsWith('http://'))throw Error('NAS는 HTTPS 주소를 사용해야 합니다.');
 const nas=new URL(address.startsWith('https://')?address:'https://'+address);
 if(nas.protocol!=='https:'||nas.username||nas.password||nas.pathname!=='/'||nas.search||nas.hash||!nas.hostname.includes('.')&&!nas.hostname.includes(':'))throw Error('NAS 도메인 주소만 입력하세요.');
 return nas.origin;
};
